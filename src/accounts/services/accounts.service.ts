import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignStatus,
  ConnectedAccountStatus,
  Platform,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { getFrontendUrl } from '../../auth/utils/app-urls.util';
import {
  CAMPAIGN_IMPORT_EVENT,
  DEFAULT_FAILURE_REDIRECT_PATH,
  DEFAULT_SUCCESS_REDIRECT_PATH,
  PLATFORM_DISPLAY_NAMES,
} from '../constants/accounts.constants';
import {
  ConnectedAccountView,
  ImportRequestPayload,
  OAuthStatePayload,
  PlatformDescriptor,
} from '../interfaces/accounts.interfaces';
import { OAuthConfigService } from './oauth-config.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthExchangeError } from './oauth-exchange.service';
import { ConnectorFactory } from '../connectors/connector-factory';
import { TokenEncryptionService } from './token-encryption.service';
import { TokenVaultService } from './token-vault.service';
import { TenantResolverService } from './tenant-resolver.service';
import { CampaignImportRunner } from './campaign-import.runner';
import { ConnectAdAccountDto } from '../dto/connect-ad-account.dto';
import { ReconnectAdAccountDto } from '../dto/reconnect-ad-account.dto';

/** Current user extracted from the JWT by JwtAuthGuard. */
export interface RequestUser {
  sub: string;
  email: string;
}

