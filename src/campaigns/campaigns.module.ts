import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignEventsService } from './events/campaign-events.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { AdaptersModule } from '../adapters/adapters.module';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { CampaignsService } from './services/campaigns.service';
import { CampaignsWorker } from './workers/campaigns.worker';

@Module({
  imports: [
    PrismaModule,
    AccountsModule,
    AuthModule,
    AdaptersModule,
    RabbitMQModule,
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    CampaignsWorker,
    CampaignEventsService,
  ],
  exports: [CampaignsService, CampaignEventsService],
})
export class CampaignsModule {}
