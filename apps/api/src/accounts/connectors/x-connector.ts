import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Platform } from '@prisma/client';
import {
  OAuthExchangeError,
  OAuthExchangeService,
} from '../services/oauth-exchange.service';
import {
  ImportedCampaign,
  OAuthAuthSession,
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
import { XCampaignResponse } from './connector-responses';

/**
 * X (Twitter) Ads connector.
 *
 * X requires PKCE (S256): a code verifier is generated when the flow
 * starts, its challenge is embedded in the authorization URL, and the
 * verifier itself is carried in the OAuth state payload until the callback
 * presents it during the code exchange. `offline.access` must be in the
 * scope to receive a refresh token.
 */
@Injectable()
export class XConnector implements AdAccountConnector {
  readonly platform = Platform.X;

  constructor(private readonly oauthExchange: OAuthExchangeService) {}

  async prepareAuthSession(): Promise<OAuthAuthSession> {
    // RFC 7636: 43-128 chars from [A-Za-z0-9-._~]; 64 random bytes base64url.
    return { pkceVerifier: randomBytes(64).toString('base64url') };
  }

  buildAuthUrl(
    state: string,
    config: PlatformOAuthConfig,
    session?: OAuthAuthSession,
  ): string {
    const verifier = session?.pkceVerifier;
    if (!verifier) {
      // A URL without the code_challenge is guaranteed to be rejected by
      // the provider, so fail loudly instead of silently misdirecting users.
      throw new OAuthExchangeError(
        'X requires a PKCE code verifier - start the linking process again',
      );
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope,
      state,
      code_challenge_method: 'S256',
      code_challenge: this.sha256Base64Url(verifier),
    });
    return `${config.authUrl}?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    config: PlatformOAuthConfig,
    session?: OAuthAuthSession,
  ): Promise<TokenExchangeResult> {
    const verifier = session?.pkceVerifier;
    if (!verifier) {
      throw new OAuthExchangeError(
        'X requires a PKCE code verifier - start the linking process again',
      );
    }
    const data = await this.oauthExchange.postForm(config.tokenUrl, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: verifier,
    });
    return toTokenResult(data, 'X');
  }

  async refreshToken(
    params: { accessToken: string; refreshToken: string | null },
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult> {
    if (!params.refreshToken) {
      throw new OAuthExchangeError(
        'X requires a refresh token (re-link with offline.access scope)',
      );
    }
    const data = await this.oauthExchange.postForm(config.tokenUrl, {
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    return toTokenResult(data, 'X');
  }

  async listAccessibleAccounts(
    accessToken: string,
    config: PlatformOAuthConfig,
  ): Promise<PlatformAccount[]> {
    const accounts: PlatformAccount[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
      const params = new URLSearchParams({ count: '1000' });
      if (cursor) params.set('cursor', cursor);
      const data = await this.oauthExchange.getJson(
        `${config.apiBaseUrl}/accounts?${params.toString()}`,
        this.apiHeaders(accessToken),
      );
      const rawAccounts = Array.isArray(data?.data) ? data.data : [];
      accounts.push(
        ...rawAccounts.map((account: any) => ({
          id: String(account.id ?? ''),
          name: account.name ?? `X account ${account.id}`,
        })),
      );
      cursor =
        typeof data?.next_cursor === 'string' && data.next_cursor
          ? data.next_cursor
          : null;
      if (!cursor) break;
    }
    return accounts;
  }

  async listCampaigns(
    accessToken: string,
    adAccountId: string,
    config: PlatformOAuthConfig,
  ): Promise<ImportedCampaign[]> {
    const campaigns: ImportedCampaign[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
      const params = new URLSearchParams({ count: '1000' });
      if (cursor) params.set('cursor', cursor);
      const data = await this.oauthExchange.getJson(
        `${config.apiBaseUrl}/accounts/${adAccountId}/campaigns?${params.toString()}`,
        this.apiHeaders(accessToken),
      );
      const rawCampaigns = Array.isArray(data?.data) ? data.data : [];
      campaigns.push(
        ...rawCampaigns.map((campaign: XCampaignResponse) =>
          this.toImportedCampaign(campaign),
        ),
      );
      cursor =
        typeof data?.next_cursor === 'string' && data.next_cursor
          ? data.next_cursor
          : null;
      if (!cursor) break;
    }
    return campaigns;
  }

  private apiHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` };
  }

  private sha256Base64Url(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
  }

  private toImportedCampaign(campaign: XCampaignResponse): ImportedCampaign {
    return {
      externalId: String(campaign.id ?? ''),
      name: campaign.name ?? `X campaign ${campaign.id}`,
      externalStatus: String(campaign.status ?? 'UNKNOWN'),
      budget: fromMicroUnits(campaign.daily_funding_amount_in_micro_currency),
      startDate: campaign.start_time
        ? new Date(campaign.start_time)
        : undefined,
      endDate: campaign.end_time ? new Date(campaign.end_time) : undefined,
      raw: campaign as unknown as Record<string, unknown>,
    };
  }
}
