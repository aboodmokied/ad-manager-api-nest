import { Test, TestingModule } from '@nestjs/testing';
import { Platform } from '@prisma/client';
import { MetaConnector } from './meta-connector';
import { MAX_PAGINATION_PAGES } from './connector-utils';
import {
  OAuthExchangeError,
  OAuthExchangeService,
} from '../services/oauth-exchange.service';
import { PlatformOAuthConfig } from '../interfaces/accounts.interfaces';

describe('MetaConnector', () => {
  let connector: MetaConnector;
  let exchange: { getJson: jest.Mock };

  const config = (
    overrides: Partial<PlatformOAuthConfig> = {},
  ): PlatformOAuthConfig => ({
    platform: Platform.META,
    displayName: 'Meta Ads',
    clientId: 'meta-app-id',
    clientSecret: 'meta-app-secret',
    redirectUri: 'http://localhost:8030/api/v1/ad-accounts/oauth/callback',
    scope: 'ads_management,ads_read',
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    apiBaseUrl: 'https://graph.facebook.com/v21.0',
    apiVersion: 'v21.0',
    ...overrides,
  });

  beforeEach(async () => {
    exchange = { getJson: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaConnector,
        { provide: OAuthExchangeService, useValue: exchange },
      ],
    }).compile();
    connector = module.get(MetaConnector);
  });

  describe('buildAuthUrl', () => {
    it('builds the dialog URL with client id, redirect, scope and state', () => {
      const url = connector.buildAuthUrl('state-123', config());
      expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth?');
      expect(url).toContain('client_id=meta-app-id');
      expect(url).toContain(
        `redirect_uri=${encodeURIComponent(config().redirectUri)}`,
      );
      expect(url).toContain('scope=ads_management%2Cads_read');
      expect(url).toContain('response_type=code');
      expect(url).toContain('state=state-123');
    });
  });

  describe('exchangeCode', () => {
    it('exchanges the code and maps the token response', async () => {
      exchange.getJson.mockResolvedValue({
        access_token: 'meta-short-lived',
        token_type: 'bearer',
        expires_in: 7200,
      });
      const result = await connector.exchangeCode('code-1', config());
      expect(result).toEqual({
        access_token: 'meta-short-lived',
        expires_in: 7200,
      });
      expect(exchange.getJson).toHaveBeenCalledWith(
        expect.stringContaining('code=code-1'),
      );
      expect(exchange.getJson).toHaveBeenCalledWith(
        expect.stringContaining('client_secret=meta-app-secret'),
      );
    });

    it('throws a sanitized error when no access token is returned', async () => {
      exchange.getJson.mockResolvedValue({ error: { code: 100 } });
      await expect(connector.exchangeCode('bad', config())).rejects.toThrow(
        OAuthExchangeError,
      );
    });
  });

  describe('refreshToken', () => {
    it('uses the refresh token as exchange material when present', async () => {
      exchange.getJson.mockResolvedValue({
        access_token: 'meta-long-lived',
        expires_in: 5184000,
      });
      const result = await connector.refreshToken(
        { accessToken: 'old', refreshToken: 'refresh-material' },
        config(),
      );
      expect(result.access_token).toBe('meta-long-lived');
      expect(exchange.getJson).toHaveBeenCalledWith(
        expect.stringContaining('fb_exchange_token=refresh-material'),
      );
      expect(exchange.getJson).toHaveBeenCalledWith(
        expect.stringContaining('grant_type=fb_exchange_token'),
      );
    });

    it('falls back to the current access token when no refresh token exists', async () => {
      exchange.getJson.mockResolvedValue({
        access_token: 'new',
        expires_in: 1000,
      });
      await connector.refreshToken(
        { accessToken: 'current', refreshToken: null },
        config(),
      );
      expect(exchange.getJson).toHaveBeenCalledWith(
        expect.stringContaining('fb_exchange_token=current'),
      );
    });
  });

  describe('listAccessibleAccounts', () => {
    it('maps /me/adaccounts payloads and strips act_ prefixes', async () => {
      exchange.getJson.mockResolvedValue({
        data: [
          { id: 'act_111', name: 'Agency account' },
          { id: '222', name: 'Client account' },
        ],
      });
      const accounts = await connector.listAccessibleAccounts('tok', config());
      expect(accounts).toEqual([
        { id: '111', name: 'Agency account' },
        { id: '222', name: 'Client account' },
      ]);
      expect(exchange.getJson).toHaveBeenCalledWith(
        expect.stringContaining('/me/adaccounts?'),
        { Authorization: 'Bearer tok' },
      );
    });
  });

  describe('listCampaigns', () => {
    it('maps campaigns with budget and dates', async () => {
      exchange.getJson.mockResolvedValue({
        data: [
          {
            id: 'c1',
            name: 'Spring sale',
            status: 'ACTIVE',
            start_time: '2026-03-01T00:00:00+0000',
            stop_time: '2026-03-31T00:00:00+0000',
            daily_budget: '10000', // cents -> $100
          },
          { id: 'c2', name: 'Always on', status: 'PAUSED' },
        ],
      });
      const campaigns = await connector.listCampaigns('tok', '111', config());
      expect(campaigns).toHaveLength(2);
      expect(campaigns[0]).toMatchObject({
        externalId: 'c1',
        name: 'Spring sale',
        externalStatus: 'ACTIVE',
        budget: 100,
      });
      expect(campaigns[0].startDate?.toISOString()).toBe(
        '2026-03-01T00:00:00.000Z',
      );
      expect(campaigns[1].budget).toBeUndefined();
      expect(exchange.getJson).toHaveBeenCalledWith(
        expect.stringContaining('/act_111/campaigns?'),
        { Authorization: 'Bearer tok' },
      );
    });

    it('uses the account currency to convert budgets for no-cents currencies', async () => {
      exchange.getJson
        .mockResolvedValueOnce({ currency: 'JPY' })
        .mockResolvedValueOnce({
          data: [
            {
              id: 'c-jpy',
              name: 'JPY campaign',
              status: 'ACTIVE',
              daily_budget: '10000',
            },
          ],
        });
      const campaigns = await connector.listCampaigns('tok', '111', config());
      expect(campaigns[0].budget).toBe(10000); // yen has no cents
      expect(exchange.getJson).toHaveBeenCalledWith(
        expect.stringContaining('/act_111?fields=currency'),
        { Authorization: 'Bearer tok' },
      );
    });

    it('falls back to 2-decimal conversion when the currency is unknown', async () => {
      exchange.getJson.mockResolvedValueOnce({}).mockResolvedValueOnce({
        data: [
          {
            id: 'c-unknown',
            name: 'Unknown currency',
            status: 'ACTIVE',
            daily_budget: '10000',
          },
        ],
      });
      const campaigns = await connector.listCampaigns('tok', '111', config());
      expect(campaigns[0].budget).toBe(100);
    });

    it('returns an empty list when the API returns no data', async () => {
      exchange.getJson.mockResolvedValue({});
      const campaigns = await connector.listCampaigns('tok', '111', config());
      expect(campaigns).toEqual([]);
    });

    it('follows paging.next until no further page is returned', async () => {
      exchange.getJson
        .mockResolvedValueOnce({ currency: 'USD' })
        .mockResolvedValueOnce({
          data: [{ id: 'c1', name: 'Page 1', status: 'ACTIVE' }],
          paging: {
            next: 'https://graph.facebook.com/v21.0/act_111/campaigns?after=cursor',
          },
        })
        .mockResolvedValueOnce({
          data: [{ id: 'c2', name: 'Page 2', status: 'ACTIVE' }],
        });
      const campaigns = await connector.listCampaigns('tok', '111', config());
      expect(campaigns.map((c) => c.externalId)).toEqual(['c1', 'c2']);
      expect(exchange.getJson).toHaveBeenLastCalledWith(
        'https://graph.facebook.com/v21.0/act_111/campaigns?after=cursor',
        { Authorization: 'Bearer tok' },
      );
    });

    it('stops paginating when the provider repeats paging.next forever', async () => {
      exchange.getJson.mockResolvedValue({
        data: [{ id: 'c1', name: 'Loop', status: 'ACTIVE' }],
        paging: {
          next: 'https://graph.facebook.com/v21.0/act_111/campaigns?after=loop',
        },
      });
      const campaigns = await connector.listCampaigns('tok', '111', config());
      expect(campaigns).toHaveLength(MAX_PAGINATION_PAGES);
      // 1 extra call for the account currency lookup.
      expect(exchange.getJson).toHaveBeenCalledTimes(MAX_PAGINATION_PAGES + 1);
    });
  });
});
