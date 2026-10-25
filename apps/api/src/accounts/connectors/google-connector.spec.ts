import { Test, TestingModule } from '@nestjs/testing';
import { Platform } from '@prisma/client';
import { GoogleConnector } from './google-connector';
import {
  OAuthExchangeError,
  OAuthExchangeService,
} from '../services/oauth-exchange.service';
import { PlatformOAuthConfig } from '../interfaces/accounts.interfaces';

describe('GoogleConnector', () => {
  let connector: GoogleConnector;
  let exchange: {
    getJson: jest.Mock;
    postForm: jest.Mock;
    postJson: jest.Mock;
  };

  const config = (): PlatformOAuthConfig => ({
    platform: Platform.GOOGLE,
    displayName: 'Google Ads',
    clientId: 'google-client',
    clientSecret: 'google-secret',
    redirectUri: 'http://localhost:8030/api/v1/ad-accounts/oauth/callback',
    scope: 'https://www.googleapis.com/auth/adwords',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    apiBaseUrl: 'https://googleads.googleapis.com/v18',
    apiVersion: 'v18',
    developerToken: 'dev-token-abc',
  });

  beforeEach(async () => {
    exchange = {
      getJson: jest.fn(),
      postForm: jest.fn(),
      postJson: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleConnector,
        { provide: OAuthExchangeService, useValue: exchange },
      ],
    }).compile();
    connector = module.get(GoogleConnector);
  });

  describe('buildAuthUrl', () => {
    it('includes offline access and consent prompt so refresh tokens are issued', () => {
      const url = connector.buildAuthUrl('state-x', config());
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
      expect(url).toContain('client_id=google-client');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
      expect(url).toContain(
        'scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fadwords',
      );
      expect(url).toContain('state=state-x');
    });
  });

  describe('exchangeCode', () => {
    it('posts the code exchange form and returns tokens', async () => {
      exchange.postForm.mockResolvedValue({
        access_token: 'google-access',
        refresh_token: 'google-refresh',
        expires_in: 3600,
      });
      const result = await connector.exchangeCode('code-9', config());
      expect(result).toEqual({
        access_token: 'google-access',
        refresh_token: 'google-refresh',
        expires_in: 3600,
      });
      expect(exchange.postForm).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          code: 'code-9',
          grant_type: 'authorization_code',
        }),
      );
    });

    it('throws a sanitized error when the token endpoint fails', async () => {
      exchange.postForm.mockResolvedValue({ error: 'invalid_grant' });
      await expect(connector.exchangeCode('bad', config())).rejects.toThrow(
        OAuthExchangeError,
      );
    });
  });

  describe('refreshToken', () => {
    it('refreshes with the stored refresh token', async () => {
      exchange.postForm.mockResolvedValue({
        access_token: 'fresh',
        expires_in: 3600,
      });
      const result = await connector.refreshToken(
        { accessToken: 'old', refreshToken: 'google-refresh' },
        config(),
      );
      expect(result.access_token).toBe('fresh');
      expect(exchange.postForm).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          refresh_token: 'google-refresh',
          grant_type: 'refresh_token',
        }),
      );
    });

    it('throws when no refresh token exists', async () => {
      await expect(
        connector.refreshToken(
          { accessToken: 'old', refreshToken: null },
          config(),
        ),
      ).rejects.toThrow(/refresh token/i);
      expect(exchange.postForm).not.toHaveBeenCalled();
    });
  });

  describe('listAccessibleAccounts', () => {
    it('parses resource names into customer ids', async () => {
      exchange.getJson.mockResolvedValue({
        resourceNames: ['customers/1234567890'],
      });
      const accounts = await connector.listAccessibleAccounts('tok', config());
      expect(accounts).toEqual([
        { id: '1234567890', name: 'Customer 1234567890' },
      ]);
      expect(exchange.getJson).toHaveBeenCalledWith(
        'https://googleads.googleapis.com/v18/customers:listAccessibleCustomers',
        expect.objectContaining({ 'developer-token': 'dev-token-abc' }),
      );
    });
  });

  describe('listCampaigns', () => {
    it('posts the searchStream query and maps micros + dates', async () => {
      exchange.postJson.mockResolvedValue({
        results: [
          {
            campaign: {
              id: '101',
              name: 'Q1 campaign',
              status: 'ENABLED',
              startDate: '20260101',
              endDate: '20260331',
            },
            campaignBudget: { amountMicros: 25000000 },
          },
        ],
      });
      const campaigns = await connector.listCampaigns(
        'tok',
        '1234567890',
        config(),
      );
      expect(campaigns[0]).toMatchObject({
        externalId: '101',
        name: 'Q1 campaign',
        externalStatus: 'ENABLED',
        budget: 25,
      });
      expect(campaigns[0].startDate?.toISOString()).toBe(
        '2026-01-01T00:00:00.000Z',
      );
      expect(exchange.postJson).toHaveBeenCalledWith(
        'https://googleads.googleapis.com/v18/customers/1234567890/googleAds:searchStream',
        expect.objectContaining({
          query: expect.stringContaining('SELECT campaign.id'),
        }),
        expect.objectContaining({ Authorization: 'Bearer tok' }),
      );
    });

    it('handles the searchStream response shape alias', async () => {
      exchange.postJson.mockResolvedValue({
        googleAds: [
          {
            results: [
              { campaign: { id: '202', name: 'Second', status: 'PAUSED' } },
            ],
          },
        ],
      });
      const campaigns = await connector.listCampaigns('tok', '123', config());
      expect(campaigns).toHaveLength(1);
      expect(campaigns[0].externalId).toBe('202');
    });

    it('flattens streamed response batches', async () => {
      exchange.postJson.mockResolvedValue([
        {
          results: [
            { campaign: { id: '301', name: 'Batch A', status: 'ENABLED' } },
          ],
        },
        {
          results: [
            { campaign: { id: '302', name: 'Batch B', status: 'PAUSED' } },
          ],
        },
      ]);
      const campaigns = await connector.listCampaigns('tok', '123', config());
      expect(campaigns.map((c) => c.externalId)).toEqual(['301', '302']);
    });

    it('returns an empty list when the API returns no rows', async () => {
      exchange.postJson.mockResolvedValue({});
      const campaigns = await connector.listCampaigns('tok', '123', config());
      expect(campaigns).toEqual([]);
    });
  });
});
