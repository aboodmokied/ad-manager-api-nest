import { Test, TestingModule } from '@nestjs/testing';
import { CampaignStatus, Platform } from '@prisma/client';
import { CampaignsWorker } from './campaigns.worker';
import { PrismaService } from '../../prisma/prisma.service';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { AdapterFactory } from '../../adapters/adapter-factory.service';
import { RateLimiterService } from '../../common/services/rate-limiter.service';
import { IdempotencyService } from '../../common/services/idempotency.service';
import { TokenVaultService } from '../../accounts/services/token-vault.service';
import { CampaignEventsService } from '../events/campaign-events.service';

describe('CampaignsWorker', () => {
  let worker: CampaignsWorker;
  let prisma: any;
  let rabbit: { publish: jest.Mock; consume: jest.Mock };
  let adapterFactory: { getAdapter: jest.Mock };
  let rateLimiter: { checkRateLimit: jest.Mock };
  let idempotency: {
    isProcessed: jest.Mock;
    checkAndMarkProcessed: jest.Mock;
    cleanup: jest.Mock;
  };
  let tokenVault: { requireValidAccessToken: jest.Mock };
  let campaignEvents: { emit: jest.Mock };
  let mockAdapter: {
    createCampaign: jest.Mock;
    updateCampaign: jest.Mock;
    pauseCampaign: jest.Mock;
    resumeCampaign: jest.Mock;
  };

  const samplePlatformCampaign = (overrides: any = {}) => ({
    id: 'pc-1',
    uacmCampaignId: 'uacm-1',
    platform: Platform.META,
    platformCampaignId: null,
    platformData: { objective: 'TRAFFIC' },
    status: CampaignStatus.PENDING,
    uacmCampaign: {
      id: 'uacm-1',
      userId: 'user-1',
      name: 'Black Friday',
      budget: { toNumber: () => 1000 },
      startDate: new Date('2026-11-20'),
      endDate: new Date('2026-11-30'),
      status: CampaignStatus.PENDING,
    },
    ...overrides,
  });

  beforeEach(async () => {
    rabbit = { publish: jest.fn().mockResolvedValue(undefined), consume: jest.fn() };
    mockAdapter = {
      createCampaign: jest.fn().mockResolvedValue('external-meta-123'),
      updateCampaign: jest.fn().mockResolvedValue(undefined),
      pauseCampaign: jest.fn().mockResolvedValue(undefined),
      resumeCampaign: jest.fn().mockResolvedValue(undefined),
    };
    adapterFactory = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter),
    };
    rateLimiter = {
      checkRateLimit: jest.fn().mockResolvedValue(true),
    };
    idempotency = {
      isProcessed: jest.fn().mockResolvedValue(false),
      checkAndMarkProcessed: jest.fn().mockResolvedValue(true),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    tokenVault = {
      requireValidAccessToken: jest.fn().mockResolvedValue('valid-access-token'),
    };
    campaignEvents = {
      emit: jest.fn(),
    };

    prisma = {
      platformCampaign: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      uacmCampaign: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      connectedAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'acc-1',
          userId: 'user-1',
          platform: Platform.META,
          platformAccountId: 'act_123',
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsWorker,
        { provide: PrismaService, useValue: prisma },
        { provide: RabbitMQService, useValue: rabbit },
        { provide: AdapterFactory, useValue: adapterFactory },
        { provide: RateLimiterService, useValue: rateLimiter },
        { provide: IdempotencyService, useValue: idempotency },
        { provide: TokenVaultService, useValue: tokenVault },
        { provide: CampaignEventsService, useValue: campaignEvents },
      ],
    }).compile();

    worker = module.get<CampaignsWorker>(CampaignsWorker);
  });

  afterEach(() => {
    worker.onModuleDestroy();
  });

  describe('handleCampaignCreated', () => {
    const rawMessage = {
      content: Buffer.from(
        JSON.stringify({
          uacmCampaignId: 'uacm-1',
          platformCampaignId: 'pc-1',
          platform: Platform.META,
        }),
      ),
    };

    it('creates campaign on platform, sets status ACTIVE, reconciles parent status, and marks idempotency', async () => {
      const pc = samplePlatformCampaign();
      prisma.platformCampaign.findUnique.mockResolvedValue(pc);
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        id: 'uacm-1',
        userId: 'user-1',
        status: CampaignStatus.PENDING,
        platformCampaigns: [
          { id: 'pc-1', status: CampaignStatus.ACTIVE },
        ],
      });

      await (worker as any).handleCampaignCreated(rawMessage);

      expect(tokenVault.requireValidAccessToken).toHaveBeenCalled();
      expect(mockAdapter.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          uacmCampaignId: 'uacm-1',
          name: 'Black Friday',
          budget: 1000,
        }),
        'valid-access-token',
      );
      expect(prisma.platformCampaign.update).toHaveBeenCalledWith({
        where: { id: 'pc-1' },
        data: {
          status: CampaignStatus.ACTIVE,
          platformCampaignId: 'external-meta-123',
        },
      });
      // Reconciles parent UACM campaign status to ACTIVE
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'uacm-1' },
        data: { status: CampaignStatus.ACTIVE },
      });
      expect(idempotency.checkAndMarkProcessed).toHaveBeenCalledWith('campaign:pc-1');
    });

    it('skips duplicate processing when already processed by idempotency', async () => {
      idempotency.isProcessed.mockResolvedValue(true);

      await (worker as any).handleCampaignCreated(rawMessage);

      expect(mockAdapter.createCampaign).not.toHaveBeenCalled();
      expect(prisma.platformCampaign.update).not.toHaveBeenCalled();
    });

    it('marks platformCampaign ERROR and reconciles parent status if no connected account exists', async () => {
      const pc = samplePlatformCampaign();
      prisma.platformCampaign.findUnique.mockResolvedValue(pc);
      prisma.connectedAccount.findFirst.mockResolvedValue(null);
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        id: 'uacm-1',
        userId: 'user-1',
        status: CampaignStatus.PENDING,
        platformCampaigns: [{ id: 'pc-1', status: CampaignStatus.ERROR }],
      });

      await expect(
        (worker as any).handleCampaignCreated(rawMessage),
      ).rejects.toThrow('No connected account');

      expect(prisma.platformCampaign.update).toHaveBeenCalledWith({
        where: { id: 'pc-1' },
        data: { status: CampaignStatus.ERROR },
      });
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'uacm-1' },
        data: { status: CampaignStatus.ERROR },
      });
    });

    it('handles adapter error by marking platformCampaign ERROR and reconciling parent status', async () => {
      const pc = samplePlatformCampaign();
      prisma.platformCampaign.findUnique.mockResolvedValue(pc);
      mockAdapter.createCampaign.mockRejectedValue(new Error('Meta API error'));
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        id: 'uacm-1',
        userId: 'user-1',
        status: CampaignStatus.PENDING,
        platformCampaigns: [{ id: 'pc-1', status: CampaignStatus.ERROR }],
      });

      await expect(
        (worker as any).handleCampaignCreated(rawMessage),
      ).rejects.toThrow('Meta API error');

      expect(prisma.platformCampaign.update).toHaveBeenCalledWith({
        where: { id: 'pc-1' },
        data: { status: CampaignStatus.ERROR },
      });
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'uacm-1' },
        data: { status: CampaignStatus.ERROR },
      });
    });
  });

  describe('handleCampaignPaused and handleCampaignResumed', () => {
    it('calls adapter.pauseCampaign and reconciles parent status', async () => {
      const pc = samplePlatformCampaign({
        platformCampaignId: 'meta-123',
        status: CampaignStatus.ACTIVE,
      });
      prisma.platformCampaign.findUnique.mockResolvedValue(pc);
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        id: 'uacm-1',
        userId: 'user-1',
        status: CampaignStatus.ACTIVE,
        platformCampaigns: [{ id: 'pc-1', status: CampaignStatus.PAUSED }],
      });

      await (worker as any).handleCampaignPaused({
        content: Buffer.from(
          JSON.stringify({
            uacmCampaignId: 'uacm-1',
            platformCampaignId: 'pc-1',
            platform: Platform.META,
          }),
        ),
      });

      expect(mockAdapter.pauseCampaign).toHaveBeenCalledWith(
        'meta-123',
        'valid-access-token',
        'act_123',
      );
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'uacm-1' },
        data: { status: CampaignStatus.PAUSED },
      });
    });

    it('calls adapter.resumeCampaign and reconciles parent status', async () => {
      const pc = samplePlatformCampaign({
        platformCampaignId: 'meta-123',
        status: CampaignStatus.PAUSED,
      });
      prisma.platformCampaign.findUnique.mockResolvedValue(pc);
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        id: 'uacm-1',
        userId: 'user-1',
        status: CampaignStatus.PAUSED,
        platformCampaigns: [{ id: 'pc-1', status: CampaignStatus.ACTIVE }],
      });

      await (worker as any).handleCampaignResumed({
        content: Buffer.from(
          JSON.stringify({
            uacmCampaignId: 'uacm-1',
            platformCampaignId: 'pc-1',
            platform: Platform.META,
          }),
        ),
      });

      expect(mockAdapter.resumeCampaign).toHaveBeenCalledWith(
        'meta-123',
        'valid-access-token',
        'act_123',
      );
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'uacm-1' },
        data: { status: CampaignStatus.ACTIVE },
      });
    });
  });

  describe('reconcileUacmCampaignStatus', () => {
    it('sets ACTIVE if at least one platform campaign is ACTIVE', async () => {
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        id: 'uacm-1',
        userId: 'user-1',
        status: CampaignStatus.PENDING,
        platformCampaigns: [
          { id: 'pc-1', status: CampaignStatus.ACTIVE },
          { id: 'pc-2', status: CampaignStatus.PENDING },
        ],
      });

      const status = await worker.reconcileUacmCampaignStatus('uacm-1');

      expect(status).toBe(CampaignStatus.ACTIVE);
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'uacm-1' },
        data: { status: CampaignStatus.ACTIVE },
      });
    });

    it('sets PAUSED if all platform campaigns are PAUSED', async () => {
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        id: 'uacm-1',
        userId: 'user-1',
        status: CampaignStatus.ACTIVE,
        platformCampaigns: [
          { id: 'pc-1', status: CampaignStatus.PAUSED },
          { id: 'pc-2', status: CampaignStatus.PAUSED },
        ],
      });

      const status = await worker.reconcileUacmCampaignStatus('uacm-1');

      expect(status).toBe(CampaignStatus.PAUSED);
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'uacm-1' },
        data: { status: CampaignStatus.PAUSED },
      });
    });

    it('sets ERROR if all platform campaigns are in ERROR', async () => {
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        id: 'uacm-1',
        userId: 'user-1',
        status: CampaignStatus.PENDING,
        platformCampaigns: [
          { id: 'pc-1', status: CampaignStatus.ERROR },
          { id: 'pc-2', status: CampaignStatus.ERROR },
        ],
      });

      const status = await worker.reconcileUacmCampaignStatus('uacm-1');

      expect(status).toBe(CampaignStatus.ERROR);
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'uacm-1' },
        data: { status: CampaignStatus.ERROR },
      });
    });
  });
});
