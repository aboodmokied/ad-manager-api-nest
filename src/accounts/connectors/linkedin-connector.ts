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
  fromMinorUnits,
  toTokenResult,
} from './connector-utils';
import {
  LinkedInAccountResponse,
  LinkedInCampaignResponse,
  LinkedInDateValue,
} from './connector-responses';

/**
 * LinkedIn Ads connector.
 *
 * OAuth flow: consent URL -> authorization code -> tokens (access +
 * refresh). LinkedIn issues real refresh tokens. The Marketing API
 * requires the `X-Restli-Protocol-Version: 2.0.0` header on every call.
 */
@Injectable()
export class LinkedinConnector implements AdAccountConnector {
  readonly platform = Platform.LINKEDIN;

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
    return toTokenResult(data, 'LinkedIn');
  }

  async refreshToken(
    params: { accessToken: string; refreshToken: string | null },
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    if (!params.refreshToken) {
      throw new OAuthExchangeError(
        'LinkedIn Ads requires a refresh token to obtain a new access token',
      );
    }
    const data = await this.oauthExchange.postForm(config.tokenUrl, {
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    return toTokenResult(data, 'LinkedIn');
  }

  async listAccessibleAccounts(
    accessToken: string,
    config: PlatformOAuthConfig,
  ): Promise<PlatformAccount[]> {
    const accounts: PlatformAccount[] = [];
    let start = 0;
    for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
      const params = new URLSearchParams({
        q: 'search',
        projection: '(elements*(id,name))',
        start: String(start),
        count: String(PAGE_SIZE),
      });
      const data = await this.oauthExchange.getJson(
        `${config.apiBaseUrl}/adAccountsV2?${params.toString()}`,
        this.apiHeaders(accessToken),
      );
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      accounts.push(
        ...elements.map((account: LinkedInAccountResponse) => ({
          id: String(account.id ?? ''),
          name: account.name ?? `LinkedIn account ${account.id}`,
        })),
      );
      if (elements.length < PAGE_SIZE) break;
      start += PAGE_SIZE;
    }
    return accounts;
  }

  async listCampaigns(
    accessToken: string,
    adAccountId: string,
    config: PlatformOAuthConfig,
  ): Promise<ImportedCampaign[]> {
    const campaigns: ImportedCampaign[] = [];
    let start = 0;
    for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
      const params = new URLSearchParams({
        q: 'search',
        search: `(account:(urn:li:sponsoredAccount:${adAccountId}))`,
        projection: '(elements*(id,name,status,startDate,endDate,dailyBudget))',
        start: String(start),
        count: String(PAGE_SIZE),
      });
      const data = await this.oauthExchange.getJson(
        `${config.apiBaseUrl}/adCampaignsV2?${params.toString()}`,
        this.apiHeaders(accessToken),
      );
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      campaigns.push(
        ...elements.map((campaign: LinkedInCampaignResponse) =>
          this.toImportedCampaign(campaign),
        ),
      );
      if (elements.length < PAGE_SIZE) break;
      start += PAGE_SIZE;
    }
    return campaigns;
  }

  private apiHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    };
  }

  /** LinkedIn dates arrive as { year, month, day } maps. */
  private parseDate(value: LinkedInDateValue | undefined): Date | undefined {
    if (!value) return undefined;
    const year = Number(value.year);
    const month = Number(value.month);
    const day = Number(value.day);
    if (!year || !month || !day) return undefined;
    return new Date(Date.UTC(year, month - 1, day));
  }

  private toImportedCampaign(
    campaign: LinkedInCampaignResponse,
  ): ImportedCampaign {
    // LinkedIn budgets are in the currency's minor units (e.g. cents for
    // USD) and carry the currency code so non-2-decimal currencies work.
    return {
      externalId: String(campaign.id ?? ''),
      name: campaign.name ?? `LinkedIn campaign ${campaign.id}`,
      externalStatus: String(campaign.status ?? 'UNKNOWN'),
      budget: fromMinorUnits(
        campaign.dailyBudget?.amount,
        campaign.dailyBudget?.currencyCode,
      ),
      startDate: this.parseDate(campaign.startDate),
      endDate: this.parseDate(campaign.endDate),
      raw: campaign as unknown as Record<string, unknown>,
    };
  }
}
