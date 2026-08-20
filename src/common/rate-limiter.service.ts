import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface RateLimitConfig {
  tokensPerInterval: number;
  interval: number; // in milliseconds
}

@Injectable()
export class RateLimiterService {
  constructor(private readonly redisService: RedisService) {}

  async checkRateLimit(key: string, config: RateLimitConfig): Promise<boolean> {
    const redis = this.redisService.getClient();
    if (!redis) {
      // Fail open when no store is available (e.g. mock/development mode)
      return true;
    }

    const now = Date.now();
    const windowStart = now - config.interval;

    // Use a sorted set to track requests in the current window
    const keyName = `rate-limit:${key}`;

    // Remove old entries
    await redis.zremrangebyscore(keyName, 0, windowStart);

    // Count current entries
    const currentCount = await redis.zcard(keyName);

    if (currentCount >= config.tokensPerInterval) {
      return false;
    }

    // Add new entry
    await redis.zadd(keyName, now, `${now}-${Math.random()}`);
    await redis.pexpire(keyName, config.interval);

    return true;
  }
}
