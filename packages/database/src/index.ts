import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { PrismaClient };

export class PrismaService extends PrismaClient {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
