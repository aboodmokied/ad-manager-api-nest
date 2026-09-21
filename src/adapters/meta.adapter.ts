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
 * Adapter for Meta Ads (Facebook/Instagram).
 *
 * Implements the full campaign lifecycle against the Meta Graph API:
 * - campaign creation with objectives and daily budget;
 * - updates and budget modifications;
 * - pause / resume state toggles;
 * - insights retrieval and metrics transformation.
 */
@Injectable()
export class MetaAdapter implements AdsPlatformAdapter {
  readonly platform = Platform.META;
  private readonly logger = new Logger(MetaAdapter.name);

  constructor(
    private readonly oauthExchange: OAuthExchangeService,
    private readonly oauthConfig: OAuthConfigService,
  ) {}

  private getApiBaseUrl(): string {
    try {
      return this.oauthConfig.getConfig(Platform.META).apiBaseUrl;
    } catch {
      return 'https://graph.facebook.com/v21.0';
    }
  }

  private buildHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }

  private normalizeAccountId(accountId: string): string {
    return accountId.replace(/^act_/, '');
  }

  async createCampaign(
    request: CreateCampaignRequest,
    accessToken: string,
  ): Promise<string> {
    const rawAccountId =
      request.platformSpecificData?.adAccountId ||
      request.platformSpecificData?.accountId;

    if (!rawAccountId) {
      throw new Error('Meta Ads adAccountId is required to create a campaign');
    }

    const accountId = this.normalizeAccountId(rawAccountId);
    const url = `${this.getApiBaseUrl()}/act_${accountId}/campaigns`;

    const payload = {
      name: request.name,
      objective:
        request.platformSpecificData?.objective || 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories:
        request.platformSpecificData?.special_ad_categories || ['NONE'],
      daily_budget: Math.round(request.budget * 100), // Meta budgets are in cents
      start_time: request.startDate
        ? new Date(request.startDate).toISOString()
        : undefined,
      stop_time: request.endDate
        ? new Date(request.endDate).toISOString()
        : undefined,
      ...(request.platformSpecificData?.metaConfig || {}),
    };

    const response = await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );

    const campaignId = response?.id || response?.campaign_id;
    if (!campaignId) {
      throw new Error('Meta Ads campaign creation returned no campaign id');
    }

    this.logger.log(`Created Meta Ads campaign: ${campaignId}`);
    return String(campaignId);
  }

  async updateCampaign(
    request: UpdateCampaignRequest,
    accessToken: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/${request.platformCampaignId}`;

    const payload: Record<string, unknown> = {
      ...(request.name ? { name: request.name } : {}),
      ...(request.budget !== undefined
        ? { daily_budget: Math.round(request.budget * 100) }
        : {}),
      ...(request.startDate
        ? { start_time: new Date(request.startDate).toISOString() }
        : {}),
      ...(request.endDate
        ? { stop_time: new Date(request.endDate).toISOString() }
        : {}),
      ...(request.platformSpecificData?.metaConfig || {}),
    };

    await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Updated Meta Ads campaign: ${request.platformCampaignId}`);
  }

  async updateBudget(
    request: UpdateBudgetRequest,
    accessToken: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/${request.platformCampaignId}`;

    await this.oauthExchange.postJson(
      url,
      { daily_budget: Math.round(request.newBudget * 100) },
      this.buildHeaders(accessToken),
    );
    this.logger.log(
      `Updated budget for Meta campaign ${request.platformCampaignId} to $${request.newBudget}`,
    );
  }

  async pauseCampaign(
    platformCampaignId: string,
    accessToken: string,
    _accountId?: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/${platformCampaignId}`;
    await this.oauthExchange.postJson(
      url,
      { status: 'PAUSED' },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Paused Meta Ads campaign: ${platformCampaignId}`);
  }

  async resumeCampaign(
    platformCampaignId: string,
    accessToken: string,
    _accountId?: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/${platformCampaignId}`;
    await this.oauthExchange.postJson(
      url,
      { status: 'ACTIVE' },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Resumed Meta Ads campaign: ${platformCampaignId}`);
  }

  async getInsights(
    platformCampaignId: string,
    accessToken: string,
    _accountId?: string,
  ): Promise<UnifiedMetrics> {
    const url = `${this.getApiBaseUrl()}/${platformCampaignId}/insights?fields=impressions,clicks,spend,actions,ctr,cpc,purchase_value`;
    const data = await this.oauthExchange.getJson(
      url,
      this.buildHeaders(accessToken),
    );
    const rawMetrics = Array.isArray(data?.data) ? data.data[0] || {} : {};
    return this.transformToUnifiedMetrics(rawMetrics);
  }

  /**
   * Transforms Meta's raw metrics to the unified format
   * @param rawMetrics - Raw metrics from Meta
   * @returns Unified performance metrics
   */
  transformToUnifiedMetrics(rawMetrics: any): UnifiedMetrics {
    const spend = Number(rawMetrics.spend ?? 0);
    const hasPurchaseValue =
      rawMetrics.purchase_value !== undefined &&
      rawMetrics.purchase_value !== null;

    let purchases = 0;
    if (Array.isArray(rawMetrics.actions)) {
      const purchaseAction = rawMetrics.actions.find(
        (a: any) => a.action_type === 'purchase',
      );
      if (purchaseAction) {
        purchases = Number(purchaseAction.value ?? 0);
      }
    } else if (rawMetrics.purchase !== undefined) {
      purchases = Number(rawMetrics.purchase ?? 0);
    }

    return {
      impressions: Number(rawMetrics.impressions ?? 0),
      clicks: Number(rawMetrics.clicks ?? 0),
      spend,
      conversions: purchases,
      ctr: Number(rawMetrics.ctr ?? 0),
      cpc: Number(rawMetrics.cpc ?? 0),
      roas:
        spend > 0 && hasPurchaseValue
          ? Number(rawMetrics.purchase_value) / spend
          : undefined,
    };
  }
}

