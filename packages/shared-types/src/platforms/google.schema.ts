import { z } from 'zod';

export const GoogleAdvertisingChannelTypeEnum = z.enum([
  'SEARCH',
  'PERFORMANCE_MAX',
  'DISPLAY',
  'VIDEO',
]);
export type GoogleAdvertisingChannelType = z.infer<
  typeof GoogleAdvertisingChannelTypeEnum
>;

export const GoogleBiddingStrategyTypeEnum = z.enum([
  'TARGET_CPA',
  'TARGET_ROAS',
  'MAXIMIZE_CONVERSIONS',
  'MAXIMIZE_CONVERSION_VALUE',
  'MANUAL_CPC',
]);
export type GoogleBiddingStrategyType = z.infer<
  typeof GoogleBiddingStrategyTypeEnum
>;

export const GoogleNetworkSettingsSchema = z.object({
  targetGoogleSearch: z.boolean().default(true),
  targetSearchNetwork: z.boolean().default(true),
  targetContentNetwork: z.boolean().default(false),
  targetPartnerSearchNetwork: z.boolean().default(false),
});
export type GoogleNetworkSettings = z.infer<typeof GoogleNetworkSettingsSchema>;

export const GoogleCampaignOverrideSchema = z.object({
  customerId: z
    .string()
    .regex(
      /^\d{3}-?\d{3}-?\d{4}$/,
      'Invalid Google customerId format (e.g. 123-456-7890 or 1234567890)',
    ),
  advertisingChannelType: GoogleAdvertisingChannelTypeEnum.default('SEARCH'),
  biddingStrategyType: GoogleBiddingStrategyTypeEnum.default(
    'MAXIMIZE_CONVERSIONS',
  ),
  targetCpaMicros: z
    .bigint()
    .positive('targetCpaMicros must be positive')
    .optional(),
  targetRoas: z.number().positive('targetRoas must be positive').optional(),
  networkSettings: GoogleNetworkSettingsSchema.default({
    targetGoogleSearch: true,
    targetSearchNetwork: true,
    targetContentNetwork: false,
    targetPartnerSearchNetwork: false,
  }),
  finalUrlSuffix: z.string().optional(),
});

export const GoogleKeywordMatchTypeEnum = z.enum(['EXACT', 'PHRASE', 'BROAD']);
export type GoogleKeywordMatchType = z.infer<typeof GoogleKeywordMatchTypeEnum>;

export const GoogleKeywordSchema = z.object({
  text: z.string().min(1, 'Keyword text cannot be empty'),
  matchType: GoogleKeywordMatchTypeEnum.default('BROAD'),
});
export type GoogleKeyword = z.infer<typeof GoogleKeywordSchema>;

export const GoogleAdGroupTypeEnum = z.enum([
  'SEARCH_STANDARD',
  'DISPLAY_STANDARD',
  'SHOPPING_PRODUCT_ADS',
]);
export type GoogleAdGroupType = z.infer<typeof GoogleAdGroupTypeEnum>;

export const GoogleTargetingSetOverrideSchema = z.object({
  adGroupType: GoogleAdGroupTypeEnum.default('SEARCH_STANDARD'),
  cpcBidMicros: z.bigint().positive('cpcBidMicros must be positive').optional(),
  keywords: z
    .array(GoogleKeywordSchema)
    .min(1, 'Search Ad Groups require at least 1 keyword'),
  negativeKeywords: z.array(GoogleKeywordSchema).optional(),
  targetLocations: z
    .array(z.string())
    .min(1, 'At least 1 location criterion ID is required'),
  targetLanguages: z.array(z.string()).default(['1000']), // 1000 = English
});

export const GoogleRsaHeadlineSchema = z.object({
  text: z
    .string()
    .min(1, 'Headline text cannot be empty')
    .max(30, 'Google headline cannot exceed 30 characters'),
  pinnedField: z.enum(['HEADLINE_1', 'HEADLINE_2', 'HEADLINE_3']).optional(),
});
export type GoogleRsaHeadline = z.infer<typeof GoogleRsaHeadlineSchema>;

export const GoogleRsaDescriptionSchema = z.object({
  text: z
    .string()
    .min(1, 'Description text cannot be empty')
    .max(90, 'Google description cannot exceed 90 characters'),
  pinnedField: z.enum(['DESCRIPTION_1', 'DESCRIPTION_2']).optional(),
});
export type GoogleRsaDescription = z.infer<typeof GoogleRsaDescriptionSchema>;

export const GoogleCreativeAdOverrideSchema = z.object({
  adFormat: z
    .enum(['RESPONSIVE_SEARCH_AD', 'RESPONSIVE_DISPLAY_AD'])
    .default('RESPONSIVE_SEARCH_AD'),
  headlines: z
    .array(GoogleRsaHeadlineSchema)
    .min(3, 'Google Responsive Search Ads require at least 3 headlines')
    .max(15, 'Google Responsive Search Ads allow at most 15 headlines'),
  descriptions: z
    .array(GoogleRsaDescriptionSchema)
    .min(2, 'Google Responsive Search Ads require at least 2 descriptions')
    .max(4, 'Google Responsive Search Ads allow at most 4 descriptions'),
  path1: z.string().max(15, 'Path1 cannot exceed 15 characters').optional(),
  path2: z.string().max(15, 'Path2 cannot exceed 15 characters').optional(),
});

export type GoogleCampaignOverride = z.infer<
  typeof GoogleCampaignOverrideSchema
>;
export type GoogleTargetingSetOverride = z.infer<
  typeof GoogleTargetingSetOverrideSchema
>;
export type GoogleCreativeAdOverride = z.infer<
  typeof GoogleCreativeAdOverrideSchema
>;
