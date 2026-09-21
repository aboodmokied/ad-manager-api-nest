import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './services/campaigns.service';
import { CampaignStatus, Platform } from '@prisma/client';
import { TokenPayload } from '../auth/interfaces/auth.interfaces';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { of } from 'rxjs';

describe('CampaignsController', () => {
  let controller: CampaignsController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    pause: jest.Mock;
    resume: jest.Mock;
    remove: jest.Mock;
    getEventStream: jest.Mock;
  };

  const mockUser: TokenPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    type: 'access',
    jti: 'jwt-123',
  };

  const sampleCampaign = {
    id: 'camp-123',
    userId: 'user-123',
    name: 'Q3 Promo',
    budget: 500,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-31'),
    status: CampaignStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    platformCampaigns: [],
  };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue(sampleCampaign),
      findAll: jest.fn().mockResolvedValue({
        items: [sampleCampaign],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
      findOne: jest.fn().mockResolvedValue(sampleCampaign),
      getInsights: jest.fn().mockResolvedValue({
        uacmCampaignId: 'camp-123',
        name: 'Q3 Promo',
        status: CampaignStatus.PENDING,
        total: {
          impressions: 1000,
          clicks: 50,
          spend: 25,
          conversions: 5,
          ctr: 0.05,
          cpc: 0.5,
        },
        byPlatform: [],
        fetchedAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue({ ...sampleCampaign, name: 'Updated' }),
      pause: jest.fn().mockResolvedValue({ ...sampleCampaign, status: CampaignStatus.PAUSED }),
      resume: jest.fn().mockResolvedValue({ ...sampleCampaign, status: CampaignStatus.ACTIVE }),
      remove: jest.fn().mockResolvedValue({ message: 'Campaign deleted successfully' }),
      getEventStream: jest.fn().mockReturnValue(of({ type: 'campaign.created', data: {} })),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [{ provide: CampaignsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CampaignsController>(CampaignsController);
  });

  it('delegates create to service', async () => {
    const dto = {
      name: 'Q3 Promo',
      budget: 500,
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-07-31T00:00:00.000Z',
      platforms: [{ platform: Platform.META, platformSpecificData: {} }],
    };

    const result = await controller.create(dto, mockUser, 'key-123');

    expect(service.create).toHaveBeenCalledWith('user-123', dto, 'key-123');
    expect(result.id).toBe('camp-123');
  });

  it('delegates streamEvents to service', () => {
    const stream = controller.streamEvents(mockUser);
    expect(service.getEventStream).toHaveBeenCalledWith('user-123');
    expect(stream).toBeDefined();
  });

  it('delegates findAll to service with query params', async () => {
    const query = { page: 1, limit: 10, sortBy: 'createdAt' as const, sortOrder: 'desc' as const };
    const result = await controller.findAll(query, mockUser);

    expect(service.findAll).toHaveBeenCalledWith('user-123', query);
    expect(result.total).toBe(1);
  });

  it('delegates findOne to service', async () => {
    const result = await controller.findOne('camp-123', mockUser);
    expect(service.findOne).toHaveBeenCalledWith('user-123', 'camp-123');
    expect(result.id).toBe('camp-123');
  });

  it('delegates getInsights to service', async () => {
    const result = await controller.getInsights('camp-123', mockUser);
    expect(service.getInsights).toHaveBeenCalledWith('user-123', 'camp-123');
    expect(result.uacmCampaignId).toBe('camp-123');
    expect(result.total.impressions).toBe(1000);
  });

  it('delegates update to service', async () => {
    const result = await controller.update('camp-123', { name: 'Updated' }, mockUser);
    expect(service.update).toHaveBeenCalledWith('user-123', 'camp-123', { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('delegates pause to service', async () => {
    const result = await controller.pause('camp-123', mockUser);
    expect(service.pause).toHaveBeenCalledWith('user-123', 'camp-123');
    expect(result.status).toBe(CampaignStatus.PAUSED);
  });

  it('delegates resume to service', async () => {
    const result = await controller.resume('camp-123', mockUser);
    expect(service.resume).toHaveBeenCalledWith('user-123', 'camp-123');
    expect(result.status).toBe(CampaignStatus.ACTIVE);
  });

  it('delegates remove to service', async () => {
    const result = await controller.remove('camp-123', mockUser);
    expect(service.remove).toHaveBeenCalledWith('user-123', 'camp-123');
    expect(result.message).toBe('Campaign deleted successfully');
  });
});
