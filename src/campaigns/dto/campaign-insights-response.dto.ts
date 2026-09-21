import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignStatus, Platform } from '@prisma/client';

/**
 * Unified metrics standardizing performance metrics across all ad platforms.
 */
export class UnifiedMetricsDto {
  @ApiProperty({ description: 'Number of times ads were displayed', example: 12500 })
  impressions: number;

  @ApiProperty({ description: 'Number of times ads were clicked', example: 450 })
  clicks: number;

  @ApiProperty({ description: 'Total ad spend in USD', example: 120.5 })
  spend: number;

  @ApiProperty({ description: 'Number of conversions recorded', example: 18 })
  conversions: number;

  @ApiProperty({
    description: 'Click-through rate (clicks / impressions)',
    example: 0.036,
  })
  ctr: number;

  @ApiProperty({
    description: 'Cost per click in USD (spend / clicks)',
    example: 0.27,
  })
  cpc: number;

  @ApiPropertyOptional({
    description: 'Return on ad spend (revenue / spend), if available',
    example: 3.5,
  })
  roas?: number;
}

/**
 * Breakdown of insights and metrics for an individual platform within a campaign.
 */
export class PlatformCampaignInsightsDto {
  @ApiProperty({ enum: Platform, description: 'The advertising platform' })
  platform: Platform;

  @ApiProperty({
    nullable: true,
    description: 'The platform-specific campaign ID (e.g. Meta / Google campaign ID)',
    example: 'act_123456789_camp_987',
  })
  platformCampaignId: string | null;

  @ApiProperty({
    enum: CampaignStatus,
    description: 'Status of this platform campaign',
  })
  status: CampaignStatus;

  @ApiPropertyOptional({
    type: UnifiedMetricsDto,
    description: 'Performance metrics for this platform campaign',
  })
  metrics?: UnifiedMetricsDto;

  @ApiPropertyOptional({
    description: 'Error message if metrics retrieval failed for this platform',
    example: 'Failed to fetch insights from Google Ads API',
  })
  error?: string;
}

/**
 * Aggregated campaign performance insights across all connected platforms.
 */
export class CampaignInsightsResponseDto {
  @ApiProperty({ description: 'UACM campaign ID', example: 'cm123456789' })
  uacmCampaignId: string;

  @ApiProperty({ description: 'Campaign name', example: 'Summer Promo 2026' })
  name: string;

  @ApiProperty({
    enum: CampaignStatus,
    description: 'Aggregated campaign status',
  })
  status: CampaignStatus;

  @ApiProperty({
    type: UnifiedMetricsDto,
    description: 'Aggregated metrics summed across all platforms',
  })
  total: UnifiedMetricsDto;

  @ApiProperty({
    type: [PlatformCampaignInsightsDto],
    description: 'Per-platform performance metrics breakdown',
  })
  byPlatform: PlatformCampaignInsightsDto[];

  @ApiProperty({
    description: 'Timestamp when the metrics were retrieved',
    example: '2026-08-24T00:00:00.000Z',
  })
  fetchedAt: Date;
}
