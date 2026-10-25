/** JWT payload shared by every token type issued by the auth module */
export interface TokenPayload {
  sub: string;
  email: string;
  type:
    | 'access'
    | 'refresh'
    | 'two-factor-login'
    | 'password-reset'
    | 'email-verification';
  jti: string;
  /** Password reset nonce - ties a reset link to the latest reset request */
  prn?: string;
}

/** Verified profile returned by the Google OAuth userinfo endpoint */
export interface GoogleOAuthProfile {
  id: string;
  email: string;
  name?: string;
  verified_email?: boolean;
}

/**
 * A fully rendered HTML page plus the HTTP status it should be served with.
 * Lets controllers stay dumb: a handler only writes the status and body
 * returned by the service instead of owning rendering or error mapping.
 */
export interface HtmlPageResult {
  statusCode: number;
  html: string;
}

/** Token pair + user info returned after a successful credential login */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; emailVerified: boolean };
}

/** Result of a Google OAuth callback: either a token pair or a 2FA challenge */
export type OAuthCallbackResult =
  TokenResponse | { requiresTwoFactor: true; loginToken: string };
