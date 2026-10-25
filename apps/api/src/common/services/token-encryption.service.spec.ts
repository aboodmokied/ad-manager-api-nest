import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService (AES-256-GCM)', () => {
  const buildService = (configGet: jest.Mock) => {
    return new TokenEncryptionService({
      get: configGet,
    } as unknown as ConfigService);
  };

  const createMockConfig = (key?: string, env = 'test') =>
    jest.fn((name: string) => {
      if (name === 'TOKEN_ENCRYPTION_KEY') return key ?? undefined;
      if (name === 'NODE_ENV') return env;
      return undefined;
    });

  describe('Encryption format & round-trip', () => {
    it('encrypts to authenticated format v1:<base64(iv || tag || ciphertext)>', () => {
      const service = buildService(createMockConfig('a'.repeat(64)));
      const plaintext = 'oauth-access-token-secret-12345';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toMatch(/^v1:[A-Za-z0-9+/]+={0,2}$/);
      expect(encrypted).not.toContain(plaintext);

      const [version, b64Payload] = encrypted.split(':');
      expect(version).toBe('v1');

      const raw = Buffer.from(b64Payload, 'base64');
      // 12 bytes IV + 16 bytes AuthTag + length of ciphertext
      expect(raw.length).toBe(12 + 16 + Buffer.byteLength(plaintext, 'utf8'));

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('handles unicode strings, empty strings, and long tokens', () => {
      const service = buildService(createMockConfig('a'.repeat(64)));
      const testCases = [
        '',
        'short',
        'unicode-token: 🚀-広告キャンペーン-مرحبا',
        'x'.repeat(4096),
      ];

      for (const tc of testCases) {
        const encrypted = service.encrypt(tc);
        expect(service.decrypt(encrypted)).toBe(tc);
      }
    });
  });

  describe('IV Uniqueness', () => {
    it('generates a cryptographically fresh 12-byte IV for every encryption', () => {
      const service = buildService(createMockConfig('a'.repeat(64)));
      const plaintext = 'identical-plaintext-token';
      const iterations = 100;
      const ivSet = new Set<string>();
      const ciphertextSet = new Set<string>();

      for (let i = 0; i < iterations; i++) {
        const encrypted = service.encrypt(plaintext);
        const b64Payload = encrypted.slice(3);
        const raw = Buffer.from(b64Payload, 'base64');
        const iv = raw.subarray(0, 12).toString('hex');

        expect(raw.subarray(0, 12).length).toBe(12);
        ivSet.add(iv);
        ciphertextSet.add(encrypted);
      }

      // Every IV and every ciphertext must be distinct
      expect(ivSet.size).toBe(iterations);
      expect(ciphertextSet.size).toBe(iterations);
    });
  });

  describe('Bit-flip tamper rejection across IV, AuthTag, and Ciphertext', () => {
    it('rejects bit-flip tampering anywhere in the 12-byte IV', () => {
      const service = buildService(createMockConfig('a'.repeat(64)));
      const plaintext = 'confidential-refresh-token';
      const encrypted = service.encrypt(plaintext);
      const b64Payload = encrypted.slice(3);
      const raw = Buffer.from(b64Payload, 'base64');

      // Test bit flips across each byte of the IV (indices 0..11)
      for (let byteIdx = 0; byteIdx < 12; byteIdx++) {
        const tampered = Buffer.from(raw);
        tampered[byteIdx] ^= 0x01; // flip lowest bit
        const tamperedPayload = `v1:${tampered.toString('base64')}`;

        expect(() => service.decrypt(tamperedPayload)).toThrow();
      }
    });

    it('rejects bit-flip tampering anywhere in the 16-byte AuthTag', () => {
      const service = buildService(createMockConfig('a'.repeat(64)));
      const plaintext = 'confidential-refresh-token';
      const encrypted = service.encrypt(plaintext);
      const b64Payload = encrypted.slice(3);
      const raw = Buffer.from(b64Payload, 'base64');

      // Test bit flips across each byte of the AuthTag (indices 12..27)
      for (let byteIdx = 12; byteIdx < 28; byteIdx++) {
        const tampered = Buffer.from(raw);
        tampered[byteIdx] ^= 0x01; // flip lowest bit
        const tamperedPayload = `v1:${tampered.toString('base64')}`;

        expect(() => service.decrypt(tamperedPayload)).toThrow();
      }
    });

    it('rejects bit-flip tampering anywhere in the Ciphertext', () => {
      const service = buildService(createMockConfig('a'.repeat(64)));
      const plaintext = 'confidential-refresh-token-with-some-length';
      const encrypted = service.encrypt(plaintext);
      const b64Payload = encrypted.slice(3);
      const raw = Buffer.from(b64Payload, 'base64');

      // Test bit flips across each byte of the ciphertext (indices 28..raw.length-1)
      for (let byteIdx = 28; byteIdx < raw.length; byteIdx++) {
        const tampered = Buffer.from(raw);
        tampered[byteIdx] ^= 0x01; // flip lowest bit
        const tamperedPayload = `v1:${tampered.toString('base64')}`;

        expect(() => service.decrypt(tamperedPayload)).toThrow();
      }
    });
  });

  describe('Malformed & corrupt payload rejection', () => {
    it('throws on corrupt payloads shorter than 28 bytes', () => {
      const service = buildService(createMockConfig('a'.repeat(64)));
      const shortBytes = Buffer.alloc(20);
      const payload = `v1:${shortBytes.toString('base64')}`;

      expect(() => service.decrypt(payload)).toThrow(
        'Corrupt encrypted token payload',
      );
    });

    it('throws on unsupported version prefix or missing body', () => {
      const service = buildService(createMockConfig('a'.repeat(64)));

      expect(() => service.decrypt('v2:somebody')).toThrow(
        'Unsupported encrypted token payload',
      );
      expect(() => service.decrypt('plaintext')).toThrow(
        'Unsupported encrypted token payload',
      );
      expect(() => service.decrypt('v1:')).toThrow(
        'Unsupported encrypted token payload',
      );
    });
  });

  describe('Key derivation & environments', () => {
    it('correctly derives 32-byte key from 64-hex string', () => {
      const hexKey =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const service = buildService(createMockConfig(hexKey));
      const encrypted = service.encrypt('token');
      expect(service.decrypt(encrypted)).toBe('token');
    });

    it('correctly derives 32-byte key from 44-character base64 string', () => {
      const b64Key = Buffer.alloc(32, 0x42).toString('base64');
      const service = buildService(createMockConfig(b64Key));
      const encrypted = service.encrypt('token');
      expect(service.decrypt(encrypted)).toBe('token');
    });

    it('hashes arbitrary string with SHA-256 for key derivation', () => {
      const service = buildService(createMockConfig('arbitrary-passphrase'));
      const encrypted = service.encrypt('token');
      expect(service.decrypt(encrypted)).toBe('token');
    });

    it('uses development fallback key when unset in non-production', () => {
      const service = buildService(createMockConfig(undefined, 'development'));
      const encrypted = service.encrypt('token');
      expect(service.decrypt(encrypted)).toBe('token');
    });

    it('refuses to start when key is unset in production', () => {
      expect(() =>
        buildService(createMockConfig(undefined, 'production')),
      ).toThrow('TOKEN_ENCRYPTION_KEY must be set when NODE_ENV=production');
    });
  });

  describe('NestJS DI Integration', () => {
    it('is resolvable from Nest testing module', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TokenEncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((name: string) => {
                if (name === 'NODE_ENV') return 'test';
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const service = module.get(TokenEncryptionService);
      const encrypted = service.encrypt('nest-di-token');
      expect(service.decrypt(encrypted)).toBe('nest-di-token');
    });
  });
});
