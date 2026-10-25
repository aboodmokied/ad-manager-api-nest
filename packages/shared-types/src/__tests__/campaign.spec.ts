import {
  UnifiedCampaign,
  UnifiedCampaignObjective,
  UnifiedTargetingSet,
  UnifiedBidStrategy,
  UnifiedCreativeAd,
  UnifiedCallToAction,
  CampaignStatus,
  Platform,
  CurrencyCode,
  dollarsToMicros,
} from '../index';

describe('Canonical 3-Tier Hierarchy Models', () => {
  it('creates and validates a complete 3-tier campaign hierarchy structure', () => {
    // Tier 1: UnifiedCampaign
    const campaign: UnifiedCampaign = {
      id: 'cmp_univ_001',
      workspaceId: 'wsp_main_001',
      name: 'Black Friday Mega Sale 2026',
      objective: UnifiedCampaignObjective.SALES,
      status: CampaignStatus.DRAFT,
      totalBudgetMicros: dollarsToMicros('5000.00'), // $5,000.00 in BigInt micros
      dailyBudgetMicros: dollarsToMicros('250.00'), // $250.00 in BigInt micros
      currency: CurrencyCode.USD,
      startDate: '2026-11-20T00:00:00Z',
      endDate: '2026-11-30T23:59:59Z',
      targetPlatforms: [Platform.META, Platform.GOOGLE],
      idempotencyKey: 'sha256_mock_idempotency_key_123',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      platformOverrides: {
        meta: {
          specialAdCategories: ['NONE'],
          objective: 'OUTCOME_SALES',
          buyingType: 'AUCTION',
          advantageCampaignBudget: true,
          adAccountId: 'act_123456789',
        },
        google: {
          customerId: '123-456-7890',
          advertisingChannelType: 'SEARCH',
          biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
        },
      },
    };

    expect(campaign.totalBudgetMicros).toBe(5_000_000_000n);
    expect(campaign.dailyBudgetMicros).toBe(250_000_000n);
    expect(campaign.targetPlatforms).toEqual([Platform.META, Platform.GOOGLE]);

    // Tier 2: UnifiedTargetingSet
    const targetingSet: UnifiedTargetingSet = {
      id: 'ts_001',
      campaignId: campaign.id,
      workspaceId: campaign.workspaceId,
      name: 'High-Intent Online Shoppers US & SA',
      status: CampaignStatus.DRAFT,
      dailyBudgetMicros: dollarsToMicros('150.00'),
      bidStrategy: UnifiedBidStrategy.MAXIMIZE_CONVERSIONS,
      targeting: {
        locations: {
          countries: ['US', 'SA'],
          cities: ['New York', 'Riyadh'],
        },
        demographics: {
          ageMin: 21,
          ageMax: 55,
          genders: ['ALL'],
          languages: ['en', 'ar'],
        },
        interests: ['Online Shopping', 'Consumer Electronics'],
      },
      platformOverrides: {
        meta: {
          optimizationGoal: 'OFFSITE_CONVERSIONS',
          billingEvent: 'IMPRESSIONS',
          publisherPlatforms: ['facebook', 'instagram'],
        },
        google: {
          adGroupType: 'SEARCH_STANDARD',
          keywords: [
            { text: 'buy electronics sale', matchType: 'EXACT' },
            { text: 'best black friday electronics', matchType: 'PHRASE' },
          ],
          targetLocations: ['2840', '2682'],
          targetLanguages: ['1000', '1019'],
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(targetingSet.campaignId).toBe(campaign.id);
    expect(targetingSet.targeting.locations.countries).toEqual(['US', 'SA']);

    // Tier 3: UnifiedCreativeAd
    const creativeAd: UnifiedCreativeAd = {
      id: 'ad_001',
      targetingSetId: targetingSet.id,
      workspaceId: campaign.workspaceId,
      name: 'Dynamic Promo Banner A',
      status: CampaignStatus.DRAFT,
      headline: 'Black Friday 50% Off Today',
      body: 'Get unmissable discounts on top gear. Free shipping on all orders over $50.',
      mediaAssets: [
        {
          id: 'med_001',
          type: 'IMAGE',
          url: 'https://minio.internal/uacm-media/banner1.jpg',
          hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          width: 1080,
          height: 1080,
          aspectRatio: '1:1',
          fileSizeBytes: 450200,
        },
      ],
      callToAction: UnifiedCallToAction.SHOP_NOW,
      destinationUrl: 'https://example.com/sale',
      finalUrlWithUtm:
        'https://example.com/sale?utm_source=uacm&utm_medium=cpc&utm_campaign=black_friday&uacm_ad_id=ad_001',
      utmParameters: {
        utmSource: 'uacm',
        utmMedium: 'cpc',
        utmCampaign: 'black_friday',
        uacmAdId: 'ad_001',
      },
      platformOverrides: {
        meta: {
          pageId: 'meta_page_456',
          primaryText:
            'Get unmissable discounts on top gear with Meta Exclusive Code.',
          headline: 'Black Friday 50% Off Today',
          callToAction: 'SHOP_NOW',
        },
        google: {
          adFormat: 'RESPONSIVE_SEARCH_AD',
          headlines: [
            { text: 'Black Friday 50% Off' },
            { text: 'Huge Deals Today' },
            { text: 'Free Delivery Worldwide' },
          ],
          descriptions: [
            {
              text: 'Get unmissable discounts on top gear. Shop today and save big.',
            },
            {
              text: 'Exclusive Black Friday discounts available for limited time only.',
            },
          ],
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(creativeAd.targetingSetId).toBe(targetingSet.id);
    expect(creativeAd.mediaAssets[0].aspectRatio).toBe('1:1');
    expect(creativeAd.callToAction).toBe(UnifiedCallToAction.SHOP_NOW);
  });
});
