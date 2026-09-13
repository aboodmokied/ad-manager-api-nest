import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { IdempotencyService } from './services/idempotency.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { TenantResolverService } from './services/tenant-resolver.service';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { TokenEncryptionService } from './services/token-encryption.service';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, RedisModule],
  providers: [
    IdempotencyService,
    RateLimiterService,
    TenantResolverService,
    RequestIdMiddleware,
    TokenEncryptionService,
  ],
  exports: [
    IdempotencyService,
    RateLimiterService,
    TenantResolverService,
    RequestIdMiddleware,
    TokenEncryptionService,
  ],
})
export class CommonModule {}
