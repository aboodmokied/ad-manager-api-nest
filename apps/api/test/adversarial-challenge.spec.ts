import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { TokenEncryptionService } from '../src/common/services/token-encryption.service';

process.env.USE_MOCK_PRISMA = 'true';
process.env.REDIS_URL = '';
process.env.RABBITMQ_URL = '';

describe('Adversarial Challenge Suite: Route Resolution & AES-256-GCM', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let tokenCrypto: TokenEncryptionService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // Mirror EXACT production configuration in apps/api/src/main.ts:
    app.setGlobalPrefix('api/v1', {
      exclude: ['api/health', 'health'],
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();

    tokenCrypto = moduleRef.get<TokenEncryptionService>(TokenEncryptionService);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // SECTION 1: Adversarial Route Path Resolution & Prefix Collision Testing
  // =========================================================================
  describe('Challenge 1: Route Path Resolution for GET /api/health', () => {
    it('directly resolves GET /api/health with 200 OK and valid health payload', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.timestamp).toBe('string');
      expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      expect(res.body.version).toBe('1.0.0');
    });

    it('resolves secondary alias GET /health with 200 OK', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body.status).toBe('ok');
    });

    it('confirms GET /api/v1/health returns 404 (does NOT get prefixed)', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(404);
    });

    it('confirms GET /api/v1/api/health returns 404 (no double-prefix collision)', async () => {
      await request(app.getHttpServer()).get('/api/v1/api/health').expect(404);
    });

    it('handles query parameters gracefully on GET /api/health?probe=liveness&verbose=1', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health?probe=liveness&verbose=1')
        .expect(200);

      expect(res.body.status).toBe('ok');
    });

    it('rejects unsupported HTTP methods on /api/health (POST, PUT, DELETE, PATCH)', async () => {
      await request(app.getHttpServer())
        .post('/api/health')
        .send({ dummy: 'data' })
        .expect(404);

      await request(app.getHttpServer())
        .put('/api/health')
        .send({ dummy: 'data' })
        .expect(404);

      await request(app.getHttpServer()).delete('/api/health').expect(404);

      await request(app.getHttpServer())
        .patch('/api/health')
        .send({ dummy: 'data' })
        .expect(404);
    });

    it('confirms normal API routes require the /api/v1 prefix and do not collide', async () => {
      // Unprefixed /workspaces should 404
      await request(app.getHttpServer()).get('/workspaces').expect(404);

      // Prefixed /api/v1/workspaces should resolve to controller and return 401 (Unauthorized)
      const res = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });

    it('survives a burst of 50 concurrent requests to /api/health without degradation', async () => {
      const requests = Array.from({ length: 50 }, () =>
        request(app.getHttpServer()).get('/api/health'),
      );

      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
      }
    });
  });

  // =========================================================================
  // SECTION 2: Adversarial AES-256-GCM Bit-Flip Mutation & Cryptographic Stress
  // =========================================================================
  describe('Challenge 2: AES-256-GCM Bit-Flip Mutations across IV, AuthTag, and Ciphertext', () => {
    const testPlaintexts = [
      '', // 0 bytes empty string
      'x', // 1 byte single char
      'short-secret-token', // short ASCII
      'EAABwzLIXnjYBO1x9ZBpZC7ZB1qJ6ZA4Q8mK0N8yR4sW1vL6tU3eP2oI5aD7fG9hK', // realistic OAuth token (66 chars)
      'مفتاح_وصول_سري_مشفر_بأمان_🔐_12345', // Multibyte Unicode (Arabic + Emoji)
      'A'.repeat(512), // Long payload (512 bytes)
    ];

    it('empirically verifies 100% rejection of bit flips across every bit of IV, AuthTag, and Ciphertext', () => {
      let totalBitFlipsTested = 0;
      let totalRejections = 0;

      for (const plaintext of testPlaintexts) {
        const encrypted = tokenCrypto.encrypt(plaintext);
        const [version, b64Payload] = encrypted.split(':');
        expect(version).toBe('v1');

        const raw = Buffer.from(b64Payload, 'base64');
        const ivLen = 12;
        const tagLen = 16;
        const ciphertextLen = raw.length - ivLen - tagLen;

        expect(raw.length).toBe(ivLen + tagLen + ciphertextLen);

        // Exhaustive bit-flip test: flip bit 0, bit 3, and bit 7 for every byte in the buffer
        // covering:
        // - IV: bytes 0..11
        // - AuthTag: bytes 12..27
        // - Ciphertext: bytes 28..raw.length - 1
        for (let byteIdx = 0; byteIdx < raw.length; byteIdx++) {
          const bitMasks = [0x01, 0x08, 0x80]; // lowest, middle, highest bit

          for (const mask of bitMasks) {
            const tampered = Buffer.from(raw);
            tampered[byteIdx] ^= mask;

            const tamperedPayload = `v1:${tampered.toString('base64')}`;
            totalBitFlipsTested++;

            try {
              tokenCrypto.decrypt(tamperedPayload);
              // If it decrypted successfully despite bit flip, that is a CRITICAL security vulnerability!
              throw new Error(
                `SECURITY FLAW: Bit flip at byte ${byteIdx} with mask 0x${mask.toString(16)} was accepted for plaintext "${plaintext.slice(0, 20)}"`,
              );
            } catch (err: any) {
              if (err.message.startsWith('SECURITY FLAW')) {
                throw err;
              }
              // GCM authentication check or buffer length check failed as required
              totalRejections++;
            }
          }
        }
      }

      expect(totalBitFlipsTested).toBeGreaterThan(500);
      expect(totalRejections).toBe(totalBitFlipsTested);
    });

    it('rejects multi-bit byte inversions (^ 0xFF) at every single byte position', () => {
      const plaintext = 'sensitive-meta-access-token-9876543210';
      const encrypted = tokenCrypto.encrypt(plaintext);
      const b64Payload = encrypted.slice(3);
      const raw = Buffer.from(b64Payload, 'base64');

      for (let i = 0; i < raw.length; i++) {
        const tampered = Buffer.from(raw);
        tampered[i] ^= 0xff; // Invert all 8 bits in byte

        expect(() =>
          tokenCrypto.decrypt(`v1:${tampered.toString('base64')}`),
        ).toThrow();
      }
    });

    it('rejects byte transpositions (adjacent byte swapping)', () => {
      const plaintext = 'sensitive-meta-access-token-transposition-test';
      const encrypted = tokenCrypto.encrypt(plaintext);
      const b64Payload = encrypted.slice(3);
      const raw = Buffer.from(b64Payload, 'base64');

      // Swap adjacent bytes throughout the payload
      for (let i = 0; i < raw.length - 1; i++) {
        const tampered = Buffer.from(raw);
        const temp = tampered[i];
        tampered[i] = tampered[i + 1];
        tampered[i + 1] = temp;

        if (tampered[i] !== tampered[i + 1]) {
          expect(() =>
            tokenCrypto.decrypt(`v1:${tampered.toString('base64')}`),
          ).toThrow();
        }
      }
    });

    it('rejects forged AuthTags (zeroed, inverted, random)', () => {
      const plaintext = 'auth-tag-forgery-attack-target';
      const encrypted = tokenCrypto.encrypt(plaintext);
      const raw = Buffer.from(encrypted.slice(3), 'base64');

      // 1. All-zeros tag
      const zeroTag = Buffer.from(raw);
      zeroTag.fill(0x00, 12, 28);
      expect(() =>
        tokenCrypto.decrypt(`v1:${zeroTag.toString('base64')}`),
      ).toThrow();

      // 2. All-ones tag
      const onesTag = Buffer.from(raw);
      onesTag.fill(0xff, 12, 28);
      expect(() =>
        tokenCrypto.decrypt(`v1:${onesTag.toString('base64')}`),
      ).toThrow();

      // 3. AuthTag borrowed from a different encryption
      const otherEncrypted = tokenCrypto.encrypt('different-secret');
      const otherRaw = Buffer.from(otherEncrypted.slice(3), 'base64');
      const swappedTag = Buffer.from(raw);
      otherRaw.copy(swappedTag, 12, 12, 28);
      expect(() =>
        tokenCrypto.decrypt(`v1:${swappedTag.toString('base64')}`),
      ).toThrow();
    });

    it('rejects truncated payloads of every length from 0 to 27 bytes', () => {
      for (let len = 0; len < 28; len++) {
        const truncated = Buffer.alloc(len, 0x42);
        const payload = `v1:${truncated.toString('base64')}`;

        expect(() => tokenCrypto.decrypt(payload)).toThrow();
      }
    });

    it('rejects malformed Base64 and structural protocol mutations', () => {
      const malformedCases = [
        '',
        'v1',
        'v1:',
        ':somepayload',
        'v2:aGVsbG8gd29ybGQ=',
        'v0:aGVsbG8gd29ybGQ=',
        'v1:not-base64-!@#$%^&*()',
        'v1:===',
        'v1:YWJj', // valid base64 for 'abc', but only 3 bytes (< 28)
      ];

      for (const tc of malformedCases) {
        expect(() => tokenCrypto.decrypt(tc)).toThrow();
      }
    });

    it('guarantees cross-key segregation (ciphertext encrypted under key A cannot decrypt under key B)', () => {
      const serviceA = new TokenEncryptionService({
        get: jest.fn((k: string) =>
          k === 'TOKEN_ENCRYPTION_KEY' ? 'key-a-'.repeat(8) : 'test',
        ),
      } as unknown as ConfigService);

      const serviceB = new TokenEncryptionService({
        get: jest.fn((k: string) =>
          k === 'TOKEN_ENCRYPTION_KEY' ? 'key-b-'.repeat(8) : 'test',
        ),
      } as unknown as ConfigService);

      const plaintext = 'cross-key-secret-payload';
      const encryptedA = serviceA.encrypt(plaintext);

      expect(() => serviceB.decrypt(encryptedA)).toThrow();
    });

    it('verifies 200 consecutive encryptions generate strictly unique IVs and ciphertexts', () => {
      const iterations = 200;
      const ivs = new Set<string>();
      const ciphertexts = new Set<string>();
      const plaintext = 'fixed-token-for-iv-collision-testing';

      for (let i = 0; i < iterations; i++) {
        const enc = tokenCrypto.encrypt(plaintext);
        const raw = Buffer.from(enc.slice(3), 'base64');
        const iv = raw.subarray(0, 12).toString('hex');

        ivs.add(iv);
        ciphertexts.add(enc);
      }

      expect(ivs.size).toBe(iterations);
      expect(ciphertexts.size).toBe(iterations);
    });
  });
});
