import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

export interface ChatMemoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

@Injectable()
export class RedisChatMemoryService {
  private readonly logger = new Logger(RedisChatMemoryService.name);
  private readonly DEFAULT_TTL_SECONDS = 86400 * 7; // 7 days TTL for active memory

  constructor(private readonly redisService: RedisService) {}

  /**
   * Save a message to conversation memory buffer in Redis
   */
  async appendMessage(conversationId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    const key = `ai:memory:${conversationId}`;
    const client = this.redisService.getClient() as any;

    const message: ChatMemoryMessage = {
      role,
      content,
      timestamp: Date.now(),
    };

    if (typeof client.rpush === 'function') {
      await client.rpush(key, JSON.stringify(message));
      await client.expire(key, this.DEFAULT_TTL_SECONDS);
    } else {
      this.logger.debug(`Appending message for conversation ${conversationId} (mock Redis)`);
    }
  }

  /**
   * Get recent message history for conversation
   */
  async getRecentMessages(conversationId: string, limit: number = 10): Promise<ChatMemoryMessage[]> {
    const key = `ai:memory:${conversationId}`;
    const client = this.redisService.getClient() as any;

    if (typeof client.lrange === 'function') {
      const rawList = await client.lrange(key, -limit, -1);
      return rawList.map((item: string) => JSON.parse(item));
    }

    return [];
  }

  /**
   * Clear conversation memory buffer
   */
  async clearMemory(conversationId: string): Promise<void> {
    const key = `ai:memory:${conversationId}`;
    const client = this.redisService.getClient() as any;

    if (typeof client.del === 'function') {
      await client.del(key);
    }
  }
}
