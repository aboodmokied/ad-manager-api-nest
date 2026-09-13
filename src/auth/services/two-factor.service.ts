import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenService } from './token.service';
import { TokenEncryptionService } from '../../common/services/token-encryption.service';
import { EnableTwoFactorDto } from '../dto/enable-two-factor.dto';
import { DisableTwoFactorDto } from '../dto/disable-two-factor.dto';
import { RECOVERY_CODE_COUNT } from '../constants/auth-messages';
import {
  createTotpUri,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotpCode,
} from '../utils/totp.util';

/**
 * TOTP setup/enable/disable plus one-time recovery codes, persisted hashed in
 * the database. TOTP secrets are encrypted at rest with versioned ciphertext (v1:...)
 * using TokenEncryptionService while maintaining backward compatibility via dual-read.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly tokenService: TokenService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {}

  /**
   * Resolves the plaintext TOTP secret from persisted storage.
   * Preserves backward-compatibility by supporting both:
   * 1. Versioned encrypted secrets (`v1:...`) encrypted at rest via TokenEncryptionService.
   * 2. Legacy unencrypted plaintext secrets (dual-read fallback).
   */
  private resolveTotpSecret(persistedSecret: string): string {
    if (!persistedSecret) {
      return '';
    }
    if (persistedSecret.startsWith('v1:')) {
      try {
        return this.tokenEncryption.decrypt(persistedSecret);
      } catch (err: any) {
        this.logger.error(
          `Failed to decrypt versioned TOTP secret: ${err?.message || err}`,
        );
        throw new UnauthorizedException(
          'Failed to decrypt two-factor authentication secret',
        );
      }
    }
    // Backward compatibility: handle existing unencrypted secrets
    return persistedSecret;
  }

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

    const plainSecret = this.resolveTotpSecret(user.twoFactorSecret);
    const codeValid = verifyTotpCode(code, plainSecret);
    if (!codeValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Lazy migration: upgrade legacy plaintext secret to encrypted at rest
    if (!user.twoFactorSecret.startsWith('v1:')) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { twoFactorSecret: this.tokenEncryption.encrypt(plainSecret) },
      });
    }

    return this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
  }

  /** Completes a login with a single-use recovery code (stored hashed in database). */
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

    const storedHashes: string[] = user.twoFactorRecoveryCodes ?? [];
    const presentedHash = hashRecoveryCode(normalizeRecoveryCode(recoveryCode));
    const index = storedHashes.indexOf(presentedHash);

    if (index === -1) {
      throw new UnauthorizedException('Invalid recovery code');
    }

    // Recovery codes are single-use: remove the used code and persist the rest
    const remainingHashes = [...storedHashes];
    remainingHashes.splice(index, 1);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorRecoveryCodes: remainingHashes },
    });

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

    // Persist secret encrypted at rest using versioned ciphertext
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: this.tokenEncryption.encrypt(secret) },
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

    const plainSecret = this.resolveTotpSecret(user.twoFactorSecret);
    const codeValid = verifyTotpCode(dto.code, plainSecret);
    if (!codeValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Generate single-use recovery codes as a fallback for lost authenticator devices
    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const hashed = recoveryCodes.map((code) =>
      hashRecoveryCode(normalizeRecoveryCode(code)),
    );

    const updateData: {
      twoFactorEnabled: boolean;
      twoFactorRecoveryCodes: string[];
      twoFactorSecret?: string;
    } = {
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: hashed,
    };

    // Lazy migration: upgrade legacy plaintext secret to encrypted at rest
    if (!user.twoFactorSecret.startsWith('v1:')) {
      updateData.twoFactorSecret = this.tokenEncryption.encrypt(plainSecret);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Invalidate all existing sessions now that 2FA is required
    await this.tokenService.revokeAllRefreshTokens(user.id);

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

    const plainSecret = this.resolveTotpSecret(user.twoFactorSecret);
    const codeValid = verifyTotpCode(dto.code, plainSecret);
    if (!codeValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
      },
    });

    // Invalidate existing sessions
    await this.tokenService.revokeAllRefreshTokens(user.id);

    return { message: 'Two-factor authentication disabled successfully' };
  }

  async issueRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const hashed = codes.map((code) =>
      hashRecoveryCode(normalizeRecoveryCode(code)),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorRecoveryCodes: hashed },
    });

    return codes;
  }

  async clearRecoveryCodes(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorRecoveryCodes: [] },
    });
  }
}
