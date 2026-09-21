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
 * Adapter for LinkedIn Ads.
 */
@Injectable()
export class LinkedinAdapter implements AdsPlatformAdapter {
  readonly platform = Platform.LINKEDIN;
  private readonly logger = new Logger(LinkedinAdapter.name);

  constructor(
    private readonly oauthExchange: OAuthExchangeService,
    private readonly oauthConfig: OAuthConfigService,
  ) {}

  private getApiBaseUrl(): string {
    try {
      return this.oauthConfig.getConfig(Platform.LINKEDIN).apiBaseUrl;
    } catch {
      return 'https://api.linkedin.com/v2';
    }
  }

  private buildHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202401',
    };
  }

  async createCampaign(
    request: CreateCampaignRequest,
    accessToken: string,
  ): Promise<string> {
    const accountId =
      request.platformSpecificData?.accountId ||
      request.platformSpecificData?.adAccountId ||
      'urn:li:sponsoredAccount:123456';

    const accountUrn = accountId.startsWith('urn:li:sponsoredAccount:')
      ? accountId
      : `urn:li:sponsoredAccount:${accountId}`;

    const url = `${this.getApiBaseUrl()}/adCampaignsV2`;

    const payload = {
      account: accountUrn,
      name: request.name,
      status: 'PAUSED',
      type: request.platformSpecificData?.campaignType || 'SPONSORED_UPDATES',
      dailyBudget: {
        amount: String(request.budget),
        currencyCode: 'USD',
      },
      locale: {
        country: 'US',
        language: 'en',
      },
      ...(request.platformSpecificData?.linkedinConfig || {}),
    };

    const response = await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );

    const campaignId = response?.id || response?.idStr;
    if (!campaignId) {
      throw new Error('LinkedIn Ads campaign creation returned no campaign id');
    }

    this.logger.log(`Created LinkedIn Ads campaign: ${campaignId}`);
    return String(campaignId);
  }

  async updateCampaign(
    request: UpdateCampaignRequest,
    accessToken: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/adCampaignsV2/${request.platformCampaignId}`;

    const payload: Record<string, unknown> = {
      ...(request.name ? { name: request.name } : {}),
      ...(request.budget !== undefined
        ? { dailyBudget: { amount: String(request.budget), currencyCode: 'USD' } }
        : {}),
      ...(request.platformSpecificData?.linkedinConfig || {}),
    };

    await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Updated LinkedIn Ads campaign: ${request.platformCampaignId}`);
  }

  async updateBudget(
    request: UpdateBudgetRequest,
    accessToken: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/adCampaignsV2/${request.platformCampaignId}`;

    await this.oauthExchange.postJson(
      url,
      { dailyBudget: { amount: String(request.newBudget), currencyCode: 'USD' } },
      this.buildHeaders(accessToken),
    );
    this.logger.log(
      `Updated budget for LinkedIn campaign ${request.platformCampaignId} to $${request.newBudget}`,
    );
  }

  async pauseCampaign(
    platformCampaignId: string,
    accessToken: string,
    _accountId?: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/adCampaignsV2/${platformCampaignId}`;
    await this.oauthExchange.postJson(
      url,
      { status: 'PAUSED' },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Paused LinkedIn Ads campaign: ${platformCampaignId}`);
  }

  async resumeCampaign(
    platformCampaignId: string,
    accessToken: string,
    _accountId?: string,
  ): Promise<void> {
    const url = `${this.getApiBaseUrl()}/adCampaignsV2/${platformCampaignId}`;
    await this.oauthExchange.postJson(
      url,
      { status: 'ACTIVE' },
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Resumed LinkedIn Ads campaign: ${platformCampaignId}`);
  }

  async getInsights(
    platformCampaignId: string,
    accessToken: string,
    _accountId?: string,
  ): Promise<UnifiedMetrics> {
    const url = `${this.getApiBaseUrl()}/adAnalyticsV2?q=analytics&pivot=CAMPAIGN&campaigns=List(urn:li:sponsoredCampaign:${platformCampaignId})&timeRange=(start:(year:2024,month:1,day:1))`;
    const data = await this.oauthExchange.getJson(
      url,
      this.buildHeaders(accessToken),
    );
    const rawMetrics = Array.isArray(data?.elements)
      ? data.elements[0] || {}
      : {};
    return this.transformToUnifiedMetrics(rawMetrics);
  }

  transformToUnifiedMetrics(rawMetrics: any): UnifiedMetrics {
    const impressions = Number(rawMetrics.impressions) || 0;
    const clicks = Number(rawMetrics.clicks) || 0;
    const spend = Number(rawMetrics.costInLocalCurrency) || 0;
    const conversions =
      Number(rawMetrics.externalWebsiteConversions) ||
      Number(rawMetrics.conversions) ||
      0;
    const ctr =
      Number(rawMetrics.ctr) || (impressions > 0 ? clicks / impressions : 0);
    const cpc =
      Number(rawMetrics.costPerClick) || (clicks > 0 ? spend / clicks : 0);
    const roas =
      rawMetrics.conversionValueInLocalCurrency && spend > 0
        ? Number(rawMetrics.conversionValueInLocalCurrency) / spend
        : undefined;

    return {
      impressions,
      clicks,
      spend,
      conversions,
      ctr,
      cpc,
      roas,
    };
  }
}
