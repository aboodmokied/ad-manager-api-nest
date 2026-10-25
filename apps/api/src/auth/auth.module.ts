import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { TwoFactorService } from './services/two-factor.service';
import { OAuthService } from './services/oauth.service';
import { PasswordService } from './services/password.service';
import { AuthController } from './auth.controller';
import { TokenRevocationService } from './services/token-revocation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { CommonModule } from '../common/common.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ThrottleGuard } from '../common/guards/throttle.guard';

@Module({
  imports: [
    CommonModule,
    PrismaModule,
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (configService.get<string>('NODE_ENV') === 'production' && !secret) {
          throw new Error(
            'JWT_SECRET must be set in the environment when NODE_ENV=production',
          );
        }
        return { secret: secret ?? 'uacm-dev-secret' };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    TwoFactorService,
    OAuthService,
    PasswordService,
    TokenRevocationService,
    JwtAuthGuard,
    ThrottleGuard,
  ],
  exports: [
    JwtModule,
    TokenRevocationService,
    JwtAuthGuard,
    ThrottleGuard,
    AuthService,
    TokenService,
  ],
})
export class AuthModule {}
