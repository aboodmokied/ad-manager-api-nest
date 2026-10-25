import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
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

describe('PasswordService', () => {
  let service: PasswordService;
  let jwtService: JwtService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
  };
  let tokenRevocation: { revoke: jest.Mock; isRevoked: jest.Mock };
  let mailService: { sendPasswordResetEmail: jest.Mock };
  let configService: { get: jest.Mock };
  let fakeRedis: FakeRedis;
  let redisService: { getClient: jest.Mock };

  const email = 'ahmed@example.com';
  const originalPassword = 'StrongPass123';
  const newPassword = 'NewStrongPass456';
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

  const defaultGetConfig = (key: string) => {
    if (key === 'FRONTEND_URL') return 'http://localhost:3000';
    return undefined;
  };

  const getValidToken = () =>
    jwtService.signAsync(
      {
        sub: 'user-1',
        email,
        type: 'password-reset',
        jti: 'reset-1',
        prn: 'current-nonce',
      },
      { expiresIn: '15m' },
    );

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(originalPassword, 10);

    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
    };
    tokenRevocation = {
      revoke: jest.fn(),
      isRevoked: jest.fn().mockResolvedValue(false),
    };
    mailService = { sendPasswordResetEmail: jest.fn() };
    fakeRedis = new FakeRedis();
    redisService = { getClient: jest.fn(() => fakeRedis) };
    configService = { get: jest.fn(defaultGetConfig) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        PasswordService,
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redisService },
        { provide: MailService, useValue: mailService },
        { provide: TokenRevocationService, useValue: tokenRevocation },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
    jwtService = module.get<JwtService>(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fakeRedis = new FakeRedis();
    redisService.getClient.mockImplementation(() => fakeRedis);
    configService.get.mockImplementation(defaultGetConfig);
    tokenRevocation.isRevoked.mockResolvedValue(false);
  });

  describe('forgotPassword', () => {
    it('sends a reset link to the registered email', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.forgotPassword({ email });

      expect(result.message).toBe('Password reset link sent to your email');
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        email,
        expect.stringContaining('token='),
      );

      const resetLink: string =
        mailService.sendPasswordResetEmail.mock.calls[0][1];
      expect(
        resetLink.startsWith(
          'http://localhost:8030/api/v1/auth/reset-password',
        ),
      ).toBe(true);

      const token = new URL(resetLink).searchParams.get('token') as string;
      const decoded: any = jwtService.decode(token);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.type).toBe('password-reset');
      expect(decoded.jti).toBeDefined();
      expect(decoded.prn).toBeDefined();
    });

    it('stores the reset nonce so only the latest link stays valid', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await service.forgotPassword({ email });

      const storedNonce = await fakeRedis.get('password-reset:user-1');
      expect(storedNonce).toBeDefined();
    });

    it('does not reveal whether an email is registered', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nobody@example.com',
      });

      expect(result.message).toBe('Password reset link sent to your email');
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const seedValidNonce = () =>
      fakeRedis.set('password-reset:user-1', 'current-nonce');

    it('updates the password with a new hash and revokes the token', async () => {
      const token = await getValidToken();
      await seedValidNonce();
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser());

      const result = await service.resetPassword({ token, newPassword });

      expect(result.message).toBe('Password has been reset successfully');

      const updateData = prisma.user.update.mock.calls[0][0].data;
      expect(updateData.passwordHash).not.toBe(newPassword);
      expect(await bcrypt.compare(newPassword, updateData.passwordHash)).toBe(
        true,
      );
      expect(
        await bcrypt.compare(originalPassword, updateData.passwordHash),
      ).toBe(false);

      expect(tokenRevocation.revoke).toHaveBeenCalledWith(
        token,
        expect.any(Number),
      );
    });

    it('invalidates all existing sessions after a password reset', async () => {
      const token = await getValidToken();
      await seedValidNonce();
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser());

      await service.resetPassword({ token, newPassword });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(await fakeRedis.get('password-reset:user-1')).toBeNull();
      expect(tokenRevocation.revoke).toHaveBeenCalledWith(
        token,
        expect.any(Number),
      );
    });

    it('rejects resetting to the current password', async () => {
      const token = await getValidToken();
      await seedValidNonce();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ passwordHash: await bcrypt.hash(newPassword, 10) }),
      );

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a reset link that is not the latest one issued', async () => {
      const token = await getValidToken();
      prisma.user.findUnique.mockResolvedValue(makeUser());
      // Store a different nonce than the one embedded in the token
      await fakeRedis.set('password-reset:user-1', 'stale-nonce');

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow(
        'This reset link is no longer valid. Please request a new one.',
      );
    });

    it('rejects an expired reset link', async () => {
      const token = await jwtService.signAsync(
        {
          sub: 'user-1',
          email,
          type: 'password-reset',
          jti: 'reset-1',
        },
        { expiresIn: 0 },
      );

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow(
        'This reset link has expired. Please request a new one.',
      );
    });

    it('rejects a token that is not a reset token', async () => {
      const token = await jwtService.signAsync(
        { sub: 'user-1', email, type: 'access', jti: 'x' },
        { expiresIn: '15m' },
      );

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow('Invalid reset link. Please request a new one.');
    });

    it('rejects a reset link that was already used', async () => {
      const token = await getValidToken();
      tokenRevocation.isRevoked.mockResolvedValue(true);

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow(
        'This reset link has already been used. Please request a new one.',
      );
    });
  });
});
