/** How long an OAuth state token stays valid in Redis (10 minutes). */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/** Fallback budget used when the platform reports no budget for a campaign. */
export const DEFAULT_IMPORTED_CAMPAIGN_BUDGET = 0;

/** Default campaign duration when the platform reports no end date. */
export const DEFAULT_IMPORTED_CAMPAIGN_DURATION_DAYS = 30;

/** Upper bound enforced on imported budgets (fits the Decimal(10,2) column). */
export const MAX_IMPORTED_CAMPAIGN_BUDGET = 99_999_999.99;

/** Outbound HTTP timeout for platform API calls (15 seconds). */
export const OAUTH_HTTP_TIMEOUT_MS = 15_000;

/** Google Ads REST API version used for campaign/customer calls. */
export const GOOGLE_ADS_API_VERSION = 'v18';

/** Default Meta Graph API version used for OAuth/campaign calls. */
export const DEFAULT_META_API_VERSION = 'v21.0';

/** LinkedIn Marketing API version used for ad account/campaign calls. */
export const LINKEDIN_API_VERSION = 'v2';

/** X (Twitter) Ads API version used for ad account/campaign calls. */
export const X_API_VERSION = '2';

/** Snapchat Marketing API version used for ad account/campaign calls. */
export const SNAPCHAT_API_VERSION = 'v1';

/** TikTok Business API version used for ad account/campaign calls. */
export const TIKTOK_API_VERSION = 'v1.3';

/** Default OAuth scopes per platform (overridable via env). */
export const DEFAULT_META_SCOPE = 'ads_management,ads_read,business_management';
export const DEFAULT_GOOGLE_ADS_SCOPE =
  'https://www.googleapis.com/auth/adwords';
export const DEFAULT_LINKEDIN_SCOPE = 'r_ads,r_ads_reporting';
export const DEFAULT_X_SCOPE = 'tweet.read users.read offline.access ads.read';
export const DEFAULT_SNAPCHAT_SCOPE = 'snapchat-marketing-api';
export const DEFAULT_TIKTOK_SCOPE = 'ad.account.read,ad.campaign.read';

/** Google OAuth endpoint constants. */
export const GOOGLE_OAUTH_AUTH_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** LinkedIn OAuth endpoint constants. */
export const LINKEDIN_OAUTH_AUTH_URL =
  'https://www.linkedin.com/oauth/v2/authorization';
export const LINKEDIN_OAUTH_TOKEN_URL =
  'https://www.linkedin.com/oauth/v2/accessToken';

/** X (Twitter) OAuth endpoint constants. */
export const X_OAUTH_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
export const X_OAUTH_TOKEN_URL = 'https://api.x.com/2/oauth2/token';

/** Snapchat OAuth endpoint constants. */
export const SNAPCHAT_OAUTH_AUTH_URL =
  'https://accounts.snapchat.com/accounts/oauth2/auth';
export const SNAPCHAT_OAUTH_TOKEN_URL =
  'https://accounts.snapchat.com/accounts/oauth2/token';

/** TikTok OAuth endpoint constants. */
export const TIKTOK_OAUTH_AUTH_URL =
  'https://ads.tiktok.com/marketing_api/v2/oauth/authorize/';
export const TIKTOK_OAUTH_TOKEN_URL =
  'https://ads.tiktok.com/open_api/v1.3/oauth2/access_token/';
export const TIKTOK_OAUTH_REFRESH_URL =
  'https://ads.tiktok.com/open_api/v1.3/oauth2/refresh_token/';

/** RabbitMQ queue + routing key used to schedule campaign imports. */
export const CAMPAIGN_IMPORT_QUEUE = 'account_campaign_import_queue';
export const CAMPAIGN_IMPORT_EVENT = 'account.campaigns-import-requested';

/** RabbitMQ event emitted when an account needs user reauthorization. */
export const REAUTH_REQUIRED_EVENT = 'account.reauthorization-required';

/** Redis key prefix for OAuth state tokens. */
export const ACCOUNT_STATE_KEY_PREFIX = 'ad-oauth:state:';

/**
 * Connection lifecycle of an advertising account, exposed to the API and
 * used internally to decide whether platform calls can proceed.
 */
export const CONNECTION_STATUS = {
  /** Account exists and the stored access token is still valid. */
  CONNECTED: 'CONNECTED',
  /** No account is linked for the platform. */
  DISCONNECTED: 'DISCONNECTED',
  /** The access token expired; a refresh attempt has not succeeded yet. */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** Token refresh failed; the user must re-connect the account. */
  REAUTHORIZATION_REQUIRED: 'REAUTHORIZATION_REQUIRED',
} as const;

export type ConnectionStatus =
  (typeof CONNECTION_STATUS)[keyof typeof CONNECTION_STATUS];

/** Frontend paths the callback redirects to after success/failure. */
export const DEFAULT_SUCCESS_REDIRECT_PATH = '/ad-accounts/connected';
export const DEFAULT_FAILURE_REDIRECT_PATH = '/ad-accounts/connect-failed';

/** Friendly platform names used in API responses and emails. */
export const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  META: 'Meta Ads',
  GOOGLE: 'Google Ads',
  LINKEDIN: 'LinkedIn Ads',
  X: 'X (Twitter)',
  SNAPCHAT: 'Snapchat Ads',
  TIKTOK: 'TikTok Ads',
};
