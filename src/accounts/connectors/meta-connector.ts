import { Injectable, Logger } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { OAuthExchangeService } from '../services/oauth-exchange.service';
import {
  ImportedCampaign,
  PlatformAccount,
  PlatformOAuthConfig,
  TokenExchangeResult,
} from '../interfaces/accounts.interfaces';
import { AdAccountConnector } from './ad-account-connector.interface';
import {
  MAX_PAGINATION_PAGES,
  fromMinorUnits,
  toTokenResult,
} from './connector-utils';
import {
  MetaAccountResponse,
  MetaCampaignResponse,
} from './connector-responses';

/**
 * Meta (Facebook/Instagram) Ads connector.
 *
 * OAuth flow: the /dialog/oauth consent URL -> authorization code -> short
 * lived token -> fb_exchange_token refresh to a long lived token. Meta does
 * not issue refresh tokens, so the refresh material is the long lived token
 * itself (the stored access token is used when no refresh token exists).
 */
@Injectable()
export class MetaConnector implements AdAccountConnector {
  readonly platform = Platform.META;

  private readonly logger = new Logger(MetaConnector.name);

  constructor(private readonly oauthExchange: OAuthExchangeService) {}

  buildAuthUrl(state: string, config: PlatformOAuthConfig): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scope,
      state,
    });
    return `${config.authUrl}?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    });
    const data = await this.oauthExchange.getJson(
      `${config.tokenUrl}?${params.toString()}`,
    );
    return toTokenResult(data, 'Meta');
  }

  async refreshToken(
    params: { accessToken: string; refreshToken: string | null },
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    const query = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      fb_exchange_token: params.refreshToken ?? params.accessToken,
    });
    const data = await this.oauthExchange.getJson(
      `${config.tokenUrl}?${query.toString()}`,
    );
    return toTokenResult(data, 'Meta');
  }

  async listAccessibleAccounts(
    accessToken: string,
    config: PlatformOAuthConfig,
  ): Promise<PlatformAccount[]> {
    const accounts: PlatformAccount[] = [];
    let nextUrl: string | null =
      `${config.apiBaseUrl}/me/adaccounts?${new URLSearchParams({
        fields: 'id,name',
        limit: '100',
        access_token: accessToken,
      })}`;
    for (let page = 0; page < MAX_PAGINATION_PAGES && nextUrl; page++) {
      const data = await this.oauthExchange.getJson(nextUrl);
      const rawAccounts = Array.isArray(data?.data) ? data.data : [];
      accounts.push(
        ...rawAccounts.map((account: MetaAccountResponse) => ({
          id: this.normalizeAccountId(String(account.id ?? '')),
          name: account.name ?? `Meta account ${account.id}`,
        })),
      );
      nextUrl =
        typeof data?.paging?.next === 'string' ? data.paging.next : null;
    }
    return accounts;
  }

  async listCampaigns(
    accessToken: string,
    adAccountId: string,
    config: PlatformOAuthConfig,
  ): Promise<ImportedCampaign[]> {
    const currency = await this.fetchAccountCurrency(
      accessToken,
      adAccountId,
      config,
    );
    const campaigns: ImportedCampaign[] = [];
    let nextUrl: string | null =
      `${config.apiBaseUrl}/act_${this.normalizeAccountId(adAccountId)}/campaigns?${new URLSearchParams(
        {
          fields: 'id,name,status,start_time,stop_time,daily_budget',
          limit: '500',
          access_token: accessToken,
        },
      )}`;
    for (let page = 0; page < MAX_PAGINATION_PAGES && nextUrl; page++) {
      const data = await this.oauthExchange.getJson(nextUrl);
      const rawCampaigns = Array.isArray(data?.data) ? data.data : [];
      campaigns.push(
        ...rawCampaigns.map((campaign: MetaCampaignResponse) =>
          this.toImportedCampaign(campaign, currency),
        ),
      );
      nextUrl =
        typeof data?.paging?.next === 'string' ? data.paging.next : null;
    }
    return campaigns;
  }

  private async fetchAccountCurrency(
    accessToken: string,
    adAccountId: string,
    config: PlatformOAuthConfig,
  ): Promise<string | undefined> {
    try {
      const data: MetaAccountResponse = await this.oauthExchange.getJson(
        `${config.apiBaseUrl}/act_${this.normalizeAccountId(adAccountId)}?fields=currency&access_token=${accessToken}`,
      );
      return typeof data?.currency === 'string' ? data.currency : undefined;
    } catch {
      this.logger.warn(
        `Could not resolve currency for Meta account ${adAccountId} - assuming a 2-decimal currency`,
      );
      return undefined;
    }
  }

  private normalizeAccountId(accountId: string): string {
    return accountId.replace(/^act_/, '');
  }

  private toImportedCampaign(
    campaign: MetaCampaignResponse,
    currency?: string,
  ): ImportedCampaign {
    // daily_budget is expressed in the account currency's minimum
    // denomination (e.g. cents for USD), not in whole currency units.
    return {
      externalId: String(campaign.id ?? ''),
      name: campaign.name ?? `Meta campaign ${campaign.id}`,
      externalStatus: String(campaign.status ?? 'UNKNOWN'),
      budget: fromMinorUnits(campaign.daily_budget, currency),
      startDate: campaign.start_time
        ? new Date(campaign.start_time)
        : undefined,
      endDate: campaign.stop_time ? new Date(campaign.stop_time) : undefined,
      raw: campaign as unknown as Record<string, unknown>,
    };
  }
}
