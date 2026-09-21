import { ApiProperty } from '@nestjs/swagger';
import { CampaignStatus, Platform } from '@prisma/client';

export class PlatformCampaignResponseDto {
  @ApiProperty({ description: 'Platform campaign mapping ID' })
  id: string;

  @ApiProperty({ enum: Platform, description: 'Advertising platform' })
  platform: Platform;

  @ApiProperty({
    nullable: true,
    description: 'External campaign ID returned by the platform',
  })
  platformCampaignId: string | null;

  @ApiProperty({ enum: CampaignStatus, description: 'Status on the platform' })
  status: CampaignStatus;

  @ApiProperty({
    nullable: true,
    description: 'Platform-specific targeting and creative configuration',
  })
  platformData: any;

  @ApiProperty({ description: 'Record creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Record last update timestamp' })
  updatedAt: Date;
}

export class CampaignResponseDto {
  @ApiProperty({ description: 'UACM campaign ID' })
  id: string;

  @ApiProperty({ description: 'User ID of the campaign owner' })
  userId: string;

  @ApiProperty({ description: 'Campaign name' })
  name: string;

  @ApiProperty({ description: 'Budget amount in USD', example: 1000 })
  budget: number;

  @ApiProperty({ description: 'Campaign start date' })
  startDate: Date;

  @ApiProperty({ description: 'Campaign end date' })
  endDate: Date;

  @ApiProperty({ enum: CampaignStatus, description: 'Aggregated campaign status' })
  status: CampaignStatus;

  @ApiProperty({ description: 'Campaign creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Campaign last update timestamp' })
  updatedAt: Date;

  @ApiProperty({
    type: [PlatformCampaignResponseDto],
    description: 'Platform-specific campaign associations',
  })
  platformCampaigns: PlatformCampaignResponseDto[];
}

export class PaginatedCampaignsResponseDto {
  @ApiProperty({ type: [CampaignResponseDto] })
  items: CampaignResponseDto[];

  @ApiProperty({ description: 'Total number of items matching filters' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages available' })
  totalPages: number;
}

/**
 * Maps a raw Prisma campaign entity (with platform campaigns included)
 * to a clean CampaignResponseDto, safely converting Decimal budget to number
 * and excluding internal database columns like tenantId.
 */
export function toCampaignResponseDto(campaign: {
  id: string;
  userId: string;
  name: string;
  budget: any;
  startDate: Date;
  endDate: Date;
  status: CampaignStatus;
  createdAt: Date;
  updatedAt: Date;
  platformCampaigns?: Array<{
    id: string;
    platform: Platform;
    platformCampaignId: string | null;
    status: CampaignStatus;
    platformData: any;
    createdAt: Date;
    updatedAt: Date;
  }>;
}): CampaignResponseDto {
  return {
    id: campaign.id,
    userId: campaign.userId,
    name: campaign.name,
    budget: Number(campaign.budget),
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    status: campaign.status,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    platformCampaigns: (campaign.platformCampaigns ?? []).map((pc) => ({
      id: pc.id,
      platform: pc.platform,
      platformCampaignId: pc.platformCampaignId,
      status: pc.status,
      platformData: pc.platformData,
      createdAt: pc.createdAt,
      updatedAt: pc.updatedAt,
    })),
  };
}

