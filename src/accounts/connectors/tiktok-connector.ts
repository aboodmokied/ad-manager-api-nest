import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import {
  OAuthExchangeError,
  OAuthExchangeService,
} from '../services/oauth-exchange.service';
import {
  ImportedCampaign,
  PlatformAccount,
  PlatformOAuthConfig,
  TokenExchangeResult,
} from '../interfaces/accounts.interfaces';
import { AdAccountConnector } from './ad-account-connector.interface';
import {
  MAX_PAGINATION_PAGES,
  PAGE_SIZE,
  toTokenResult,
} from './connector-utils';
import {
  TiktokAccountResponse,
  TiktokCampaignResponse,
} from './connector-responses';

/**
 * TikTok Ads connector.
 *
 * OAuth flow uses the Marketing API business endpoints: the consent URL is
 * keyed by `app_id` (TikTok's name for the client id) and the token calls
 * are JSON POSTs authenticated by `app_id` + `secret`. Every Business API
 * response carries a top-level `code` (0 = success) on which we validate.
 */
@Injectable()
export class TiktokConnector implements AdAccountConnector {
  readonly platform = Platform.TIKTOK;

  constructor(private readonly oauthExchange: OAuthExchangeService) {}

  buildAuthUrl(state: string, config: PlatformOAuthConfig): string {
    const params = new URLSearchParams({
      app_id: config.clientId,
      state,
      scope: config.scope,
      redirect_uri: config.redirectUri,
    });
    return `${config.authUrl}?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    const data = await this.oauthExchange.postJson(config.tokenUrl, {
      app_id: config.clientId,
      secret: config.clientSecret,
      auth_code: code,
    });
    this.assertOk(data);
    return toTokenResult(data?.data, 'TikTok');
  }

  async refreshToken(
    params: { accessToken: string; refreshToken: string | null },
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    if (!params.refreshToken) {
      throw new OAuthExchangeError(
        'TikTok requires a refresh token to obtain a new access token',
      );
    }
    const data = await this.oauthExchange.postJson(
      config.refreshTokenUrl ?? config.tokenUrl,
      {
        app_id: config.clientId,
        secret: config.clientSecret,
        refresh_token: params.refreshToken,
      },
    );
    this.assertOk(data);
    return toTokenResult(data?.data, 'TikTok');
  }

  async listAccessibleAccounts(
    accessToken: string,
    config: PlatformOAuthConfig,
  ): Promise<PlatformAccount[]> {
    const accounts: PlatformAccount[] = [];
    for (let page = 1; page <= MAX_PAGINATION_PAGES; page++) {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
        fields: 'advertiser_id,advertiser_name,name',
      });
      const data = await this.oauthExchange.getJson(
        `${config.apiBaseUrl}/advertiser/get/?${params.toString()}`,
        this.apiHeaders(accessToken),
      );
      this.assertOk(data);
      const listed = Array.isArray(data?.data?.list) ? data.data.list : [];
      accounts.push(
        ...listed.map((account: TiktokAccountResponse) => ({
          id: String(account.advertiser_id ?? ''),
          name:
            account.advertiser_name ??
            account.name ??
            `TikTok account ${account.advertiser_id}`,
        })),
      );
      const totalPage = data?.data?.page_info?.total_page;
      const lastPage =
        typeof totalPage === 'number'
          ? page >= totalPage
          : listed.length < PAGE_SIZE;
      if (lastPage) break;
    }
    return accounts;
  }

  async listCampaigns(
    accessToken: string,
    adAccountId: string,
    config: PlatformOAuthConfig,
  ): Promise<ImportedCampaign[]> {
    const campaigns: ImportedCampaign[] = [];
    for (let page = 1; page <= MAX_PAGINATION_PAGES; page++) {
      const params = new URLSearchParams({
        advertiser_id: adAccountId,
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      const data = await this.oauthExchange.getJson(
        `${config.apiBaseUrl}/campaign/get/?${params.toString()}`,
        this.apiHeaders(accessToken),
      );
      this.assertOk(data);
      const listed = Array.isArray(data?.data?.list) ? data.data.list : [];
      campaigns.push(
        ...listed.map((campaign: TiktokCampaignResponse) =>
          this.toImportedCampaign(campaign),
        ),
      );
      const totalPage = data?.data?.page_info?.total_page;
      const lastPage =
        typeof totalPage === 'number'
          ? page >= totalPage
          : listed.length < PAGE_SIZE;
      if (lastPage) break;
    }
    return campaigns;
  }

  private apiHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /** TikTok Business API wraps results in `code` (0 = success). */
  private assertOk(data: any): void {
    const code = data?.code;
    if (code !== 0) {
      throw new OAuthExchangeError(
        `TikTok rejected the request (code ${code ?? 'unknown'})`,
      );
    }
  }

  private toImportedCampaign(
    campaign: TiktokCampaignResponse,
  ): ImportedCampaign {
    const status = String(campaign.status ?? 'UNKNOWN').toUpperCase();
    const budget =
      campaign.budget !== undefined && campaign.budget !== null
        ? Number(campaign.budget)
        : campaign.daily_budget !== undefined && campaign.daily_budget !== null
          ? Number(campaign.daily_budget)
          : undefined;
    return {
      externalId: String(campaign.campaign_id ?? ''),
      name: campaign.campaign_name ?? `TikTok campaign ${campaign.campaign_id}`,
      externalStatus: status,
      budget,
      startDate: this.epochToDate(campaign.start_time),
      endDate: this.epochToDate(campaign.end_time),
      raw: campaign as unknown as Record<string, unknown>,
    };
  }

  /** TikTok campaign dates are unix seconds; 0 / empty means unknown. */
  private epochToDate(value: any): Date | undefined {
    const seconds = Number(value);
    if (!seconds || seconds <= 0) return undefined;
    return new Date(seconds * 1000);
  }
}
