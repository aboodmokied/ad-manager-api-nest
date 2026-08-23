import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CampaignStatus } from '@prisma/client';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { IdempotencyService } from '../common/idempotency.service';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Creates a campaign. When the client supplies an Idempotency-Key header
   * the request is deduplicated: a second call with the same key is rejected
   * with 409 instead of creating a duplicate campaign.
   */
  async create(
    userId: string,
    createCampaignDto: CreateCampaignDto,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey ? `http:campaigns:${idempotencyKey}` : undefined;
    if (key) {
      const alreadyProcessed =
        await this.idempotencyService.checkAndMarkProcessed(key);
      if (alreadyProcessed) {
        throw new ConflictException(
          'A campaign was already created for this Idempotency-Key.',
        );
      }
    }

    try {
      const uacmCampaign = await this.prisma.uacmCampaign.create({
        data: {
          userId,
          name: createCampaignDto.name,
          budget: createCampaignDto.budget,
          startDate: new Date(createCampaignDto.startDate),
          endDate: new Date(createCampaignDto.endDate),
          status: CampaignStatus.PENDING,
          platformCampaigns: {
            create: createCampaignDto.platforms.map((config) => ({
              platform: config.platform,
              platformData: config.platformSpecificData,
              status: CampaignStatus.PENDING,
            })),
          },
        },
        include: { platformCampaigns: true },
      });

      // Emit an event for each platform campaign. A failure here must not
      // fail the HTTP request: the worker's startup sweep re-publishes
      // PENDING platform campaigns, so the row will still be processed.
      for (const platformCampaign of uacmCampaign.platformCampaigns) {
        await this.publishCampaignCreated(uacmCampaign.id, platformCampaign);
      }

      return uacmCampaign;
    } catch (error) {
      // Roll back the reservation so the client can retry with the same key.
      if (key) {
        await this.idempotencyService.remove(key);
      }
      throw error;
    }
  }

  private async publishCampaignCreated(
    uacmCampaignId: string,
    platformCampaign: { id: string; platform: string },
  ): Promise<void> {
    const message = {
      uacmCampaignId,
      platformCampaignId: platformCampaign.id,
      platform: platformCampaign.platform,
    };
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.rabbitMQService.publish('campaign.created', message);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        }
      }
    }
    this.logger.error(
      `Could not publish campaign.created for ${platformCampaign.id} ` +
        `after 3 attempts: ${lastError instanceof Error ? lastError.message : lastError}`,
    );
  }

  /** Returns the campaign only when it belongs to the given user. */
  async findOne(userId: string, id: string) {
    return this.prisma.uacmCampaign.findFirst({
      where: { id, userId },
      include: { platformCampaigns: true },
    });
  }
}
