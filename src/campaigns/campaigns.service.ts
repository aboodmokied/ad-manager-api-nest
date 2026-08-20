import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CampaignStatus } from '@prisma/client';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async create(createCampaignDto: CreateCampaignDto) {
    const uacmCampaign = await this.prisma.uacmCampaign.create({
      data: {
        userId: createCampaignDto.userId,
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

    // Emit event for each platform campaign
    for (const platformCampaign of uacmCampaign.platformCampaigns) {
      await this.rabbitMQService.publish('campaign.created', {
        uacmCampaignId: uacmCampaign.id,
        platformCampaignId: platformCampaign.id,
        platform: platformCampaign.platform,
      });
    }

    return uacmCampaign;
  }

  async findOne(id: string) {
    return this.prisma.uacmCampaign.findUnique({
      where: { id },
      include: { platformCampaigns: true },
    });
  }
}
