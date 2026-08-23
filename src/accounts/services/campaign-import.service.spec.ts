import { Test, TestingModule } from '@nestjs/testing';
import { CampaignStatus, Platform } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CampaignImportInput,
  CampaignImportService,
} from './campaign-import.service';

describe('CampaignImportService', () => {
  let service: CampaignImportService;
  const platformCampaignFindFirst = jest.fn();
  const platformCampaignUpdate = jest.fn();
  const platformCampaignCreate = jest.fn();
  const uacmCampaignCreate = jest.fn();

  const input = (): CampaignImportInput => ({
    userId: 'user-1',
    platform: Platform.META,
    tenantId: 'tenant-1',
    platformAccountId: 'act_111',
    campaigns: [
      {
        externalId: 'c1',
        name: 'Spring sale',
        externalStatus: 'ACTIVE',
        budget: 100,
        startDate: new Date('2026-03-01T00:00:00Z'),
        endDate: new Date('2026-03-31T00:00:00Z'),
        raw: { id: 'c1' },
      },
      {
        externalId: 'c2',
        name: 'Big spend',
        externalStatus: 'PAUSED',
        budget: 999_999_999_999,
        raw: { id: 'c2' },
      },
      { externalId: '', name: 'Dropped', externalStatus: 'ACTIVE', raw: {} },
    ],
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    uacmCampaignCreate.mockImplementation(async ({ data }) => ({
      id: `uacm-${data.name}`,
      ...data,
    }));
    platformCampaignCreate.mockResolvedValue({ id: 'pc-new' });
    platformCampaignUpdate.mockResolvedValue({ id: 'pc-existing' });
    platformCampaignFindFirst.mockResolvedValue(null);

    const prisma = {
      platformCampaign: {
        findFirst: platformCampaignFindFirst,
        update: platformCampaignUpdate,
        create: platformCampaignCreate,
      },
      uacmCampaign: { create: uacmCampaignCreate },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignImportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CampaignImportService);
  });

  it('creates UACM campaigns plus platform campaigns with import metadata', async () => {
    const result = await service.importCampaigns(input());
    expect(result).toEqual({ imported: 2, updated: 0, failed: 1 });

    expect(uacmCampaignCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'Spring sale',
        status: CampaignStatus.ACTIVE,
        budget: 100,
      }),
    });
    expect(platformCampaignCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform: Platform.META,
        platformCampaignId: 'c1',
        status: CampaignStatus.ACTIVE,
        platformData: expect.objectContaining({
          imported: true,
          tenantId: 'tenant-1',
          platformAccountId: 'act_111',
          externalStatus: 'ACTIVE',
        }),
      }),
    });
  });

  it('clamps oversized budgets to the column range and maps PAUSED status', async () => {
    await service.importCampaigns(input());
    const calls = uacmCampaignCreate.mock.calls;
    const bigSpend = calls.find(([args]) => args.data.name === 'Big spend');
    expect(bigSpend[0].data.budget).toBeLessThanOrEqual(99_999_999.99);
    expect(bigSpend[0].data.status).toBe(CampaignStatus.PAUSED);
  });

  it('updates an existing campaign instead of duplicating it', async () => {
    const existing = {
      id: 'pc-existing-id',
      platformCampaignId: 'c1',
      uacmCampaign: { id: 'uacm-existing' },
    };
    platformCampaignFindFirst.mockImplementation(async ({ where }) =>
      where.platformCampaignId === 'c1' ? existing : null,
    );

    const result = await service.importCampaigns(input());
    expect(result).toEqual({ imported: 1, updated: 1, failed: 1 });
    expect(platformCampaignUpdate).toHaveBeenCalledWith({
      where: { id: 'pc-existing-id' },
      data: expect.objectContaining({
        status: CampaignStatus.ACTIVE,
        platformData: expect.objectContaining({ importedVia: 'oauth' }),
      }),
    });
    expect(uacmCampaignCreate).toHaveBeenCalledTimes(1);
  });

  it('scopes the existing-row lookup to the importing user (no cross-tenant updates)', async () => {
    await service.importCampaigns(input());
    expect(platformCampaignFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          platform: Platform.META,
          platformCampaignId: 'c1',
          uacmCampaign: { userId: 'user-1' },
        }),
      }),
    );
  });

  it('defaults missing dates and budgets safely', async () => {
    const minimal = {
      ...input(),
      campaigns: [
        {
          externalId: 'c9',
          name: 'Minimal',
          externalStatus: 'ACTIVE',
          raw: {},
        },
      ],
    };
    const result = await service.importCampaigns(minimal);
    expect(result.failed).toBe(0);
    const args = uacmCampaignCreate.mock.calls[0][0];
    expect(args.data.budget).toBe(0);
    expect(args.data.startDate).toBeInstanceOf(Date);
    expect(args.data.endDate).toBeInstanceOf(Date);
    expect(
      args.data.endDate.getTime() - args.data.startDate.getTime(),
    ).toBeGreaterThan(0);
  });
});
