import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { RedisService } from '../../redis/redis.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthStatePayload } from '../interfaces/accounts.interfaces';

/** Minimal in-memory Redis for tests. */
class FakeRedis {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(
    key: string,
    value: string,
    _mode?: 'EX',
    ttlSeconds?: number,
  ): Promise<string> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
    });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

describe('OAuthStateService', () => {
  let service: OAuthStateService;
  let fakeRedis: FakeRedis;
  let redisService: { getClient: jest.Mock };

  const payload: OAuthStatePayload = {
    userId: 'user-1',
    email: 'marketer@example.com',
    platform: Platform.META,
    tenantId: 'tenant-1',
    adAccountId: 'act_123',
  };

  beforeEach(async () => {
    fakeRedis = new FakeRedis();
    redisService = { getClient: jest.fn(() => fakeRedis) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthStateService,
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();
    service = module.get(OAuthStateService);
  });

  it('stores the payload and returns a random state token', async () => {
    const state = await service.create(payload);
    expect(state).toBeDefined();
    expect(state.length).toBeGreaterThan(10);
    const raw = await fakeRedis.get(`ad-oauth:state:${state}`);
    expect(JSON.parse(raw as string)).toEqual(payload);
  });

  it('consumes a valid state and returns the payload', async () => {
    const state = await service.create(payload);
    const consumed = await service.consume(state);
    expect(consumed).toEqual(payload);
  });

  it('deletes the state after consumption (no replay)', async () => {
    const state = await service.create(payload);
    await service.consume(state);
    await expect(service.consume(state)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown or forged state', async () => {
    await expect(service.consume('forged-state')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a state whose payload is corrupt', async () => {
    const state = 'bad-state';
    await fakeRedis.set(`ad-oauth:state:${state}`, 'not-json{');
    await expect(service.consume(state)).rejects.toThrow(UnauthorizedException);
  });
});
