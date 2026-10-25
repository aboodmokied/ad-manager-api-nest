import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { TokenService } from './token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenRevocationService } from './token-revocation.service';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: JwtService;
  let prisma: {
    user: { findUnique: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let tokenRevocation: { revoke: jest.Mock; isRevoked: jest.Mock };
  let configService: { get: jest.Mock };

  const email = 'ahmed@example.com';

  const validRecord = {
    id: 'rt-1',
    userId: 'user-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    revokedAt: null,
    createdAt: new Date(),
  };

  const validUser = {
    id: 'user-1',
    email,
    emailVerified: true,
    passwordHash: 'hash',
    name: 'Ahmed Ali',
    twoFactorEnabled: false,
    twoFactorSecret: null,
    oauthProvider: null,
    oauthProviderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    tokenRevocation = {
      revoke: jest.fn(),
      isRevoked: jest.fn().mockResolvedValue(false),
    };
    configService = { get: jest.fn(() => undefined) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokenRevocationService, useValue: tokenRevocation },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    jwtService = module.get<JwtService>(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tokenRevocation.isRevoked.mockResolvedValue(false);
    configService.get.mockImplementation(() => undefined);
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
    prisma.user.findUnique.mockResolvedValue(validUser);
  });

  describe('issueTokens', () => {
    it('issues access and refresh tokens with the correct types', async () => {
      const result = await service.issueTokens('user-1', email, true);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      const access: any = jwtService.decode(result.accessToken);
      const refresh: any = jwtService.decode(result.refreshToken);
      expect(access.sub).toBe('user-1');
      expect(access.type).toBe('access');
      expect(refresh.type).toBe('refresh');
      expect(result.user).toEqual({
        id: 'user-1',
        email,
        emailVerified: true,
      });
    });

    it('persists only a hash of the refresh token', async () => {
      const result = await service.issueTokens('user-1', email);

      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.userId).toBe('user-1');
      expect(data.tokenHash).toBe(
        createHash('sha256').update(result.refreshToken).digest('hex'),
      );
      expect(data.tokenHash).not.toBe(result.refreshToken);
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('issueLoginToken', () => {
    it('issues a short-lived two-factor-login token', async () => {
      const token = await service.issueLoginToken('user-1', email);

      const decoded: any = jwtService.decode(token);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.type).toBe('two-factor-login');
    });
  });

  describe('refresh', () => {
    const getPair = async () => service.issueTokens('user-1', email, true);

    it('issues a new token pair and rotates the presented refresh token', async () => {
      const pair = await getPair();
      prisma.refreshToken.findUnique.mockResolvedValue(validRecord);

      const result: any = await service.refresh(pair.refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(pair.refreshToken);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String) },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects a token that is not a JWT', async () => {
      await expect(service.refresh('not-a-jwt')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an access token used as a refresh token', async () => {
      const pair = await getPair();

      await expect(service.refresh(pair.accessToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a revoked refresh token and revokes the whole token family', async () => {
      const pair = await getPair();
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validRecord,
        revokedAt: new Date(),
      });

      await expect(service.refresh(pair.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects an expired stored refresh token', async () => {
      const pair = await getPair();
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh(pair.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the access token so it becomes invalid', async () => {
      const pair = await service.issueTokens('user-1', email, true);

      const result = await service.logout(pair.accessToken);

      expect(result.message).toBe('Logged out successfully');
      expect(tokenRevocation.revoke).toHaveBeenCalledWith(
        pair.accessToken,
        expect.any(Number),
      );
    });

    it('revokes with a TTL that expires at the token expiry time', async () => {
      const token = await jwtService.signAsync(
        { sub: 'user-1', email, type: 'access' },
        { expiresIn: 60 },
      );

      await service.logout(token);

      const ttl = tokenRevocation.revoke.mock.calls[0][1];
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('revokes every refresh token of the user', async () => {
      const pair = await service.issueTokens('user-1', email, true);

      await service.logout(pair.accessToken);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('verifyTypedToken', () => {
    it('returns the payload when the type matches', async () => {
      const token = await jwtService.signAsync(
        { sub: 'user-1', email, type: 'access' },
        { expiresIn: '1h' },
      );

      const payload = await service.verifyTypedToken(token, 'access', {
        expired: 'expired',
        wrongType: 'wrong type',
      });

      expect(payload.sub).toBe('user-1');
      expect(payload.type).toBe('access');
    });

    it('rejects a token of the wrong type', async () => {
      const token = await jwtService.signAsync(
        { sub: 'user-1', email, type: 'refresh' },
        { expiresIn: '1h' },
      );

      await expect(
        service.verifyTypedToken(token, 'access', {
          expired: 'expired',
          wrongType: 'wrong type',
        }),
      ).rejects.toThrow('wrong type');
    });

    it('rejects an expired token', async () => {
      const token = await jwtService.signAsync(
        { sub: 'user-1', email, type: 'access' },
        { expiresIn: 0 },
      );

      await expect(
        service.verifyTypedToken(token, 'access', {
          expired: 'expired',
          wrongType: 'wrong type',
        }),
      ).rejects.toThrow('expired');
    });
  });
});
