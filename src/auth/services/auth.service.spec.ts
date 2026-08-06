import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
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

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: { create: jest.Mock; updateMany: jest.Mock };
  };
  let tokenRevocation: { revoke: jest.Mock; isRevoked: jest.Mock };
  let mailService: {
    sendPasswordResetEmail: jest.Mock;
    sendVerificationEmail: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let fakeRedis: FakeRedis;
  let redisService: { getClient: jest.Mock };

  const validDto = {
    name: 'Ahmed Ali',
    email: 'ahmed@example.com',
    password: 'StrongPass123',
  };

  let hashedPassword: string;

  const makeUser = (overrides: any = {}) => ({
    id: 'user-1',
    name: validDto.name,
    email: validDto.email,
    passwordHash: hashedPassword,
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
    return undefined;
  };

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(validDto.password, 10);

    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    tokenRevocation = {
      revoke: jest.fn(),
      isRevoked: jest.fn().mockResolvedValue(false),
    };
    mailService = {
      sendPasswordResetEmail: jest.fn(),
      sendVerificationEmail: jest.fn(),
    };
    fakeRedis = new FakeRedis();
    redisService = { getClient: jest.fn(() => fakeRedis) };
    configService = { get: jest.fn(defaultGetConfig) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        AuthService,
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redisService },
        { provide: MailService, useValue: mailService },
        { provide: TokenRevocationService, useValue: tokenRevocation },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fakeRedis = new FakeRedis();
    redisService.getClient.mockImplementation(() => fakeRedis);
    tokenRevocation.isRevoked.mockResolvedValue(false);
    configService.get.mockImplementation(defaultGetConfig);
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
  });

  describe('register', () => {
    it('creates an account without issuing tokens until the email is verified', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(makeUser({ createdAt: new Date() }));

      const result: any = await service.register(validDto);

      expect(result.message).toContain('verify');
      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(result.user).toBeUndefined();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('emails a verification link after creating the account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({
        id: 'user-1',
        ...data,
        emailVerified: false,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await service.register(validDto);

      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        validDto.email,
        expect.stringContaining('token='),
      );
      const verifyLink: string =
        mailService.sendVerificationEmail.mock.calls[0][1];
      expect(
        verifyLink.startsWith('http://localhost:8030/api/v1/auth/verify-email'),
      ).toBe(true);
      const token = new URL(verifyLink).searchParams.get('token') as string;
      const decoded: any = jwtService.decode(token);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.type).toBe('email-verification');
      expect(decoded.prn).toBeDefined();
      expect(await fakeRedis.get('email-verification:user-1')).toBe(
        decoded.prn,
      );
    });

    it('stores the password hashed (never plaintext)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({
        id: 'user-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await service.register(validDto);

      const stored = prisma.user.create.mock.calls[0][0].data;
      expect(stored.passwordHash).toBeDefined();
      expect(stored.passwordHash).not.toBe(validDto.password);
      expect(await bcrypt.compare(validDto.password, stored.passwordHash)).toBe(
        true,
      );
    });

    it('rejects registration when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.register(validDto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('issues a valid access JWT for correct credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      const result: any = await service.login(validDto);

      expect(result.accessToken).toBeDefined();
      expect(result).not.toHaveProperty('requiresTwoFactor');

      const decoded: any = jwtService.decode(result.accessToken);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.email).toBe(validDto.email);
      expect(decoded.type).toBe('access');
    });

    it('rejects login until the email is verified', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.login(validDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(validDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      await expect(
        service.login({ ...validDto, password: 'WrongPass123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('requests a verification code instead of issuing a JWT when 2FA is enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          twoFactorSecret: 'secret',
          emailVerified: true,
        }),
      );

      const result: any = await service.login(validDto);

      expect(result.requiresTwoFactor).toBe(true);
      expect(result.loginToken).toBeDefined();
      expect(result.accessToken).toBeUndefined();

      const decoded: any = jwtService.decode(result.loginToken);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.type).toBe('two-factor-login');
    });
  });

  describe('verifyEmail', () => {
    const getValidToken = () =>
      jwtService.signAsync(
        {
          sub: 'user-1',
          email: validDto.email,
          type: 'email-verification',
          jti: 'verify-1',
          prn: 'current-nonce',
        },
        { expiresIn: '24h' },
      );

    const seedValidNonce = () =>
      fakeRedis.set('email-verification:user-1', 'current-nonce');

    it('marks the email as verified and revokes the link', async () => {
      const token = await getValidToken();
      await seedValidNonce();
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser({ emailVerified: true }));

      const result = await service.verifyEmail(token);

      expect(result.message).toBe('Your email has been verified successfully');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerified: true },
      });
      expect(tokenRevocation.revoke).toHaveBeenCalledWith(
        token,
        expect.any(Number),
      );
      expect(await fakeRedis.get('email-verification:user-1')).toBeNull();
    });

    it('reports success when the email is already verified', async () => {
      const token = await getValidToken();
      await seedValidNonce();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      const result = await service.verifyEmail(token);

      expect(result.message).toBe('Your email is already verified');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an expired verification link', async () => {
      const token = await jwtService.signAsync(
        {
          sub: 'user-1',
          email: validDto.email,
          type: 'email-verification',
          jti: 'verify-1',
        },
        { expiresIn: 0 },
      );

      await expect(service.verifyEmail(token)).rejects.toThrow(
        'This verification link has expired. Please request a new one.',
      );
    });

    it('rejects a token that is not a verification token', async () => {
      const token = await jwtService.signAsync(
        { sub: 'user-1', email: validDto.email, type: 'access', jti: 'x' },
        { expiresIn: '24h' },
      );

      await expect(service.verifyEmail(token)).rejects.toThrow(
        'Invalid verification link. Please request a new one.',
      );
    });

    it('rejects a link that is not the latest one issued', async () => {
      const token = await getValidToken();
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await fakeRedis.set('email-verification:user-1', 'stale-nonce');

      await expect(service.verifyEmail(token)).rejects.toThrow(
        'This verification link is no longer valid. Please request a new one.',
      );
    });
  });

  describe('resendVerification', () => {
    it('sends a fresh verification link for an unverified account', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.resendVerification(validDto.email);

      expect(result.message).toBe('Verification link sent to your email');
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        validDto.email,
        expect.stringContaining('token='),
      );
    });

    it('does not send a link for an already verified account', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      await service.resendVerification(validDto.email);

      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('does not reveal whether an email is registered', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resendVerification('nobody@example.com');

      expect(result.message).toBe('Verification link sent to your email');
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('returns the user profile without sensitive fields', async () => {
      const user = makeUser({ createdAt: new Date() });
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.getProfile('user-1');

      expect(result).toEqual({
        id: 'user-1',
        name: validDto.name,
        email: validDto.email,
        emailVerified: false,
        twoFactorEnabled: false,
        createdAt: user.createdAt,
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('twoFactorSecret');
    });

    it('throws NotFound when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verifyEmailPage', () => {
    const getValidToken = () =>
      jwtService.signAsync(
        {
          sub: 'user-1',
          email: validDto.email,
          type: 'email-verification',
          jti: 'verify-1',
          prn: 'current-nonce',
        },
        { expiresIn: '24h' },
      );

    it('renders a success HTML page with status 200', async () => {
      const token = await getValidToken();
      await fakeRedis.set('email-verification:user-1', 'current-nonce');
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.verifyEmailPage(token);

      expect(result.statusCode).toBe(200);
      expect(result.html).toContain('Email verified');
      expect(result.html).toContain('success');
    });

    it('renders an error page when verification fails', async () => {
      const token = await getValidToken();
      await fakeRedis.set('email-verification:user-1', 'stale-nonce');
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.verifyEmailPage(token);

      expect(result.statusCode).toBe(401);
      expect(result.html).toContain('Verification failed');
      expect(result.html).toContain('error');
    });
  });

  describe('getResetPasswordPage', () => {
    it('returns the reset password HTML form', () => {
      const html = service.getResetPasswordPage();

      expect(html).toContain('Reset your password');
      expect(html).toContain('resetForm');
    });
  });
});
