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
 * Adapter for X (Twitter) Ads.
 */
@Injectable()
export class XAdapter implements AdsPlatformAdapter {
  readonly platform = Platform.X;
  private readonly logger = new Logger(XAdapter.name);

  constructor(
    private readonly oauthExchange: OAuthExchangeService,
    private readonly oauthConfig: OAuthConfigService,
  ) {}

  private getApiBaseUrl(): string {
    try {
      return this.oauthConfig.getConfig(Platform.X).apiBaseUrl;
    } catch {
      return 'https://api.x.com/12';
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
    const accountId =
      request.platformSpecificData?.accountId ||
      request.platformSpecificData?.adAccountId;

    if (!accountId) {
      throw new Error('X Ads accountId is required to create a campaign');
    }

    const url = `${this.getApiBaseUrl()}/accounts/${accountId}/campaigns`;

    const payload = {
      name: request.name,
      entity_status: 'PAUSED',
      daily_budget_amount_local_micro: Math.round(request.budget * 1_000_000),
      start_time: request.startDate
        ? new Date(request.startDate).toISOString()
        : undefined,
      end_time: request.endDate
        ? new Date(request.endDate).toISOString()
        : undefined,
      ...(request.platformSpecificData?.xConfig || {}),
    };

    const response = await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );

    const campaignId = response?.data?.id || response?.data?.id_str;
    if (!campaignId) {
      throw new Error('X Ads campaign creation returned no campaign id');
    }

    this.logger.log(`Created X Ads campaign: ${campaignId}`);
    return String(campaignId);
  }

  async updateCampaign(
    request: UpdateCampaignRequest,
    accessToken: string,
  ): Promise<void> {
    const accountId =
      request.platformSpecificData?.accountId ||
      request.platformSpecificData?.adAccountId;

    if (!accountId) {
      throw new Error('X Ads accountId is required to update a campaign');
    }

    const url = `${this.getApiBaseUrl()}/accounts/${accountId}/campaigns/${request.platformCampaignId}`;

    const payload: Record<string, unknown> = {
      ...(request.name ? { name: request.name } : {}),
      ...(request.budget !== undefined
        ? { daily_budget_amount_local_micro: Math.round(request.budget * 1_000_000) }
        : {}),
      ...(request.platformSpecificData?.xConfig || {}),
    };

    await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Updated X Ads campaign: ${request.platformCampaignId}`);
  }

  async updateBudget(
    request: UpdateBudgetRequest,
    accessToken: string,
  ): Promise<void> {
    const accountId = request.accountId;
    if (!accountId) {
      throw new Error('X Ads accountId is required to update budget');
    }

    const url = `${this.getApiBaseUrl()}/accounts/${accountId}/campaigns/${request.platformCampaignId}`;

    await this.oauthExchange.postJson(
      url,
      { daily_budget_amount_local_micro: Math.round(request.newBudget * 1_000_000) },
      this.buildHeaders(accessToken),
    );
    this.logger.log(
      `Updated budget for X campaign ${request.platformCampaignId} to $${request.newBudget}`,
    );
  }

  async pauseCampaign(
    platformCampaignId: string,
    accessToken: string,
    accountId?: string,
  ): Promise<void> {
    if (!accountId) {
      throw new Error('X Ads accountId is required to pause a campaign');
    }

    const url = `${this.getApiBaseUrl()}/accounts/${accountId}/campaigns/${platformCampaignId}`;
    await this.oauthExchange.postJson(
      url,
      { entity_status: 'PAUSED' },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Paused X Ads campaign: ${platformCampaignId}`);
  }

  async resumeCampaign(
    platformCampaignId: string,
    accessToken: string,
    accountId?: string,
  ): Promise<void> {
    if (!accountId) {
      throw new Error('X Ads accountId is required to resume a campaign');
    }

    const url = `${this.getApiBaseUrl()}/accounts/${accountId}/campaigns/${platformCampaignId}`;
    await this.oauthExchange.postJson(
      url,
      { entity_status: 'ACTIVE' },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Resumed X Ads campaign: ${platformCampaignId}`);
  }

  async getInsights(
    platformCampaignId: string,
    accessToken: string,
    accountId?: string,
  ): Promise<UnifiedMetrics> {
    if (!accountId) {
      throw new Error('X Ads accountId is required to fetch campaign insights');
    }

    const url = `${this.getApiBaseUrl()}/stats/accounts/${accountId}?entity=CAMPAIGN&entity_ids=${platformCampaignId}&granularity=TOTAL&metric_groups=ENGAGEMENT,BILLING`;
    const data = await this.oauthExchange.getJson(
      url,
      this.buildHeaders(accessToken),
    );
    const rawMetrics = data?.data?.[0]?.id_data?.[0]?.metrics || {};
    return this.transformToUnifiedMetrics(rawMetrics);
  }

  transformToUnifiedMetrics(rawMetrics: any): UnifiedMetrics {
    const impressions = Number(rawMetrics.impressions?.[0]) || 0;
    const clicks = Number(rawMetrics.clicks?.[0]) || 0;
    const spend = (Number(rawMetrics.billed_charge_local_micro?.[0]) || 0) / 1_000_000;
    const conversions = Number(rawMetrics.conversion_purchases?.[0]) || 0;
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
