import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { requireRedis } from '../../common/utils/redis.util';
import {
  ACCOUNT_STATE_KEY_PREFIX,
  OAUTH_STATE_TTL_SECONDS,
} from '../constants/accounts.constants';
import { OAuthStatePayload } from '../interfaces/accounts.interfaces';

/**
 * Issues and verifies the CSRF `state` token of the OAuth flow.
 *
 * Every authorization URL embeds a random state string whose expanded
 * payload (user, platform, tenant, redirect targets) is kept in Redis with a
 * short TTL. The callback only trusts states it can consume from Redis,
 * which prevents forgery and replay of callback links.
 */
@Injectable()
export class OAuthStateService {
  constructor(private readonly redisService: RedisService) {}

  /** Creates a state token bound to the given payload and returns it. */
  async create(payload: OAuthStatePayload): Promise<string> {
    const state = randomUUID();
    const redis = requireRedis(this.redisService);
    await redis.set(
      ACCOUNT_STATE_KEY_PREFIX + state,
      JSON.stringify(payload),
      'EX',
      OAUTH_STATE_TTL_SECONDS,
    );
    return state;
  }

  /**
   * Validates and consumes a state token. Throws UnauthorizedException when
   * the token is unknown, expired or was already used.
   */
  async consume(state: string): Promise<OAuthStatePayload> {
    const redis = requireRedis(this.redisService);
    const raw = await redis.get(ACCOUNT_STATE_KEY_PREFIX + state);
    if (!raw) {
      throw new UnauthorizedException(
        'The OAuth state is invalid or expired. Please start the linking process again.',
      );
    }
    await redis.del(ACCOUNT_STATE_KEY_PREFIX + state);

    try {
      return JSON.parse(raw) as OAuthStatePayload;
    } catch {
      throw new UnauthorizedException('The OAuth state payload is corrupt.');
    }
  }
}
