import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from './oauth.service';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenRevocationService } from './token-revocation.service';

jest.mock('bcryptjs', () => {
  const prefix = '$2b$04$uacm-test-hash:';
  const hash = (value: string) => `${prefix}${value}`;
  return {
    hash: async (value: string) => hash(value),
    hashSync: (value: string) => hash(value),
    compare: async (value: string, hashed: string) => hashed === hash(value),
    compareSync: (value: string, hashed: string) => hashed === hash(value),
  };
});

/** Minimal in-memory Redis stand-in used for unit tests */
class FakeRedis {
  private store = new Map<string, { value: string; expiresAt: number }>();

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

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

describe('OAuthService', () => {
  let service: OAuthService;
  let jwtService: JwtService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: { create: jest.Mock; updateMany: jest.Mock };
  };
  let tokenRevocation: { revoke: jest.Mock; isRevoked: jest.Mock };
  let configService: { get: jest.Mock };
  let fakeRedis: FakeRedis;
  let redisService: { getClient: jest.Mock };

  const email = 'ahmed@example.com';
  const name = 'Ahmed Ali';

  const makeUser = (overrides: any = {}) => ({
    id: 'user-1',
    name,
    email,
    passwordHash: 'hash',
    twoFactorEnabled: false,
    twoFactorSecret: null,
    emailVerified: false,
    oauthProvider: null,
    oauthProviderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const defaultGetConfig = (key: string) => {
    if (key === 'FRONTEND_URL') return 'http://localhost:3000';
    if (key === 'BACKEND_URL') return 'http://localhost:8030';
    if (key === 'GOOGLE_CLIENT_ID') return 'google-client-id';
    if (key === 'GOOGLE_CLIENT_SECRET') return 'google-client-secret';
    return undefined;
  };

  /** Mocks the two Google API calls used by OAuth (token exchange + userinfo) */
  const mockGoogleApis = (profile: any = {}) => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValue({ access_token: 'google-access-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'google-id-1',
          email,
          name,
          verified_email: true,
          ...profile,
        }),
      });
  };

  const getState = async () => {
    const url = await service.getGoogleOAuthUrl();
    return new URL(url).searchParams.get('state') as string;
  };

