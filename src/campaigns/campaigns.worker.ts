import { Injectable, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdapterFactory } from '../adapters/adapter-factory.service';
import { RateLimiterService } from '../common/rate-limiter.service';
import { IdempotencyService } from '../common/idempotency.service';
import { CampaignStatus } from '@prisma/client';

@Injectable()
export class CampaignsWorker implements OnModuleInit {
  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly prisma: PrismaService,
    private readonly adapterFactory: AdapterFactory,
    private readonly rateLimiter: RateLimiterService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async onModuleInit() {
    await this.rabbitMQService.consume(
      'campaign_created_queue',
      'campaign.created',
      this.handleCampaignCreated.bind(this),
    );
  }

  private async handleCampaignCreated(msg: any) {
    const { uacmCampaignId, platformCampaignId, platform } = JSON.parse(
      msg.content.toString(),
    );

    const idempotencyKey = `campaign:${platformCampaignId}`;

    // Check idempotency first
    const alreadyProcessed =
      await this.idempotencyService.checkAndMarkProcessed(idempotencyKey);
    if (alreadyProcessed) {
      console.log(`Campaign ${platformCampaignId} already processed`);
      return;
    }

    // Get platform campaign and connected account
    const platformCampaign = await this.prisma.platformCampaign.findUnique({
      where: { id: platformCampaignId },
      include: { uacmCampaign: true },
    });

    if (!platformCampaign) {
      throw new Error(`Platform campaign ${platformCampaignId} not found`);
    }

    const connectedAccount = await this.prisma.connectedAccount.findFirst({
      where: { userId: platformCampaign.uacmCampaign.userId, platform },
    });

    if (!connectedAccount) {
      await this.prisma.platformCampaign.update({
        where: { id: platformCampaignId },
        data: { status: CampaignStatus.ERROR },
      });
      throw new Error(`No connected account for platform ${platform}`);
    }

    // Check rate limit
    const rateLimitKey = `platform:${platform}:${connectedAccount.id}`;
    const rateLimitAllowed = await this.rateLimiter.checkRateLimit(
      rateLimitKey,
      {
        tokensPerInterval: 100, // Example: 100 requests per minute
        interval: 60000,
      },
    );

    if (!rateLimitAllowed) {
      // Requeue the message to be processed later
      throw new Error('Rate limit exceeded');
    }

    // Get adapter and create campaign on platform
    try {
      const adapter = this.adapterFactory.getAdapter(platform);
      const platformCampaignExternalId = await adapter.createCampaign(
        {
          uacmCampaignId,
          name: platformCampaign.uacmCampaign.name,
          budget: platformCampaign.uacmCampaign.budget.toNumber(),
          startDate: platformCampaign.uacmCampaign.startDate,
          endDate: platformCampaign.uacmCampaign.endDate,
          platformSpecificData: platformCampaign.platformData,
        },
        connectedAccount.accessToken,
      );

      // Update status to active
      await this.prisma.platformCampaign.update({
        where: { id: platformCampaignId },
        data: {
          status: CampaignStatus.ACTIVE,
          platformCampaignId: platformCampaignExternalId,
        },
      });
    } catch (error) {
      await this.prisma.platformCampaign.update({
        where: { id: platformCampaignId },
        data: { status: CampaignStatus.ERROR },
      });
      throw error;
    }
  }
}
