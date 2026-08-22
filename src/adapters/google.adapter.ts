import { Injectable, NotImplementedException } from '@nestjs/common';
import { Platform } from '@prisma/client';
import {
  AdsPlatformAdapter,
  UnifiedMetrics,
  CreateCampaignRequest,
  UpdateBudgetRequest,
} from './ads-platform.adapter';

/**
 * Adapter for Google Ads.
 *
 * WARNING: the Google Ads campaign API integration is not implemented yet.
 * Instead of returning fake campaign IDs (which would silently mark campaigns
 * ACTIVE without creating anything), every operation throws so the campaign
 * transitions to ERROR and is routed to the dead-letter queue for inspection.
 */
@Injectable()
export class GoogleAdapter implements AdsPlatformAdapter {
  /** The platform this adapter supports (GOOGLE) */
  platform = Platform.GOOGLE;

  async createCampaign(
    _request: CreateCampaignRequest,
    _accessToken: string,
  ): Promise<string> {
    throw new NotImplementedException(
      'Google Ads campaign creation is not implemented yet',
    );
  }

  async updateBudget(
    _request: UpdateBudgetRequest,
    _accessToken: string,
  ): Promise<void> {
    throw new NotImplementedException(
      'Google Ads budget updates are not implemented yet',
    );
  }

  async getInsights(
    _platformCampaignId: string,
    _accessToken: string,
  ): Promise<UnifiedMetrics> {
    throw new NotImplementedException(
      'Google Ads insights are not implemented yet',
    );
  }

  /**
   * Transforms Google's raw metrics to the unified format
   * @param rawMetrics - Raw metrics from Google Ads
   * @returns Unified performance metrics
   */
  transformToUnifiedMetrics(rawMetrics: any): UnifiedMetrics {
    return {
      impressions: rawMetrics.impressions || 0,
      clicks: rawMetrics.clicks || 0,
      spend: rawMetrics.cost_micros ? rawMetrics.cost_micros / 1000000 : 0, // Convert micros to dollars
      conversions: rawMetrics.conversions || 0,
      ctr: rawMetrics.ctr || 0,
      cpc: rawMetrics.cpc_micros ? rawMetrics.cpc_micros / 1000000 : 0, // Convert micros to dollars
      roas: rawMetrics.conversions_value
        ? rawMetrics.conversions_value / (rawMetrics.cost_micros / 1000000)
        : undefined,
    };
  }
}
