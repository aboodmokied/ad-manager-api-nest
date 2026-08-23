import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConnectedAccount, ConnectedAccountStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenEncryptionService } from './token-encryption.service';
import { ConnectorFactory } from '../connectors/connector-factory';
import { OAuthConfigService } from './oauth-config.service';
import { AccountNotificationService } from './account-notification.service';
import { RedisService } from '../../redis/redis.service';
import { CONNECTION_STATUS } from '../constants/accounts.constants';
import { ConnectionStatus } from '../constants/accounts.constants';
import { OAuthExchangeError } from './oauth-exchange.service';

/** Skew tolerated before an access token is considered expired (60s). */
const EXPIRY_SKEW_MS = 60_000;

/** TTL of the per-account refresh lock (must exceed a platform refresh call). */
const REFRESH_LOCK_TTL_SECONDS = 15;

/** Poll interval while waiting for another worker's refresh to finish. */
const REFRESH_LOCK_POLL_MS = 200;

/** Max time to wait for a concurrent refresh before taking it over. */
const REFRESH_LOCK_MAX_WAIT_MS = 10_000;

/**
 * Owns the lifecycle of stored platform credentials. The persisted
 * ConnectedAccount.status column is the source of truth for the connection
 * lifecycle (CONNECTED / DISCONNECTED / TOKEN_EXPIRED /
 * REAUTHORIZATION_REQUIRED):
 *
 * - returns a usable access token, refreshing transparently when expired;
 * - writes refreshed credentials back **encrypted** and marks the account
 *   CONNECTED on success, REAUTHORIZATION_REQUIRED on failure (with a user
 *   notification);
 * - blocks every platform operation while reauthorization is pending;
 * - derives the user-facing connection status.
 *
 * Raw tokens never leave this service; everything is encrypted at rest and
 * logs only contain sanitized messages.
 */
@Injectable()
export class TokenVaultService {
  private readonly logger = new Logger(TokenVaultService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly connectorFactory: ConnectorFactory,
    private readonly oauthConfig: OAuthConfigService,
    private readonly notification: AccountNotificationService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Returns a valid access token for the account.
   * Throws ConflictException when reauthorization is required or the account
   * is disconnected (its stored token was cleared and is unusable).
   */
  async requireValidAccessToken(account: ConnectedAccount): Promise<string> {
    this.assertUsable(account);
    const accessToken = this.tokenEncryption.decrypt(account.accessToken);
    if (!this.isExpired(account.expiresAt)) {
      return accessToken;
    }

    // Single-flight: only one caller refreshes per account so concurrent
    // requests cannot race the refresh material (some platforms invalidate
    // refresh tokens once used). Others wait for the refreshed token.
    const lockAcquired = await this.acquireRefreshLock(account.id);
    if (lockAcquired) {
      try {
        return await this.refreshAndPersist(account, accessToken);
      } finally {
        await this.releaseRefreshLock(account.id);
      }
    }
    return this.waitForRefreshedToken(account, accessToken);
  }

  /**
   * Computes the user-facing connection status.
   * TOKEN_EXPIRED is derived: the account is CONNECTED in the database but
   * its access token has expired and a refresh has not been attempted yet.
   */
  async getStatus(
    account: ConnectedAccount | null | undefined,
  ): Promise<ConnectionStatus> {
    if (!account) {
      return CONNECTION_STATUS.DISCONNECTED;
    }
    if (account.status === ConnectedAccountStatus.REAUTHORIZATION_REQUIRED) {
      return CONNECTION_STATUS.REAUTHORIZATION_REQUIRED;
    }
    if (account.status === ConnectedAccountStatus.DISCONNECTED) {
      return CONNECTION_STATUS.DISCONNECTED;
    }
    if (this.isExpired(account.expiresAt)) {
      return CONNECTION_STATUS.TOKEN_EXPIRED;
    }
    return CONNECTION_STATUS.CONNECTED;
  }

  /** Marks an account as needing reauthorization (e.g. permission denied). */
  async markReauthRequired(accountId: string): Promise<void> {
    await this.prisma.connectedAccount.update({
      where: { id: accountId },
      data: { status: ConnectedAccountStatus.REAUTHORIZATION_REQUIRED },
    });
  }

  /** Marks the account back as connected after a successful re-link/refresh. */
  async markConnected(accountId: string): Promise<void> {
    await this.prisma.connectedAccount.update({
      where: { id: accountId },
      data: { status: ConnectedAccountStatus.CONNECTED },
    });
  }

  isExpired(expiresAt: Date | null | undefined): boolean {
    if (!expiresAt) return false;
    return expiresAt.getTime() - Date.now() <= EXPIRY_SKEW_MS;
  }

  private assertUsable(account: ConnectedAccount): void {
    if (account.status === ConnectedAccountStatus.REAUTHORIZATION_REQUIRED) {
      throw new ConflictException(
        `Your ${account.platform} account needs to be reconnected before this operation.`,
      );
    }
    if (account.status === ConnectedAccountStatus.DISCONNECTED) {
      throw new ConflictException(
        `Your ${account.platform} account is disconnected. Connect it again before this operation.`,
      );
    }
  }

  private async acquireRefreshLock(accountId: string): Promise<boolean> {
    const redis = this.redisService.getClient();
    if (!redis) return true;
    const result = await redis.set(
      `token-refresh:${accountId}`,
      '1',
      'EX',
      REFRESH_LOCK_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  private async releaseRefreshLock(accountId: string): Promise<void> {
    const redis = this.redisService.getClient();
    await redis?.del(`token-refresh:${accountId}`);
  }

  /**
   * Waits for another worker holding the refresh lock to persist a fresh
   * token. Falls back to refreshing ourselves when the wait times out (the
   * lock has expired by then) or the account was marked reauthorization
   * required in the meantime.
   */
  private async waitForRefreshedToken(
    account: ConnectedAccount,
    currentAccessToken: string,
  ): Promise<string> {
    const deadline = Date.now() + REFRESH_LOCK_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, REFRESH_LOCK_POLL_MS));
      const fresh = await this.prisma.connectedAccount.findUnique({
        where: { id: account.id },
      });
      if (!fresh) break;
      if (fresh.status === ConnectedAccountStatus.REAUTHORIZATION_REQUIRED) {
        throw new ConflictException(
          `Your ${account.platform} account could not be refreshed. ` +
            'Please reconnect the account to continue.',
        );
      }
      const token = this.tokenEncryption.decrypt(fresh.accessToken);
      if (!this.isExpired(fresh.expiresAt)) {
        return token;
      }
      if (
        fresh.expiresAt &&
        account.expiresAt &&
        fresh.expiresAt.getTime() !== account.expiresAt.getTime()
      ) {
        // The other worker refreshed but reported no new expiry; the token
        // material is fresh, so hand it out.
        return token;
      }
    }
    return this.refreshAndPersist(account, currentAccessToken);
  }

