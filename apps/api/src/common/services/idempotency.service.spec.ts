import { IdempotencyService } from './idempotency.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('IdempotencyService with MockPrisma', () => {
  let idempotencyService: IdempotencyService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    prismaService = new PrismaService({
      get: () => 'true', // force mock prisma
    } as any);
    await prismaService.onModuleInit();
    idempotencyService = new IdempotencyService(prismaService);
  });

  it('marks key as processed on first call and detects duplicate on second call', async () => {
    const key = 'idem-test-1';
    expect(await idempotencyService.isProcessed(key)).toBe(false);
    expect(await idempotencyService.checkAndMarkProcessed(key)).toBe(false);
    expect(await idempotencyService.isProcessed(key)).toBe(true);
    expect(await idempotencyService.checkAndMarkProcessed(key)).toBe(true);
  });

  it('removes reservation using deleteMany by id', async () => {
    const key = 'idem-test-remove';
    await idempotencyService.checkAndMarkProcessed(key);
    expect(await idempotencyService.isProcessed(key)).toBe(true);

    await idempotencyService.remove(key);
    expect(await idempotencyService.isProcessed(key)).toBe(false);
  });

  it('cleans up stale records older than given cutoff using deleteMany', async () => {
    const freshKey = 'fresh-record';
    const oldKey = 'old-record';

    await idempotencyService.checkAndMarkProcessed(freshKey);
    await idempotencyService.checkAndMarkProcessed(oldKey);

    // Manually age the old record
    const records = (prismaService as any).client.idempotencyRecords;
    const oldRecord = records.find((r: any) => r.id === oldKey);
    if (oldRecord) {
      oldRecord.processedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    }

    const deletedCount = await idempotencyService.cleanup(7);
    expect(deletedCount).toBe(1);

    expect(await idempotencyService.isProcessed(oldKey)).toBe(false);
    expect(await idempotencyService.isProcessed(freshKey)).toBe(true);
  });
});
