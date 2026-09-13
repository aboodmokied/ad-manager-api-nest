import { Injectable, Logger } from '@nestjs/common';
import { Platform } from '@prisma/client';
import {
  AdsPlatformAdapter,
  UnifiedMetrics,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  UpdateBudgetRequest,
} from './ads-platform.adapter';
import { OAuthExchangeService } from '../accounts/services/oauth-exchange.service';
import { OAuthConfigService } from '../accounts/services/oauth-config.service';

/**
 * Adapter for TikTok Ads.
 */
@Injectable()
export class TiktokAdapter implements AdsPlatformAdapter {
  readonly platform = Platform.TIKTOK;
  private readonly logger = new Logger(TiktokAdapter.name);

  constructor(
    private readonly oauthExchange: OAuthExchangeService,
    private readonly oauthConfig: OAuthConfigService,
  ) {}

  private getApiBaseUrl(): string {
    try {
      return this.oauthConfig.getConfig(Platform.TIKTOK).apiBaseUrl;
    } catch {
      return 'https://business-api.tiktok.com/open_api/v1.3';
    }
  }

  private buildHeaders(accessToken: string): Record<string, string> {
    return {
      'Access-Token': accessToken,
    };
  }

  async createCampaign(
    request: CreateCampaignRequest,
    accessToken: string,
  ): Promise<string> {
    const advertiserId =
      request.platformSpecificData?.advertiserId ||
      request.platformSpecificData?.accountId ||
      request.platformSpecificData?.adAccountId;

    if (!advertiserId) {
      throw new Error('TikTok Ads advertiserId is required to create a campaign');
    }

    const url = `${this.getApiBaseUrl()}/campaign/create/`;

    const payload = {
      advertiser_id: advertiserId,
      campaign_name: request.name,
      objective_type:
        request.platformSpecificData?.objectiveType || 'TRAFFIC',
      budget_mode: 'BUDGET_MODE_DAY',
      budget: request.budget,
      operation_status: 'DISABLE', // Create paused
      ...(request.platformSpecificData?.tiktokConfig || {}),
    };

    const response = await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );

    const campaignId = response?.data?.campaign_id;
    if (!campaignId) {
      throw new Error('TikTok Ads campaign creation returned no campaign id');
    }

    this.logger.log(`Created TikTok Ads campaign: ${campaignId}`);
    return String(campaignId);
  }

  async updateCampaign(
    request: UpdateCampaignRequest,
    accessToken: string,
  ): Promise<void> {
    const advertiserId =
      request.platformSpecificData?.advertiserId ||
      request.platformSpecificData?.accountId ||
      request.platformSpecificData?.adAccountId;

    if (!advertiserId) {
      throw new Error('TikTok Ads advertiserId is required to update a campaign');
    }

    const url = `${this.getApiBaseUrl()}/campaign/update/`;

    const payload: Record<string, unknown> = {
      advertiser_id: advertiserId,
      campaign_id: request.platformCampaignId,
      ...(request.name ? { campaign_name: request.name } : {}),
      ...(request.budget !== undefined ? { budget: request.budget } : {}),
      ...(request.platformSpecificData?.tiktokConfig || {}),
    };

    await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Updated TikTok Ads campaign: ${request.platformCampaignId}`);
  }

  async updateBudget(
    request: UpdateBudgetRequest,
    accessToken: string,
  ): Promise<void> {
    const advertiserId = request.accountId;
    if (!advertiserId) {
      throw new Error('TikTok Ads advertiserId is required to update budget');
    }

    const url = `${this.getApiBaseUrl()}/campaign/update/`;

    await this.oauthExchange.postJson(
      url,
      {
        advertiser_id: advertiserId,
        campaign_id: request.platformCampaignId,
        budget: request.newBudget,
      },
      this.buildHeaders(accessToken),
    );
    this.logger.log(
      `Updated budget for TikTok campaign ${request.platformCampaignId} to $${request.newBudget}`,
    );
  }

  async pauseCampaign(
    platformCampaignId: string,
    accessToken: string,
    accountId?: string,
  ): Promise<void> {
    if (!accountId) {
      throw new Error('TikTok Ads advertiserId is required to pause a campaign');
    }

    const url = `${this.getApiBaseUrl()}/campaign/status/update/`;
    await this.oauthExchange.postJson(
      url,
      {
        advertiser_id: accountId,
        campaign_ids: [platformCampaignId],
        operation_status: 'DISABLE',
      },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Paused TikTok Ads campaign: ${platformCampaignId}`);
  }

  async resumeCampaign(
    platformCampaignId: string,
    accessToken: string,
    accountId?: string,
  ): Promise<void> {
    if (!accountId) {
      throw new Error('TikTok Ads advertiserId is required to resume a campaign');
    }

    const url = `${this.getApiBaseUrl()}/campaign/status/update/`;
    await this.oauthExchange.postJson(
      url,
      {
        advertiser_id: accountId,
        campaign_ids: [platformCampaignId],
        operation_status: 'ENABLE',
      },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Resumed TikTok Ads campaign: ${platformCampaignId}`);
  }

  async getInsights(
    platformCampaignId: string,
    accessToken: string,
    accountId?: string,
  ): Promise<UnifiedMetrics> {
    if (!accountId) {
      throw new Error('TikTok Ads advertiserId is required to fetch campaign insights');
    }

    const url = `${this.getApiBaseUrl()}/reports/integrated/get/?advertiser_id=${accountId}&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=["campaign_id"]&metrics=["impressions","clicks","spend","conversion","ctr","cpc"]&filters=[{"field_name":"campaign_ids","filter_type":"IN","filter_value":["${platformCampaignId}"]}]`;
    const data = await this.oauthExchange.getJson(
      url,
      this.buildHeaders(accessToken),
    );
    const rawMetrics = data?.data?.list?.[0]?.metrics || {};
    return this.transformToUnifiedMetrics(rawMetrics);
  }

  transformToUnifiedMetrics(rawMetrics: any): UnifiedMetrics {
    const impressions = Number(rawMetrics.impressions) || 0;
    const clicks = Number(rawMetrics.clicks) || 0;
    const spend = Number(rawMetrics.spend) || 0;
    const conversions = Number(rawMetrics.conversion) || 0;
    const ctr = Number(rawMetrics.ctr) || (impressions > 0 ? clicks / impressions : 0);
    const cpc = Number(rawMetrics.cpc) || (clicks > 0 ? spend / clicks : 0);

    return {
      impressions,
      clicks,
      spend,
      conversions,
      ctr,
      cpc,
    };
  }
}
