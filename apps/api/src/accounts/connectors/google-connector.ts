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
import { fromMicroUnits, toTokenResult } from './connector-utils';
import {
  GoogleCampaignRow,
  GoogleSearchStreamBatch,
} from './connector-responses';

/**
 * Google Ads connector.
 *
 * OAuth flow: consent URL with `access_type=offline&prompt=consent` so the
 * provider returns a refresh token on the first code exchange. Google Ads
 * API calls (customers + campaigns) additionally require the developer
 * token header and an optional login-customer-id header.
 */
@Injectable()
export class GoogleConnector implements AdAccountConnector {
  readonly platform = Platform.GOOGLE;

  constructor(private readonly oauthExchange: OAuthExchangeService) {}

  buildAuthUrl(state: string, config: PlatformOAuthConfig): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scope,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${config.authUrl}?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    const data = await this.oauthExchange.postForm(config.tokenUrl, {
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    });
    return toTokenResult(data, 'Google');
  }

  async refreshToken(
    params: { accessToken: string; refreshToken: string | null },
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    if (!params.refreshToken) {
      throw new OAuthExchangeError(
        'Google Ads requires a refresh token to obtain a new access token',
      );
    }
    const data = await this.oauthExchange.postForm(config.tokenUrl, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: params.refreshToken,
      grant_type: 'refresh_token',
    });
    return toTokenResult(data, 'Google');
  }

  async listAccessibleAccounts(
    accessToken: string,
    config: PlatformOAuthConfig,
  ): Promise<PlatformAccount[]> {
    const data = await this.oauthExchange.getJson(
      `${config.apiBaseUrl}/customers:listAccessibleCustomers`,
      this.apiHeaders(accessToken, config),
    );
    const resourceNames = Array.isArray(data?.resourceNames)
      ? data.resourceNames
      : [];
    return resourceNames.map((resourceName: string) => {
      const customerId = resourceName.replace(/^customers\//, '');
      return { id: customerId, name: `Customer ${customerId}` };
    });
  }

  async listCampaigns(
    accessToken: string,
    adAccountId: string,
    config: PlatformOAuthConfig,
  ): Promise<ImportedCampaign[]> {
    const query = [
      'SELECT campaign.id, campaign.name, campaign.status,',
      'campaign.start_date, campaign.end_date, campaign_budget.amount_micros',
      'FROM campaign',
      "WHERE campaign.status != 'REMOVED'",
    ].join(' ');

    const data = await this.oauthExchange.postJson(
      `${config.apiBaseUrl}/customers/${adAccountId}/googleAds:searchStream`,
      { query },
      this.apiHeaders(accessToken, config),
    );

    // searchStream can return a single { results } object or an array of
    // streamed batches, each with its own results array - accept both.
    const rows: GoogleCampaignRow[] = Array.isArray(data)
      ? data.flatMap((batch: GoogleSearchStreamBatch) =>
          Array.isArray(batch?.results) ? batch.results : [],
        )
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.googleAds?.[0]?.results)
          ? data.googleAds[0].results
          : [];
    return rows.map((row) => this.toImportedCampaign(row));
  }

  private apiHeaders(
    accessToken: string,
    config: PlatformOAuthConfig,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': config.developerToken ?? '',
    };
    if (config.loginCustomerId) {
      headers['login-customer-id'] = config.loginCustomerId;
    }
    return headers;
  }

  /** Google Ads REST dates arrive as YYYYMMDD strings. */
  private parseDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
    if (!match) return undefined;
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private toImportedCampaign(row: GoogleCampaignRow): ImportedCampaign {
    const campaign = row?.campaign ?? {};
    return {
      externalId: String(campaign.id ?? ''),
      name: campaign.name ?? `Google campaign ${campaign.id}`,
      externalStatus: String(campaign.status ?? 'UNKNOWN'),
      budget: fromMicroUnits(row?.campaignBudget?.amountMicros),
      startDate: this.parseDate(campaign.startDate),
      endDate: this.parseDate(campaign.endDate),
      raw: row as unknown as Record<string, unknown>,
    };
  }
}
