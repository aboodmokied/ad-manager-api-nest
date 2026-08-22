import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisClient } from '../common/utils/redis.util';

/**
 * Mock Redis client for development and testing. Implements the subset of
 * ioredis used by the application so unit tests need no real server.
 */
class MockRedis implements RedisClient {
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

  async quit(): Promise<void> {
    this.data.clear();
    this.expirations.clear();
    this.strings.clear();
  }
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClient | null = null;
  private rawClient: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    // Connect to a real Redis whenever a URL is configured (including development,
    // e.g. via docker compose). Fall back to the in-memory mock only in tests,
    // when explicitly requested, or when no URL is provided.
    const useMock =
      nodeEnv === 'test' ||
      this.configService.get<string>('USE_MOCK_REDIS') === 'true' ||
      !redisUrl;

    if (useMock) {
      this.client = new MockRedis();
      console.log(
        'Using mock Redis client (development mode or no REDIS_URL provided)',
      );
    } else {
      this.rawClient = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 200, 2000),
      });
      this.rawClient.on('error', (err) => {
        console.error(
          `[RedisService] Connection error (${redisUrl}): ${err.message}`,
        );
      });
      this.client = this.rawClient;
    }
  }

  async onModuleDestroy() {
    if (this.rawClient) {
      await this.rawClient.quit();
    }
  }

  getClient(): RedisClient | null {
    return this.client;
  }
}
