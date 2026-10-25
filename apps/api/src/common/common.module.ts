import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { IdempotencyService } from './services/idempotency.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { TenantResolverService } from './services/tenant-resolver.service';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { TokenEncryptionService } from './services/token-encryption.service';

import { WorkspaceRolesGuard } from './guards/workspace-roles.guard';
import { WorkspaceContextInterceptor } from './interceptors/workspace-context.interceptor';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, RedisModule],
  providers: [
    IdempotencyService,
    RateLimiterService,
    TenantResolverService,
    RequestIdMiddleware,
    TokenEncryptionService,
    WorkspaceRolesGuard,
    WorkspaceContextInterceptor,
  ],
  exports: [
    IdempotencyService,
    RateLimiterService,
    TenantResolverService,
    RequestIdMiddleware,
    TokenEncryptionService,
    WorkspaceRolesGuard,
    WorkspaceContextInterceptor,
  ],
})
export class CommonModule {}
