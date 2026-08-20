import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

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
}
