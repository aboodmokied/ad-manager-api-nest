import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenService } from './token.service';
import {
  GoogleOAuthProfile,
  OAuthCallbackResult,
} from '../interfaces/auth.interfaces';
import { getBackendUrl, getFrontendUrl } from '../utils/app-urls.util';
import {
  BCRYPT_SALT_ROUNDS,
  OAUTH_STATE_TTL_SECONDS,
  GOOGLE_OAUTH_AUTH_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_OAUTH_USERINFO_URL,
  GOOGLE_OAUTH_SCOPE,
} from '../constant/auth-messages';

/**
 * Google OAuth: consent URL generation, authorization-code exchange, profile
 * resolution and find-or-create account linking.
 */
@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
  ) {}

  /** Builds the Google OAuth consent URL the user is redirected to. */
  async getGoogleOAuthUrl(): Promise<string> {
    const config = this.getGoogleConfig();
    const state = randomUUID();
    const redis = this.redisService.getClient();
    if (redis) {
      await redis.set(
        `oauth-state:${state}`,
        'google',
        'EX',
        OAUTH_STATE_TTL_SECONDS,
      );
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPE,
      access_type: 'online',
      state,
    });
    return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Completes a Google OAuth login: exchanges the authorization code for
   * tokens, resolves the profile, and finds-or-creates the user account.
   */
  async handleGoogleOAuthCallback(
    code: string,
    state: string,
  ): Promise<OAuthCallbackResult> {
    const config = this.getGoogleConfig();
    await this.consumeOAuthState(state);

    const tokens = await this.exchangeGoogleCode(code, config);
    const profile = await this.fetchGoogleProfile(tokens.access_token);

    const user = await this.findOrCreateOAuthUser(profile);

    if (user.twoFactorEnabled) {
      const loginToken = await this.tokenService.issueLoginToken(
        user.id,
        user.email,
      );
      return { requiresTwoFactor: true, loginToken };
    }

    return this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
  }

  /**
   * Returns the Google consent URL the user should be redirected to. If the
   * URL cannot be built (e.g. OAuth is not configured) it returns the frontend
   * error redirect instead of throwing, so the endpoint always redirects.
   */
  async getGoogleOAuthRedirectUrl(): Promise<string> {
    try {
      return await this.getGoogleOAuthUrl();
    } catch (error: any) {
      return this.buildOAuthErrorRedirect(error?.message);
    }
  }

  /**
   * Builds the single browser redirect for the OAuth callback: it either
   * carries the issued token pair, the two-factor step requirement, or an
   * error query param. All response-building lives here, not in the controller.
   */
  async handleGoogleOAuthCallbackRedirect(
    code: string,
    state: string,
    oauthError?: string,
  ): Promise<string> {
    if (oauthError || !code || !state) {
      return this.buildOAuthErrorRedirect(
        oauthError ?? 'Google login was cancelled or incomplete',
      );
    }
    try {
      const result = await this.handleGoogleOAuthCallback(code, state);
      const params = new URLSearchParams();
      if ('requiresTwoFactor' in result) {
        params.set('requires_two_factor', 'true');
        params.set('login_token', result.loginToken);
      } else {
        params.set('access_token', result.accessToken);
        params.set('refresh_token', result.refreshToken);
        params.set('user', JSON.stringify(result.user));
      }
      return `${getFrontendUrl(this.configService)}/oauth/callback?${params.toString()}`;
    } catch (error: any) {
      return this.buildOAuthErrorRedirect(error?.message);
    }
  }

  private buildOAuthErrorRedirect(message?: string): string {
    const params = new URLSearchParams({
      error: message ?? 'OAuth login failed',
    });
    return `${getFrontendUrl(this.configService)}/oauth/callback?${params.toString()}`;
  }

  private async consumeOAuthState(state: string): Promise<void> {
    const redis = this.redisService.getClient();
    if (!redis) {
      throw new UnauthorizedException('OAuth state verification unavailable');
    }
    const stored = await redis.get(`oauth-state:${state}`);
    if (!stored) {
      throw new UnauthorizedException(
        'Invalid OAuth state. Please start the login again.',
      );
    }
    await redis.del(`oauth-state:${state}`);
  }

  private async exchangeGoogleCode(
    code: string,
    config: { clientId: string; clientSecret: string; redirectUri: string },
  ): Promise<{ access_token: string; refresh_token?: string }> {
    // Google's token endpoint requires application/x-www-form-urlencoded
    const body = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new UnauthorizedException(
        'Google could not exchange the authorization code',
      );
    }
    return data;
  }

  private async fetchGoogleProfile(
    accessToken: string,
  ): Promise<GoogleOAuthProfile> {
    const response = await fetch(GOOGLE_OAUTH_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const profile = await response.json().catch(() => null);
    if (!response.ok || !profile?.id || !profile?.email) {
      throw new UnauthorizedException(
        'Google could not provide the user profile',
      );
    }
    return profile as GoogleOAuthProfile;
  }

  /**
   * Resolves a Google profile into a UACM account. A user is matched by the
   * provider ID first, then by email (linking an existing account to Google
   * on first sign-in).
   */
  private async findOrCreateOAuthUser(profile: GoogleOAuthProfile): Promise<{
    id: string;
    email: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
  }> {
    let user = await this.prisma.user.findFirst({
      where: { oauthProvider: 'google', oauthProviderId: profile.id },
    });

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });
    }
    if (user) {
      if (user.oauthProviderId !== profile.id) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            oauthProvider: 'google',
            oauthProviderId: profile.id,
            emailVerified:
              user.emailVerified || profile.verified_email === true,
          },
        });
      }
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      };
    }

    const passwordHash = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      BCRYPT_SALT_ROUNDS,
    );
    const created = await this.prisma.user.create({
      data: {
        name: profile.name || profile.email.split('@')[0],
        email: profile.email,
        passwordHash,
        emailVerified: profile.verified_email === true,
        oauthProvider: 'google',
        oauthProviderId: profile.id,
      },
    });

    return {
      id: created.id,
      email: created.email,
      emailVerified: created.emailVerified,
      twoFactorEnabled: created.twoFactorEnabled,
    };
  }

  private getGoogleConfig(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri =
      this.configService.get<string>('GOOGLE_REDIRECT_URI') ??
      `${getBackendUrl(this.configService)}/api/v1/auth/oauth/google/callback`;

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      );
    }
    return { clientId, clientSecret, redirectUri };
  }
}