/**
 * Orchestrates the advertising-account OAuth linking flow:
 *
 * 1. platform selection + authorization URL generation (with CSRF state);
 * 2. callback handling: state verification -> code exchange -> encrypted
 *    storage -> immediate campaign import;
 * 3. connection lifecycle: listing/status, disconnect, refresh, reconnect
 *    and manual import.
 *
 * All callbacks redirect to the frontend (success or failure), so the
 * provider never sees internal errors and the SPA gets one explicit flow.
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly oauthConfig: OAuthConfigService,
    private readonly oauthState: OAuthStateService,
    private readonly connectorFactory: ConnectorFactory,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly tokenVault: TokenVaultService,
    private readonly tenantResolver: TenantResolverService,
    private readonly importRunner: CampaignImportRunner,
  ) {}

  // -------------------------------------------------------------------------
  // Platform selection & OAuth authorization
  // -------------------------------------------------------------------------

  /** Lists the supported advertising platforms. */
  listSupportedPlatforms(): PlatformDescriptor[] {
    return this.oauthConfig.listPlatforms();
  }

  /** JSON variant: starts the linking flow and returns the authorization URL. */
  async startConnect(
    user: RequestUser,
    dto: ConnectAdAccountDto,
  ): Promise<{ authorizationUrl: string }> {
    const { connector, config, state, payload } = await this.startFlow(user, {
      platform: dto.platform,
      adAccountId: dto.adAccountId,
      successRedirectUri: dto.successRedirectUri,
      failureRedirectUri: dto.failureRedirectUri,
    });
    return { authorizationUrl: connector.buildAuthUrl(state, config, payload) };
  }

  /** Browser variant: starts the linking flow and returns the URL to redirect to. */
  async startConnectUrl(
    user: RequestUser,
    platform: Platform,
  ): Promise<string> {
    const { connector, config, state, payload } = await this.startFlow(user, {
      platform,
    });
    return connector.buildAuthUrl(state, config, payload);
  }

  // -------------------------------------------------------------------------
  // OAuth callback
  // -------------------------------------------------------------------------

  /**
   * Handles the provider callback and returns the frontend redirect URL:
   * success (account linked + import scheduled) or failure (with message).
   */
  async handleCallback(
    code: string,
    state: string,
    oauthError?: string,
  ): Promise<string> {
    if (oauthError || !code || !state) {
      return this.handleDeniedFlow(state, oauthError ?? 'linking-cancelled');
    }

    try {
      const payload = await this.oauthState.consume(state);
      return await this.completeLinking(payload, code);
    } catch (error: any) {
      // Only provider-sanitized errors may reach the frontend URL; anything
      // else (DB, decryption, unexpected) maps to a generic message so
      // internal details never leak into redirects or logs of the SPA.
      const message =
        error instanceof OAuthExchangeError
          ? error.message
          : 'Linking failed. Please try again.';
      return this.buildFailureRedirect(undefined, message);
    }
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  /** Lists the user's per-platform connection status. */
  async list(userId: string): Promise<ConnectedAccountView[]> {
    const accounts = await this.prisma.connectedAccount.findMany({
      where: { userId },
    });
    const byPlatform = new Map(accounts.map((a) => [a.platform, a]));

    return Promise.all(
      this.oauthConfig
        .listPlatforms()
        .map((descriptor) =>
          this.toView(descriptor.platform, byPlatform.get(descriptor.platform)),
        ),
    );
  }

  /** Returns the detail view of one connected account. */
  async detail(userId: string, id: string): Promise<ConnectedAccountView> {
    const account = await this.findOwned(userId, id);
    return this.toView(account.platform, account);
  }

  /**
   * Disconnects an account: marks it DISCONNECTED (persisted), clears the
   * stored tokens, and pauses its imported campaigns. The row is kept so the
   * connection history and imported campaigns stay visible.
   */
  async disconnect(userId: string, id: string): Promise<{ message: string }> {
    const account = await this.findOwned(userId, id);

    await this.prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        status: ConnectedAccountStatus.DISCONNECTED,
        accessToken: '',
        refreshToken: null,
        expiresAt: null,
      },
    });
    await this.prisma.platformCampaign.updateMany({
      where: { platform: account.platform, uacmCampaign: { userId } },
      data: { status: CampaignStatus.PAUSED },
    });

    this.logger.log(`Disconnected ${account.platform} account ${account.id}`);
    return { message: 'Advertising account disconnected' };
  }

  /** Forces a token refresh; blocked while reauthorization is required. */
  async refresh(
    userId: string,
    id: string,
  ): Promise<{ message: string; platform: Platform }> {
    const account = await this.findOwned(userId, id);
    await this.tokenVault.requireValidAccessToken(account);
    return {
      message: 'Access token refreshed successfully',
      platform: account.platform,
    };
  }

  /** Builds a new authorization URL for an existing account (re-link). */
  async reconnect(
    user: RequestUser,
    id: string,
    dto: ReconnectAdAccountDto,
  ): Promise<{ authorizationUrl: string }> {
    const account = await this.findOwned(user.sub, id);
    const { connector, config, state, payload } = await this.startFlow(user, {
      platform: account.platform,
      successRedirectUri: dto.successRedirectUri,
      failureRedirectUri: dto.failureRedirectUri,
    });
    return { authorizationUrl: connector.buildAuthUrl(state, config, payload) };
  }

  /** Runs a fresh campaign import for an account (synchronous variant). */
  async importNow(
    userId: string,
    id: string,
  ): Promise<{ accountId: string; platform: Platform; result: any }> {
    const account = await this.findOwned(userId, id);
    const payload: ImportRequestPayload = {
      accountId: account.id,
      userId,
      platform: account.platform,
      tenantId: account.tenantId ?? this.tenantResolver.resolveTenantId(userId),
    };
    try {
      const result = await this.importRunner.run(payload);
      return { accountId: account.id, platform: account.platform, result };
    } catch (error) {
      if (error instanceof OAuthExchangeError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }
  }

  /** Returns the campaigns imported from the platform. */
  async listImportedCampaigns(userId: string, id: string) {
    const account = await this.findOwned(userId, id);
    return this.prisma.platformCampaign.findMany({
      where: {
        platform: account.platform,
        platformCampaignId: { not: null },
        uacmCampaign: { userId },
      },
      include: { uacmCampaign: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async completeLinking(
    payload: OAuthStatePayload,
    code: string,
  ): Promise<string> {
    const config = this.oauthConfig.getConfig(payload.platform);
    const connector = this.connectorFactory.get(payload.platform);

    // Exchange the authorization code for tokens (throws sanitized errors).
    // The payload is passed along so PKCE platforms (X) can present their
    // code verifier during the exchange.
    const tokens = await connector.exchangeCode(code, config, payload);

    const encryptedAccess = this.tokenEncryption.encrypt(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token
      ? this.tokenEncryption.encrypt(tokens.refresh_token)
      : null;
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // A user can only hold one account per platform: upsert the credentials
    // and bind the connection to the tenant + selected platform account.
    const existing = await this.prisma.connectedAccount.findUnique({
      where: {
        userId_platform: {
          userId: payload.userId,
          platform: payload.platform,
        },
      },
    });
    const account = await this.prisma.connectedAccount.upsert({
      where: {
        userId_platform: {
          userId: payload.userId,
          platform: payload.platform,
        },
      },
      create: {
        userId: payload.userId,
        platform: payload.platform,
        status: ConnectedAccountStatus.CONNECTED,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        tenantId: payload.tenantId,
        platformAccountId: payload.adAccountId ?? null,
      },
      update: {
        status: ConnectedAccountStatus.CONNECTED,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh ?? existing?.refreshToken ?? null,
        expiresAt,
        tenantId: payload.tenantId,
        platformAccountId: payload.adAccountId ?? undefined,
      },
    });

    // Import campaigns immediately after a successful linking.
    await this.publishImportRequest(payload, account.id);

    this.logger.log(
      `Linked ${payload.platform} account ${account.id} for user ${payload.userId}`,
    );
    return this.buildSuccessRedirect(
      payload.successRedirectUri,
      account.id,
      payload.platform,
    );
  }

  private async handleDeniedFlow(
    state: string | undefined,
    reason: string,
  ): Promise<string> {
    this.logger.warn(`OAuth linking cancelled or denied: ${reason}`);

    // When a valid state is present, mark the existing account as needing
    // reauthorization (silently - the user is being redirected anyway).
    if (state) {
      try {
        const payload = await this.oauthState.consume(state);
        const existing = await this.prisma.connectedAccount.findUnique({
          where: {
            userId_platform: {
              userId: payload.userId,
              platform: payload.platform,
            },
          },
        });
        if (existing) {
          await this.tokenVault.markReauthRequired(existing.id);
        }
        return this.buildFailureRedirect(payload.failureRedirectUri, reason);
      } catch {
        /* state was invalid - fall through to the default failure page */
      }
    }
    return this.buildFailureRedirect(undefined, reason);
  }

  private async publishImportRequest(
    payload: OAuthStatePayload,
    accountId: string,
  ): Promise<void> {
    try {
      await this.rabbitMQService.publish(CAMPAIGN_IMPORT_EVENT, {
        accountId,
        userId: payload.userId,
        platform: payload.platform,
        tenantId: payload.tenantId,
        adAccountId: payload.adAccountId,
      } satisfies ImportRequestPayload);
    } catch (error: any) {
      this.logger.warn(
        `Could not schedule import for account ${accountId}: ${
          error?.message ?? error
        }`,
      );
    }
  }

  /**
   * Prepares a full OAuth flow: resolved config, connector, state payload
   * (enriched with the connector's auth session, e.g. the X PKCE verifier)
   * and the persisted state token.
   */
  private async startFlow(
    user: RequestUser,
    input: {
      platform: Platform;
      adAccountId?: string;
      successRedirectUri?: string;
      failureRedirectUri?: string;
    },
  ) {
    const config = this.oauthConfig.getConfig(input.platform);
    const connector = this.connectorFactory.get(input.platform);
    const session = (await connector.prepareAuthSession?.(config)) ?? undefined;
    const payload: OAuthStatePayload = {
      ...(await this.buildStatePayload(user, input)),
      ...(session ?? {}),
    };
    const state = await this.oauthState.create(payload);
    return { connector, config, payload, state };
  }

  private async buildStatePayload(
    user: RequestUser,
    dto: {
      platform: Platform;
      adAccountId?: string;
      successRedirectUri?: string;
      failureRedirectUri?: string;
    },
  ): Promise<OAuthStatePayload> {
    return {
      userId: user.sub,
      email: user.email,
      platform: dto.platform,
      tenantId: this.tenantResolver.resolveTenantId(user.sub),
      adAccountId: dto.adAccountId,
      successRedirectUri: this.resolveSafeRedirect(
        dto.successRedirectUri,
        DEFAULT_SUCCESS_REDIRECT_PATH,
      ),
      failureRedirectUri: this.resolveSafeRedirect(
        dto.failureRedirectUri,
        DEFAULT_FAILURE_REDIRECT_PATH,
      ),
    };
  }

  private async findOwned(userId: string, id: string) {
    const account = await this.prisma.connectedAccount.findUnique({
      where: { id },
    });
    if (!account || account.userId !== userId) {
      throw new NotFoundException('Advertising account not found');
    }
    return account;
  }

  private async toView(
    platform: Platform,
    account: any,
  ): Promise<ConnectedAccountView> {
    return {
      id: account?.id ?? null,
      platform,
      platformDisplayName: PLATFORM_DISPLAY_NAMES[platform] ?? platform,
      status: await this.tokenVault.getStatus(account),
      expiresAt: account?.expiresAt ?? null,
      connectedAt: account?.createdAt ?? null,
      updatedAt: account?.updatedAt ?? null,
    };
  }

  private buildSuccessRedirect(
    uri: string | undefined,
    accountId: string,
    platform: Platform,
  ): string {
    const base = this.resolveSafeRedirect(uri, DEFAULT_SUCCESS_REDIRECT_PATH);
    const params = new URLSearchParams({
      accountId,
      platform,
    });
    return `${base}?${params.toString()}`;
  }

  private buildFailureRedirect(
    uri: string | undefined,
    message: string,
  ): string {
    const base = this.resolveSafeRedirect(uri, DEFAULT_FAILURE_REDIRECT_PATH);
    const params = new URLSearchParams({ error: message ?? 'Linking failed' });
    return `${base}?${params.toString()}`;
  }

  /**
   * Redirects must point at the configured frontend origin only -
   * prevents open-redirect attacks via the callback.
   */
  private resolveSafeRedirect(
    uri: string | undefined,
    defaultPath: string,
  ): string {
    if (uri && this.isSafeRedirect(uri)) {
      return uri;
    }
    return `${getFrontendUrl(this.configService)}${defaultPath}`;
  }

  private isSafeRedirect(uri: string): boolean {
    try {
      const url = new URL(uri);
      const frontend = new URL(getFrontendUrl(this.configService));
      return (
        url.origin === frontend.origin &&
        (url.protocol === 'http:' || url.protocol === 'https:')
      );
    } catch {
      return false;
    }
  }
}
