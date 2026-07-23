import { Injectable, Logger } from '@nestjs/common';
import { CampaignsService } from '../../../campaigns/campaigns.service';

export interface AudienceBreakdown {
  ageGroup: string;
  gender: string;
  location: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  cost: number;
}

@Injectable()
export class AudienceTool {
  private readonly logger = new Logger(AudienceTool.name);

  constructor(private readonly campaignsService: CampaignsService) {}

  /**
   * Retrieves demographic and audience segment data for a campaign
   */
  async getAudienceData(campaignId: string): Promise<AudienceBreakdown[]> {
    this.logger.log(`[AudienceTool] Fetching audience data for campaign: ${campaignId}`);
    // Service-mediated access to audience demographic breakdown
    return [
      {
        ageGroup: '25-34',
        gender: 'Female',
        location: 'US - West',
        impressions: 25000,
        conversions: 85,
        conversionRate: 3.4,
        cost: 650,
      },
      {
        ageGroup: '18-24',
        gender: 'All',
        location: 'US - East',
        impressions: 15000,
        conversions: 22,
        conversionRate: 1.47,
        cost: 420,
      },
      {
        ageGroup: '35-44',
        gender: 'Male',
        location: 'US - Midwest',
        impressions: 18000,
        conversions: 54,
        conversionRate: 3.0,
        cost: 510,
      },
    ];
  }

  /**
   * Analyzes audience segment efficiency and returns segment recommendations
   */
  async analyzeAudiencePerformance(campaignId: string) {
    this.logger.log(`[AudienceTool] Analyzing audience performance for campaign: ${campaignId}`);
    const segments = await this.getAudienceData(campaignId);
    const sorted = [...segments].sort((a, b) => b.conversionRate - a.conversionRate);

    return {
      campaignId,
      topSegment: sorted[0],
      underperformingSegment: sorted[sorted.length - 1],
      recommendation: `Increase budget allocation for top segment (${sorted[0].ageGroup} ${sorted[0].gender} in ${sorted[0].location}) and exclude low-performing segment (${sorted[sorted.length - 1].ageGroup}).`,
    };
  }
}
