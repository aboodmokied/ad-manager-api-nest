import {
  GoogleCampaignOverrideSchema,
  GoogleTargetingSetOverrideSchema,
  GoogleCreativeAdOverrideSchema,
  GoogleAdvertisingChannelTypeEnum,
  GoogleBiddingStrategyTypeEnum,
} from '../index';

describe('Google Ads Zod Validation Schemas', () => {
  describe('GoogleCampaignOverrideSchema', () => {
    it('accepts valid hyphenated customerId and applies defaults', () => {
      const result = GoogleCampaignOverrideSchema.safeParse({
        customerId: '123-456-7890',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customerId).toBe('123-456-7890');
        expect(result.data.advertisingChannelType).toBe('SEARCH');
        expect(result.data.biddingStrategyType).toBe('MAXIMIZE_CONVERSIONS');
        expect(result.data.networkSettings.targetGoogleSearch).toBe(true);
        expect(result.data.networkSettings.targetSearchNetwork).toBe(true);
        expect(result.data.networkSettings.targetContentNetwork).toBe(false);
      }
    });

    it('accepts non-hyphenated 10-digit customerId', () => {
      const result = GoogleCampaignOverrideSchema.safeParse({
        customerId: '1234567890',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid customerId formats', () => {
      const invalidCases = [
        '12-34-56',
        '123-456-789', // 9 digits
        '123-456-78901', // 11 digits
        'abc-def-ghij',
        '',
        '12345',
      ];
      for (const invalidId of invalidCases) {
        const result = GoogleCampaignOverrideSchema.safeParse({
          customerId: invalidId,
        });
        expect(result.success).toBe(false);
      }
    });

    it('validates targetCpaMicros as a positive BigInt', () => {
      const valid = GoogleCampaignOverrideSchema.safeParse({
        customerId: '123-456-7890',
        targetCpaMicros: 25_000_000n, // $25 CPA
      });
      expect(valid.success).toBe(true);

      const invalidNegative = GoogleCampaignOverrideSchema.safeParse({
        customerId: '123-456-7890',
        targetCpaMicros: -1_000_000n,
      });
      expect(invalidNegative.success).toBe(false);
    });

    it('validates targetRoas as a positive number', () => {
      const valid = GoogleCampaignOverrideSchema.safeParse({
        customerId: '123-456-7890',
        targetRoas: 4.5,
      });
      expect(valid.success).toBe(true);

      const invalidNegative = GoogleCampaignOverrideSchema.safeParse({
        customerId: '123-456-7890',
        targetRoas: -2.0,
      });
      expect(invalidNegative.success).toBe(false);
    });
  });

  describe('GoogleTargetingSetOverrideSchema', () => {
    it('validates a compliant ad group payload with keywords and locations', () => {
      const result = GoogleTargetingSetOverrideSchema.safeParse({
        keywords: [
          { text: 'best shoes online', matchType: 'EXACT' },
          { text: 'running sneakers', matchType: 'PHRASE' },
        ],
        targetLocations: ['2840'], // 2840 = United States criterion ID
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.adGroupType).toBe('SEARCH_STANDARD');
        expect(result.data.targetLanguages).toEqual(['1000']);
        expect(result.data.keywords).toHaveLength(2);
      }
    });

    it('rejects empty keywords list', () => {
      const result = GoogleTargetingSetOverrideSchema.safeParse({
        keywords: [],
        targetLocations: ['2840'],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('at least 1 keyword');
      }
    });

    it('rejects empty targetLocations list', () => {
      const result = GoogleTargetingSetOverrideSchema.safeParse({
        keywords: [{ text: 'shoes' }],
        targetLocations: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain(
          'At least 1 location criterion ID',
        );
      }
    });
  });

  describe('GoogleCreativeAdOverrideSchema (Responsive Search Ads)', () => {
    const validHeadlines = [
      { text: 'Buy Premium Shoes' },
      { text: 'Fast Free Delivery' },
      { text: 'Shop Summer Deals' },
    ];

    const validDescriptions = [
      {
        text: 'Explore our latest comfortable footwear collection today. Free shipping available.',
      },
      {
        text: 'Top rated shoes for running, training, and everyday wear. Order online now.',
      },
    ];

    it('validates a minimum RSA payload (3 headlines, 2 descriptions)', () => {
      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: validHeadlines,
        descriptions: validDescriptions,
        path1: 'shoes',
        path2: 'summer',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.adFormat).toBe('RESPONSIVE_SEARCH_AD');
      }
    });

    it('enforces headlines min 3 constraint', () => {
      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [{ text: 'Headline 1' }, { text: 'Headline 2' }], // Only 2
        descriptions: validDescriptions,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain(
          'at least 3 headlines',
        );
      }
    });

    it('enforces headlines max 15 constraint', () => {
      const sixteenHeadlines = Array.from({ length: 16 }, (_, i) => ({
        text: `Headline ${i + 1}`,
      }));
      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sixteenHeadlines,
        descriptions: validDescriptions,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain(
          'at most 15 headlines',
        );
      }
    });

    it('enforces individual headline length <= 30 characters', () => {
      // 30 chars passes
      const headline30 = '123456789012345678901234567890';
      expect(headline30.length).toBe(30);

      const passResult = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [
          { text: headline30 },
          { text: 'Valid Headline 2' },
          { text: 'Valid Headline 3' },
        ],
        descriptions: validDescriptions,
      });
      expect(passResult.success).toBe(true);

      // 31 chars fails
      const headline31 = '1234567890123456789012345678901';
      expect(headline31.length).toBe(31);

      const failResult = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [
          { text: headline31 },
          { text: 'Valid Headline 2' },
          { text: 'Valid Headline 3' },
        ],
        descriptions: validDescriptions,
      });
      expect(failResult.success).toBe(false);
      if (!failResult.success) {
        expect(failResult.error.errors[0].message).toContain('30 characters');
      }
    });

    it('enforces descriptions min 2 constraint', () => {
      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: validHeadlines,
        descriptions: [validDescriptions[0]], // Only 1
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain(
          'at least 2 descriptions',
        );
      }
    });

    it('enforces descriptions max 4 constraint', () => {
      const fiveDescriptions = Array.from({ length: 5 }, (_, i) => ({
        text: `Description number ${i + 1} for this ad group.`,
      }));
      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: validHeadlines,
        descriptions: fiveDescriptions,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain(
          'at most 4 descriptions',
        );
      }
    });

    it('enforces individual description length <= 90 characters', () => {
      const desc90 = 'd'.repeat(90);
      const passResult = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: validHeadlines,
        descriptions: [{ text: desc90 }, { text: 'Second valid description' }],
      });
      expect(passResult.success).toBe(true);

      const desc91 = 'd'.repeat(91);
      const failResult = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: validHeadlines,
        descriptions: [{ text: desc91 }, { text: 'Second valid description' }],
      });
      expect(failResult.success).toBe(false);
      if (!failResult.success) {
        expect(failResult.error.errors[0].message).toContain('90 characters');
      }
    });

    it('enforces path1 and path2 max 15 characters', () => {
      const passResult = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: validHeadlines,
        descriptions: validDescriptions,
        path1: '123456789012345',
        path2: '123456789012345',
      });
      expect(passResult.success).toBe(true);

      const failResult = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: validHeadlines,
        descriptions: validDescriptions,
        path1: '1234567890123456', // 16 chars
      });
      expect(failResult.success).toBe(false);
    });
  });
});
