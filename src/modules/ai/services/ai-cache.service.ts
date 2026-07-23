import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class AiCacheService {
  private readonly logger = new Logger(AiCacheService.name);
  private readonly DEFAULT_CACHE_TTL = 3600; // 1 hour TTL for campaign analysis cache

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get cached campaign analysis
   */
  async getCachedCampaignAnalysis(campaignId: string): Promise<any | null> {
    const key = `campaign_analysis:${campaignId}`;
    const client = this.redisService.getClient() as any;

    if (typeof client.get === 'function') {
      const data = await client.get(key);
      if (data) {
        this.logger.log(`[AiCacheService] Cache HIT for key: ${key}`);
        return JSON.parse(data);
      }
    }
    return null;
  }

  /**
   * Set cached campaign analysis
   */
  async cacheCampaignAnalysis(campaignId: string, analysisData: any, ttlSeconds: number = this.DEFAULT_CACHE_TTL): Promise<void> {
    const key = `campaign_analysis:${campaignId}`;
    const client = this.redisService.getClient() as any;

    if (typeof client.setex === 'function') {
      await client.setex(key, ttlSeconds, JSON.stringify(analysisData));
    } else if (typeof client.set === 'function') {
      await client.set(key, JSON.stringify(analysisData));
    }
  }

  /**
   * Check rate limits for user AI requests (Sliding Window / Fixed Window limit)
   */
  async checkRateLimit(userId: string, limit: number = 30, windowSeconds: number = 60): Promise<boolean> {
    const key = `ai:ratelimit:${userId}`;
    const client = this.redisService.getClient() as any;

    if (typeof client.incr === 'function') {
      const count = await client.incr(key);
      if (count === 1 && typeof client.expire === 'function') {
        await client.expire(key, windowSeconds);
      }
      return count <= limit;
    }

    return true; // Pass rate limit in dev/mock mode
  }

  /**
   * Store temporary context (e.g., intermediate tool data)
   */
  async storeTempContext(contextId: string, data: any, ttlSeconds: number = 300): Promise<void> {
    const key = `ai:temp:${contextId}`;
    const client = this.redisService.getClient() as any;

    if (typeof client.setex === 'function') {
      await client.setex(key, ttlSeconds, JSON.stringify(data));
    }
  }
}
