import { Platform } from '@prisma/client';
import {
  ImportedCampaign,
  OAuthAuthSession,
  PlatformAccount,
  PlatformOAuthConfig,
  TokenExchangeResult,
} from '../interfaces/accounts.interfaces';

/**
 * Contract every advertising platform connector must implement.
 *
 * Connectors are stateless: they receive the resolved platform config and
 * perform pure HTTP interactions. This keeps the OAuth orchestration
 * (state, encryption, import) independent from provider-specific details.
 */
export interface AdAccountConnector {
  /** The platform this connector handles. */
  platform: Platform;

  /** Builds the provider authorization URL (browser redirect target). */
  buildAuthUrl(
    state: string,
    config: PlatformOAuthConfig,
    session?: OAuthAuthSession,
  ): string;

  /** Exchanges the authorization code for access/refresh tokens. */
  exchangeCode(
    code: string,
    config: PlatformOAuthConfig,
    session?: OAuthAuthSession,
  ): Promise<TokenExchangeResult>;

  /**
   * Obtains a fresh access token using the refresh material.
   * Meta exchanges the long-lived token (or current access token when no
   * refresh token exists); Google requires a real refresh token.
   */
  refreshToken(
    params: { accessToken: string; refreshToken: string | null },
    config: PlatformOAuthConfig,
  ): Promise<TokenExchangeResult>;

  /** Lists the ad accounts accessible with the given token. */
  listAccessibleAccounts(
    accessToken: string,
    config: PlatformOAuthConfig,
  ): Promise<PlatformAccount[]>;

  /** Lists campaigns of an ad account in the unified import format. */
  listCampaigns(
    accessToken: string,
    adAccountId: string,
    config: PlatformOAuthConfig,
  ): Promise<ImportedCampaign[]>;

  /**
   * Optional: generates provider-specific session data that must persist
   * until the callback (e.g. the PKCE code verifier required by X).
   */
  prepareAuthSession?(config?: PlatformOAuthConfig): Promise<OAuthAuthSession>;
}
