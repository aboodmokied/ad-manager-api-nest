import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface RateLimitConfig {
  tokensPerInterval: number;
  interval: number; // in milliseconds
}

@Injectable()
export class RateLimiterService {
  private readonly redis: any;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getClient();
  }

  async checkRateLimit(key: string, config: RateLimitConfig): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - config.interval;

    // Use a sorted set to track requests in the current window
    const keyName = `rate-limit:${key}`;

    // Remove old entries
    await this.redis.zremrangebyscore(keyName, 0, windowStart);

    // Count current entries
    const currentCount = await this.redis.zcard(keyName);

    if (currentCount >= config.tokensPerInterval) {
      return false;
    }

    // Add new entry
    await this.redis.zadd(keyName, now, `${now}-${Math.random()}`);
    await this.redis.pexpire(keyName, config.interval);

    return true;
  }
}