  beforeAll(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: { create: jest.fn(), updateMany: jest.fn() },
    };
    tokenRevocation = {
      revoke: jest.fn(),
      isRevoked: jest.fn().mockResolvedValue(false),
    };
    fakeRedis = new FakeRedis();
    redisService = { getClient: jest.fn(() => fakeRedis) };
    configService = { get: jest.fn(defaultGetConfig) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        OAuthService,
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redisService },
        { provide: TokenRevocationService, useValue: tokenRevocation },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fakeRedis = new FakeRedis();
    redisService.getClient.mockImplementation(() => fakeRedis);
    configService.get.mockImplementation(defaultGetConfig);
    tokenRevocation.isRevoked.mockResolvedValue(false);
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
    (global as any).fetch = undefined;
  });

  afterAll(() => {
    if ((global as any).fetch && (global as any).fetch.mockRestore) {
      (global as any).fetch.mockRestore();
    }
  });

  describe('getGoogleOAuthUrl', () => {
    it('builds a Google consent URL with the configured client id', async () => {
      const url = await service.getGoogleOAuthUrl();

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
      expect(url).toContain('client_id=google-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('scope=');
      expect(url).toContain('state=');
    });

    it('stores the state so the callback can be validated', async () => {
      const url = await service.getGoogleOAuthUrl();
      const state = new URL(url).searchParams.get('state') as string;

      expect(await fakeRedis.get(`oauth-state:${state}`)).toBe('google');
    });

    it('throws when Google OAuth is not configured', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'FRONTEND_URL' ? 'http://localhost:3000' : undefined,
      );

      await expect(service.getGoogleOAuthUrl()).rejects.toThrow(
        'Google OAuth is not configured',
      );
    });
  });

  describe('getGoogleOAuthRedirectUrl', () => {
    it('returns the consent URL when OAuth is configured', async () => {
      const url = await service.getGoogleOAuthRedirectUrl();

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
      expect(url).toContain('client_id=google-client-id');
    });

    it('returns the frontend error redirect when OAuth is not configured', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'FRONTEND_URL' ? 'http://localhost:3000' : undefined,
      );

      const url = await service.getGoogleOAuthRedirectUrl();

      expect(url).toContain('http://localhost:3000/oauth/callback?error=');
      expect(url).toContain('Google');
      expect(url).toContain('GOOGLE_CLIENT_ID');
    });
  });

  describe('handleGoogleOAuthCallback', () => {
    it('exchanges the code and creates an account for a new Google user', async () => {
      mockGoogleApis();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({
        id: 'user-2',
        ...data,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const state = await getState();
      const result: any = await service.handleGoogleOAuthCallback(
        'code-1',
        state,
      );

      expect(result.accessToken).toBeDefined();
      expect(result.user.id).toBe('user-2');
      expect(result.user.emailVerified).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oauthProvider: 'google',
            oauthProviderId: 'google-id-1',
            email,
          }),
        }),
      );
    });

    it('links Google to an existing account with the same email', async () => {
      mockGoogleApis();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(
        makeUser({ oauthProvider: 'google', oauthProviderId: 'google-id-1' }),
      );

      const state = await getState();
      const result: any = await service.handleGoogleOAuthCallback(
        'code-1',
        state,
      );

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ oauthProvider: 'google' }),
      });
      expect(result.user.id).toBe('user-1');
    });

    it('requires a 2FA step when the account has 2FA enabled', async () => {
      mockGoogleApis();
      prisma.user.findFirst.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          oauthProvider: 'google',
          oauthProviderId: 'google-id-1',
        }),
      );

      const state = await getState();
      const result: any = await service.handleGoogleOAuthCallback(
        'code-1',
        state,
      );

      expect(result.requiresTwoFactor).toBe(true);
      expect(result.loginToken).toBeDefined();
      expect(result.accessToken).toBeUndefined();
      const decoded: any = jwtService.decode(result.loginToken);
      expect(decoded.type).toBe('two-factor-login');
    });

    it('rejects a callback with an unknown or used state', async () => {
      mockGoogleApis();

      await expect(
        service.handleGoogleOAuthCallback('code-1', 'forged-state'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when Google cannot exchange the authorization code', async () => {
      (global as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: 'invalid_grant' }),
      });
      prisma.user.findFirst.mockResolvedValue(null);
      await fakeRedis.set('oauth-state:valid-state', 'google');

      await expect(
        service.handleGoogleOAuthCallback('bad-code', 'valid-state'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when Google returns no profile', async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue({ access_token: 'google-access-token' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: jest.fn().mockResolvedValue({ error: 'invalid_token' }),
        });
      await fakeRedis.set('oauth-state:valid-state', 'google');

      await expect(
        service.handleGoogleOAuthCallback('code-1', 'valid-state'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('handleGoogleOAuthCallbackRedirect', () => {
    it('redirects to the frontend with the issued token pair', async () => {
      mockGoogleApis();
      prisma.user.findFirst.mockResolvedValue(
        makeUser({ oauthProvider: 'google', oauthProviderId: 'google-id-1' }),
      );

      const state = await getState();
      const url = await service.handleGoogleOAuthCallbackRedirect(
        'code-1',
        state,
      );

      expect(url).toContain('http://localhost:3000/oauth/callback?');
      expect(url).toContain('access_token=');
      expect(url).toContain('refresh_token=');
      expect(url).toContain('user=');
    });

    it('redirects to the 2FA step when the account has 2FA enabled', async () => {
      mockGoogleApis();
      prisma.user.findFirst.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          oauthProvider: 'google',
          oauthProviderId: 'google-id-1',
        }),
      );

      const state = await getState();
      const url = await service.handleGoogleOAuthCallbackRedirect(
        'code-1',
        state,
      );

      expect(url).toContain('requires_two_factor=true');
      expect(url).toContain('login_token=');
      expect(url).not.toContain('access_token=');
    });

    it('redirects with an error when the state is invalid', async () => {
      mockGoogleApis();
      await fakeRedis.set('oauth-state:valid-state', 'google');

      const url = await service.handleGoogleOAuthCallbackRedirect(
        'code-1',
        'forged-state',
      );

      expect(url).toContain('/oauth/callback?error=');
      expect(url).not.toContain('access_token=');
    });

    it('redirects with an error when code or state are missing', async () => {
      const url = await service.handleGoogleOAuthCallbackRedirect('', '');

      expect(url).toContain('/oauth/callback?error=');
      expect(url).toContain('Google+login+was+cancelled+or+incomplete');
    });

    it('redirects with the Google error when Google reports one', async () => {
      const url = await service.handleGoogleOAuthCallbackRedirect(
        'code-1',
        'state-1',
        'access_denied',
      );

      expect(url).toContain('/oauth/callback?error=access_denied');
    });
  });
});
