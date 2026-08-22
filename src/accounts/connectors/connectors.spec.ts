import { Platform } from '@prisma/client';
import { LinkedinConnector } from './linkedin-connector';
import { XConnector } from './x-connector';
import { SnapchatConnector } from './snapchat-connector';
import { TiktokConnector } from './tiktok-connector';
import { MAX_PAGINATION_PAGES } from './connector-utils';
import { PlatformOAuthConfig } from '../interfaces/accounts.interfaces';

function makeConfig(
  overrides: Partial<PlatformOAuthConfig> = {},
): PlatformOAuthConfig {
  return {
    platform: Platform.LINKEDIN,
    displayName: 'LinkedIn Ads',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://localhost:8030/api/v1/ad-accounts/oauth/callback',
    scope: 'scope-a',
    authUrl: 'https://provider/auth',
    tokenUrl: 'https://provider/token',
    apiBaseUrl: 'https://api.provider/v1',
    apiVersion: 'v1',
    ...overrides,
  };
}

describe('Ad account connectors (LinkedIn / X / Snapchat / TikTok)', () => {
  let exchange: {
    getJson: jest.Mock;
    postForm: jest.Mock;
    postJson: jest.Mock;
  };

  beforeEach(() => {
    exchange = { getJson: jest.fn(), postForm: jest.fn(), postJson: jest.fn() };
  });

  describe('LinkedinConnector', () => {
    it('builds the consent URL with response_type=code and state', () => {
      const connector = new LinkedinConnector(exchange as any);
      const url = connector.buildAuthUrl('state-1', makeConfig());
      expect(url).toContain('https://provider/auth?');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=client-id');
      expect(url).toContain('state=state-1');
    });

    it('exchanges the code via form POST with client credentials', async () => {
      exchange.postForm.mockResolvedValue({
        access_token: 'li-token',
        refresh_token: 'li-refresh',
        expires_in: 3600,
      });
      const connector = new LinkedinConnector(exchange as any);
      const result = await connector.exchangeCode('code-1', makeConfig());
      expect(exchange.postForm.mock.calls[0][1]).toEqual({
        grant_type: 'authorization_code',
        code: 'code-1',
        redirect_uri: 'http://localhost:8030/api/v1/ad-accounts/oauth/callback',
        client_id: 'client-id',
        client_secret: 'client-secret',
      });
      expect(result.access_token).toBe('li-token');
    });

    it('lists campaigns with restli headers on the right endpoint', async () => {
      exchange.getJson.mockResolvedValue({
        elements: [
          {
            id: 'camp-1',
            name: 'LI Campaign',
            status: 'ACTIVE',
            dailyBudget: { amount: '5000' },
            startDate: { year: 2026, month: 1, day: 1 },
          },
        ],
      });
      const connector = new LinkedinConnector(exchange as any);
      const [campaign] = await connector.listCampaigns(
        'tok',
        'acc-123',
        makeConfig(),
      );
      expect(exchange.getJson.mock.calls[0][0]).toContain('/adCampaignsV2?');
      expect(decodeURIComponent(exchange.getJson.mock.calls[0][0])).toContain(
        '(account:(urn:li:sponsoredAccount:acc-123))',
      );
      expect(exchange.getJson.mock.calls[0][1]).toEqual({
        Authorization: 'Bearer tok',
        'X-Restli-Protocol-Version': '2.0.0',
      });
      expect(campaign.externalId).toBe('camp-1');
      expect(campaign.name).toBe('LI Campaign');
      expect(campaign.budget).toBe(50); // minor units -> USD
      expect(campaign.startDate?.toISOString()).toContain('2026-01-01');
    });

    it('does not divide budgets for no-cents currencies (JPY)', async () => {
      exchange.getJson.mockResolvedValue({
        elements: [
          {
            id: 'camp-2',
            name: 'LI Campaign JPY',
            status: 'ACTIVE',
            dailyBudget: { amount: '5000', currencyCode: 'JPY' },
          },
        ],
      });
      const connector = new LinkedinConnector(exchange as any);
      const [campaign] = await connector.listCampaigns(
        'tok',
        'acc-123',
        makeConfig(),
      );
      expect(campaign.budget).toBe(5000);
    });
  });

  describe('XConnector (PKCE)', () => {
    it('generates a PKCE verifier and embeds its S256 challenge in the URL', async () => {
      const connector = new XConnector(exchange as any);
      const session = await connector.prepareAuthSession!();
      const url = connector.buildAuthUrl(
        'state-1',
        makeConfig({ scope: 'tweet.read users.read offline.access ads.read' }),
        session,
      );
      expect(session.pkceVerifier).toBeDefined();
      expect(session.pkceVerifier!.length).toBeGreaterThanOrEqual(43);
      const { searchParams } = new URL(url);
      expect(searchParams.get('code_challenge_method')).toBe('S256');
      expect(searchParams.get('code_challenge')).toBeDefined();
      expect(searchParams.get('scope')).toContain('offline.access');
    });

    it('presents the verifier during the code exchange', async () => {
      exchange.postForm.mockResolvedValue({ access_token: 'x-token' });
      const connector = new XConnector(exchange as any);
      const session = await connector.prepareAuthSession!();
      const result = await connector.exchangeCode(
        'code-1',
        makeConfig(),
        session,
      );
      expect(exchange.postForm.mock.calls[0][1].code_verifier).toBe(
        session.pkceVerifier,
      );
      expect(result.access_token).toBe('x-token');
    });

    it('fails the exchange without a verifier', async () => {
      const connector = new XConnector(exchange as any);
      await expect(
        connector.exchangeCode('code-1', makeConfig()),
      ).rejects.toThrow(/PKCE/);
    });

    it('refuses to build an auth URL without a PKCE verifier', () => {
      const connector = new XConnector(exchange as any);
      expect(() => connector.buildAuthUrl('state-1', makeConfig())).toThrow(
        /PKCE/,
      );
      expect(exchange.getJson).not.toHaveBeenCalled();
    });

    it('stops paginating when the provider repeats the same cursor', async () => {
      exchange.getJson.mockResolvedValue({
        data: [
          {
            id: 'c1',
            name: 'X Campaign',
            status: 'ACTIVE',
            daily_funding_amount_in_micro_currency: '2500000',
          },
        ],
        next_cursor: 'same-cursor',
      });
      const connector = new XConnector(exchange as any);
      const campaigns = await connector.listCampaigns(
        'tok',
        'acc-1',
        makeConfig(),
      );
      expect(campaigns).toHaveLength(MAX_PAGINATION_PAGES);
      expect(exchange.getJson).toHaveBeenCalledTimes(MAX_PAGINATION_PAGES);
    });

    it('maps campaigns (micro currency budgets) from /accounts/:id/campaigns', async () => {
      exchange.getJson.mockResolvedValue({
        data: [
          {
            id: 'c1',
            name: 'X Campaign',
            status: 'ACTIVE',
            daily_funding_amount_in_micro_currency: '2500000',
            start_time: '2026-01-01T00:00:00Z',
          },
        ],
      });
      const connector = new XConnector(exchange as any);
      const [campaign] = await connector.listCampaigns(
        'tok',
        'acc-1',
        makeConfig(),
      );
      expect(exchange.getJson.mock.calls[0][0]).toContain(
        '/accounts/acc-1/campaigns',
      );
      expect(campaign.externalId).toBe('c1');
      expect(campaign.budget).toBe(2.5);
    });
  });

  describe('SnapchatConnector', () => {
    it('exchanges and refreshes tokens with the marketing scope', async () => {
      exchange.postForm.mockResolvedValue({ access_token: 'sc-token' });
      const connector = new SnapchatConnector(exchange as any);
      await connector.exchangeCode('code-1', makeConfig());
      expect(exchange.postForm.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          grant_type: 'authorization_code',
          code: 'code-1',
        }),
      );
      await connector.refreshToken(
        { accessToken: 'old', refreshToken: 'r' },
        makeConfig(),
      );
      expect(exchange.postForm.mock.calls[1][1]).toEqual(
        expect.objectContaining({
          grant_type: 'refresh_token',
          refresh_token: 'r',
        }),
      );
    });

    it('lists campaigns from /adaccounts/:id/campaigns with micro budgets', async () => {
      exchange.getJson.mockResolvedValue({
        campaigns: [
          {
            id: 's1',
            name: 'Snap Campaign',
            status: 'ACTIVE',
            daily_budget_micro: 1000000,
          },
        ],
      });
      const connector = new SnapchatConnector(exchange as any);
      const [campaign] = await connector.listCampaigns(
        'tok',
        'acc-9',
        makeConfig(),
      );
      expect(exchange.getJson.mock.calls[0][0]).toContain(
        '/adaccounts/acc-9/campaigns',
      );
      expect(campaign.budget).toBe(1);
    });

    it('stops paginating when the provider repeats the same next link', async () => {
      exchange.getJson.mockResolvedValue({
        campaigns: [
          {
            id: 's1',
            name: 'Snap Campaign',
            status: 'ACTIVE',
            daily_budget_micro: 1000000,
          },
        ],
        paging: {
          next_link:
            'https://api.snapchat.com/adaccounts/acc-9/campaigns?page=loop',
        },
      });
      const connector = new SnapchatConnector(exchange as any);
      const campaigns = await connector.listCampaigns(
        'tok',
        'acc-9',
        makeConfig(),
      );
      expect(campaigns).toHaveLength(MAX_PAGINATION_PAGES);
      expect(exchange.getJson).toHaveBeenCalledTimes(MAX_PAGINATION_PAGES);
    });
  });

  describe('TiktokConnector', () => {
    it('builds the consent URL with app_id', () => {
      const connector = new TiktokConnector(exchange as any);
      const url = connector.buildAuthUrl('state-1', makeConfig());
      expect(url).toContain('app_id=client-id');
      expect(url).toContain('state=state-1');
      expect(url).toContain('redirect_uri=');
    });

    it('exchanges the auth_code via JSON with app_id + secret', async () => {
      exchange.postJson.mockResolvedValue({
        code: 0,
        data: {
          access_token: 'tt-token',
          refresh_token: 'tt-refresh',
          expires_in: 86400,
        },
      });
      const connector = new TiktokConnector(exchange as any);
      const result = await connector.exchangeCode('auth-code', makeConfig());
      expect(exchange.postJson.mock.calls[0][1]).toEqual({
        app_id: 'client-id',
        secret: 'client-secret',
        auth_code: 'auth-code',
      });
      expect(result.access_token).toBe('tt-token');
    });

    it('rejects non-zero response codes without leaking payloads', async () => {
      exchange.postJson.mockResolvedValue({ code: 40005 });
      const connector = new TiktokConnector(exchange as any);
      await expect(connector.exchangeCode('bad', makeConfig())).rejects.toThrow(
        /code 40005/,
      );
    });

    it('never leaks tokens or payloads in rejection messages', async () => {
      exchange.postJson.mockResolvedValue({
        code: 40005,
        data: { access_token: 'super-secret-token', refresh_token: 'r' },
      });
      const connector = new TiktokConnector(exchange as any);
      let error: Error | undefined;
      try {
        await connector.exchangeCode('bad', makeConfig());
      } catch (e: any) {
        error = e;
      }
      expect(error?.message).toContain('code 40005');
      expect(error?.message).not.toContain('super-secret-token');
    });

    it('terminates after one page when no total_page is reported', async () => {
      exchange.getJson.mockResolvedValue({
        code: 0,
        data: {
          list: [
            {
              campaign_id: 'tt-1',
              campaign_name: 'TikTok Campaign',
              status: 'CAMPAIGN_ENABLE',
              budget: 100.5,
            },
          ],
        },
      });
      const connector = new TiktokConnector(exchange as any);
      const campaigns = await connector.listCampaigns(
        'tok',
        'ad-1',
        makeConfig(),
      );
      expect(campaigns).toHaveLength(1);
      expect(exchange.getJson).toHaveBeenCalledTimes(1);
    });

    it('maps campaigns (unix seconds + campaign_id) from campaign/get', async () => {
      exchange.getJson.mockResolvedValue({
        code: 0,
        data: {
          list: [
            {
              campaign_id: 'tt-1',
              campaign_name: 'TikTok Campaign',
              status: 'CAMPAIGN_ENABLE',
              budget: 100.5,
              start_time: 1767225600,
            },
          ],
        },
      });
      const connector = new TiktokConnector(exchange as any);
      const [campaign] = await connector.listCampaigns(
        'tok',
        'ad-1',
        makeConfig(),
      );
      expect(exchange.getJson.mock.calls[0][0]).toContain('/campaign/get/');
      expect(exchange.getJson.mock.calls[0][0]).toContain('advertiser_id=ad-1');
      expect(campaign.externalId).toBe('tt-1');
      expect(campaign.budget).toBe(100.5);
      expect(campaign.startDate?.getTime()).toBe(1767225600 * 1000);
    });

    it('lists accessible advertisers from advertiser/get', async () => {
      exchange.getJson.mockResolvedValue({
        code: 0,
        data: {
          list: [{ advertiser_id: '555', advertiser_name: 'My Ads Account' }],
        },
      });
      const connector = new TiktokConnector(exchange as any);
      const accounts = await connector.listAccessibleAccounts(
        'tok',
        makeConfig(),
      );
      expect(exchange.getJson.mock.calls[0][0]).toContain('/advertiser/get/');
      expect(accounts).toEqual([{ id: '555', name: 'My Ads Account' }]);
    });
  });
});
