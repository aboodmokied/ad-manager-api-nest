import { RateLimiterService } from './rate-limiter.service';
import { MockRedis } from '../../redis/__mocks__/mock-redis';

describe('RateLimiterService (Atomic Lua Script)', () => {
  let rateLimiter: RateLimiterService;
  let mockRedis: MockRedis;

  beforeEach(() => {
    mockRedis = new MockRedis();
    const redisService = {
      getClient: () => mockRedis,
    };
    rateLimiter = new RateLimiterService(redisService as any);
  });

  it('allows requests within limit and rejects once limit is reached', async () => {
    const config = { tokensPerInterval: 3, interval: 60000 };

    expect(await rateLimiter.checkRateLimit('user-1', config)).toBe(true);
    expect(await rateLimiter.checkRateLimit('user-1', config)).toBe(true);
    expect(await rateLimiter.checkRateLimit('user-1', config)).toBe(true);

    // 4th request must be rejected
    expect(await rateLimiter.checkRateLimit('user-1', config)).toBe(false);
  });

  it('isolates different keys from each other', async () => {
    const config = { tokensPerInterval: 2, interval: 60000 };

    expect(await rateLimiter.checkRateLimit('key-a', config)).toBe(true);
    expect(await rateLimiter.checkRateLimit('key-a', config)).toBe(true);
    expect(await rateLimiter.checkRateLimit('key-a', config)).toBe(false);

    // key-b should still have its own quota
    expect(await rateLimiter.checkRateLimit('key-b', config)).toBe(true);
    expect(await rateLimiter.checkRateLimit('key-b', config)).toBe(true);
    expect(await rateLimiter.checkRateLimit('key-b', config)).toBe(false);
  });

  it('fails open when redis is not available', async () => {
    const redisService = { getClient: () => null };
    const service = new RateLimiterService(redisService as any);

    expect(await service.checkRateLimit('key', { tokensPerInterval: 1, interval: 1000 })).toBe(true);
    expect(await service.checkRateLimit('key', { tokensPerInterval: 1, interval: 1000 })).toBe(true);
  });
});
