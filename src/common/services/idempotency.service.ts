import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only check: was the key already processed?
   * Unlike checkAndMarkProcessed this never creates the record, so a failed
   * attempt is retried instead of being skipped on its next delivery.
   */
  async isProcessed(idempotencyKey: string): Promise<boolean> {
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { id: idempotencyKey },
    });
    return existing !== null;
  }

  /** Removes a reservation (used when the operation it guarded failed). */
  async remove(idempotencyKey: string): Promise<void> {
    await this.prisma.idempotencyRecord.deleteMany({
      where: { id: idempotencyKey },
    });
  }

  async checkAndMarkProcessed(idempotencyKey: string): Promise<boolean> {
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { id: idempotencyKey },
    });
    if (existing) {
      return true;
    }

    try {
      await this.prisma.idempotencyRecord.create({
        data: { id: idempotencyKey },
      });
      return false;
    } catch (e) {
      // If another process creates it in parallel, we might get a unique constraint error
      // which means it's already processed
      return true;
    }
  }

  /**
   * Cleans up idempotency records older than the given number of days (default: 7).
   */
  async cleanup(days: number = 7): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.prisma.idempotencyRecord.deleteMany({
      where: {
        processedAt: {
          lt: cutoff,
        },
      },
    });
    return result.count;
  }
}
