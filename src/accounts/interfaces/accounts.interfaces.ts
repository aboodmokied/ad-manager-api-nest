import { Platform } from '@prisma/client';
import { ConnectionStatus } from '../constants/accounts.constants';

/** Fully resolved OAuth configuration for one advertising platform. */
export interface PlatformOAuthConfig {
  platform: Platform;
  displayName: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  authUrl: string;
  tokenUrl: string;
  /** Base URL of the platform API used for campaigns/customers calls. */
  apiBaseUrl: string;
  /** API version string used to build endpoint URLs. */
  apiVersion: string;
  /** Refresh-token endpoint when it differs from the code-exchange URL (TikTok). */
  refreshTokenUrl?: string;
  /** Google Ads developer token (only for GOOGLE). */
  developerToken?: string;
  /** Google Ads login customer id header value (only for GOOGLE). */
  loginCustomerId?: string;
}

/** Result of a successful OAuth token exchange or refresh. */
export interface TokenExchangeResult {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** An ad account owned by the user on the provider side. */
export interface PlatformAccount {
  id: string;
  name: string;
}

/** A campaign as reported by the advertising platform. */
export interface ImportedCampaign {
  externalId: string;
  name: string;
  externalStatus: string;
  budget?: number;
  startDate?: Date;
  endDate?: Date;
  raw: Record<string, unknown>;
}

/** Payload bound to a single OAuth state token. */
export interface OAuthStatePayload {
  userId: string;
  email: string;
  platform: Platform;
  tenantId: string;
  adAccountId?: string;
  successRedirectUri?: string;
  failureRedirectUri?: string;
  /**
   * PKCE code verifier (X/Twitter requires PKCE): generated when the flow
   * starts and carried inside the state payload so the callback can present
   * it during the code exchange.
   */
  pkceVerifier?: string;
}

/**
 * Provider-specific data that must survive between the authorization URL
 * and the callback (currently only the PKCE code verifier used by X).
 */
export type OAuthAuthSession = {
  pkceVerifier?: string;
};

/** Data required to start an OAuth linking flow. */
export interface ConnectAccountRequestData {
  platform: Platform;
  adAccountId?: string;
  successRedirectUri?: string;
  failureRedirectUri?: string;
}

/** Public descriptor of a supported advertising platform. */
export interface PlatformDescriptor {
  platform: Platform;
  displayName: string;
  scopes: string;
}

/** Safe (token-free) representation of a connected advertising account. */
export interface ConnectedAccountView {
  id: string | null;
  platform: Platform;
  platformDisplayName: string;
  status: ConnectionStatus;
  expiresAt: Date | null;
  connectedAt: Date | null;
  updatedAt: Date | null;
}

/** Counters returned by a campaign import run. */
export interface CampaignImportResult {
  imported: number;
  updated: number;
  failed: number;
}

/** Payload of the campaign import event published to RabbitMQ. */
export interface ImportRequestPayload {
  accountId: string;
  userId: string;
  platform: Platform;
  tenantId: string;
  adAccountId?: string;
}

/** Payload of the reauthorization-required event. */
export interface ReauthRequiredEventPayload {
  accountId: string;
  userId: string;
  platform: Platform;
  occurredAt: string;
}
