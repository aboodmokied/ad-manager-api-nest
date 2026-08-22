import { Injectable, NotImplementedException } from '@nestjs/common';
import { Platform } from '@prisma/client';
import {
  AdsPlatformAdapter,
  UnifiedMetrics,
  CreateCampaignRequest,
  UpdateBudgetRequest,
} from './ads-platform.adapter';

/**
 * Adapter for Meta Ads (Facebook/Instagram).
 *
 * WARNING: the Meta Ads campaign API integration is not implemented yet.
 * Instead of returning fake campaign IDs (which would silently mark campaigns
 * ACTIVE without creating anything), every operation throws so the campaign
 * transitions to ERROR and is routed to the dead-letter queue for inspection.
 */
@Injectable()
export class MetaAdapter implements AdsPlatformAdapter {
  /** The platform this adapter supports (META) */
  platform = Platform.META;

  async createCampaign(
    _request: CreateCampaignRequest,
    _accessToken: string,
  ): Promise<string> {
    throw new NotImplementedException(
      'Meta Ads campaign creation is not implemented yet',
    );
  }

  async updateBudget(
    _request: UpdateBudgetRequest,
    _accessToken: string,
  ): Promise<void> {
    throw new NotImplementedException(
      'Meta Ads budget updates are not implemented yet',
    );
  }

  async getInsights(
    _platformCampaignId: string,
    _accessToken: string,
  ): Promise<UnifiedMetrics> {
    throw new NotImplementedException(
      'Meta Ads insights are not implemented yet',
    );
  }

  /**
   * Transforms Meta's raw metrics to the unified format
   * @param rawMetrics - Raw metrics from Meta
   * @returns Unified performance metrics
   */
  transformToUnifiedMetrics(rawMetrics: any): UnifiedMetrics {
    return {
      impressions: rawMetrics.impressions || 0,
      clicks: rawMetrics.clicks || 0,
      spend: rawMetrics.spend || 0,
      conversions: rawMetrics.purchase || 0,
      ctr: rawMetrics.ctr || 0,
      cpc: rawMetrics.cpc || 0,
      roas: rawMetrics.purchase_value
        ? rawMetrics.purchase_value / rawMetrics.spend
        : undefined,
    };
  }
}
