import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
import { TokenService } from './token.service';
import { TokenPayload } from '../interfaces/auth.interfaces';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { getBackendUrl } from '../utils/app-urls.util';
import {
  BCRYPT_SALT_ROUNDS,
  PASSWORD_RESET_TOKEN_EXPIRES_IN,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  DUMMY_PASSWORD_HASH,
} from '../constants/auth-messages';

/**
 * Password reset flow: issues a nonce-bound reset link, emails it, and
 * applies the new password while invalidating every existing session.
 */
@Injectable()
export class PasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
  ) {}

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: forgotPasswordDto.email },
    });

    if (user) {
      // Issue a fresh nonce that invalidates any previously sent reset links
      const nonce = randomUUID();
      const redis = this.redisService.getClient();
      if (redis) {
        await redis.set(
          `password-reset:${user.id}`,
          nonce,
          'EX',
          PASSWORD_RESET_TOKEN_TTL_SECONDS,
        );
      }

      const resetToken = await this.tokenService.signToken(
        this.tokenService.buildPayload(
          user.id,
          user.email,
          'password-reset',
          nonce,
        ),
        PASSWORD_RESET_TOKEN_EXPIRES_IN,
      );
      const resetLink = `${getBackendUrl(this.configService)}/api/v1/auth/reset-password?token=${resetToken}`;

      await this.mailService.sendPasswordResetEmail(user.email, resetLink);
    } else {
      // Equalize response timing so the response does not reveal
      // whether the email is registered
      await bcrypt.compare(forgotPasswordDto.email, DUMMY_PASSWORD_HASH);
    }

    // Always return the same message to prevent user enumeration
    return { message: 'Password reset link sent to your email' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const payload = await this.resolvePasswordResetToken(
      resetPasswordDto.token,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.email !== payload.email) {
      throw new UnauthorizedException(
        'Invalid reset link. Please request a new one.',
      );
    }

    const samePassword = await bcrypt.compare(
      resetPasswordDto.newPassword,
      user.passwordHash,
    );
    if (samePassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await bcrypt.hash(
      resetPasswordDto.newPassword,
      BCRYPT_SALT_ROUNDS,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Invalidate all existing sessions after a password change
    await this.tokenService.revokeAllRefreshTokens(user.id);

    const redis: any = this.redisService.getClient();
    if (redis) {
      await redis.del(`password-reset:${user.id}`);
    }

    await this.tokenService.revokeToken(resetPasswordDto.token);

    return { message: 'Password has been reset successfully' };
  }

  private async resolvePasswordResetToken(
    resetToken: string,
  ): Promise<TokenPayload> {
    const payload = await this.tokenService.verifyTypedToken(
      resetToken,
      'password-reset',
      {
        expired: 'This reset link has expired. Please request a new one.',
        wrongType: 'Invalid reset link. Please request a new one.',
      },
    );
    if (await this.tokenService.isTokenRevoked(resetToken)) {
      throw new UnauthorizedException(
        'This reset link has already been used. Please request a new one.',
      );
    }
    // The link is only valid if it was the most recently issued one
    const redis: any = this.redisService.getClient();
    if (payload.prn && redis) {
      const storedNonce = await redis.get(`password-reset:${payload.sub}`);
      if (storedNonce !== payload.prn) {
        throw new UnauthorizedException(
          'This reset link is no longer valid. Please request a new one.',
        );
      }
    }
    return payload;
  }
}
