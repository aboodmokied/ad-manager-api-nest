import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

// Mock Prisma client for development mode fallback
class MockPrisma {
  private uacmCampaigns: any[] = [];
  private platformCampaigns: any[] = [];
  private connectedAccounts: any[] = [];
  private idempotencyRecords: any[] = [];
  private aiRecommendations: any[] = [];
  private aiAnalyses: any[] = [];
  private aiConversations: any[] = [];
  private aiMessages: any[] = [];
  private aiUsages: any[] = [];
  private vectorDocuments: any[] = [];

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

      if (args.include?.platformCampaigns && args.data.platformCampaigns?.create) {
        const platformCamps = args.data.platformCampaigns.create.map((config: any) => {
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
        });
        return { ...campaign, platformCampaigns: platformCamps };
      }
      return campaign;
    },
    findUnique: async (args: any) => {
      return this.uacmCampaigns.find((c) => c.id === args.where.id) || null;
    },
  };

  platformCampaign = {
    findUnique: async (args: any) => {
      const pc = this.platformCampaigns.find((c) => c.id === args.where.id) || null;
      if (pc && args.include?.uacmCampaign) {
        const uacm = this.uacmCampaigns.find((c) => c.id === pc.uacmCampaignId);
        return { ...pc, uacmCampaign: uacm };
      }
      return pc;
    },
    update: async (args: any) => {
      const idx = this.platformCampaigns.findIndex((c) => c.id === args.where.id);
      if (idx !== -1) {
        this.platformCampaigns[idx] = { ...this.platformCampaigns[idx], ...args.data, updatedAt: new Date() };
        return this.platformCampaigns[idx];
      }
      throw new Error('Platform campaign not found');
    },
  };

  connectedAccount = {
    findFirst: async (args: any) => {
      return this.connectedAccounts.find((acc) => acc.userId === args.where.userId && acc.platform === args.where.platform) || null;
    },
  };

  idempotencyRecord = {
    findUnique: async (args: any) => {
      return this.idempotencyRecords.find((r) => r.id === args.where.id) || null;
    },
    create: async (args: any) => {
      const record = { id: args.data.id, processedAt: new Date() };
      this.idempotencyRecords.push(record);
      return record;
    },
  };

  aIRecommendation = {
    create: async (args: any) => {
      const rec = { id: `rec-${Date.now()}-${Math.random()}`, createdAt: new Date(), ...args.data };
      this.aiRecommendations.push(rec);
      return rec;
    },
    findMany: async (args: any) => {
      return this.aiRecommendations.filter((r) => r.campaignId === args.where.campaignId);
    },
  };

  aIAnalysis = {
    create: async (args: any) => {
      const analysis = { id: `analysis-${Date.now()}`, createdAt: new Date(), ...args.data };
      this.aiAnalyses.push(analysis);
      return analysis;
    },
  };

  aIConversation = {
    create: async (args: any) => {
      const conv = { id: `conv-${Date.now()}`, createdAt: new Date(), updatedAt: new Date(), ...args.data, messages: [] };
      this.aiConversations.push(conv);
      return conv;
    },
    findUnique: async (args: any) => {
      const conv = this.aiConversations.find((c) => c.id === args.where.id);
      if (!conv) return null;
      const msgs = this.aiMessages.filter((m) => m.conversationId === conv.id);
      return { ...conv, messages: msgs };
    },
  };

  aIMessage = {
    create: async (args: any) => {
      const msg = { id: `msg-${Date.now()}`, createdAt: new Date(), ...args.data };
      this.aiMessages.push(msg);
      return msg;
    },
  };

  aIUsage = {
    create: async (args: any) => {
      const usage = { id: `usage-${Date.now()}`, createdAt: new Date(), ...args.data };
      this.aiUsages.push(usage);
      return usage;
    },
  };

  vectorDocument = {
    create: async (args: any) => {
      const doc = { id: `vec-${Date.now()}`, createdAt: new Date(), ...args.data };
      this.vectorDocuments.push(doc);
      return doc;
    },
  };

  async $executeRawUnsafe(...args: any[]) {
    return 1;
  }

  async $queryRawUnsafe(...args: any[]) {
    return [];
  }

  async $connect() {}
  async $disconnect() {}
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client: PrismaClient | MockPrisma;
  private useMock = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const useMock = this.configService.get<string>('NODE_ENV') === 'development' || !this.configService.get<string>('DATABASE_URL');
    if (useMock) {
      this.useMock = true;
      this.client = new MockPrisma();
      console.log('Using mock Prisma client (development mode or no DATABASE_URL provided)');
    } else {
      this.client = new PrismaClient();
      await (this.client as PrismaClient).$connect();
    }
  }

  async onModuleDestroy() {
    if (!this.useMock) {
      await (this.client as PrismaClient).$disconnect();
    }
  }

  get uacmCampaign() {
    return (this.client as any).uacmCampaign;
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

  get aIRecommendation() {
    return (this.client as any).aIRecommendation;
  }

  get aIAnalysis() {
    return (this.client as any).aIAnalysis;
  }

  get aIConversation() {
    return (this.client as any).aIConversation;
  }

  get aIMessage() {
    return (this.client as any).aIMessage;
  }

  get aIUsage() {
    return (this.client as any).aIUsage;
  }

  get vectorDocument() {
    return (this.client as any).vectorDocument;
  }

  async $executeRawUnsafe(query: string, ...values: any[]) {
    return (this.client as any).$executeRawUnsafe(query, ...values);
  }

  async $queryRawUnsafe(query: string, ...values: any[]) {
    return (this.client as any).$queryRawUnsafe(query, ...values);
  }
}
