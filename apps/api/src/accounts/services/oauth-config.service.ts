import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { getBackendUrl } from '../../auth/utils/app-urls.util';
import {
  DEFAULT_GOOGLE_ADS_SCOPE,
  DEFAULT_LINKEDIN_SCOPE,
  DEFAULT_META_API_VERSION,
  DEFAULT_META_SCOPE,
  DEFAULT_SNAPCHAT_SCOPE,
  DEFAULT_TIKTOK_SCOPE,
  DEFAULT_X_SCOPE,
  GOOGLE_ADS_API_VERSION,
  GOOGLE_OAUTH_AUTH_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  LINKEDIN_API_VERSION,
  LINKEDIN_OAUTH_AUTH_URL,
  LINKEDIN_OAUTH_TOKEN_URL,
  PLATFORM_DISPLAY_NAMES,
  SNAPCHAT_API_VERSION,
  SNAPCHAT_OAUTH_AUTH_URL,
  SNAPCHAT_OAUTH_TOKEN_URL,
  TIKTOK_API_VERSION,
  TIKTOK_OAUTH_REFRESH_URL,
  TIKTOK_OAUTH_TOKEN_URL,
  TIKTOK_OAUTH_AUTH_URL,
  X_API_VERSION,
  X_OAUTH_AUTH_URL,
  X_OAUTH_TOKEN_URL,
} from '../constants/accounts.constants';
import {
  PlatformDescriptor,
  PlatformOAuthConfig,
} from '../interfaces/accounts.interfaces';

/**
 * Platform registry + OAuth configuration resolver.
 *
 * The module supports any platform registered here (currently Meta and
 * Google Ads) and validates that the required environment variables exist
 * before an authorization flow can start - mirroring the auth module's
 * Google OAuth configuration handling.
 */
@Injectable()
export class OAuthConfigService {
  constructor(private readonly configService: ConfigService) {}

  /** Lists the supported platforms with their display names and scopes. */
  listPlatforms(): PlatformDescriptor[] {
    return [
      {
        platform: Platform.META,
        displayName: PLATFORM_DISPLAY_NAMES[Platform.META],
        scopes:
          this.configService.get<string>('META_SCOPE') ?? DEFAULT_META_SCOPE,
      },
      {
        platform: Platform.GOOGLE,
        displayName: PLATFORM_DISPLAY_NAMES[Platform.GOOGLE],
        scopes:
          this.configService.get<string>('GOOGLE_ADS_SCOPE') ??
          DEFAULT_GOOGLE_ADS_SCOPE,
      },
      {
        platform: Platform.LINKEDIN,
        displayName: PLATFORM_DISPLAY_NAMES[Platform.LINKEDIN],
        scopes:
          this.configService.get<string>('LINKEDIN_SCOPE') ??
          DEFAULT_LINKEDIN_SCOPE,
      },
      {
        platform: Platform.X,
        displayName: PLATFORM_DISPLAY_NAMES[Platform.X],
        scopes: this.configService.get<string>('X_SCOPE') ?? DEFAULT_X_SCOPE,
      },
      {
        platform: Platform.SNAPCHAT,
        displayName: PLATFORM_DISPLAY_NAMES[Platform.SNAPCHAT],
        scopes:
          this.configService.get<string>('SNAPCHAT_SCOPE') ??
          DEFAULT_SNAPCHAT_SCOPE,
      },
      {
        platform: Platform.TIKTOK,
        displayName: PLATFORM_DISPLAY_NAMES[Platform.TIKTOK],
        scopes:
          this.configService.get<string>('TIKTOK_SCOPE') ??
          DEFAULT_TIKTOK_SCOPE,
      },
    ];
  }

