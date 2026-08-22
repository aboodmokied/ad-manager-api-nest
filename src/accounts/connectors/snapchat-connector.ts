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
  fromMicroUnits,
  toTokenResult,
} from './connector-utils';
import {
  SnapchatAccountResponse,
  SnapchatCampaignResponse,
} from './connector-responses';

/**
 * Snapchat Ads connector.
 *
 * OAuth flow: consent URL -> authorization code -> tokens (access +
 * refresh). The Marketing API endpoints under adsapi.snapchat.com/v1
 * return `{ adaccounts: [...] }` / `{ campaigns: [...] }` payloads.
 */
@Injectable()
export class SnapchatConnector implements AdAccountConnector {
  readonly platform = Platform.SNAPCHAT;

  constructor(private readonly oauthExchange: OAuthExchangeService) {}

  buildAuthUrl(state: string, config: PlatformOAuthConfig): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope,
      state,
    });
    return `${config.authUrl}?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    const data = await this.oauthExchange.postForm(config.tokenUrl, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    return toTokenResult(data, 'Snapchat');
  }

  async refreshToken(
    params: { accessToken: string; refreshToken: string | null },
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    if (!params.refreshToken) {
      throw new OAuthExchangeError(
        'Snapchat requires a refresh token to obtain a new access token',
      );
    }
    const data = await this.oauthExchange.postForm(config.tokenUrl, {
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    return toTokenResult(data, 'Snapchat');
  }

  async listAccessibleAccounts(
    accessToken: string,
    config: PlatformOAuthConfig,
  ): Promise<PlatformAccount[]> {
    const accounts: PlatformAccount[] = [];
    let nextUrl: string | null = `${config.apiBaseUrl}/adaccounts?limit=1000`;
    for (let page = 0; page < MAX_PAGINATION_PAGES && nextUrl; page++) {
      const data = await this.oauthExchange.getJson(
        nextUrl,
        this.apiHeaders(accessToken),
      );
      const rawAccounts = Array.isArray(data?.adaccounts)
        ? data.adaccounts
        : [];
      accounts.push(
        ...rawAccounts.map((account: SnapchatAccountResponse) => ({
          id: String(account.id ?? ''),
          name: account.name ?? `Snapchat account ${account.id}`,
        })),
      );
      nextUrl =
        typeof data?.paging?.next_link === 'string'
          ? data.paging.next_link
          : null;
    }
    return accounts;
  }

  async listCampaigns(
    accessToken: string,
    adAccountId: string,
    config: PlatformOAuthConfig,
  ): Promise<ImportedCampaign[]> {
    const campaigns: ImportedCampaign[] = [];
    let nextUrl: string | null =
      `${config.apiBaseUrl}/adaccounts/${adAccountId}/campaigns?limit=1000`;
    for (let page = 0; page < MAX_PAGINATION_PAGES && nextUrl; page++) {
      const data = await this.oauthExchange.getJson(
        nextUrl,
        this.apiHeaders(accessToken),
      );
      const rawCampaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
      campaigns.push(
        ...rawCampaigns.map((campaign: SnapchatCampaignResponse) =>
          this.toImportedCampaign(campaign),
        ),
      );
      nextUrl =
        typeof data?.paging?.next_link === 'string'
          ? data.paging.next_link
          : null;
    }
    return campaigns;
  }

  private apiHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` };
  }

  /** Snapchat budgets are in micro currency units (1 unit = 1/1,000,000). */
  private toImportedCampaign(
    campaign: SnapchatCampaignResponse,
  ): ImportedCampaign {
    return {
      externalId: String(campaign.id ?? ''),
      name: campaign.name ?? `Snapchat campaign ${campaign.id}`,
      externalStatus: String(campaign.status ?? 'UNKNOWN'),
      budget: fromMicroUnits(campaign.daily_budget_micro),
      startDate: campaign.start_time
        ? new Date(campaign.start_time)
        : undefined,
      endDate: campaign.end_time ? new Date(campaign.end_time) : undefined,
      raw: campaign as unknown as Record<string, unknown>,
    };
  }
}
