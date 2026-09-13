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
 * Adapter for Snapchat Ads.
 */
@Injectable()
export class SnapchatAdapter implements AdsPlatformAdapter {
  readonly platform = Platform.SNAPCHAT;
  private readonly logger = new Logger(SnapchatAdapter.name);

  constructor(
    private readonly oauthExchange: OAuthExchangeService,
    private readonly oauthConfig: OAuthConfigService,
  ) {}

  private getApiBaseUrl(): string {
    try {
      return this.oauthConfig.getConfig(Platform.SNAPCHAT).apiBaseUrl;
    } catch {
      return 'https://adsapi.snapchat.com/v1';
    }
  }

  private buildHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }

  async createCampaign(
    request: CreateCampaignRequest,
    accessToken: string,
  ): Promise<string> {
    const adAccountId =
      request.platformSpecificData?.adAccountId ||
      request.platformSpecificData?.accountId;

    if (!adAccountId) {
      throw new Error('Snapchat adAccountId is required to create a campaign');
    }

    const url = `${this.getApiBaseUrl()}/adaccounts/${adAccountId}/campaigns`;

    const payload = {
      campaigns: [
        {
          name: request.name,
          ad_account_id: adAccountId,
          status: 'PAUSED',
          daily_budget_micro: Math.round(request.budget * 1_000_000),
          start_time: request.startDate
            ? new Date(request.startDate).toISOString()
            : undefined,
          end_time: request.endDate
            ? new Date(request.endDate).toISOString()
            : undefined,
          ...(request.platformSpecificData?.snapchatConfig || {}),
        },
      ],
    };

    const response = await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );

    const campaignId = response?.campaigns?.[0]?.campaign?.id;
    if (!campaignId) {
      throw new Error('Snapchat Ads campaign creation returned no campaign id');
    }

    this.logger.log(`Created Snapchat Ads campaign: ${campaignId}`);
    return String(campaignId);
  }

  async updateCampaign(
    request: UpdateCampaignRequest,
    accessToken: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/campaigns/${request.platformCampaignId}`;

    const payload = {
      campaigns: [
        {
          id: request.platformCampaignId,
          ...(request.name ? { name: request.name } : {}),
          ...(request.budget !== undefined
            ? { daily_budget_micro: Math.round(request.budget * 1_000_000) }
            : {}),
          ...(request.platformSpecificData?.snapchatConfig || {}),
        },
      ],
    };

    await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Updated Snapchat Ads campaign: ${request.platformCampaignId}`);
  }

  async updateBudget(
    request: UpdateBudgetRequest,
    accessToken: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/campaigns/${request.platformCampaignId}`;

    await this.oauthExchange.postJson(
      url,
      {
        campaigns: [
          {
            id: request.platformCampaignId,
            daily_budget_micro: Math.round(request.newBudget * 1_000_000),
          },
        ],
      },
      this.buildHeaders(accessToken),
    );
    this.logger.log(
      `Updated budget for Snapchat campaign ${request.platformCampaignId} to $${request.newBudget}`,
    );
  }

  async pauseCampaign(
    platformCampaignId: string,
    accessToken: string,
    _accountId?: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/campaigns/${platformCampaignId}`;
    await this.oauthExchange.postJson(
      url,
      {
        campaigns: [{ id: platformCampaignId, status: 'PAUSED' }],
      },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Paused Snapchat Ads campaign: ${platformCampaignId}`);
  }

  async resumeCampaign(
    platformCampaignId: string,
    accessToken: string,
    _accountId?: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/campaigns/${platformCampaignId}`;
    await this.oauthExchange.postJson(
      url,
      {
        campaigns: [{ id: platformCampaignId, status: 'ACTIVE' }],
      },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Resumed Snapchat Ads campaign: ${platformCampaignId}`);
  }

  async getInsights(
    platformCampaignId: string,
    accessToken: string,
    _accountId?: string,
  ): Promise<UnifiedMetrics> {
    const url = `${this.getApiBaseUrl()}/campaigns/${platformCampaignId}/stats?granularity=TOTAL&fields=impressions,swipes,spend,conversion_purchases`;
    const data = await this.oauthExchange.getJson(
      url,
      this.buildHeaders(accessToken),
    );
    const rawMetrics = data?.timeseries_stats?.[0]?.timeseries_stat?.stats || {};
    return this.transformToUnifiedMetrics(rawMetrics);
  }

  transformToUnifiedMetrics(rawMetrics: any): UnifiedMetrics {
    const impressions = Number(rawMetrics.impressions) || 0;
    const clicks = Number(rawMetrics.swipes) || 0;
    const spend = (Number(rawMetrics.spend) || 0) / 1_000_000;
    const conversions = Number(rawMetrics.conversion_purchases) || 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;

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
