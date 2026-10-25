import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { RedisClient } from '../utils/redis.util';
import {
  THROTTLE_METADATA,
  ThrottleOptions,
} from '../decorators/throttle.decorator';

/**
 * Guard that enforces per-client request limits on decorated endpoints.
 * Uses Redis when available (shared across instances) and falls back to an
 * in-memory store otherwise (single-instance/dev mode).
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  /** In-memory fallback store used when no Redis client is available */
  private readonly fallback = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options: ThrottleOptions | undefined = Reflect.getMetadata(
      THROTTLE_METADATA,
      context.getHandler(),
    );
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip =
      request.ip ??
      request.socket?.remoteAddress ??
      request.connection?.remoteAddress ??
      'unknown';
    const key = `auth-throttle:${ip}:${request.method}:${request.url}`;

    const allowed = await this.tryIncrement(
      key,
      options.limit,
      options.windowMs,
    );
    if (!allowed) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private async tryIncrement(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const client: RedisClient | null = this.redisService.getClient();
    if (client) {
      const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));

      // Atomic increment — INCR creates the key with value 1 if it does not exist.
      const count = await client.incr(key);

      // Set expiry only on the first request in the window to avoid resetting
      // the TTL on every request.
      if (count === 1) {
        await client.expire(key, ttlSeconds);
      }

      return count <= limit;
    }

    // In-memory fallback (single instance / before Redis init)
    const now = Date.now();
    const entry = this.fallback.get(key);
    if (!entry || entry.resetAt <= now) {
      this.fallback.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= limit) {
      return false;
    }
    entry.count++;
    return true;
  }
}
