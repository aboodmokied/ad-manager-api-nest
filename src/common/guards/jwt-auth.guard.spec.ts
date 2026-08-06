import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenRevocationService } from '../../auth/services/token-revocation.service';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;
  let tokenRevocation: { revoke: jest.Mock; isRevoked: jest.Mock };

  const buildContext = (authorization?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    }) as unknown as ExecutionContext;

  // Module compiled once; per-test state reset in beforeEach below.
  beforeAll(async () => {
    tokenRevocation = {
      revoke: jest.fn(),
      isRevoked: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        JwtAuthGuard,
        { provide: TokenRevocationService, useValue: tokenRevocation },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    jwtService = module.get<JwtService>(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tokenRevocation.isRevoked.mockResolvedValue(false);
  });

  const signAccessToken = (options: any = {}, payload: any = {}) =>
    jwtService.signAsync(
      { sub: 'user-1', email: 'ahmed@example.com', type: 'access', ...payload },
      options,
    );

  it('allows a valid access token', async () => {
    const token = await signAccessToken({ expiresIn: '1h' });

    await expect(
      guard.canActivate(buildContext(`Bearer ${token}`)),
    ).resolves.toBe(true);
  });

  it('rejects a request without an authorization header', async () => {
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a non-Bearer authorization header', async () => {
    await expect(guard.canActivate(buildContext('Basic abc'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a tampered token', async () => {
    const token = await signAccessToken({ expiresIn: '1h' });

    await expect(
      guard.canActivate(buildContext(`Bearer ${token}tampered`)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token with a re-login message', async () => {
    const token = await signAccessToken({ expiresIn: 0 });

    await expect(
      guard.canActivate(buildContext(`Bearer ${token}`)),
    ).rejects.toThrow('Session has expired. Please log in again.');
  });

  it('rejects a revoked token (after logout) with a re-login message', async () => {
    const token = await signAccessToken({ expiresIn: '1h' });
    tokenRevocation.isRevoked.mockResolvedValue(true);

    await expect(
      guard.canActivate(buildContext(`Bearer ${token}`)),
    ).rejects.toThrow('Session has been terminated. Please log in again.');
  });

  it('rejects a two-factor login token (not an access token)', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-1', email: 'ahmed@example.com', type: 'two-factor-login' },
      { expiresIn: '5m' },
    );

    await expect(
      guard.canActivate(buildContext(`Bearer ${token}`)),
    ).rejects.toThrow(UnauthorizedException);
  });
});
