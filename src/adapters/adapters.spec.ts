import { Test, TestingModule } from '@nestjs/testing';
import { Platform } from '@prisma/client';
import { AdapterFactory } from './adapter-factory.service';
import { MetaAdapter } from './meta.adapter';
import { GoogleAdapter } from './google.adapter';
import { LinkedinAdapter } from './linkedin.adapter';
import { XAdapter } from './x.adapter';
import { SnapchatAdapter } from './snapchat.adapter';
import { TiktokAdapter } from './tiktok.adapter';

describe('AdapterFactory', () => {
  let factory: AdapterFactory;
  let metaAdapter: MetaAdapter;
  let googleAdapter: GoogleAdapter;
  let linkedinAdapter: LinkedinAdapter;
  let xAdapter: XAdapter;
  let snapchatAdapter: SnapchatAdapter;
  let tiktokAdapter: TiktokAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdapterFactory,
        {
          provide: MetaAdapter,
          useValue: { platform: Platform.META },
        },
        {
          provide: GoogleAdapter,
          useValue: { platform: Platform.GOOGLE },
        },
        {
          provide: LinkedinAdapter,
          useValue: { platform: Platform.LINKEDIN },
        },
        {
          provide: XAdapter,
          useValue: { platform: Platform.X },
        },
        {
          provide: SnapchatAdapter,
          useValue: { platform: Platform.SNAPCHAT },
        },
        {
          provide: TiktokAdapter,
          useValue: { platform: Platform.TIKTOK },
        },
      ],
    }).compile();

    factory = module.get<AdapterFactory>(AdapterFactory);
    metaAdapter = module.get<MetaAdapter>(MetaAdapter);
    googleAdapter = module.get<GoogleAdapter>(GoogleAdapter);
    linkedinAdapter = module.get<LinkedinAdapter>(LinkedinAdapter);
    xAdapter = module.get<XAdapter>(XAdapter);
    snapchatAdapter = module.get<SnapchatAdapter>(SnapchatAdapter);
    tiktokAdapter = module.get<TiktokAdapter>(TiktokAdapter);
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  it('should return MetaAdapter for Platform.META', () => {
    expect(factory.getAdapter(Platform.META)).toBe(metaAdapter);
  });

  it('should return GoogleAdapter for Platform.GOOGLE', () => {
    expect(factory.getAdapter(Platform.GOOGLE)).toBe(googleAdapter);
  });

  it('should return LinkedinAdapter for Platform.LINKEDIN', () => {
    expect(factory.getAdapter(Platform.LINKEDIN)).toBe(linkedinAdapter);
  });

  it('should return XAdapter for Platform.X', () => {
    expect(factory.getAdapter(Platform.X)).toBe(xAdapter);
  });

  it('should return SnapchatAdapter for Platform.SNAPCHAT', () => {
    expect(factory.getAdapter(Platform.SNAPCHAT)).toBe(snapchatAdapter);
  });

  it('should return TiktokAdapter for Platform.TIKTOK', () => {
    expect(factory.getAdapter(Platform.TIKTOK)).toBe(tiktokAdapter);
  });

  it('should throw an error for unsupported platform', () => {
    expect(() => factory.getAdapter('UNSUPPORTED' as Platform)).toThrow(
      'No adapter found for platform: UNSUPPORTED',
    );
  });
});

describe('GoogleAdapter - transformToUnifiedMetrics', () => {
  const adapter = new GoogleAdapter(null as any);

  it('should safely transform metrics with string inputs and calculate ROAS', () => {
    const raw = {
      impressions: '1000',
      clicks: '50',
      cost_micros: '10000000', // $10
      conversions: '5',
      ctr: '0.05',
      cpc_micros: '200000', // $0.20
      conversions_value: '50', // $50 -> roas = 5
    };

    const metrics = adapter.transformToUnifiedMetrics(raw);
    expect(metrics).toEqual({
      impressions: 1000,
      clicks: 50,
      spend: 10,
      conversions: 5,
      ctr: 0.05,
      cpc: 0.2,
      roas: 5,
    });
  });

  it('should return undefined roas when spend is 0 or missing, preventing Infinity/NaN', () => {
    const rawWithZeroSpend = {
      cost_micros: 0,
      conversions_value: 100,
    };
    expect(adapter.transformToUnifiedMetrics(rawWithZeroSpend).roas).toBeUndefined();

    const rawWithUndefinedSpend = {
      conversions_value: 100,
    };
    expect(adapter.transformToUnifiedMetrics(rawWithUndefinedSpend).roas).toBeUndefined();
  });

  it('should return undefined roas when conversions_value is missing', () => {
    const raw = {
      cost_micros: 5000000,
    };
    expect(adapter.transformToUnifiedMetrics(raw).roas).toBeUndefined();
  });
});

