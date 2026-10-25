import { CurrencyCode, CurrencyMicros } from './currency';
import { Platform } from '../enums/platform.enum';
import { CampaignStatus } from '../enums/campaign-status.enum';
import {
  MetaCampaignOverride,
  MetaTargetingSetOverride,
  MetaCreativeAdOverride,
} from '../platforms/meta.schema';
import {
  GoogleCampaignOverride,
  GoogleTargetingSetOverride,
  GoogleCreativeAdOverride,
} from '../platforms/google.schema';

/** Tier 1: Canonical Campaign Objective */
export enum UnifiedCampaignObjective {
  AWARENESS = 'AWARENESS',
  TRAFFIC = 'TRAFFIC',
  ENGAGEMENT = 'ENGAGEMENT',
  LEAD_GENERATION = 'LEAD_GENERATION',
  SALES = 'SALES',
  APP_PROMOTION = 'APP_PROMOTION',
}

/** Tier 1: Platform Overrides Envelope */
export interface CampaignPlatformOverrides {
  meta?: MetaCampaignOverride;
  google?: GoogleCampaignOverride;
  tiktok?: Record<string, unknown>;
  snapchat?: Record<string, unknown>;
}

/** Tier 1: UnifiedCampaign */
export interface UnifiedCampaign {
  id: string;
  workspaceId: string;
  name: string;
  objective: UnifiedCampaignObjective;
  status: CampaignStatus;
  totalBudgetMicros: CurrencyMicros;
  dailyBudgetMicros?: CurrencyMicros;
  currency: CurrencyCode;
  startDate: string; // ISO 8601 UTC
  endDate: string; // ISO 8601 UTC
  targetPlatforms: Platform[];
  platformOverrides?: CampaignPlatformOverrides;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

/** Tier 2: Unified Bidding Strategy */
export enum UnifiedBidStrategy {
  LOWEST_COST = 'LOWEST_COST',
  COST_CAP = 'COST_CAP',
  TARGET_CPA = 'TARGET_CPA',
  TARGET_ROAS = 'TARGET_ROAS',
  MAXIMIZE_CONVERSIONS = 'MAXIMIZE_CONVERSIONS',
}

/** Tier 2: Canonical Geographic & Demographic Targeting */
export interface UnifiedTargetingData {
  locations: {
    countries: string[]; // ISO 3166-1 alpha-2 (e.g. ['US', 'SA', 'EG'])
    regions?: string[];
    cities?: string[];
    excludedCountries?: string[];
  };
  demographics: {
    ageMin: number; // 18 - 65
    ageMax: number; // 18 - 65
    genders: ('MALE' | 'FEMALE' | 'ALL')[];
    languages?: string[]; // ISO 639-1 (e.g. ['ar', 'en'])
  };
  interests?: string[];
  customAudienceIds?: string[];
  excludedAudienceIds?: string[];
}

/** Tier 2: Platform Overrides Envelope */
export interface TargetingSetPlatformOverrides {
  meta?: MetaTargetingSetOverride;
  google?: GoogleTargetingSetOverride;
  tiktok?: Record<string, unknown>;
  snapchat?: Record<string, unknown>;
}

/** Tier 2: UnifiedTargetingSet (AdSet / AdGroup) */
export interface UnifiedTargetingSet {
  id: string;
  campaignId: string;
  workspaceId: string;
  name: string;
  status: CampaignStatus;
  dailyBudgetMicros?: CurrencyMicros;
  bidStrategy: UnifiedBidStrategy;
  bidAmountMicros?: CurrencyMicros;
  targeting: UnifiedTargetingData;
  platformOverrides?: TargetingSetPlatformOverrides;
  createdAt: string;
  updatedAt: string;
}

/** Tier 3: Call To Action Enum */
export enum UnifiedCallToAction {
  LEARN_MORE = 'LEARN_MORE',
  SHOP_NOW = 'SHOP_NOW',
  SIGN_UP = 'SIGN_UP',
  CONTACT_US = 'CONTACT_US',
  GET_OFFER = 'GET_OFFER',
  BOOK_NOW = 'BOOK_NOW',
  DOWNLOAD = 'DOWNLOAD',
}

/** Tier 3: Media Asset Descriptor */
export interface UnifiedMediaAsset {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  url: string; // MinIO/S3 canonical URL
  hash: string; // SHA-256 hash for deduplication
  width: number;
  height: number;
  aspectRatio: string; // '1:1', '9:16', '16:9'
  fileSizeBytes: number;
  durationSeconds?: number; // For video assets
}

/** Tier 3: Automated UTM Parameters */
export interface UnifiedUtmParameters {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent?: string;
  utmTerm?: string;
  uacmAdId: string;
}

/** Tier 3: Platform Overrides Envelope */
export interface CreativeAdPlatformOverrides {
  meta?: MetaCreativeAdOverride;
  google?: GoogleCreativeAdOverride;
  tiktok?: Record<string, unknown>;
  snapchat?: Record<string, unknown>;
}

/** Tier 3: UnifiedCreativeAd */
export interface UnifiedCreativeAd {
  id: string;
  targetingSetId: string;
  workspaceId: string;
  name: string;
  status: CampaignStatus;
  headline: string; // Base headline (max 30 chars for universal cross-platform compatibility)
  body: string; // Base primary text / description
  mediaAssets: UnifiedMediaAsset[];
  callToAction: UnifiedCallToAction;
  destinationUrl: string; // Raw landing page URL
  finalUrlWithUtm: string; // Automatically tagged landing page URL
  utmParameters: UnifiedUtmParameters;
  platformOverrides?: CreativeAdPlatformOverrides;
  createdAt: string;
  updatedAt: string;
}
