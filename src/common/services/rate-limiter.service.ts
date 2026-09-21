import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface RateLimitConfig {
  tokensPerInterval: number;
  interval: number; // in milliseconds
}

/**
 * Atomic sliding-window rate limiting Lua script.
 * Removes expired tokens, checks current count against limit, and if permitted,
 * inserts the new token and updates TTL in a single atomic transaction.
 */
const RATE_LIMIT_LUA_SCRIPT = `
local key = KEYS[1]
local windowStart = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local member = ARGV[3]
local limit = tonumber(ARGV[4])
local intervalMs = tonumber(ARGV[5])

redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
local currentCount = redis.call('ZCARD', key)

if currentCount >= limit then
  return 0
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, intervalMs)
return 1
`;

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
    const keyName = `rate-limit:${key}`;
    const member = `${now}-${Math.random()}`;

    // Execute atomically via Lua script to prevent concurrent race conditions
    if (typeof redis.eval === 'function') {
      const result = await redis.eval(
        RATE_LIMIT_LUA_SCRIPT,
        1,
        keyName,
        windowStart,
        now,
        member,
        config.tokensPerInterval,
        config.interval,
      );
      return result === 1 || result === '1';
    }

    // Fallback if eval is not present
    await redis.zremrangebyscore(keyName, 0, windowStart);
    const currentCount = await redis.zcard(keyName);
    if (currentCount >= config.tokensPerInterval) {
      return false;
    }
    await redis.zadd(keyName, now, member);
    await redis.pexpire(keyName, config.interval);

    return true;
  }
}
