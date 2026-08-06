import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { TwoFactorService } from './two-factor.service';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenRevocationService } from './token-revocation.service';

/**
 * bcrypt cost 10 is intentionally slow (~150-250ms per op) to keep production
 * brute-force resistance. Tests do not need to pay that cost: a deterministic
 * fake preserves the exact hashing contract (hash -> string, compare -> bool)
 * while running in microseconds.
 */
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

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let jwtService: JwtService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let tokenRevocation: { revoke: jest.Mock; isRevoked: jest.Mock };
  let configService: { get: jest.Mock };
  let fakeRedis: FakeRedis;
  let redisService: { getClient: jest.Mock };

  const email = 'ahmed@example.com';
  const password = 'StrongPass123';
  let hashedPassword: string;

  const makeUser = (overrides: any = {}) => ({
    id: 'user-1',
    name: 'Ahmed Ali',
    email,
    passwordHash: hashedPassword,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    emailVerified: true,
    oauthProvider: null,
    oauthProviderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const getLoginToken = () =>
    jwtService.signAsync(
      { sub: 'user-1', email, type: 'two-factor-login', jti: 'login-1' },
      { expiresIn: '5m' },
    );

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(password, 10);

    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        updateMany: jest.fn(),
      },
    };
    tokenRevocation = {
      revoke: jest.fn(),
      isRevoked: jest.fn().mockResolvedValue(false),
    };
    fakeRedis = new FakeRedis();
    redisService = { getClient: jest.fn(() => fakeRedis) };
    configService = { get: jest.fn(() => undefined) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        TwoFactorService,
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redisService },
        { provide: TokenRevocationService, useValue: tokenRevocation },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
    jwtService = module.get<JwtService>(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fakeRedis = new FakeRedis();
    redisService.getClient.mockImplementation(() => fakeRedis);
    tokenRevocation.isRevoked.mockResolvedValue(false);
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
  });

  describe('verifyTwoFactor', () => {
    it('issues an access JWT when the code is correct', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      const loginToken = await getLoginToken();
      const code = authenticator.generate(secret);

      const result: any = await service.verifyTwoFactor(loginToken, code);

      expect(result.accessToken).toBeDefined();
      const decoded: any = jwtService.decode(result.accessToken);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.type).toBe('access');
    });

    it('rejects an incorrect verification code', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      const loginToken = await getLoginToken();

      await expect(
        service.verifyTwoFactor(loginToken, '000000'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when 2FA is not enabled on the account', async () => {
      const loginToken = await getLoginToken();
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.verifyTwoFactor(loginToken, '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an invalid or tampered login token', async () => {
      await expect(
        service.verifyTwoFactor('not-a-jwt', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyRecoveryCode', () => {
    it('issues tokens when a valid unused recovery code is presented', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true }),
      );

      const plainCode = 'a1b2c-d3e4f';
      const hash = createHash('sha256')
        .update(plainCode.replace('-', '').toUpperCase())
        .digest('hex');
      await fakeRedis.set(
        '2fa-recovery:user-1',
        JSON.stringify([hash, 'other-hash']),
      );

      const loginToken = await getLoginToken();
      const result: any = await service.verifyRecoveryCode(
        loginToken,
        plainCode,
      );

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      const stored = JSON.parse(await fakeRedis.get('2fa-recovery:user-1'));
      expect(stored).not.toContain(hash);
      expect(stored).toContain('other-hash');
    });

    it('rejects an unknown or already-used recovery code', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true }),
      );
      await fakeRedis.set('2fa-recovery:user-1', JSON.stringify(['some-hash']));

      const loginToken = await getLoginToken();
      await expect(
        service.verifyRecoveryCode(loginToken, 'zzzzz-zzzzz'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when 2FA is not enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      const loginToken = await getLoginToken();

      await expect(
        service.verifyRecoveryCode(loginToken, 'a1b2c-d3e4f'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an invalid login token', async () => {
      await expect(
        service.verifyRecoveryCode('not-a-jwt', 'a1b2c-d3e4f'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('setupTwoFactor', () => {
    it('generates a secret and otpauth URL, and stores the secret', async () => {
      const user = makeUser();
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      const result = await service.setupTwoFactor('user-1');

      expect(result.secret).toBeDefined();
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(result.otpauthUrl).toContain(email.replace('@', '%40'));
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorSecret: result.secret },
      });
    });

    it('rejects setup when 2FA is already enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true }),
      );

      await expect(service.setupTwoFactor('user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFound when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setupTwoFactor('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('enableTwoFactor', () => {
    it('enables 2FA, returns recovery codes and revokes existing sessions', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorSecret: secret }),
      );
      prisma.user.update.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      const code = authenticator.generate(secret);
      const result = await service.enableTwoFactor('user-1', { code });

      expect(result.message).toBe(
        'Two-factor authentication enabled successfully',
      );
      expect(Array.isArray(result.recoveryCodes)).toBe(true);
      expect(result.recoveryCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorEnabled: true },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('stores hashed (never plaintext) recovery codes in Redis', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorSecret: secret }),
      );
      prisma.user.update.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      const code = authenticator.generate(secret);
      const result = await service.enableTwoFactor('user-1', { code });

      const raw = await fakeRedis.get('2fa-recovery:user-1');
      const storedHashes = JSON.parse(raw);
      const sampleHash = result.recoveryCodes[0].replace('-', '').toUpperCase();
      const expectedHash = createHash('sha256')
        .update(sampleHash)
        .digest('hex');
      expect(storedHashes).toContain(expectedHash);
      expect(storedHashes).not.toContain(result.recoveryCodes[0]);
    });

    it('rejects an incorrect verification code', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorSecret: secret }),
      );

      await expect(
        service.enableTwoFactor('user-1', { code: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects enabling when 2FA is already enabled', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      await expect(
        service.enableTwoFactor('user-1', { code: '123456' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects enabling without a prior setup', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.enableTwoFactor('user-1', { code: '123456' }),
      ).rejects.toThrow('Please request a 2FA setup first');
    });
  });

  describe('disableTwoFactor', () => {
    it('disables 2FA when code and password match, and revokes sessions', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );
      prisma.user.update.mockResolvedValue(makeUser());
      await fakeRedis.set(
        '2fa-recovery:user-1',
        JSON.stringify(['hash1', 'hash2']),
      );

      const code = authenticator.generate(secret);
      const result = await service.disableTwoFactor('user-1', {
        code,
        password,
      });

      expect(result.message).toBe(
        'Two-factor authentication disabled successfully',
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(await fakeRedis.get('2fa-recovery:user-1')).toBeNull();
    });

    it('rejects a wrong password even with a valid code', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      const code = authenticator.generate(secret);
      await expect(
        service.disableTwoFactor('user-1', {
          code,
          password: 'WrongPass123',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an incorrect verification code', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      await expect(
        service.disableTwoFactor('user-1', {
          code: '000000',
          password,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects disabling when 2FA is not enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.disableTwoFactor('user-1', {
          code: '123456',
          password,
        }),
      ).rejects.toThrow('Two-factor authentication is not enabled');
    });
  });
});
