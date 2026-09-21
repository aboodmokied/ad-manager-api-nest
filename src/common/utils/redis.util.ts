import { UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

/**
 * Minimal contract for the Redis client methods used across the auth module.
 * Keeps the rest of the codebase typed without depending on ioredis internals.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode?: 'EX',
    ttlSeconds?: number,
    getMode?: 'NX',
  ): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  zcard(key: string): Promise<number>;
  zadd(key: string, ...args: any[]): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  eval?(script: string, numkeys: number, ...args: any[]): Promise<any>;
}

/**
 * Returns a typed Redis client or throws when unavailable.
 * Eliminates the repeated `const redis: any = this.redisService.getClient(); if (!redis)` pattern.
 */
export function requireRedis(redisService: RedisService): RedisClient {
  const client = redisService.getClient();
  if (!client) {
    throw new UnauthorizedException(
      'Service unavailable: Redis is not connected',
    );
  }
  return client as RedisClient;
}
