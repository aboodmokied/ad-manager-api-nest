import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

// Mock Prisma client for development
class MockPrisma {
  private users: any[] = [];
  private uacmCampaigns: any[] = [];
  private platformCampaigns: any[] = [];
  private connectedAccounts: any[] = [];
  private idempotencyRecords: any[] = [];
  private refreshTokens: any[] = [];
  private metricLogs: any[] = [];

  user = {
    findUnique: async (args: any) => {
      const users = this.users.filter((u) => u.id === args.where.id);
      if (args.where.email) {
        return this.users.find((u) => u.email === args.where.email) || null;
      }
      return users[0] || null;
    },
    create: async (args: any) => {
      const existing = this.users.find((u) => u.email === args.data.email);
      if (existing) {
        throw new Error('Unique constraint failed on the fields: (`email`)');
      }
      const now = new Date();
      const user = {
        id: `user-${Date.now()}`,
        name: args.data.name,
        email: args.data.email,
        passwordHash: args.data.passwordHash,
        twoFactorEnabled: args.data.twoFactorEnabled ?? false,
        twoFactorSecret: args.data.twoFactorSecret ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(user);
      return user;
    },
    update: async (args: any) => {
      const idx = this.users.findIndex((u) => u.id === args.where.id);
      if (idx === -1) {
        throw new Error('User not found');
      }
      this.users[idx] = {
        ...this.users[idx],
        ...args.data,
        updatedAt: new Date(),
      };
      return this.users[idx];
    },
  };

  refreshToken = {
    findUnique: async (args: any) => {
      const record = this.refreshTokens.find(
        (r) => r.tokenHash === args.where.tokenHash,
      );
      return record || null;
    },
    create: async (args: any) => {
      const record = {
        id: `refresh-token-${Date.now()}-${Math.random()}`,
        userId: args.data.userId,
        tokenHash: args.data.tokenHash,
        expiresAt: args.data.expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      };
      this.refreshTokens.push(record);
      return record;
    },
    update: async (args: any) => {
      const record = this.refreshTokens.find(
        (r) => r.tokenHash === args.where.tokenHash,
      );
      if (!record) {
        throw new Error('Refresh token not found');
      }
      Object.assign(record, args.data);
      return record;
    },
    updateMany: async (args: any) => {
      let count = 0;
      for (const record of this.refreshTokens) {
        const matchesWhere = Object.entries(args.where).every(
          ([key, value]) => record[key] === value,
        );
        if (matchesWhere) {
          Object.assign(record, args.data);
          count++;
        }
      }
      return { count };
    },
  };

  uacmCampaign = {
    create: async (args: any) => {
      const id = `uacm-campaign-${Date.now()}`;
      const now = new Date();
      const campaign = {
        id,
        userId: args.data.userId,
        name: args.data.name,
        status: args.data.status,
        budget: args.data.budget,
        startDate: args.data.startDate,
        endDate: args.data.endDate,
        createdAt: now,
        updatedAt: now,
      };
      this.uacmCampaigns.push(campaign);

      if (
        args.include?.platformCampaigns &&
        args.data.platformCampaigns?.create
      ) {
        const platformCamps = args.data.platformCampaigns.create.map(
          (config: any) => {
            const pcId = `platform-campaign-${Date.now()}-${Math.random()}`;
            const pc = {
              id: pcId,
              uacmCampaignId: id,
              platform: config.platform,
              platformCampaignId: null,
              platformData: config.platformData,
              status: config.status,
              createdAt: now,
              updatedAt: now,
            };
            this.platformCampaigns.push(pc);
            return pc;
          },
        );
        return { ...campaign, platformCampaigns: platformCamps };
      }
      return campaign;
    },
    findFirst: async (args: any) => {
      const campaign =
        this.uacmCampaigns.find(
          (c) =>
            (args.where.id === undefined || c.id === args.where.id) &&
            (args.where.userId === undefined || c.userId === args.where.userId),
        ) || null;
      if (campaign && args.include?.platformCampaigns) {
        return {
          ...campaign,
          platformCampaigns: this.platformCampaigns.filter(
            (pc) => pc.uacmCampaignId === campaign.id,
          ),
        };
      }
      return campaign;
    },
    findMany: async (args: any = {}) => {
      let rows = this.uacmCampaigns.filter(
        (c) =>
          (args.where?.userId === undefined ||
            c.userId === args.where.userId) &&
          (args.where?.status === undefined || c.status === args.where.status),
      );
      const [field, direction] = Object.entries(args.orderBy ?? {
        createdAt: 'desc',
      })[0] as [string, string];
      rows = [...rows].sort((a, b) =>
        direction === 'asc'
          ? a[field] > b[field]
            ? 1
            : -1
          : a[field] < b[field]
            ? 1
            : -1,
      );
      const skip = args.skip ?? 0;
      rows = rows.slice(skip, args.take === undefined ? undefined : skip + args.take);
      if (args.include?.platformCampaigns) {
        return rows.map((c) => ({
          ...c,
          platformCampaigns: this.platformCampaigns.filter(
            (pc) => pc.uacmCampaignId === c.id,
          ),
        }));
      }
      return rows;
    },
    count: async (args: any = {}) =>
      this.uacmCampaigns.filter(
        (c) =>
          (args.where?.userId === undefined ||
            c.userId === args.where.userId) &&
          (args.where?.status === undefined || c.status === args.where.status),
      ).length,
    delete: async (args: any) => {
      const idx = this.uacmCampaigns.findIndex((c) => c.id === args.where.id);
      if (idx === -1) {
        throw new Error('Campaign not found');
      }
      const [removed] = this.uacmCampaigns.splice(idx, 1);
      this.platformCampaigns = this.platformCampaigns.filter(
        (pc) => pc.uacmCampaignId !== removed.id,
      );
      return removed;
    },
    update: async (args: any) => {
      const idx = this.uacmCampaigns.findIndex((c) => c.id === args.where.id);
      if (idx !== -1) {
        this.uacmCampaigns[idx] = {
          ...this.uacmCampaigns[idx],
          ...args.data,
          updatedAt: new Date(),
        };
        const campaign = this.uacmCampaigns[idx];
        if (args.include?.platformCampaigns) {
          const platformCampaigns = this.platformCampaigns.filter(
            (pc) => pc.uacmCampaignId === campaign.id,
          );
          return { ...campaign, platformCampaigns };
        }
        return campaign;
      }
      throw new Error('Campaign not found');
    },
    findUnique: async (args: any) => {
      const campaign =
        this.uacmCampaigns.find((c) => c.id === args.where.id) || null;
      if (campaign && args.include?.platformCampaigns) {
        const platformCampaigns = this.platformCampaigns.filter(
          (pc) => pc.uacmCampaignId === campaign.id,
        );
        return { ...campaign, platformCampaigns };
      }
      return campaign;
    },
  };

  platformCampaign = {
    findMany: async (args?: any) => {
      let list = [...this.platformCampaigns];
      if (args?.where?.status) {
        list = list.filter((pc) => pc.status === args.where.status);
      }
      if (args?.where?.uacmCampaignId) {
        list = list.filter((pc) => pc.uacmCampaignId === args.where.uacmCampaignId);
      }
      if (args?.take) {
        list = list.slice(0, args.take);
      }
      return list;
    },
    findUnique: async (args: any) => {
      const pc =
        this.platformCampaigns.find((c) => c.id === args.where.id) || null;
      if (pc && args.include?.uacmCampaign) {
        const uacm = this.uacmCampaigns.find((c) => c.id === pc.uacmCampaignId);
        return { ...pc, uacmCampaign: uacm };
      }
      return pc;
    },
    update: async (args: any) => {
      const idx = this.platformCampaigns.findIndex(
        (c) => c.id === args.where.id,
      );
      if (idx !== -1) {
        this.platformCampaigns[idx] = {
          ...this.platformCampaigns[idx],
          ...args.data,
          updatedAt: new Date(),
        };
        return this.platformCampaigns[idx];
      }
      throw new Error('Platform campaign not found');
    },
  };

  connectedAccount = {
    findFirst: async (args: any) => {
      return (
        this.connectedAccounts.find(
          (acc) =>
            acc.userId === args.where.userId &&
            acc.platform === args.where.platform,
        ) || null
      );
    },
  };

  idempotencyRecord = {
    findUnique: async (args: any) => {
      return (
        this.idempotencyRecords.find((r) => r.id === args.where.id) || null
      );
    },
    create: async (args: any) => {
      const record = { id: args.data.id, processedAt: new Date() };
      this.idempotencyRecords.push(record);
      return record;
    },
    deleteMany: async (args: any = {}) => {
      const initialCount = this.idempotencyRecords.length;
      this.idempotencyRecords = this.idempotencyRecords.filter((r) => {
        if (args.where?.id !== undefined && r.id === args.where.id) {
          return false;
        }
        if (
          args.where?.processedAt?.lt !== undefined &&
          r.processedAt < args.where.processedAt.lt
        ) {
          return false;
        }
        return true;
      });
      return { count: initialCount - this.idempotencyRecords.length };
    },
  };

  metricLog = {
    findMany: async (args: any) => {
      if (args?.where?.uacmCampaignId) {
        return this.metricLogs.filter(
          (m) => m.uacmCampaignId === args.where.uacmCampaignId,
        );
      }
      return this.metricLogs;
    },
    create: async (args: any) => {
      const record = {
        id: `metric-${Date.now()}-${Math.random()}`,
        ...args.data,
        createdAt: new Date(),
      };
      this.metricLogs.push(record);
      return record;
    },
  };

  async $connect() { }
  async $disconnect() { }

  async $transaction<T>(
    fn: ((tx: any) => Promise<T>) | any[],
    _options?: any,
  ): Promise<T> {
    if (typeof fn === 'function') {
      return fn(this);
    }
    return Promise.all(fn) as any;
  }
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client: PrismaClient | MockPrisma;
  private useMock = false;

  constructor(private readonly configService: ConfigService) { }

  async onModuleInit() {
    // Use the real database whenever a DATABASE_URL is configured.
    // The in-memory mock is only used when explicitly requested via
    // USE_MOCK_PRISMA=true or when no DATABASE_URL is provided.
    const useMock =
      this.configService.get<string>('USE_MOCK_PRISMA') === 'true' ||
      !this.configService.get<string>('DATABASE_URL');
    if (useMock) {
      this.useMock = true;
      this.client = new MockPrisma();
      console.log(
        'Using mock Prisma client (USE_MOCK_PRISMA=true or no DATABASE_URL provided)',
      );
    } else {
      this.client = new PrismaClient();
      await this.client.$connect();
    }
  }

  async onModuleDestroy() {
    if (!this.useMock) {
      await (this.client as PrismaClient).$disconnect();
    }
  }

  async $transaction<T>(
    fn: ((tx: any) => Promise<T>) | any[],
    options?: any,
  ): Promise<T> {
    if (this.useMock) {
      return (this.client as MockPrisma).$transaction(fn as any);
    }
    return (this.client as any).$transaction(fn, options);
  }

  get uacmCampaign() {
    return (this.client as any).uacmCampaign;
  }

  get user() {
    return (this.client as any).user;
  }

  get refreshToken() {
    return (this.client as any).refreshToken;
  }

  get platformCampaign() {
    return (this.client as any).platformCampaign;
  }

  get connectedAccount() {
    return (this.client as any).connectedAccount;
  }

  get idempotencyRecord() {
    return (this.client as any).idempotencyRecord;
  }

  get metricLog() {
    return (this.client as any).metricLog;
  }
}
