import { RedisClient } from '../../common/utils/redis.util';

/**
 * Mock Redis client for development and testing. Implements the subset of
 * ioredis used by the application so unit tests need no real server.
 */
export class MockRedis implements RedisClient {
  private data: Map<string, { score: number; member: string }[]> = new Map();
  private strings: Map<string, { value: string; expiresAt: number }> =
    new Map();
  private expirations: Map<string, number> = new Map();

  async set(
    key: string,
    value: string,
    mode?: 'EX',
    ttlSeconds?: number,
    getMode?: 'NX',
  ): Promise<'OK' | null> {
    if (getMode === 'NX') {
      const existing = this.strings.get(key);
      if (existing) {
        if (existing.expiresAt && Date.now() > existing.expiresAt) {
          this.strings.delete(key);
        } else {
          return null;
        }
      }
    }
    const expiresAt =
      mode === 'EX' && ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
    this.strings.set(key, { value, expiresAt });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const entry = this.strings.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.strings.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<number> {
    return this.strings.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const entry = this.strings.get(key);
    let current = 0;
    let expiresAt = 0;
    if (entry) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.strings.delete(key);
      } else {
        current = Number(entry.value) || 0;
        expiresAt = entry.expiresAt;
      }
    }
    const next = current + 1;
    this.strings.set(key, {
      value: String(next),
      expiresAt,
    });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.strings.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async zremrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    const members = this.data.get(key) || [];
    const newMembers = members.filter(
      (item) => item.score < min || item.score > max,
    );
    const removed = members.length - newMembers.length;
    this.data.set(key, newMembers);
    return removed;
  }

  async zcard(key: string): Promise<number> {
    return this.data.get(key)?.length || 0;
  }

  async zadd(key: string, ...args: any[]): Promise<number> {
    const members = this.data.get(key) || [];
    for (let i = 0; i < args.length; i += 2) {
      const score = Number(args[i]);
      const member = args[i + 1];
      members.push({ score, member });
    }
    this.data.set(key, members);
    return args.length / 2;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    this.expirations.set(key, Date.now() + milliseconds);
    return 1;
  }

  async eval(script: string, numkeys: number, ...args: any[]): Promise<any> {
    const key = String(args[0]);
    const windowStart = Number(args[1]);
    const now = Number(args[2]);
    const member = String(args[3]);
    const limit = Number(args[4]);
    const intervalMs = Number(args[5]);

    await this.zremrangebyscore(key, 0, windowStart);
    const count = await this.zcard(key);
    if (count >= limit) {
      return 0;
    }
    await this.zadd(key, now, member);
    await this.pexpire(key, intervalMs);
    return 1;
  }

  async quit(): Promise<void> {
    this.data.clear();
    this.expirations.clear();
    this.strings.clear();
  }
}
