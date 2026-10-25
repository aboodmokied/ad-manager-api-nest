import {
  MetaCampaignOverrideSchema,
  MetaTargetingSetOverrideSchema,
  MetaCreativeAdOverrideSchema,
  MetaSpecialAdCategoryEnum,
  MetaObjectiveEnum,
} from '../index';

describe('Meta Ads Zod Validation Schemas', () => {
  describe('MetaCampaignOverrideSchema', () => {
    it('applies defaults correctly when only required adAccountId is provided', () => {
      const result = MetaCampaignOverrideSchema.safeParse({
        adAccountId: 'act_1234567890',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.specialAdCategories).toEqual(['NONE']);
        expect(result.data.objective).toBe('OUTCOME_TRAFFIC');
        expect(result.data.buyingType).toBe('AUCTION');
        expect(result.data.advantageCampaignBudget).toBe(false);
        expect(result.data.adAccountId).toBe('act_1234567890');
      }
    });

    it('accepts valid explicit values', () => {
      const result = MetaCampaignOverrideSchema.safeParse({
        adAccountId: 'act_987654321',
        specialAdCategories: ['HOUSING', 'EMPLOYMENT'],
        objective: 'OUTCOME_SALES',
        buyingType: 'RESERVED',
        advantageCampaignBudget: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.specialAdCategories).toEqual([
          'HOUSING',
          'EMPLOYMENT',
        ]);
        expect(result.data.objective).toBe('OUTCOME_SALES');
        expect(result.data.buyingType).toBe('RESERVED');
        expect(result.data.advantageCampaignBudget).toBe(true);
      }
    });

    it('rejects missing or empty adAccountId', () => {
      const missing = MetaCampaignOverrideSchema.safeParse({});
      expect(missing.success).toBe(false);

      const empty = MetaCampaignOverrideSchema.safeParse({ adAccountId: '' });
      expect(empty.success).toBe(false);
    });

    it('rejects invalid special ad category', () => {
      const result = MetaCampaignOverrideSchema.safeParse({
        adAccountId: 'act_123',
        specialAdCategories: ['INVALID_CATEGORY'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('MetaTargetingSetOverrideSchema', () => {
    it('validates a complete targeting set override', () => {
      const result = MetaTargetingSetOverrideSchema.safeParse({
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        publisherPlatforms: ['facebook', 'instagram'],
        billingEvent: 'IMPRESSIONS',
        promotedObject: {
          pixelId: 'pixel_12345',
          customEventType: 'PURCHASE',
          pageId: 'page_987',
        },
        facebookPositions: ['feed', 'story'],
        instagramPositions: ['stream', 'story', 'reels'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.optimizationGoal).toBe('OFFSITE_CONVERSIONS');
        expect(result.data.publisherPlatforms).toEqual([
          'facebook',
          'instagram',
        ]);
      }
    });

    it('rejects empty publisherPlatforms', () => {
      const result = MetaTargetingSetOverrideSchema.safeParse({
        optimizationGoal: 'LINK_CLICKS',
        publisherPlatforms: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid optimizationGoal', () => {
      const result = MetaTargetingSetOverrideSchema.safeParse({
        optimizationGoal: 'INVALID_GOAL',
        publisherPlatforms: ['facebook'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('MetaCreativeAdOverrideSchema', () => {
    it('validates a compliant creative ad payload', () => {
      const result = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'fb_page_123',
        instagramActorId: 'ig_actor_456',
        primaryText: 'Discover exceptional quality products today.',
        headline: 'Exclusive 50% Off Spring Sale',
        description: 'Limited time offer, free shipping on orders over $50.',
        callToAction: 'SHOP_NOW',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callToAction).toBe('SHOP_NOW');
        expect(result.data.pageId).toBe('fb_page_123');
      }
    });

    it('enforces primaryText max 2200 characters boundary', () => {
      const text2200 = 'a'.repeat(2200);
      const passResult = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_1',
        primaryText: text2200,
        headline: 'Valid Headline',
      });
      expect(passResult.success).toBe(true);

      const text2201 = 'a'.repeat(2201);
      const failResult = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_1',
        primaryText: text2201,
        headline: 'Valid Headline',
      });
      expect(failResult.success).toBe(false);
      if (!failResult.success) {
        expect(failResult.error.errors[0].message).toContain('2200 characters');
      }
    });

    it('enforces headline max 255 characters boundary', () => {
      const headline255 = 'h'.repeat(255);
      const passResult = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_1',
        primaryText: 'Valid primary text',
        headline: headline255,
      });
      expect(passResult.success).toBe(true);

      const headline256 = 'h'.repeat(256);
      const failResult = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_1',
        primaryText: 'Valid primary text',
        headline: headline256,
      });
      expect(failResult.success).toBe(false);
      if (!failResult.success) {
        expect(failResult.error.errors[0].message).toContain('255 characters');
      }
    });

    it('rejects empty pageId or empty primaryText or empty headline', () => {
      expect(
        MetaCreativeAdOverrideSchema.safeParse({
          pageId: '',
          primaryText: 'Valid',
          headline: 'Valid',
        }).success,
      ).toBe(false);

      expect(
        MetaCreativeAdOverrideSchema.safeParse({
          pageId: 'page_1',
          primaryText: '',
          headline: 'Valid',
        }).success,
      ).toBe(false);

      expect(
        MetaCreativeAdOverrideSchema.safeParse({
          pageId: 'page_1',
          primaryText: 'Valid',
          headline: '',
        }).success,
      ).toBe(false);
    });
  });
});