  private async refreshAndPersist(
    account: ConnectedAccount,
    currentAccessToken: string,
  ): Promise<string> {
    const config = this.oauthConfig.getConfig(account.platform);
    const connector = this.connectorFactory.get(account.platform);
    const refreshToken = account.refreshToken
      ? this.tokenEncryption.decrypt(account.refreshToken)
      : null;

    try {
      const result = await connector.refreshToken(
        { accessToken: currentAccessToken, refreshToken },
        config,
      );
      const encryptedAccess = this.tokenEncryption.encrypt(result.access_token);
      const encryptedRefresh = result.refresh_token
        ? this.tokenEncryption.encrypt(result.refresh_token)
        : account.refreshToken;
      const expiresAt = result.expires_in
        ? new Date(Date.now() + result.expires_in * 1000)
        : account.expiresAt;

      await this.prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          expiresAt,
          status: ConnectedAccountStatus.CONNECTED,
        },
      });
      this.logger.log(
        `Refreshed access token for ${account.platform} account ${account.id}`,
      );
      return result.access_token;
    } catch (error: any) {
      await this.markRefreshFailed(account, error);
      throw new ConflictException(
        `Your ${account.platform} account could not be refreshed. ` +
          'Please reconnect the account to continue.',
      );
    }
  }

  private async markRefreshFailed(
    account: ConnectedAccount,
    error: unknown,
  ): Promise<void> {
    await this.prisma.connectedAccount.update({
      where: { id: account.id },
      data: { status: ConnectedAccountStatus.REAUTHORIZATION_REQUIRED },
    });

    // Log a sanitized reason only - never tokens or raw payloads.
    const reason =
      error instanceof OAuthExchangeError
        ? error.message
        : 'Unexpected token refresh failure';
    this.logger.warn(
      `Account ${account.id} (${account.platform}) marked reauthorization required: ${reason}`,
    );

    const userEmail = await this.resolveUserEmail(account.userId);
    await this.notification.notifyReauthorizationRequired({
      accountId: account.id,
      userId: account.userId,
      to: userEmail,
      platform: account.platform,
    });
  }

  private async resolveUserEmail(userId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      return user?.email ?? '';
    } catch (error: any) {
      this.logger.warn(
        `Could not resolve email for notification: ${error?.message ?? error}`,
      );
      return '';
    }
  }
}
