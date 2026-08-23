import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CampaignStatus,
  ConnectedAccountStatus,
  Platform,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { AccountsService } from './accounts.service';
import { OAuthConfigService } from './oauth-config.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthExchangeService } from './oauth-exchange.service';
import { TokenEncryptionService } from './token-encryption.service';
import { TokenVaultService } from './token-vault.service';
import { AccountNotificationService } from './account-notification.service';
import { TenantResolverService } from './tenant-resolver.service';
import { CampaignImportService } from './campaign-import.service';
import { CampaignImportRunner } from './campaign-import.runner';
import { MetaConnector } from '../connectors/meta-connector';
import { GoogleConnector } from '../connectors/google-connector';
import { LinkedinConnector } from '../connectors/linkedin-connector';
import { XConnector } from '../connectors/x-connector';
import { SnapchatConnector } from '../connectors/snapchat-connector';
import { TiktokConnector } from '../connectors/tiktok-connector';
import { ConnectorFactory } from '../connectors/connector-factory';
import {
  CAMPAIGN_IMPORT_EVENT,
  CONNECTION_STATUS,
  REAUTH_REQUIRED_EVENT,
} from '../constants/accounts.constants';

/** In-memory Redis for the whole suite. */
class FakeRedis {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(
    key: string,
    value: string,
    _mode?: 'EX',
    ttlSeconds?: number,
  ): Promise<string> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
    });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

