import { Platform } from '../enums/platform.enum';
import {
  UnifiedCampaign,
  UnifiedTargetingSet,
  UnifiedCreativeAd,
  UnifiedMediaAsset,
} from '../canonical/campaign';
import { CurrencyMicros } from '../canonical/currency';

export interface PlatformValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PlatformMediaResult {
  platformMediaId: string;
  mediaUrl: string;
}

export interface PlatformCampaignResult {
  externalCampaignId: string;
}

export interface PlatformTargetingSetResult {
  externalTargetingSetId: string;
}

export interface PlatformAdResult {
  externalAdId: string;
}

export interface UnifiedPerformanceMetrics {
  impressions: bigint;
  clicks: bigint;
  spendMicros: CurrencyMicros;
  conversions: bigint;
  ctr: number;
  cpcMicros: CurrencyMicros;
  roas?: number;
}

export interface IAdPlatformAdapter {
  readonly platform: Platform;

  /** Pre-flight schema & business rules validation */
  validatePlatformPayload(
    campaign: UnifiedCampaign,
    targetingSets: UnifiedTargetingSet[],
    ads: UnifiedCreativeAd[],
  ): Promise<PlatformValidationResult>;

  /** Step 1: Upload or register media asset on ad network */
  uploadMedia(
    accountId: string,
    media: UnifiedMediaAsset,
    accessToken: string,
  ): Promise<PlatformMediaResult>;

  /** Step 2: Create external platform campaign */
  createPlatformCampaign(
    campaign: UnifiedCampaign,
    accountId: string,
    accessToken: string,
  ): Promise<PlatformCampaignResult>;

  /** Step 3: Create external platform targeting set / ad set / ad group */
  createPlatformTargetingSet(
    externalCampaignId: string,
    targetingSet: UnifiedTargetingSet,
    accountId: string,
    accessToken: string,
  ): Promise<PlatformTargetingSetResult>;

  /** Step 4: Create external platform ad & creative */
  createPlatformAd(
    externalTargetingSetId: string,
    ad: UnifiedCreativeAd,
    mediaResult: PlatformMediaResult | undefined,
    accountId: string,
    accessToken: string,
  ): Promise<PlatformAdResult>;

  /** Update campaign budget (strictly in Micros BigInt) */
  updateBudget(
    externalCampaignId: string,
    budgetMicros: CurrencyMicros,
    accountId: string,
    accessToken: string,
  ): Promise<void>;

  /** Pause active campaign */
  pauseCampaign(
    externalCampaignId: string,
    accountId: string,
    accessToken: string,
  ): Promise<void>;

  /** Resume paused campaign */
  resumeCampaign(
    externalCampaignId: string,
    accountId: string,
    accessToken: string,
  ): Promise<void>;

  /** Query campaign performance metrics */
  getInsights(
    externalCampaignId: string,
    startDate: string,
    endDate: string,
    accountId: string,
    accessToken: string,
  ): Promise<UnifiedPerformanceMetrics>;
}