describe('MetaAdapter - transformToUnifiedMetrics', () => {
  const adapter = new MetaAdapter(null as any);

  it('should safely transform metrics and calculate ROAS', () => {
    const raw = {
      impressions: '2000',
      clicks: '100',
      spend: '25.5',
      purchase: '10',
      ctr: '0.05',
      cpc: '0.255',
      purchase_value: '51',
    };

    const metrics = adapter.transformToUnifiedMetrics(raw);
    expect(metrics).toEqual({
      impressions: 2000,
      clicks: 100,
      spend: 25.5,
      conversions: 10,
      ctr: 0.05,
      cpc: 0.255,
      roas: 2,
    });
  });

  it('should return undefined roas when spend is 0 or purchase_value is missing', () => {
    expect(
      adapter.transformToUnifiedMetrics({ spend: 0, purchase_value: 50 }).roas,
    ).toBeUndefined();
    expect(
      adapter.transformToUnifiedMetrics({ spend: 10 }).roas,
    ).toBeUndefined();
  });
});

describe('MetaAdapter - operations', () => {
  let exchange: { getJson: jest.Mock; postJson: jest.Mock };
  let config: { getConfig: jest.Mock };
  let meta: MetaAdapter;

  beforeEach(() => {
    exchange = { getJson: jest.fn(), postJson: jest.fn() };
    config = {
      getConfig: jest.fn().mockReturnValue({ apiBaseUrl: 'https://graph.facebook.com/v21.0' }),
    };
    meta = new MetaAdapter(exchange as any, config as any);
  });

  it('creates a campaign on Meta and returns ID', async () => {
    exchange.postJson.mockResolvedValue({ id: 'meta-camp-123' });

    const id = await meta.createCampaign(
      {
        uacmCampaignId: 'uacm-1',
        name: 'Meta Sale',
        budget: 100,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        platformSpecificData: { adAccountId: 'act_123456' },
      },
      'test-token',
    );

    expect(id).toBe('meta-camp-123');
    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/act_123456/campaigns',
      expect.objectContaining({ name: 'Meta Sale', daily_budget: 10000, status: 'PAUSED' }),
      { Authorization: 'Bearer test-token' },
    );
  });

  it('throws when adAccountId is missing', async () => {
    await expect(
      meta.createCampaign(
        {
          uacmCampaignId: 'uacm-1',
          name: 'Meta Sale',
          budget: 100,
          startDate: new Date(),
          endDate: new Date(),
          platformSpecificData: {},
        },
        'token',
      ),
    ).rejects.toThrow('Meta Ads adAccountId is required');
  });

  it('throws when Meta returns no campaign ID', async () => {
    exchange.postJson.mockResolvedValue({});

    await expect(
      meta.createCampaign(
        {
          uacmCampaignId: 'uacm-1',
          name: 'Meta Promo',
          budget: 100,
          startDate: new Date(),
          endDate: new Date(),
          platformSpecificData: { adAccountId: '123456789' },
        },
        'token',
      ),
    ).rejects.toThrow(/Meta Ads campaign creation returned no campaign id/i);
  });

  it('updates a campaign', async () => {
    exchange.postJson.mockResolvedValue({ success: true });

    await meta.updateCampaign(
      { platformCampaignId: 'meta-camp-123', name: 'New Name', budget: 150 },
      'test-token',
    );

    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/meta-camp-123',
      expect.objectContaining({ name: 'New Name', daily_budget: 15000 }),
      { Authorization: 'Bearer test-token' },
    );
  });

  it('pauses and resumes a campaign', async () => {
    exchange.postJson.mockResolvedValue({ success: true });

    await meta.pauseCampaign('meta-camp-123', 'test-token');
    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/meta-camp-123',
      { status: 'PAUSED' },
      { Authorization: 'Bearer test-token' },
    );

    await meta.resumeCampaign('meta-camp-123', 'test-token');
    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/meta-camp-123',
      { status: 'ACTIVE' },
      { Authorization: 'Bearer test-token' },
    );
  });

  it('fetches insights and transforms them', async () => {
    exchange.getJson.mockResolvedValue({
      data: [
        {
          impressions: '500',
          clicks: '25',
          spend: '10',
          purchase: '2',
          ctr: '0.05',
          cpc: '0.4',
        },
      ],
    });

    const insights = await meta.getInsights('meta-camp-123', 'test-token');
    expect(insights.impressions).toBe(500);
    expect(insights.clicks).toBe(25);
    expect(insights.spend).toBe(10);
    expect(insights.conversions).toBe(2);
  });
});

