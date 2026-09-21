import { Test, TestingModule } from '@nestjs/testing';
import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CampaignStatus, Platform } from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { IdempotencyService } from '../../common/services/idempotency.service';
import { TenantResolverService } from '../../common/services/tenant-resolver.service';
import { TokenVaultService } from '../../accounts/services/token-vault.service';
import { AdapterFactory } from '../../adapters/adapter-factory.service';
import { CampaignEventsService } from '../events/campaign-events.service';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: any;
  let rabbit: { publish: jest.Mock; consume: jest.Mock };
  let idempotency: {
    checkAndMarkProcessed: jest.Mock;
    remove: jest.Mock;
  };
  let tenantResolver: { resolveTenantId: jest.Mock };
  let adapterFactory: { getAdapter: jest.Mock };
  let tokenVault: { requireValidAccessToken: jest.Mock };
  let campaignEvents: { emit: jest.Mock; getEventStream: jest.Mock };

  const userId = 'user-1';
  const tenantId = 'tenant-1';

  const sampleCampaign = (overrides: any = {}) => ({
    id: 'camp-1',
    userId,
    tenantId,
    name: 'Summer Sale',
    budget: 500,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-31'),
    status: CampaignStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    platformCampaigns: [
      {
        id: 'pc-1',
        uacmCampaignId: 'camp-1',
        platform: Platform.META,
        platformCampaignId: 'meta-123',
        platformData: { objective: 'OUTCOME_TRAFFIC' },
        status: CampaignStatus.PENDING,
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    rabbit = { publish: jest.fn().mockResolvedValue(undefined), consume: jest.fn() };
    idempotency = {
      checkAndMarkProcessed: jest.fn().mockResolvedValue(false),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    tenantResolver = {
      resolveTenantId: jest.fn().mockReturnValue(tenantId),
    };
    adapterFactory = {
      getAdapter: jest.fn(),
    };
    tokenVault = {
      requireValidAccessToken: jest.fn().mockResolvedValue('test-token'),
    };
    campaignEvents = {
      emit: jest.fn(),
      getEventStream: jest.fn(),
    };

    prisma = {
      uacmCampaign: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      platformCampaign: {
        update: jest.fn(),
      },
      connectedAccount: {
        findFirst: jest.fn(),
      },
      metricLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RabbitMQService, useValue: rabbit },
        { provide: IdempotencyService, useValue: idempotency },
        { provide: TenantResolverService, useValue: tenantResolver },
        { provide: AdapterFactory, useValue: adapterFactory },
        { provide: TokenVaultService, useValue: tokenVault },
        { provide: CampaignEventsService, useValue: campaignEvents },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  describe('create', () => {
    const createDto = {
      name: 'Summer Sale',
      budget: 500,
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-07-31T00:00:00.000Z',
      platforms: [
        {
          platform: Platform.META,
          platformSpecificData: { objective: 'OUTCOME_TRAFFIC' },
        },
      ],
    };

    it('creates a campaign with tenantId resolved and publishes creation events', async () => {
      const created = sampleCampaign();
      prisma.uacmCampaign.create.mockResolvedValue(created);

      const result = await service.create(userId, createDto);

      expect(tenantResolver.resolveTenantId).toHaveBeenCalledWith(userId);
      expect(prisma.uacmCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            tenantId,
            name: 'Summer Sale',
            budget: 500,
            status: CampaignStatus.PENDING,
          }),
        }),
      );
      expect(rabbit.publish).toHaveBeenCalledWith('campaign.created', {
        uacmCampaignId: 'camp-1',
        platformCampaignId: 'pc-1',
        platform: Platform.META,
      });
      expect(result.id).toBe('camp-1');
    });

    it('rejects duplicate idempotency key with 409 ConflictException', async () => {
      idempotency.checkAndMarkProcessed.mockResolvedValue(true);

      await expect(
        service.create(userId, createDto, 'dup-key'),
      ).rejects.toThrow(ConflictException);

      expect(prisma.uacmCampaign.create).not.toHaveBeenCalled();
    });

    it('rolls back idempotency reservation on database failure', async () => {
      prisma.uacmCampaign.create.mockRejectedValue(new Error('DB failure'));

      await expect(
        service.create(userId, createDto, 'failing-key'),
      ).rejects.toThrow('DB failure');

      expect(idempotency.remove).toHaveBeenCalledWith('http:campaigns:failing-key');
    });
  });

  describe('findAll', () => {
    it('queries campaigns scoped to userId and tenantId', async () => {
      prisma.uacmCampaign.findMany.mockResolvedValue([sampleCampaign()]);
      prisma.uacmCampaign.count.mockResolvedValue(1);

      const result = await service.findAll(userId, { page: 1, limit: 10 });

      expect(prisma.uacmCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            OR: [{ tenantId }, { tenantId: null }],
          },
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('applies status filter when provided', async () => {
      prisma.uacmCampaign.findMany.mockResolvedValue([]);
      prisma.uacmCampaign.count.mockResolvedValue(0);

      await service.findAll(userId, { status: CampaignStatus.ACTIVE });

      expect(prisma.uacmCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: CampaignStatus.ACTIVE }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns campaign DTO if found and owned by tenant', async () => {
      prisma.uacmCampaign.findFirst.mockResolvedValue(sampleCampaign());

      const result = await service.findOne(userId, 'camp-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('camp-1');
    });

    it('returns null if campaign is not found', async () => {
      prisma.uacmCampaign.findFirst.mockResolvedValue(null);

      const result = await service.findOne(userId, 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('updates campaign fields and publishes campaign.updated events for created platform campaigns', async () => {
      const existing = sampleCampaign({ status: CampaignStatus.ACTIVE });
      prisma.uacmCampaign.findFirst.mockResolvedValue(existing);
      prisma.uacmCampaign.update.mockResolvedValue({
        ...existing,
        name: 'Updated Name',
      });
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        ...existing,
        name: 'Updated Name',
      });

      const result = await service.update(userId, 'camp-1', {
        name: 'Updated Name',
        budget: 600,
      });

      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'camp-1' },
          data: expect.objectContaining({ name: 'Updated Name', budget: 600 }),
        }),
      );
      expect(rabbit.publish).toHaveBeenCalledWith('campaign.updated', {
        uacmCampaignId: 'camp-1',
        platformCampaignId: 'pc-1',
        platform: Platform.META,
      });
      expect(result.name).toBe('Updated Name');
    });
  });

  describe('pause', () => {
    it('pauses an ACTIVE campaign and dispatches campaign.paused event', async () => {
      const activeCampaign = sampleCampaign({
        status: CampaignStatus.ACTIVE,
        platformCampaigns: [
          {
            id: 'pc-1',
            uacmCampaignId: 'camp-1',
            platform: Platform.META,
            platformCampaignId: 'meta-123',
            status: CampaignStatus.ACTIVE,
          },
        ],
      });
      prisma.uacmCampaign.findFirst.mockResolvedValue(activeCampaign);
      prisma.uacmCampaign.update.mockResolvedValue({
        ...activeCampaign,
        status: CampaignStatus.PAUSED,
      });
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        ...activeCampaign,
        status: CampaignStatus.PAUSED,
      });

      const result = await service.pause(userId, 'camp-1');

      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { status: CampaignStatus.PAUSED },
      });
      expect(prisma.platformCampaign.update).toHaveBeenCalledWith({
        where: { id: 'pc-1' },
        data: { status: CampaignStatus.PAUSED },
      });
      expect(rabbit.publish).toHaveBeenCalledWith('campaign.paused', {
        uacmCampaignId: 'camp-1',
        platformCampaignId: 'pc-1',
        platform: Platform.META,
      });
      expect(result.status).toBe(CampaignStatus.PAUSED);
    });

    it('rejects pausing when campaign is not ACTIVE with 400 BadRequestException', async () => {
      const pendingCampaign = sampleCampaign({ status: CampaignStatus.PENDING });
      prisma.uacmCampaign.findFirst.mockResolvedValue(pendingCampaign);

      await expect(service.pause(userId, 'camp-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.uacmCampaign.update).not.toHaveBeenCalled();
    });

    it('rolls back local status and throws BadGatewayException if event publishing fails', async () => {
      const activeCampaign = sampleCampaign({
        status: CampaignStatus.ACTIVE,
        platformCampaigns: [
          {
            id: 'pc-1',
            uacmCampaignId: 'camp-1',
            platform: Platform.META,
            platformCampaignId: 'meta-123',
            status: CampaignStatus.ACTIVE,
          },
        ],
      });
      prisma.uacmCampaign.findFirst.mockResolvedValue(activeCampaign);
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        ...activeCampaign,
        status: CampaignStatus.PAUSED,
      });
      rabbit.publish.mockRejectedValue(new Error('Broker unreachable'));

      await expect(service.pause(userId, 'camp-1')).rejects.toThrow(
        BadGatewayException,
      );

      // Verify rollback occurred to restore ACTIVE status
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { status: CampaignStatus.ACTIVE },
      });
    });
  });

  describe('resume', () => {
    it('resumes a PAUSED campaign and dispatches campaign.resumed event', async () => {
      const pausedCampaign = sampleCampaign({
        status: CampaignStatus.PAUSED,
        platformCampaigns: [
          {
            id: 'pc-1',
            uacmCampaignId: 'camp-1',
            platform: Platform.META,
            platformCampaignId: 'meta-123',
            status: CampaignStatus.PAUSED,
          },
        ],
      });
      prisma.uacmCampaign.findFirst.mockResolvedValue(pausedCampaign);
      prisma.uacmCampaign.update.mockResolvedValue({
        ...pausedCampaign,
        status: CampaignStatus.ACTIVE,
      });
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        ...pausedCampaign,
        status: CampaignStatus.ACTIVE,
      });

      const result = await service.resume(userId, 'camp-1');

      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { status: CampaignStatus.ACTIVE },
      });
      expect(prisma.platformCampaign.update).toHaveBeenCalledWith({
        where: { id: 'pc-1' },
        data: { status: CampaignStatus.ACTIVE },
      });
      expect(rabbit.publish).toHaveBeenCalledWith('campaign.resumed', {
        uacmCampaignId: 'camp-1',
        platformCampaignId: 'pc-1',
        platform: Platform.META,
      });
      expect(result.status).toBe(CampaignStatus.ACTIVE);
    });

    it('rejects resuming when campaign is not PAUSED with 400 BadRequestException', async () => {
      const activeCampaign = sampleCampaign({ status: CampaignStatus.ACTIVE });
      prisma.uacmCampaign.findFirst.mockResolvedValue(activeCampaign);

      await expect(service.resume(userId, 'camp-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.uacmCampaign.update).not.toHaveBeenCalled();
    });

    it('rolls back local status and throws BadGatewayException if event publishing fails', async () => {
      const pausedCampaign = sampleCampaign({
        status: CampaignStatus.PAUSED,
        platformCampaigns: [
          {
            id: 'pc-1',
            uacmCampaignId: 'camp-1',
            platform: Platform.META,
            platformCampaignId: 'meta-123',
            status: CampaignStatus.PAUSED,
          },
        ],
      });
      prisma.uacmCampaign.findFirst.mockResolvedValue(pausedCampaign);
      prisma.uacmCampaign.findUnique.mockResolvedValue({
        ...pausedCampaign,
        status: CampaignStatus.ACTIVE,
      });
      rabbit.publish.mockRejectedValue(new Error('Broker unreachable'));

      await expect(service.resume(userId, 'camp-1')).rejects.toThrow(
        BadGatewayException,
      );

      // Verify rollback occurred to restore PAUSED status
      expect(prisma.uacmCampaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { status: CampaignStatus.PAUSED },
      });
    });
  });

  describe('remove', () => {
    it('deletes campaign and returns success message', async () => {
      prisma.uacmCampaign.findFirst.mockResolvedValue(sampleCampaign());
      prisma.uacmCampaign.delete.mockResolvedValue(sampleCampaign());

      const result = await service.remove(userId, 'camp-1');

      expect(prisma.uacmCampaign.delete).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
      });
      expect(result.message).toContain('deleted successfully');
    });

    it('throws NotFoundException when campaign does not exist', async () => {
      prisma.uacmCampaign.findFirst.mockResolvedValue(null);

      await expect(service.remove(userId, 'camp-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getInsights', () => {
    it('aggregates stored metrics and calculates totals', async () => {
      const campaign = sampleCampaign({ status: CampaignStatus.ACTIVE });
      prisma.uacmCampaign.findFirst.mockResolvedValue(campaign);
      prisma.metricLog.findMany.mockResolvedValue([
        {
          platformCampaignId: 'meta-123',
          unifiedMetrics: {
            impressions: 1000,
            clicks: 50,
            spend: 20,
            conversions: 5,
            ctr: 0.05,
            cpc: 0.4,
            roas: 3,
          },
        },
      ]);

      const insights = await service.getInsights(userId, 'camp-1');

      expect(insights.uacmCampaignId).toBe('camp-1');
      expect(insights.total.impressions).toBe(1000);
      expect(insights.total.clicks).toBe(50);
      expect(insights.total.spend).toBe(20);
      expect(insights.total.conversions).toBe(5);
      expect(insights.total.ctr).toBe(0.05);
      expect(insights.total.cpc).toBe(0.4);
      expect(insights.byPlatform[0].platform).toBe(Platform.META);
    });
  });
});