  /** Returns the fully resolved OAuth configuration for a platform. */
  getConfig(platform: Platform): PlatformOAuthConfig {
    switch (platform) {
      case Platform.META:
        return this.getMetaConfig();
      case Platform.GOOGLE:
        return this.getGoogleConfig();
      case Platform.LINKEDIN:
        return this.getLinkedinConfig();
      case Platform.X:
        return this.getXConfig();
      case Platform.SNAPCHAT:
        return this.getSnapchatConfig();
      case Platform.TIKTOK:
        return this.getTikTokConfig();
      default:
        throw new InternalServerErrorException(
          `Advertising platform ${platform} is not supported`,
        );
    }
  }

  private getMetaConfig(): PlatformOAuthConfig {
    const clientId = this.configService.get<string>('META_APP_ID');
    const clientSecret = this.configService.get<string>('META_APP_SECRET');
    const version =
      this.configService.get<string>('META_API_VERSION') ??
      DEFAULT_META_API_VERSION;
    const apiBaseUrl = `https://graph.facebook.com/${version}`;

    if (!clientId || !clientSecret) {
      throw this.missingConfig('Meta Ads', 'META_APP_ID and META_APP_SECRET');
    }

    return {
      platform: Platform.META,
      displayName: PLATFORM_DISPLAY_NAMES[Platform.META],
      clientId,
      clientSecret,
      redirectUri: this.resolveRedirectUri('META_REDIRECT_URI'),
      scope: this.configService.get<string>('META_SCOPE') ?? DEFAULT_META_SCOPE,
      authUrl: `https://www.facebook.com/${version}/dialog/oauth`,
      tokenUrl: `${apiBaseUrl}/oauth/access_token`,
      apiBaseUrl,
      apiVersion: version,
    };
  }

  private getGoogleConfig(): PlatformOAuthConfig {
    const clientId = this.configService.get<string>('GOOGLE_ADS_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'GOOGLE_ADS_CLIENT_SECRET',
    );
    const developerToken = this.configService.get<string>(
      'GOOGLE_ADS_DEVELOPER_TOKEN',
    );
    const apiBaseUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

    if (!clientId || !clientSecret || !developerToken) {
      throw this.missingConfig(
        'Google Ads',
        'GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET and GOOGLE_ADS_DEVELOPER_TOKEN',
      );
    }

    return {
      platform: Platform.GOOGLE,
      displayName: PLATFORM_DISPLAY_NAMES[Platform.GOOGLE],
      clientId,
      clientSecret,
      redirectUri: this.resolveRedirectUri('GOOGLE_ADS_REDIRECT_URI'),
      scope:
        this.configService.get<string>('GOOGLE_ADS_SCOPE') ??
        DEFAULT_GOOGLE_ADS_SCOPE,
      authUrl: GOOGLE_OAUTH_AUTH_URL,
      tokenUrl: GOOGLE_OAUTH_TOKEN_URL,
      apiBaseUrl,
      apiVersion: GOOGLE_ADS_API_VERSION,
      developerToken,
      loginCustomerId: this.configService.get<string>(
        'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
      ),
    };
  }

  private getLinkedinConfig(): PlatformOAuthConfig {
    const clientId = this.configService.get<string>('LINKEDIN_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'LINKEDIN_CLIENT_SECRET',
    );
    const apiBaseUrl = `https://api.linkedin.com/${LINKEDIN_API_VERSION}`;

    if (!clientId || !clientSecret) {
      throw this.missingConfig(
        'LinkedIn Ads',
        'LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET',
      );
    }

    return {
      platform: Platform.LINKEDIN,
      displayName: PLATFORM_DISPLAY_NAMES[Platform.LINKEDIN],
      clientId,
      clientSecret,
      redirectUri: this.resolveRedirectUri('LINKEDIN_REDIRECT_URI'),
      scope:
        this.configService.get<string>('LINKEDIN_SCOPE') ??
        DEFAULT_LINKEDIN_SCOPE,
      authUrl: LINKEDIN_OAUTH_AUTH_URL,
      tokenUrl: LINKEDIN_OAUTH_TOKEN_URL,
      apiBaseUrl,
      apiVersion: LINKEDIN_API_VERSION,
    };
  }