describe('AccountsService - Connect Advertising Account via OAuth', () => {
  let service: AccountsService;
  let vault: TokenVaultService;
  let fakeRedis: FakeRedis;
  let exchange: {
    getJson: jest.Mock;
    postForm: jest.Mock;
    postJson: jest.Mock;
  };
  let prisma: any;
  let rabbit: { publish: jest.Mock; consume: jest.Mock };
  let notification: AccountNotificationService;
  let encryption: TokenEncryptionService;

  const user = { sub: 'user-1', email: 'marketer@example.com' };

  const configGet = jest.fn((key: string) => {
    if (key === 'FRONTEND_URL') return 'http://localhost:3000';
    if (key === 'BACKEND_URL') return 'http://localhost:8030';
    if (key === 'NODE_ENV') return 'test';
    if (key === 'META_APP_ID') return 'meta-app-id';
    if (key === 'META_APP_SECRET') return 'meta-app-secret';
    if (key === 'GOOGLE_ADS_CLIENT_ID') return 'google-client-id';
    if (key === 'GOOGLE_ADS_CLIENT_SECRET') return 'google-client-secret';
    if (key === 'GOOGLE_ADS_DEVELOPER_TOKEN') return 'google-dev-token';
    return undefined;
  });

  const connectedAccount = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const platformCampaign = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const uacmCampaign = { create: jest.fn() };
  const userModel = { findUnique: jest.fn() };

  const makeAccount = (overrides: any = {}) => ({
    id: 'acc-1',
    userId: 'user-1',
    platform: Platform.META,
    status: 'CONNECTED',
    accessToken: 'v1:encrypted-access',
    refreshToken: 'v1:encrypted-refresh',
    expiresAt: new Date(Date.now() + 3600_000),
    tenantId: 'user-1',
    platformAccountId: null,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    fakeRedis = new FakeRedis();
    exchange = { getJson: jest.fn(), postForm: jest.fn(), postJson: jest.fn() };
    rabbit = {
      publish: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn(),
    };
    encryption = new TokenEncryptionService({ get: configGet } as any);

    prisma = {
      connectedAccount,
      platformCampaign,
      uacmCampaign,
      user: userModel,
    };
    userModel.findUnique.mockResolvedValue({ id: 'user-1', email: user.email });
    connectedAccount.update.mockImplementation(async ({ where, data }) =>
      makeAccount({ ...where, ...data }),
    );
    connectedAccount.upsert.mockImplementation(async ({ create }) => ({
      id: 'acc-1',
      ...create,
    }));
    platformCampaign.create.mockResolvedValue({ id: 'pc-1' });
    uacmCampaign.create.mockImplementation(async ({ data }) => ({
      id: 'uacm-1',
      ...data,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        OAuthConfigService,
        OAuthStateService,
        TokenEncryptionService,
        TokenVaultService,
        AccountNotificationService,
        TenantResolverService,
        CampaignImportService,
        CampaignImportRunner,
        MetaConnector,
        GoogleConnector,
        LinkedinConnector,
        XConnector,
        SnapchatConnector,
        TiktokConnector,
        ConnectorFactory,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: { getClient: () => fakeRedis } },
        { provide: RabbitMQService, useValue: rabbit },
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: OAuthExchangeService, useValue: exchange },
      ],
    }).compile();

    service = module.get(AccountsService);
    vault = module.get(TokenVaultService);
    notification = module.get(AccountNotificationService);
  });

  // -------------------------------------------------------------------------
  // Scenario 1 - Happy path: account linking
  // -------------------------------------------------------------------------

  describe('platform selection + authorization URL', () => {
    it('lists the supported platforms', () => {
      const platforms = service.listSupportedPlatforms();
      expect(platforms.map((p) => p.platform)).toEqual([
        Platform.META,
        Platform.GOOGLE,
        Platform.LINKEDIN,
        Platform.X,
        Platform.SNAPCHAT,
        Platform.TIKTOK,
      ]);
    });

    it('generates the provider authorization URL with a persisted state', async () => {
      const { authorizationUrl } = await service.startConnect(user, {
        platform: Platform.META,
      });
      expect(authorizationUrl).toContain(
        'https://www.facebook.com/v21.0/dialog/oauth?',
      );
      expect(authorizationUrl).toContain('client_id=meta-app-id');
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      const raw = await fakeRedis.get(`ad-oauth:state:${state}`);
      expect(JSON.parse(raw as string)).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          email: user.email,
          platform: 'META',
          tenantId: 'user-1',
        }),
      );
    });

    it('works through the browser redirect variant', async () => {
      const url = await service.startConnectUrl(user, Platform.META);
      expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth?');
    });
  });

  describe('callback - successful linking', () => {
    it('stores encrypted credentials, links user + tenant and schedules the import', async () => {
      exchange.getJson.mockResolvedValue({
        access_token: 'meta-access-1',
        expires_in: 5184000,
      });
      connectedAccount.findUnique.mockResolvedValue(null);

      const { authorizationUrl } = await service.startConnect(user, {
        platform: Platform.META,
      });
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      const redirect = await service.handleCallback('code-123', state);

      // Frontend success redirect with the linked account.
      expect(redirect).toContain('http://localhost:3000/ad-accounts/connected');
      expect(redirect).toContain('accountId=acc-1');

      // Tokens persisted encrypted - the plaintext never appears.
      const stored = (connectedAccount.upsert as jest.Mock).mock.calls[0][0];
      expect(stored.create.accessToken).toContain('v1:');
      expect(stored.create.accessToken).not.toContain('meta-access-1');
      expect(stored.create.refreshToken).toBeNull();
      expect(stored.create.platform).toBe(Platform.META);

      // Account linked to the user + tenant, and marked CONNECTED.
      expect(stored.create.userId).toBe('user-1');
      expect(stored.create.tenantId).toBe('user-1');
      expect(stored.create.status).toBe('CONNECTED');

      // Decryption round-trips to the original token.
      expect(encryption.decrypt(stored.create.accessToken)).toBe(
        'meta-access-1',
      );

      // Import scheduled immediately after linking.
      expect(rabbit.publish).toHaveBeenCalledWith(CAMPAIGN_IMPORT_EVENT, {
        accountId: 'acc-1',
        userId: 'user-1',
        platform: Platform.META,
        tenantId: 'user-1',
      });
    });

    it('re-connecting the same platform replaces the credentials (upsert)', async () => {
      exchange.getJson.mockResolvedValue({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      });
      connectedAccount.findUnique.mockResolvedValue(
        makeAccount({ refreshToken: encryption.encrypt('old-refresh') }),
      );

      const { authorizationUrl } = await service.startConnect(user, {
        platform: Platform.META,
      });
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      await service.handleCallback('code-456', state);

      const args = (connectedAccount.upsert as jest.Mock).mock.calls[0][0];
      expect(args.update.accessToken).not.toContain('new-access');
      expect(encryption.decrypt(args.update.refreshToken)).toBe('new-refresh');
      expect(args.update.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('redirects to the failure page when the state token is invalid', async () => {
      const redirect = await service.handleCallback('code-1', 'forged-state');
      expect(redirect).toContain('/ad-accounts/connect-failed?error=');
      expect(connectedAccount.upsert).not.toHaveBeenCalled();
    });

    it('redirects to the failure page when the code exchange fails', async () => {
      exchange.getJson.mockResolvedValue({ error: { code: 100 } });
      await fakeRedis.set(
        'ad-oauth:state:good-state',
        JSON.stringify({
          userId: 'user-1',
          email: user.email,
          platform: 'META',
          tenantId: 'user-1',
        }),
      );

      const redirect = await service.handleCallback('bad-code', 'good-state');
      expect(redirect).toContain('/ad-accounts/connect-failed?error=');
      expect(connectedAccount.upsert).not.toHaveBeenCalled();
    });

    it('rejects unsupported platforms at the orchestrator level', async () => {
      await expect(
        service.startConnect(user, { platform: 'TIKTOK' as any }),
      ).rejects.toThrow();
    });

    it('adopts only frontend-origin redirect URIs (open redirect protection)', async () => {
      const { authorizationUrl } = await service.startConnect(user, {
        platform: Platform.META,
        successRedirectUri: 'https://evil.example.com/phish',
      });
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      exchange.getJson.mockResolvedValue({
        access_token: 'a',
        expires_in: 3600,
      });
      connectedAccount.findUnique.mockResolvedValue(null);
      const redirect = await service.handleCallback('code-1', state);
      expect(redirect).toContain('http://localhost:3000/ad-accounts/connected');
      expect(redirect).not.toContain('evil.example.com');
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 - Permissions denied by the user at the provider
  // -------------------------------------------------------------------------

  describe('callback - permission denied', () => {
    it('redirects to the failure page with a message and stores nothing', async () => {
      const redirect = await service.handleCallback('', '', 'access_denied');
      expect(redirect).toContain(
        '/ad-accounts/connect-failed?error=access_denied',
      );
      expect(connectedAccount.upsert).not.toHaveBeenCalled();
      expect(rabbit.publish).not.toHaveBeenCalledWith(
        CAMPAIGN_IMPORT_EVENT,
        expect.anything(),
      );
    });

    it('marks an existing account as reauthorization required on denial', async () => {
      connectedAccount.findUnique.mockResolvedValue(makeAccount());
      await fakeRedis.set(
        'ad-oauth:state:valid-state',
        JSON.stringify({
          userId: 'user-1',
          email: user.email,
          platform: 'META',
          tenantId: 'user-1',
          failureRedirectUri: 'http://localhost:3000/custom-failure',
        }),
      );

      const redirect = await service.handleCallback(
        '',
        'valid-state',
        'access_denied',
      );
      expect(redirect).toContain('http://localhost:3000/custom-failure');
      expect((connectedAccount.update as jest.Mock).mock.calls[0][0]).toEqual({
        where: { id: 'acc-1' },
        data: { status: 'REAUTHORIZATION_REQUIRED' },
      });
      expect(
        await vault.getStatus(
          makeAccount({ status: 'REAUTHORIZATION_REQUIRED' }),
        ),
      ).toBe(CONNECTION_STATUS.REAUTHORIZATION_REQUIRED);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 - Access token expiry / refresh
  // -------------------------------------------------------------------------

  describe('access token refresh', () => {
    const expiredAccount = () =>
      makeAccount({
        expiresAt: new Date(Date.now() - 60_000),
        accessToken: encryption.encrypt('expired-access'),
        refreshToken: encryption.encrypt('meta-refresh-material'),
      });

    it('refreshes transparently when the token has expired and persists the new token encrypted', async () => {
      exchange.getJson.mockResolvedValue({
        access_token: 'fresh-access',
        expires_in: 5184000,
      });

      const token = await vault.requireValidAccessToken(expiredAccount());
      expect(token).toBe('fresh-access');

      const updateArgs = (connectedAccount.update as jest.Mock).mock
        .calls[0][0];
      expect(encryption.decrypt(updateArgs.data.accessToken)).toBe(
        'fresh-access',
      );
      expect(updateArgs.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('keeps working when the token is still valid (no refresh call)', async () => {
      const active = makeAccount({
        accessToken: encryption.encrypt('valid-access'),
      });
      const token = await vault.requireValidAccessToken(active);
      expect(token).toBe('valid-access');
      expect(exchange.getJson).not.toHaveBeenCalled();
    });

    it('fails a refresh -> marks reauthorization required, notifies the user and blocks operations', async () => {
      exchange.getJson.mockResolvedValue({ error: 'token_expired' });

      await expect(
        vault.requireValidAccessToken(expiredAccount()),
      ).rejects.toThrow(ConflictException);

      // Status persisted as REAUTHORIZATION_REQUIRED.
      const updateCalls = (connectedAccount.update as jest.Mock).mock.calls;
      expect(
        updateCalls.some(
          (call: any[]) => call[0]?.data?.status === 'REAUTHORIZATION_REQUIRED',
        ),
      ).toBe(true);

      // User notified: event published + email captured by the mock mailer.
      expect(rabbit.publish).toHaveBeenCalledWith(
        REAUTH_REQUIRED_EVENT,
        expect.objectContaining({
          accountId: 'acc-1',
          userId: 'user-1',
          platform: Platform.META,
        }),
      );
      const emails = notification.getCapturedNotifications();
      expect(emails).toHaveLength(1);
      expect(emails[0].to).toBe(user.email);
      expect(emails[0].subject).toContain('Reauthorization required');
      expect(emails[0].html).toContain('reconnect');

      // Status is now REAUTHORIZATION_REQUIRED.
      expect(
        await vault.getStatus(
          makeAccount({ status: 'REAUTHORIZATION_REQUIRED' }),
        ),
      ).toBe(CONNECTION_STATUS.REAUTHORIZATION_REQUIRED);

      // Operations requiring a valid token are blocked.
      await expect(
        vault.requireValidAccessToken(expiredAccount()),
      ).rejects.toThrow(ConflictException);
    });

    it('reports the token as expired before any refresh attempt', async () => {
      const expired = makeAccount({ expiresAt: new Date(Date.now() - 1000) });
      expect(await vault.getStatus(expired)).toBe(
        CONNECTION_STATUS.TOKEN_EXPIRED,
      );
    });

    it('marks the account CONNECTED again after a successful re-link (callback)', async () => {
      exchange.getJson.mockResolvedValue({
        access_token: 'recovered',
        expires_in: 3600,
      });
      connectedAccount.findUnique.mockResolvedValue(
        makeAccount({ status: 'REAUTHORIZATION_REQUIRED' }),
      );

      const { authorizationUrl } = await service.startConnect(user, {
        platform: Platform.META,
      });
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      await service.handleCallback('code-recover', state);

      const args = (connectedAccount.upsert as jest.Mock).mock.calls[0][0];
      expect(args.update.status).toBe('CONNECTED');
      expect(await vault.getStatus(makeAccount())).toBe(
        CONNECTION_STATUS.CONNECTED,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Connection status + lifecycle
  // -------------------------------------------------------------------------

  describe('connection status & lifecycle', () => {
    it('reports DISCONNECTED for platforms with no account', async () => {
      connectedAccount.findMany.mockResolvedValue([
        makeAccount({ platform: Platform.META }),
      ]);
      const views = await service.list('user-1');
      expect(views).toEqual([
        expect.objectContaining({
          platform: Platform.META,
          status: CONNECTION_STATUS.CONNECTED,
        }),
        expect.objectContaining({
          platform: Platform.GOOGLE,
          status: CONNECTION_STATUS.DISCONNECTED,
          id: null,
        }),
        expect.objectContaining({
          platform: Platform.LINKEDIN,
          status: CONNECTION_STATUS.DISCONNECTED,
          id: null,
        }),
        expect.objectContaining({
          platform: Platform.X,
          status: CONNECTION_STATUS.DISCONNECTED,
          id: null,
        }),
        expect.objectContaining({
          platform: Platform.SNAPCHAT,
          status: CONNECTION_STATUS.DISCONNECTED,
          id: null,
        }),
        expect.objectContaining({
          platform: Platform.TIKTOK,
          status: CONNECTION_STATUS.DISCONNECTED,
          id: null,
        }),
      ]);
    });

    it('never exposes token material in the views', async () => {
      connectedAccount.findMany.mockResolvedValue([makeAccount()]);
      const views = await service.list('user-1');
      const json = JSON.stringify(views);
      expect(json).not.toContain('token');
      expect(json).not.toContain('v1:');
    });

    it('disconnects: marks DISCONNECTED, clears tokens and pauses imported campaigns', async () => {
      connectedAccount.findUnique.mockResolvedValue(makeAccount());

      const result = await service.disconnect('user-1', 'acc-1');
      expect(result.message).toContain('disconnected');
      expect(connectedAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: {
          status: ConnectedAccountStatus.DISCONNECTED,
          accessToken: '',
          refreshToken: null,
          expiresAt: null,
        },
      });
      expect(platformCampaign.updateMany).toHaveBeenCalledWith({
        where: {
          platform: Platform.META,
          uacmCampaign: { userId: 'user-1' },
        },
        data: { status: CampaignStatus.PAUSED },
      });
      expect(connectedAccount.delete).not.toHaveBeenCalled();
      expect(
        await vault.getStatus(makeAccount({ status: 'DISCONNECTED' })),
      ).toBe(CONNECTION_STATUS.DISCONNECTED);
    });

    it('returns 404 semantics for accounts owned by other users (IDOR guard)', async () => {
      connectedAccount.findUnique.mockResolvedValue(
        makeAccount({ userId: 'someone-else' }),
      );
      await expect(service.detail('user-1', 'acc-1')).rejects.toThrow(
        'Advertising account not found',
      );
    });

    it('blocks manual refresh when reauthorization is required', async () => {
      connectedAccount.findUnique.mockResolvedValue(
        makeAccount({ status: 'REAUTHORIZATION_REQUIRED' }),
      );
      await expect(service.refresh('user-1', 'acc-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('forces a successful refresh through the endpoint path', async () => {
      connectedAccount.findUnique.mockResolvedValue(
        makeAccount({
          expiresAt: new Date(Date.now() - 1000),
          accessToken: encryption.encrypt('old-access'),
          refreshToken: encryption.encrypt('refresh-material'),
        }),
      );
      exchange.getJson.mockResolvedValue({
        access_token: 'manually-refreshed',
        expires_in: 3600,
      });
      const result = await service.refresh('user-1', 'acc-1');
      expect(result.message).toContain('refreshed');
      void result;
    });
  });

  // -------------------------------------------------------------------------
  // Campaign import after connection
  // -------------------------------------------------------------------------

  describe('campaign import after connection', () => {
    it('imports campaigns synchronously for a connected account', async () => {
      connectedAccount.findUnique.mockResolvedValue(
        makeAccount({
          accessToken: encryption.encrypt('valid-access'),
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      );
      platformCampaign.findFirst.mockResolvedValue(null);
      // First call = accessible accounts, second = account currency,
      // third = campaigns.
      exchange.getJson
        .mockResolvedValueOnce({ data: [{ id: 'act_111', name: 'Main' }] })
        .mockResolvedValueOnce({ currency: 'USD' })
        .mockResolvedValueOnce({
          data: [
            { id: 'c1', name: 'Q1', status: 'ACTIVE', daily_budget: '50' },
          ],
        });

      const result = await service.importNow('user-1', 'acc-1');
      expect(result.platform).toBe(Platform.META);
      expect(result.result).toEqual(
        expect.objectContaining({ imported: 1, updated: 0, failed: 0 }),
      );
      expect(platformCampaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          platformCampaignId: 'c1',
          platform: Platform.META,
          platformData: expect.objectContaining({
            imported: true,
            tenantId: 'user-1',
            platformAccountId: '111',
          }),
        }),
      });
    });

    it('blocks import while reauthorization is required', async () => {
      connectedAccount.findUnique.mockResolvedValue(
        makeAccount({ status: 'REAUTHORIZATION_REQUIRED' }),
      );
      await expect(service.importNow('user-1', 'acc-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('lists previously imported campaigns for the user', async () => {
      connectedAccount.findUnique.mockResolvedValue(makeAccount());
      platformCampaign.findMany.mockResolvedValue([
        {
          id: 'pc-1',
          platformCampaignId: 'c1',
          platformData: { imported: true, tenantId: 't1' },
          status: 'ACTIVE',
          uacmCampaign: {
            name: 'Q1',
            budget: 50,
            startDate: new Date(),
            endDate: new Date(),
          },
        },
      ]);
      const campaigns = await service.listImportedCampaigns('user-1', 'acc-1');
      expect(campaigns).toHaveLength(1);
      expect(platformCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            platform: Platform.META,
            uacmCampaign: { userId: 'user-1' },
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Reconnect action
  // -------------------------------------------------------------------------

  describe('reconnect', () => {
    it('issues a fresh authorization URL for an existing account', async () => {
      connectedAccount.findUnique.mockResolvedValue(makeAccount());
      const { authorizationUrl } = await service.reconnect(user, 'acc-1', {});
      expect(authorizationUrl).toContain(
        'https://www.facebook.com/v21.0/dialog/oauth?',
      );
      expect(authorizationUrl).toContain('state=');
    });
  });
});
