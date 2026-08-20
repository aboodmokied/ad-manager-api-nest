import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenRevocationService } from './token-revocation.service';
import { TokenPayload } from '../interfaces/auth.interfaces';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN,
  TWO_FACTOR_LOGIN_TOKEN_EXPIRES_IN,
} from '../constant/auth-messages';

/**
 * Owns every JWT concern: payload building, signing, verification, refresh
 * token rotation/persistence and server-side revocation.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly configService: ConfigService,
  ) {}

  buildPayload(
    userId: string,
    email: string,
    type: TokenPayload['type'],
    prn?: string,
  ): TokenPayload {
    return { sub: userId, email, type, jti: randomUUID(), prn };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async signToken(
    payload: TokenPayload,
    expiresIn: string | number,
  ): Promise<string> {
    return this.jwtService.signAsync(payload, {
      expiresIn: expiresIn as any,
    });
  }

  /**
   * Verifies a JWT and enforces its type. Throws UnauthorizedException with
   * the given messages so each flow keeps its own user-facing wording.
   */
  async verifyTypedToken(
    token: string,
    expectedType: TokenPayload['type'],
    messages: { expired: string; wrongType: string },
  ): Promise<TokenPayload> {
    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException(messages.expired);
    }
    if (payload.type !== expectedType) {
      throw new UnauthorizedException(messages.wrongType);
    }
    return payload;
  }

  async issueTokens(userId: string, email: string, emailVerified = false) {
    const refreshExpiresInSeconds = this.getRefreshExpiresInSeconds();

    const accessToken = await this.jwtService.signAsync(
      this.buildPayload(userId, email, 'access'),
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );
    const refreshToken = await this.jwtService.signAsync(
      this.buildPayload(userId, email, 'refresh'),
      { expiresIn: refreshExpiresInSeconds },
    );

    const expiresAt = new Date(Date.now() + refreshExpiresInSeconds * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: { id: userId, email, emailVerified },
    };
  }

  /** Short-lived token proving a password/Google credential was accepted,
   *  requiring a 2FA code before full tokens are issued. */
  async issueLoginToken(userId: string, email: string): Promise<string> {
    return this.jwtService.signAsync(
      this.buildPayload(userId, email, 'two-factor-login'),
      { expiresIn: TWO_FACTOR_LOGIN_TOKEN_EXPIRES_IN },
    );
  }

  /** Rotates the refresh token: revokes the presented one, issues a new pair. */
  async refresh(refreshToken: string) {
    const payload = await this.verifyTypedToken(refreshToken, 'refresh', {
      expired: 'Invalid or expired refresh token',
      wrongType: 'Invalid refresh token',
    });

    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (record.revokedAt) {
      // Reuse of a rotated token is a sign of theft: revoke the whole family
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    return this.issueTokens(
      payload.sub,
      payload.email,
      user?.emailVerified ?? false,
    );
  }

  /** Revokes the presented access token and every refresh token of the user. */
  async logout(token: string) {
    const decoded = this.jwtService.decode(token) as {
      exp?: number;
      sub?: string;
    } | null;
    if (decoded?.exp) {
      const ttlSeconds = Math.max(
        0,
        decoded.exp - Math.floor(Date.now() / 1000),
      );
      await this.tokenRevocationService.revoke(token, ttlSeconds);
    }
    if (decoded?.sub) {
      await this.revokeAllRefreshTokens(decoded.sub);
    }
    return { message: 'Logged out successfully' };
  }

  /** Revokes a JWT until its natural expiry so it cannot be replayed. */
  async revokeToken(token: string): Promise<void> {
    const decoded = this.jwtService.decode(token) as { exp?: number } | null;
    const ttlSeconds = Math.max(
      0,
      (decoded?.exp ?? 0) - Math.floor(Date.now() / 1000),
    );
    await this.tokenRevocationService.revoke(token, ttlSeconds);
  }

  async isTokenRevoked(token: string): Promise<boolean> {
    return this.tokenRevocationService.isRevoked(token);
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Parses the JWT_REFRESH_EXPIRES_IN value (e.g. "7d", "12h", "30m") into
   * seconds. Falls back to 7 days when unset or malformed.
   */
  private getRefreshExpiresInSeconds(): number {
    const value =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      DEFAULT_REFRESH_TOKEN_EXPIRES_IN;

    const match = /^(\d+)([smhdw])$/.exec(value.trim());
    if (!match) {
      return 7 * 24 * 60 * 60;
    }

    const amount = Number(match[1]);
    const unitMultiplier: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
      w: 7 * 24 * 60 * 60,
    };
    return amount * unitMultiplier[match[2]];
  }
}