  private getXConfig(): PlatformOAuthConfig {
    const clientId = this.configService.get<string>('X_CLIENT_ID');
    const clientSecret = this.configService.get<string>('X_CLIENT_SECRET');
    const apiBaseUrl = `https://api.x.com/${X_API_VERSION}`;

    if (!clientId || !clientSecret) {
      throw this.missingConfig(
        'X (Twitter)',
        'X_CLIENT_ID and X_CLIENT_SECRET',
      );
    }

    return {
      platform: Platform.X,
      displayName: PLATFORM_DISPLAY_NAMES[Platform.X],
      clientId,
      clientSecret,
      redirectUri: this.resolveRedirectUri('X_REDIRECT_URI'),
      scope: this.configService.get<string>('X_SCOPE') ?? DEFAULT_X_SCOPE,
      authUrl: X_OAUTH_AUTH_URL,
      tokenUrl: X_OAUTH_TOKEN_URL,
      apiBaseUrl,
      apiVersion: X_API_VERSION,
    };
  }

  private getSnapchatConfig(): PlatformOAuthConfig {
    const clientId = this.configService.get<string>('SNAPCHAT_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'SNAPCHAT_CLIENT_SECRET',
    );
    const apiBaseUrl = `https://adsapi.snapchat.com/${SNAPCHAT_API_VERSION}`;

    if (!clientId || !clientSecret) {
      throw this.missingConfig(
        'Snapchat Ads',
        'SNAPCHAT_CLIENT_ID and SNAPCHAT_CLIENT_SECRET',
      );
    }

    return {
      platform: Platform.SNAPCHAT,
      displayName: PLATFORM_DISPLAY_NAMES[Platform.SNAPCHAT],
      clientId,
      clientSecret,
      redirectUri: this.resolveRedirectUri('SNAPCHAT_REDIRECT_URI'),
      scope:
        this.configService.get<string>('SNAPCHAT_SCOPE') ??
        DEFAULT_SNAPCHAT_SCOPE,
      authUrl: SNAPCHAT_OAUTH_AUTH_URL,
      tokenUrl: SNAPCHAT_OAUTH_TOKEN_URL,
      apiBaseUrl,
      apiVersion: SNAPCHAT_API_VERSION,
    };
  }

  private getTikTokConfig(): PlatformOAuthConfig {
    const appId = this.configService.get<string>('TIKTOK_APP_ID');
    const secret = this.configService.get<string>('TIKTOK_SECRET');
    const apiBaseUrl = `https://ads.tiktok.com/open_api/${TIKTOK_API_VERSION}`;

    if (!appId || !secret) {
      throw this.missingConfig('TikTok Ads', 'TIKTOK_APP_ID and TIKTOK_SECRET');
    }

    return {
      platform: Platform.TIKTOK,
      displayName: PLATFORM_DISPLAY_NAMES[Platform.TIKTOK],
      clientId: appId,
      clientSecret: secret,
      redirectUri: this.resolveRedirectUri('TIKTOK_REDIRECT_URI'),
      scope:
        this.configService.get<string>('TIKTOK_SCOPE') ?? DEFAULT_TIKTOK_SCOPE,
      authUrl: TIKTOK_OAUTH_AUTH_URL,
      tokenUrl: TIKTOK_OAUTH_TOKEN_URL,
      refreshTokenUrl: TIKTOK_OAUTH_REFRESH_URL,
      apiBaseUrl,
      apiVersion: TIKTOK_API_VERSION,
    };
  }

  /** Shared callback URI, overridable per platform via env vars. */
  private resolveRedirectUri(envKey: string): string {
    return (
      this.configService.get<string>(envKey) ??
      `${getBackendUrl(this.configService)}/api/v1/ad-accounts/oauth/callback`
    );
  }

  private missingConfig(platformName: string, vars: string): Error {
    return new InternalServerErrorException(
      `${platformName} OAuth is not configured. Set ${vars}.`,
    );
  }
}
