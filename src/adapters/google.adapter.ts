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
 * Adapter for Google Ads.
 *
 * Implements the full campaign lifecycle against the Google Ads REST API:
 * - campaign creation via customers.campaigns:mutate;
 * - updates and budget modifications;
 * - pause / resume state toggles (PAUSED / ENABLED);
 * - insights retrieval via searchStream and metrics transformation.
 */
@Injectable()
export class GoogleAdapter implements AdsPlatformAdapter {
  readonly platform = Platform.GOOGLE;
  private readonly logger = new Logger(GoogleAdapter.name);

  constructor(
    private readonly oauthExchange: OAuthExchangeService,
    private readonly oauthConfig: OAuthConfigService,
  ) {}

  private getApiBaseUrl(): string {
    try {
      return this.oauthConfig.getConfig(Platform.GOOGLE).apiBaseUrl;
    } catch {
      return 'https://googleads.googleapis.com/v18';
    }
  }

  private buildHeaders(accessToken: string): Record<string, string> {
    const config = this.oauthConfig?.getConfig?.(Platform.GOOGLE);
    const developerToken = config?.developerToken;

    if (!developerToken) {
      throw new Error(
        'Google Ads developerToken is not configured. Please set GOOGLE_ADS_DEVELOPER_TOKEN in environment variables.',
      );
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
    };

    if (config?.loginCustomerId) {
      headers['login-customer-id'] = config.loginCustomerId.replace(/-/g, '');
    }

    return headers;
  }

  private cleanCustomerId(customerId: string): string {
    return customerId.replace(/-/g, '').replace(/^customers\//, '');
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async createCampaign(
    request: CreateCampaignRequest,
    accessToken: string,
  ): Promise<string> {
    const rawCustomerId =
      request.platformSpecificData?.customerId ||
      request.platformSpecificData?.adAccountId ||
      request.platformSpecificData?.accountId;

    if (!rawCustomerId) {
      throw new Error('Google Ads customerId is required to create a campaign');
    }

    const customerId = this.cleanCustomerId(rawCustomerId);
    const url = `${this.getApiBaseUrl()}/customers/${customerId}/campaigns:mutate`;

    const payload = {
      operations: [
        {
          create: {
            name: request.name,
            status: 'PAUSED',
            advertisingChannelType:
              request.platformSpecificData?.advertisingChannelType || 'SEARCH',
            startDate: request.startDate
              ? this.formatDate(request.startDate)
              : undefined,
            endDate: request.endDate
              ? this.formatDate(request.endDate)
              : undefined,
            ...(request.platformSpecificData?.googleConfig || {}),
          },
        },
      ],
    };

    const response = await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );

    const resourceName: string | undefined =
      response?.results?.[0]?.resourceName;
    const campaignId = resourceName?.split('/').pop();

    if (!campaignId) {
      throw new Error(
        'Google Ads campaign creation returned no campaign resource name',
      );
    }

    this.logger.log(`Created Google Ads campaign: ${campaignId}`);
    return String(campaignId);
  }

  async updateCampaign(
    request: UpdateCampaignRequest,
    accessToken: string,
  ): Promise<void> {
    const rawCustomerId =
      request.platformSpecificData?.customerId ||
      request.platformSpecificData?.adAccountId ||
      request.platformSpecificData?.accountId;

    if (!rawCustomerId) {
      throw new Error('Google Ads customerId is required to update a campaign');
    }

    const customerId = this.cleanCustomerId(rawCustomerId);
    const url = `${this.getApiBaseUrl()}/customers/${customerId}/campaigns:mutate`;

    const updateFields: Record<string, unknown> = {
      resourceName: `customers/${customerId}/campaigns/${request.platformCampaignId}`,
    };
    const updateMaskFields: string[] = [];

    if (request.name) {
      updateFields.name = request.name;
      updateMaskFields.push('name');
    }
    if (request.startDate) {
      updateFields.startDate = this.formatDate(request.startDate);
      updateMaskFields.push('start_date');
    }
    if (request.endDate) {
      updateFields.endDate = this.formatDate(request.endDate);
      updateMaskFields.push('end_date');
    }

    if (request.platformSpecificData?.googleConfig) {
      Object.assign(updateFields, request.platformSpecificData.googleConfig);
      for (const key of Object.keys(request.platformSpecificData.googleConfig)) {
        if (!updateMaskFields.includes(key)) {
          updateMaskFields.push(key);
        }
      }
    }

    if (request.budget !== undefined) {
      await this.updateBudget(
        {
          platformCampaignId: request.platformCampaignId,
          newBudget: request.budget,
          accountId: customerId,
        },
        accessToken,
      );
    }

    if (updateMaskFields.length === 0) {
      this.logger.warn(
        `No updatable fields for Google Ads campaign ${request.platformCampaignId}`,
      );
      return;
    }

    const payload = {
      operations: [
        {
          updateMask: updateMaskFields.join(','),
          update: updateFields,
        },
      ],
    };

    await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Updated Google Ads campaign: ${request.platformCampaignId}`);
  }

  async updateBudget(
    request: UpdateBudgetRequest,
    accessToken: string,
  ): Promise<void> {
    if (!request.accountId) {
      throw new Error('Google Ads customerId is required to update budget');
    }

    const customerId = this.cleanCustomerId(request.accountId);
    const url = `${this.getApiBaseUrl()}/customers/${customerId}/campaignBudgets:mutate`;

    const payload = {
      operations: [
        {
          create: {
            name: `Budget-${Date.now()}`,
            amountMicros: Math.round(request.newBudget * 1_000_000),
            explicitlyShared: false,
          },
        },
      ],
    };

    await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );
    this.logger.log(
      `Updated budget for Google campaign ${request.platformCampaignId} to $${request.newBudget}`,
    );
  }

  async pauseCampaign(
    platformCampaignId: string,
    accessToken: string,
    accountId?: string,
  ): Promise<void> {
    if (!accountId) {
      throw new Error('Google Ads customerId is required to pause a campaign');
    }

    const customerId = this.cleanCustomerId(accountId);
    const url = `${this.getApiBaseUrl()}/customers/${customerId}/campaigns:mutate`;

    const payload = {
      operations: [
        {
          updateMask: 'status',
          update: {
            resourceName: `customers/${customerId}/campaigns/${platformCampaignId}`,
            status: 'PAUSED',
          },
        },
      ],
    };

    await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Paused Google Ads campaign: ${platformCampaignId}`);
  }

