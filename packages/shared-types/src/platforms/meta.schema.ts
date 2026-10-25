import { z } from 'zod';

export const MetaSpecialAdCategoryEnum = z.enum([
  'NONE',
  'HOUSING',
  'EMPLOYMENT',
  'CREDIT',
  'ISSUES_ELECTIONS_POLITICS',
]);
export type MetaSpecialAdCategory = z.infer<typeof MetaSpecialAdCategoryEnum>;

export const MetaObjectiveEnum = z.enum([
  'OUTCOME_LEADS',
  'OUTCOME_SALES',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_AWARENESS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_APP_PROMOTION',
]);
export type MetaObjective = z.infer<typeof MetaObjectiveEnum>;

export const MetaBuyingTypeEnum = z.enum(['AUCTION', 'RESERVED']);
export type MetaBuyingType = z.infer<typeof MetaBuyingTypeEnum>;

export const MetaOptimizationGoalEnum = z.enum([
  'OFFSITE_CONVERSIONS',
  'LANDING_PAGE_VIEWS',
  'LINK_CLICKS',
  'IMPRESSIONS',
  'REACH',
  'LEAD_GENERATION',
  'MESSAGES',
]);
export type MetaOptimizationGoal = z.infer<typeof MetaOptimizationGoalEnum>;

export const MetaBillingEventEnum = z.enum([
  'IMPRESSIONS',
  'LINK_CLICKS',
  'PURCHASE',
]);
export type MetaBillingEvent = z.infer<typeof MetaBillingEventEnum>;

export const MetaPublisherPlatformEnum = z.enum([
  'facebook',
  'instagram',
  'audience_network',
  'messenger',
]);
export type MetaPublisherPlatform = z.infer<typeof MetaPublisherPlatformEnum>;

export const MetaCallToActionEnum = z.enum([
  'LEARN_MORE',
  'SHOP_NOW',
  'SIGN_UP',
  'CONTACT_US',
  'GET_OFFER',
  'BOOK_NOW',
  'ORDER_NOW',
  'DOWNLOAD',
]);
export type MetaCallToAction = z.infer<typeof MetaCallToActionEnum>;

export const MetaPromotedObjectSchema = z.object({
  pixelId: z.string().optional(),
  customEventType: z.string().optional(),
  pageId: z.string().optional(),
});
export type MetaPromotedObject = z.infer<typeof MetaPromotedObjectSchema>;

export const MetaCampaignOverrideSchema = z.object({
  specialAdCategories: z
    .array(MetaSpecialAdCategoryEnum)
    .min(1)
    .default(['NONE']),
  objective: MetaObjectiveEnum.default('OUTCOME_TRAFFIC'),
  buyingType: MetaBuyingTypeEnum.default('AUCTION'),
  advantageCampaignBudget: z.boolean().default(false),
  adAccountId: z
    .string()
    .min(1, 'Meta adAccountId is required (e.g. act_123456789)'),
});

export const MetaTargetingSetOverrideSchema = z.object({
  optimizationGoal: MetaOptimizationGoalEnum,
  billingEvent: MetaBillingEventEnum.default('IMPRESSIONS'),
  promotedObject: MetaPromotedObjectSchema.optional(),
  publisherPlatforms: z
    .array(MetaPublisherPlatformEnum)
    .min(1, 'At least 1 publisher platform is required'),
  facebookPositions: z.array(z.string()).optional(),
  instagramPositions: z.array(z.string()).optional(),
});

export const MetaCreativeAdOverrideSchema = z.object({
  pageId: z.string().min(1, 'Facebook Page ID is required for Meta Ads'),
  instagramActorId: z.string().optional(),
  primaryText: z
    .string()
    .min(1, 'Primary text cannot be empty')
    .max(2200, 'Meta primary text cannot exceed 2200 characters'),
  headline: z
    .string()
    .min(1, 'Headline cannot be empty')
    .max(255, 'Meta headline cannot exceed 255 characters'),
  description: z
    .string()
    .max(255, 'Meta description cannot exceed 255 characters')
    .optional(),
  callToAction: MetaCallToActionEnum.default('LEARN_MORE'),
});

export type MetaCampaignOverride = z.infer<typeof MetaCampaignOverrideSchema>;
export type MetaTargetingSetOverride = z.infer<
  typeof MetaTargetingSetOverrideSchema
>;
export type MetaCreativeAdOverride = z.infer<
  typeof MetaCreativeAdOverrideSchema
>;
