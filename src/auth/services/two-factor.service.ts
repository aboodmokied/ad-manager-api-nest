import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenService } from './token.service';
import { EnableTwoFactorDto } from '../dto/enable-two-factor.dto';
import { DisableTwoFactorDto } from '../dto/disable-two-factor.dto';
import {
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_TTL_SECONDS,
} from '../constant/auth-messages';
import {
  createTotpUri,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotpCode,
} from '../utils/totp.util';
import { requireRedis } from 'src/common/utils/redis.util';

/**
 * TOTP setup/enable/disable plus one-time recovery codes, stored hashed in
 * Redis. Flows that complete a login delegate token issuance to TokenService.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly tokenService: TokenService,
  ) {}

  /** Verifies a 2FA code against the account bound to the login token. */
  async verifyTwoFactor(loginToken: string, code: string) {
    const payload = await this.tokenService.verifyTypedToken(
      loginToken,
      'two-factor-login',
      {
        expired: 'Invalid or expired login token',
        wrongType: 'Invalid login token',
      },
    );

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException(
        'Two-factor authentication is not enabled for this account',
      );
    }

    const codeValid = verifyTotpCode(code, user.twoFactorSecret);
    if (!codeValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    return this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
  }

  /** Completes a login with a single-use recovery code (stored hashed). */
  async verifyRecoveryCode(loginToken: string, recoveryCode: string) {
    const payload = await this.tokenService.verifyTypedToken(
      loginToken,
      'two-factor-login',
      {
        expired: 'Invalid or expired login token',
        wrongType: 'Invalid login token',
      },
    );

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.twoFactorEnabled) {
      throw new UnauthorizedException(
        'Two-factor authentication is not enabled for this account',
      );
    }

    const redis = requireRedis(this.redisService);

    const raw = await redis.get(this.recoveryCodesKey(user.id));
    const storedHashes: string[] = raw ? JSON.parse(raw) : [];

    const presentedHash = hashRecoveryCode(normalizeRecoveryCode(recoveryCode));
    const index = storedHashes.indexOf(presentedHash);

    if (index === -1) {
      throw new UnauthorizedException('Invalid recovery code');
    }

    // Recovery codes are single-use: remove the used code and persist the rest
    storedHashes.splice(index, 1);
    await redis.set(
      this.recoveryCodesKey(user.id),
      JSON.stringify(storedHashes),
      'EX',
      RECOVERY_CODE_TTL_SECONDS,
    );

    return this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
  }

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.twoFactorEnabled) {
      throw new ConflictException(
        'Two-factor authentication is already enabled',
      );
    }

    const secret = generateTotpSecret();
    const otpauthUrl = createTotpUri(user.email, secret);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret },
    });

    return { secret, otpauthUrl };
  }

  async enableTwoFactor(userId: string, dto: EnableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.twoFactorEnabled) {
      throw new ConflictException(
        'Two-factor authentication is already enabled',
      );
    }
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Please request a 2FA setup first');
    }

    const codeValid = verifyTotpCode(dto.code, user.twoFactorSecret);
    if (!codeValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });

    // Invalidate all existing sessions now that 2FA is required
    await this.tokenService.revokeAllRefreshTokens(user.id);

    // Issue one-time recovery codes as a fallback for lost authenticator devices
    const recoveryCodes = await this.issueRecoveryCodes(user.id);

    return {
      message: 'Two-factor authentication enabled successfully',
      recoveryCodes,
    };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    // Re-authenticate with the password so 2FA cannot be removed by
    // someone holding only a transient TOTP code
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const codeValid = verifyTotpCode(dto.code, user.twoFactorSecret);
    if (!codeValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    // Invalidate existing sessions and delete recovery codes
    await this.tokenService.revokeAllRefreshTokens(user.id);
    await this.clearRecoveryCodes(user.id);

    return { message: 'Two-factor authentication disabled successfully' };
  }

  async issueRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const hashed = codes.map((code) =>
      hashRecoveryCode(normalizeRecoveryCode(code)),
    );

    const redis = this.redisService.getClient();
    if (redis) {
      await redis.set(
        this.recoveryCodesKey(userId),
        JSON.stringify(hashed),
        'EX',
        RECOVERY_CODE_TTL_SECONDS,
      );
    }

    return codes;
  }

  async clearRecoveryCodes(userId: string): Promise<void> {
    const redis = this.redisService.getClient();
    if (redis) {
      await redis.del(this.recoveryCodesKey(userId));
    }
  }

  private recoveryCodesKey(userId: string): string {
    return `2fa-recovery:${userId}`;
  }
}
