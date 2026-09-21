import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
import { TokenService } from './token.service';
import { TokenPayload, HtmlPageResult } from '../interfaces/auth.interfaces';
import { RegisterDto } from '../dto/register.dto';
import { getBackendUrl } from '../utils/app-urls.util';
import { LoginDto } from '../dto/login.dto';
import {
  BCRYPT_SALT_ROUNDS,
  EMAIL_VERIFICATION_TOKEN_EXPIRES_IN,
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  DUMMY_PASSWORD_HASH,
} from '../constants/auth-messages';
import { resetPasswordPage, verificationResultPage } from '../templates/auth-pages.template';

/**
 * Core authentication facade. Owns the account lifecycle (registration, email
 * verification, credential login, profile) and coordinates the specialized
 * TokenService, TwoFactorService, OAuthService and PasswordService.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(
      registerDto.password,
      BCRYPT_SALT_ROUNDS,
    );

    const user = await this.prisma.user.create({
      data: {
        name: registerDto.name,
        email: registerDto.email,
        passwordHash,
      },
    });

    await this.sendEmailVerification(user.id, user.email);

    return {
      message:
        'Account created successfully. Please verify your email before logging in.',
    };
  }

  /**
   * Marks a user's email as verified using the token from the emailed link.
   */
  async verifyEmail(token: string) {
    const payload = await this.resolveEmailVerificationToken(token);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.email !== payload.email) {
      throw new UnauthorizedException(
        'Invalid verification link. Please request a new one.',
      );
    }

    if (user.emailVerified) {
      return { message: 'Your email is already verified' };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    await this.tokenService.revokeToken(token);
    const redis = this.redisService.getClient();
    if (redis) {
      await redis.del(this.emailVerificationKey(user.id));
    }

    return { message: 'Your email has been verified successfully' };
  }

  /**
   * Verifies an email token and renders the result page shown to the user, so
   * the controller only has to write the status and HTML body.
   */
  async verifyEmailPage(token: string): Promise<HtmlPageResult> {
    try {
      const result = await this.verifyEmail(token);
      return {
        statusCode: HttpStatus.OK,
        html: verificationResultPage(result.message, true),
      };
    } catch (error: any) {
      return {
        statusCode: error?.status ?? HttpStatus.BAD_REQUEST,
        html: verificationResultPage(
          error?.message ?? 'Verification failed. Please request a new link.',
          false,
        ),
      };
    }
  }

  /**
   * Returns the HTML for the password reset form, keeping page rendering out
   * of the controller.
   */
  getResetPasswordPage(): string {
    return resetPasswordPage();
  }

  /**
   * Sends a fresh verification link to the user's email. Always returns the
   * same message so the response does not reveal whether the email exists.
   */
  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && !user.emailVerified) {
      await this.sendEmailVerification(user.id, user.email);
    } else if (!user) {
      await bcrypt.compare(email, DUMMY_PASSWORD_HASH);
    }

    return { message: 'Verification link sent to your email' };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });
    if (!user) {
      // Perform a dummy bcrypt comparison so response time does not reveal
      // whether the email is registered.
      await bcrypt.compare(loginDto.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email address before logging in',
      );
    }

    if (user.twoFactorEnabled) {
      const loginToken = await this.tokenService.issueLoginToken(
        user.id,
        user.email,
      );
      return {
        requiresTwoFactor: true,
        loginToken,
      };
    }

    return this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
    };
  }

  /**
   * Issues a fresh verification link (invalidating any previously sent ones)
   * and emails it to the user.
   */
  private async sendEmailVerification(
    userId: string,
    email: string,
  ): Promise<void> {
    const nonce = randomUUID();
    const redis = this.redisService.getClient();
    if (redis) {
      await redis.set(
        this.emailVerificationKey(userId),
        nonce,
        'EX',
        EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
      );
    }

    const verifyToken = await this.tokenService.signToken(
      this.tokenService.buildPayload(
        userId,
        email,
        'email-verification',
        nonce,
      ),
      EMAIL_VERIFICATION_TOKEN_EXPIRES_IN,
    );
    const verifyLink = `${getBackendUrl(this.configService)}/api/v1/auth/verify-email?token=${verifyToken}`;

    await this.mailService.sendVerificationEmail(email, verifyLink);
  }

  private emailVerificationKey(userId: string): string {
    return `email-verification:${userId}`;
  }

  private async resolveEmailVerificationToken(
    token: string,
  ): Promise<TokenPayload> {
    const payload = await this.tokenService.verifyTypedToken(
      token,
      'email-verification',
      {
        expired:
          'This verification link has expired. Please request a new one.',
        wrongType: 'Invalid verification link. Please request a new one.',
      },
    );
    if (await this.tokenService.isTokenRevoked(token)) {
      throw new UnauthorizedException(
        'This verification link has already been used. Please request a new one.',
      );
    }
    // The link is only valid if it was the most recently issued one
    const redis = this.redisService.getClient();
    if (payload.prn && redis) {
      const storedNonce = await redis.get(
        this.emailVerificationKey(payload.sub),
      );
      if (storedNonce !== payload.prn) {
        throw new UnauthorizedException(
          'This verification link is no longer valid. Please request a new one.',
        );
      }
    }
    return payload;
  }
}