  async resumeCampaign(
    platformCampaignId: string,
    accessToken: string,
    accountId?: string,
  ): Promise<void> {
    if (!accountId) {
      throw new Error('Google Ads customerId is required to resume a campaign');
    }

    const customerId = this.cleanCustomerId(accountId);
    const url = `${this.getApiBaseUrl()}/customers/${customerId}/campaigns:mutate`;

    const payload = {
      operations: [
        {
          updateMask: 'status',
          update: {
            resourceName: `customers/${customerId}/campaigns/${platformCampaignId}`,
            status: 'ENABLED',
          },
        },
      ],
    };

    await this.oauthExchange.postJson(
      url,
      payload,
      this.buildHeaders(accessToken),
    );
    this.logger.log(`Resumed Google Ads campaign: ${platformCampaignId}`);
  }

  async getInsights(
    platformCampaignId: string,
    accessToken: string,
    accountId?: string,
  ): Promise<UnifiedMetrics> {
    if (!accountId) {
      throw new Error(
        'Google Ads customerId is required to fetch campaign insights',
      );
    }

    const customerId = this.cleanCustomerId(accountId);
    const url = `${this.getApiBaseUrl()}/customers/${customerId}/googleAds:searchStream`;
    const query = [
      'SELECT metrics.impressions, metrics.clicks, metrics.cost_micros,',
      'metrics.conversions, metrics.ctr, metrics.average_cpc, metrics.conversions_value',
      'FROM campaign',
      `WHERE campaign.id = ${platformCampaignId}`,
    ].join(' ');

    const data = await this.oauthExchange.postJson(
      url,
      { query },
      this.buildHeaders(accessToken),
    );

    const row = Array.isArray(data)
      ? data[0]?.results?.[0]?.metrics || {}
      : data?.results?.[0]?.metrics || {};

    return this.transformToUnifiedMetrics(row);
  }

  /**
   * Transforms Google's raw metrics to the unified format
   * @param rawMetrics - Raw metrics from Google Ads
   * @returns Unified performance metrics
   */
  transformToUnifiedMetrics(rawMetrics: any): UnifiedMetrics {
    const spend = Number(rawMetrics.cost_micros ?? 0) / 1000000;
    const hasConversionsValue =
      rawMetrics.conversions_value !== undefined &&
      rawMetrics.conversions_value !== null;

    return {
      impressions: Number(rawMetrics.impressions ?? 0),
      clicks: Number(rawMetrics.clicks ?? 0),
      spend, // Convert micros to dollars
      conversions: Number(rawMetrics.conversions ?? 0),
      ctr: Number(rawMetrics.ctr ?? 0),
      cpc: Number(rawMetrics.cpc_micros ?? 0) / 1000000, // Convert micros to dollars
      roas:
        spend > 0 && hasConversionsValue
          ? Number(rawMetrics.conversions_value) / spend
          : undefined,
    };
  }
}

