import {
  GoogleCampaignOverrideSchema,
  GoogleCreativeAdOverrideSchema,
  GoogleTargetingSetOverrideSchema,
  MetaCampaignOverrideSchema,
  MetaCreativeAdOverrideSchema,
  MetaTargetingSetOverrideSchema,
  dollarsToMicros,
  microsToCents,
  centsToMicros,
  formatMicros,
  CurrencyCode,
  CampaignStatus,
  isValidStatusTransition,
  CreateWorkspaceSchema,
} from '../index';

describe('EMPIRICAL ADVERSARIAL CHALLENGE SUITE — Milestone 2', () => {
  const sampleDescriptions = [
    { text: 'First valid description under 90 characters' },
    { text: 'Second valid description under 90 characters' },
  ];

  const sampleHeadlines = [
    { text: 'Headline One' },
    { text: 'Headline Two' },
    { text: 'Headline Three' },
  ];

  describe('1. Google RSA Headline Boundary Challenges', () => {
    it('accepts headline with exactly 30 characters', () => {
      const headline30 = 'H'.repeat(30);
      expect(headline30.length).toBe(30);

      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [
          { text: headline30 },
          { text: 'Headline Two' },
          { text: 'Headline Three' },
        ],
        descriptions: sampleDescriptions,
      });

      expect(result.success).toBe(true);
    });

    it('REJECTS headline with exactly 31 characters', () => {
      const headline31 = 'H'.repeat(31);
      expect(headline31.length).toBe(31);

      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [
          { text: headline31 },
          { text: 'Headline Two' },
          { text: 'Headline Three' },
        ],
        descriptions: sampleDescriptions,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.message.includes('30 characters')),
        ).toBe(true);
      }
    });

    it('REJECTS headline with 0 characters (empty text)', () => {
      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [
          { text: '' },
          { text: 'Headline Two' },
          { text: 'Headline Three' },
        ],
        descriptions: sampleDescriptions,
      });

      expect(result.success).toBe(false);
    });

    it('REJECTS headline count < 3 (0, 1, 2 headlines)', () => {
      const zeroHeadlines = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [],
        descriptions: sampleDescriptions,
      });
      expect(zeroHeadlines.success).toBe(false);
      if (!zeroHeadlines.success) {
        expect(
          zeroHeadlines.error.issues.some((i) =>
            i.message.includes('at least 3'),
          ),
        ).toBe(true);
      }

      const oneHeadline = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [{ text: 'Headline 1' }],
        descriptions: sampleDescriptions,
      });
      expect(oneHeadline.success).toBe(false);

      const twoHeadlines = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [{ text: 'Headline 1' }, { text: 'Headline 2' }],
        descriptions: sampleDescriptions,
      });
      expect(twoHeadlines.success).toBe(false);
    });

    it('ACCEPTS headline count = 3 and headline count = 15', () => {
      const three = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
        descriptions: sampleDescriptions,
      });
      expect(three.success).toBe(true);

      const fifteen = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: Array.from({ length: 15 }, (_, i) => ({
          text: `Headline ${i + 1}`,
        })),
        descriptions: sampleDescriptions,
      });
      expect(fifteen.success).toBe(true);
    });

    it('REJECTS headline count > 15 (16 headlines, 25 headlines)', () => {
      const sixteen = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: Array.from({ length: 16 }, (_, i) => ({
          text: `Headline ${i + 1}`,
        })),
        descriptions: sampleDescriptions,
      });
      expect(sixteen.success).toBe(false);
      if (!sixteen.success) {
        expect(
          sixteen.error.issues.some((i) => i.message.includes('at most 15')),
        ).toBe(true);
      }

      const twentyFive = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: Array.from({ length: 25 }, (_, i) => ({
          text: `Headline ${i + 1}`,
        })),
        descriptions: sampleDescriptions,
      });
      expect(twentyFive.success).toBe(false);
    });
  });

  describe('2. Google RSA Description Boundary Challenges', () => {
    it('accepts description with exactly 90 characters', () => {
      const desc90 = 'D'.repeat(90);
      expect(desc90.length).toBe(90);

      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: [{ text: desc90 }, { text: 'Second valid description' }],
      });

      expect(result.success).toBe(true);
    });

    it('REJECTS description with exactly 91 characters', () => {
      const desc91 = 'D'.repeat(91);
      expect(desc91.length).toBe(91);

      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: [{ text: desc91 }, { text: 'Second valid description' }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.message.includes('90 characters')),
        ).toBe(true);
      }
    });

    it('REJECTS description with 0 characters (empty text)', () => {
      const result = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: [{ text: '' }, { text: 'Second valid description' }],
      });

      expect(result.success).toBe(false);
    });

    it('REJECTS description count < 2 (0 and 1 descriptions)', () => {
      const zero = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: [],
      });
      expect(zero.success).toBe(false);
      if (!zero.success) {
        expect(
          zero.error.issues.some((i) => i.message.includes('at least 2')),
        ).toBe(true);
      }

      const one = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: [{ text: 'Only one description' }],
      });
      expect(one.success).toBe(false);
    });

    it('ACCEPTS description count = 2 and description count = 4', () => {
      const two = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: [{ text: 'Desc 1' }, { text: 'Desc 2' }],
      });
      expect(two.success).toBe(true);

      const four = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: [
          { text: 'Desc 1' },
          { text: 'Desc 2' },
          { text: 'Desc 3' },
          { text: 'Desc 4' },
        ],
      });
      expect(four.success).toBe(true);
    });

    it('REJECTS description count > 4 (5 descriptions)', () => {
      const five = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: [
          { text: 'Desc 1' },
          { text: 'Desc 2' },
          { text: 'Desc 3' },
          { text: 'Desc 4' },
          { text: 'Desc 5' },
        ],
      });
      expect(five.success).toBe(false);
      if (!five.success) {
        expect(
          five.error.issues.some((i) => i.message.includes('at most 4')),
        ).toBe(true);
      }
    });
  });

  describe('3. Google customerId Regex Challenges', () => {
    it('accepts standard hyphenated customerId (123-456-7890)', () => {
      const result = GoogleCampaignOverrideSchema.safeParse({
        customerId: '123-456-7890',
      });
      expect(result.success).toBe(true);
    });

    it('accepts raw unhyphenated 10-digit customerId (1234567890)', () => {
      const result = GoogleCampaignOverrideSchema.safeParse({
        customerId: '1234567890',
      });
      expect(result.success).toBe(true);
    });

    it('REJECTS invalid customerId values', () => {
      const adversarialInvalidCases = [
        '', // empty
        ' ', // space
        '123456789', // 9 digits unhyphenated
        '12345678901', // 11 digits unhyphenated
        '123-456-789', // 9 digits hyphenated
        '123-456-78901', // 11 digits hyphenated
        '12-345-6789', // misplaced hyphen (2-3-4)
        '123-45-6789', // misplaced hyphen (3-2-4)
        '123-456-789a', // alphanumeric
        'abc', // short string
        'abcdefghij', // letters only 10 chars
        '123 456 7890', // spaced
        ' 123-456-7890 ', // padded whitespace
        '123--456-7890', // double hyphen
        '123/456/7890', // slashes
      ];

      for (const invalidId of adversarialInvalidCases) {
        const result = GoogleCampaignOverrideSchema.safeParse({
          customerId: invalidId,
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe('4. Meta Creative Ad primaryText Boundary Challenges', () => {
    it('accepts primaryText with exactly 2200 characters', () => {
      const text2200 = 'P'.repeat(2200);
      expect(text2200.length).toBe(2200);

      const result = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_12345',
        primaryText: text2200,
        headline: 'Valid Headline',
      });

      expect(result.success).toBe(true);
    });

    it('REJECTS primaryText with exactly 2201 characters', () => {
      const text2201 = 'P'.repeat(2201);
      expect(text2201.length).toBe(2201);

      const result = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_12345',
        primaryText: text2201,
        headline: 'Valid Headline',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) =>
            i.message.includes('2200 characters'),
          ),
        ).toBe(true);
      }
    });

    it('REJECTS empty primaryText (0 characters) and missing primaryText', () => {
      const empty = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_12345',
        primaryText: '',
        headline: 'Valid Headline',
      });
      expect(empty.success).toBe(false);

      const missing = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_12345',
        headline: 'Valid Headline',
      });
      expect(missing.success).toBe(false);
    });
  });

  describe('5. Meta Creative Ad headline Boundary Challenges', () => {
    it('accepts headline with exactly 255 characters', () => {
      const headline255 = 'H'.repeat(255);
      expect(headline255.length).toBe(255);

      const result = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_12345',
        primaryText: 'Valid primary text',
        headline: headline255,
      });

      expect(result.success).toBe(true);
    });

    it('REJECTS headline with exactly 256 characters', () => {
      const headline256 = 'H'.repeat(256);
      expect(headline256.length).toBe(256);

      const result = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_12345',
        primaryText: 'Valid primary text',
        headline: headline256,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.message.includes('255 characters')),
        ).toBe(true);
      }
    });

    it('REJECTS empty headline (0 characters) and missing headline', () => {
      const empty = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_12345',
        primaryText: 'Valid primary text',
        headline: '',
      });
      expect(empty.success).toBe(false);

      const missing = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_12345',
        primaryText: 'Valid primary text',
      });
      expect(missing.success).toBe(false);
    });
  });

  describe('6. Meta Creative Ad pageId Required Challenges', () => {
    it('REJECTS missing pageId', () => {
      const result = MetaCreativeAdOverrideSchema.safeParse({
        primaryText: 'Valid primary text',
        headline: 'Valid headline',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('pageId'))).toBe(
          true,
        );
      }
    });

    it('REJECTS empty string pageId', () => {
      const result = MetaCreativeAdOverrideSchema.safeParse({
        pageId: '',
        primaryText: 'Valid primary text',
        headline: 'Valid headline',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('pageId'))).toBe(
          true,
        );
      }
    });

    it('ACCEPTS valid pageId', () => {
      const result = MetaCreativeAdOverrideSchema.safeParse({
        pageId: 'page_987654321',
        primaryText: 'Valid primary text',
        headline: 'Valid headline',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pageId).toBe('page_987654321');
      }
    });
  });

  describe('7. Additional Strict Boundary & Adversarial Checks', () => {
    it('Google RSA path1 and path2 max 15 characters limit', () => {
      const passPath = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: sampleDescriptions,
        path1: '123456789012345', // 15 chars
        path2: '123456789012345', // 15 chars
      });
      expect(passPath.success).toBe(true);

      const failPath1 = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: sampleDescriptions,
        path1: '1234567890123456', // 16 chars
      });
      expect(failPath1.success).toBe(false);

      const failPath2 = GoogleCreativeAdOverrideSchema.safeParse({
        headlines: sampleHeadlines,
        descriptions: sampleDescriptions,
        path2: '1234567890123456', // 16 chars
      });
      expect(failPath2.success).toBe(false);
    });

    it('Google Campaign targetCpaMicros rejects 0n and negative BigInt', () => {
      const zero = GoogleCampaignOverrideSchema.safeParse({
        customerId: '123-456-7890',
        targetCpaMicros: 0n,
      });
      expect(zero.success).toBe(false);

      const negative = GoogleCampaignOverrideSchema.safeParse({
        customerId: '123-456-7890',
        targetCpaMicros: -100_000n,
      });
      expect(negative.success).toBe(false);
    });

    it('Meta Campaign rejects empty specialAdCategories array', () => {
      const result = MetaCampaignOverrideSchema.safeParse({
        adAccountId: 'act_123',
        specialAdCategories: [],
      });
      expect(result.success).toBe(false);
    });

    it('Meta Targeting Set rejects empty publisherPlatforms array', () => {
      const result = MetaTargetingSetOverrideSchema.safeParse({
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        publisherPlatforms: [],
      });
      expect(result.success).toBe(false);
    });

    it('Financial precision: dollarsToMicros and formatMicros handle fractional and negative amounts', () => {
      expect(dollarsToMicros(0)).toBe(0n);
      expect(dollarsToMicros('10.50')).toBe(10_500_000n);
      expect(dollarsToMicros('-25.00')).toBe(-25_000_000n);
      expect(dollarsToMicros('0.000001')).toBe(1n);

      expect(microsToCents(10_500_000n)).toBe(1050n);
      expect(centsToMicros(1050n)).toBe(10_500_000n);

      expect(formatMicros(10_500_000n, CurrencyCode.USD)).toBe('10.50 USD');
      expect(formatMicros(-25_000_000n, CurrencyCode.SAR)).toBe('-25.00 SAR');
      expect(formatMicros(50_000n, CurrencyCode.EUR)).toBe('0.05 EUR');
    });

    it('CampaignStatus state machine transitions enforce valid lifecycle', () => {
      // Valid transitions
      expect(
        isValidStatusTransition(
          CampaignStatus.DRAFT,
          CampaignStatus.PRE_VALIDATING,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          CampaignStatus.QUEUED_FOR_PUBLISH,
          CampaignStatus.PARTIALLY_LIVE,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          CampaignStatus.PARTIALLY_LIVE,
          CampaignStatus.QUEUED_FOR_PUBLISH,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(CampaignStatus.LIVE, CampaignStatus.PAUSED),
      ).toBe(true);

      // Illegal transitions
      expect(
        isValidStatusTransition(CampaignStatus.FAILED, CampaignStatus.LIVE),
      ).toBe(false);
      expect(
        isValidStatusTransition(CampaignStatus.DRAFT, CampaignStatus.LIVE),
      ).toBe(false);
      expect(
        isValidStatusTransition(
          CampaignStatus.PAUSED,
          CampaignStatus.PRE_VALIDATING,
        ),
      ).toBe(false);
    });

    it('Workspace DTO validates slug format and name length', () => {
      const valid = CreateWorkspaceSchema.safeParse({
        name: 'Growth Ads Workspace',
        slug: 'growth-ads-workspace-2026',
        baseCurrency: CurrencyCode.USD,
      });
      expect(valid.success).toBe(true);

      const invalidSlug = CreateWorkspaceSchema.safeParse({
        name: 'Growth Ads',
        slug: 'Growth_Ads!',
      });
      expect(invalidSlug.success).toBe(false);

      const tooShortName = CreateWorkspaceSchema.safeParse({
        name: 'A',
      });
      expect(tooShortName.success).toBe(false);
    });
  });
});
