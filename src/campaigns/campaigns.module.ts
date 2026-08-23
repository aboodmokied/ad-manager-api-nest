import { Module } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsWorker } from './campaigns.worker';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RateLimiterService } from '../common/rate-limiter.service';
import { IdempotencyService } from '../common/idempotency.service';
import { AdapterFactory } from '../adapters/adapter-factory.service';
import { MetaAdapter } from '../adapters/meta.adapter';
import { GoogleAdapter } from '../adapters/google.adapter';
import { AccountsModule } from '../accounts/accounts.module';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { TokenRevocationService } from '../auth/services/token-revocation.service';

@Module({
  imports: [PrismaModule, AccountsModule, AuthModule],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    CampaignsWorker,
    RateLimiterService,
    IdempotencyService,
    AdapterFactory,
    MetaAdapter,
    GoogleAdapter,
    JwtAuthGuard,
    TokenRevocationService,
  ],
})
export class CampaignsModule {}