describe('GoogleAdapter - operations', () => {
  let exchange: { getJson: jest.Mock; postJson: jest.Mock };
  let config: { getConfig: jest.Mock };
  let google: GoogleAdapter;

  beforeEach(() => {
    exchange = { getJson: jest.fn(), postJson: jest.fn() };
    config = {
      getConfig: jest.fn().mockReturnValue({
        apiBaseUrl: 'https://googleads.googleapis.com/v18',
        developerToken: 'dev-token',
      }),
    };
    google = new GoogleAdapter(exchange as any, config as any);
  });

  it('creates a campaign on Google and returns ID', async () => {
    exchange.postJson.mockResolvedValue({
      results: [{ resourceName: 'customers/1234567890/campaigns/987654' }],
    });

    const id = await google.createCampaign(
      {
        uacmCampaignId: 'uacm-1',
        name: 'Google Promo',
        budget: 200,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
        platformSpecificData: { customerId: '123-456-7890' },
      },
      'test-token',
    );

    expect(id).toBe('987654');
    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v18/customers/1234567890/campaigns:mutate',
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            create: expect.objectContaining({
              name: 'Google Promo',
              status: 'PAUSED',
            }),
          }),
        ],
      }),
      expect.objectContaining({
        Authorization: 'Bearer test-token',
        'developer-token': 'dev-token',
      }),
    );
  });

  it('throws when customerId is missing', async () => {
    await expect(
      google.createCampaign(
        {
          uacmCampaignId: 'uacm-1',
          name: 'Google Promo',
          budget: 200,
          startDate: new Date(),
          endDate: new Date(),
          platformSpecificData: {},
        },
        'token',
      ),
    ).rejects.toThrow('Google Ads customerId is required');
  });

  it('throws when Google returns no campaign resource name', async () => {
    exchange.postJson.mockResolvedValue({});

    await expect(
      google.createCampaign(
        {
          uacmCampaignId: 'uacm-1',
          name: 'Google Promo',
          budget: 200,
          startDate: new Date(),
          endDate: new Date(),
          platformSpecificData: { customerId: '123-456-7890' },
        },
        'test-token',
      ),
    ).rejects.toThrow('Google Ads campaign creation returned no campaign resource name');
  });

  it('pauses and resumes a campaign', async () => {
    exchange.postJson.mockResolvedValue({ results: [{}] });

    await google.pauseCampaign('987654', 'token', '1234567890');
    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v18/customers/1234567890/campaigns:mutate',
      expect.objectContaining({
        operations: [{ updateMask: 'status', update: expect.objectContaining({ status: 'PAUSED' }) }],
      }),
      expect.anything(),
    );

    await google.resumeCampaign('987654', 'token', '1234567890');
    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v18/customers/1234567890/campaigns:mutate',
      expect.objectContaining({
        operations: [{ updateMask: 'status', update: expect.objectContaining({ status: 'ENABLED' }) }],
      }),
      expect.anything(),
    );
  });

  it('throws when developerToken is not configured', async () => {
    config.getConfig.mockReturnValue({ apiBaseUrl: 'https://googleads.googleapis.com/v18' });

    await expect(
      google.pauseCampaign('987654', 'token', '1234567890'),
    ).rejects.toThrow('Google Ads developerToken is not configured');
  });

  it('throws when accountId is missing in getInsights', async () => {
    await expect(
      google.getInsights('987654', 'token'),
    ).rejects.toThrow('Google Ads customerId is required to fetch campaign insights');
  });

  it('queries searchStream and returns unified metrics in getInsights', async () => {
    exchange.postJson.mockResolvedValue([
      {
        results: [
          {
            metrics: {
              impressions: '1000',
              clicks: '50',
              cost_micros: '10000000',
              conversions: '5',
              ctr: '0.05',
              average_cpc: '200000',
              conversions_value: '50',
            },
          },
        ],
      },
    ]);

    const metrics = await google.getInsights('987654', 'token', '1234567890');
    expect(metrics.impressions).toBe(1000);
    expect(metrics.clicks).toBe(50);
    expect(metrics.spend).toBe(10);
    expect(metrics.conversions).toBe(5);
    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v18/customers/1234567890/googleAds:searchStream',
      expect.objectContaining({
        query: expect.stringContaining('WHERE campaign.id = 987654'),
      }),
      expect.anything(),
    );
  });

  it('updates campaign fields on Google', async () => {
    exchange.postJson.mockResolvedValue({ results: [{}] });

    await google.updateCampaign(
      {
        platformCampaignId: '987654',
        name: 'New Google Name',
        platformSpecificData: { customerId: '123-456-7890' },
      },
      'test-token',
    );

    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v18/customers/1234567890/campaigns:mutate',
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            updateMask: 'name',
            update: expect.objectContaining({ name: 'New Google Name' }),
          }),
        ],
      }),
      expect.anything(),
    );
  });

  it('routes budget to campaignBudgets:mutate and skips empty campaigns:mutate when only budget is updated', async () => {
    exchange.postJson.mockResolvedValue({ results: [{}] });

    await google.updateCampaign(
      {
        platformCampaignId: '987654',
        budget: 500,
        platformSpecificData: { customerId: '123-456-7890' },
      },
      'test-token',
    );

    // Verify campaignBudgets:mutate was called for budget
    expect(exchange.postJson).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v18/customers/1234567890/campaignBudgets:mutate',
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            create: expect.objectContaining({
              amountMicros: 500_000_000,
            }),
          }),
        ],
      }),
      expect.anything(),
    );

    // Verify campaigns:mutate was NOT called with an empty mask
    expect(exchange.postJson).not.toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v18/customers/1234567890/campaigns:mutate',
      expect.anything(),
      expect.anything(),
    );
  });

  it('skips request when no updatable fields or budget are passed to updateCampaign', async () => {
    await google.updateCampaign(
      {
        platformCampaignId: '987654',
        platformSpecificData: { customerId: '123-456-7890' },
      },
      'test-token',
    );

    expect(exchange.postJson).not.toHaveBeenCalled();
  });
});

