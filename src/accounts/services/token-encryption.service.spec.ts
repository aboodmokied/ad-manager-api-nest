import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService', () => {
  const buildService = (configGet: jest.Mock) => {
    return new TokenEncryptionService({
      get: configGet,
    } as unknown as ConfigService);
  };

  const defaults = (key?: string) =>
    jest.fn((name: string) => {
      if (name === 'TOKEN_ENCRYPTION_KEY') return key ?? undefined;
      if (name === 'NODE_ENV') return 'test';
      return undefined;
    });

  it('encrypts and decrypts a token (round trip)', () => {
    const service = buildService(defaults('a'.repeat(64)));
    const ciphertext = service.encrypt('super-secret-access-token');
    expect(ciphertext).not.toContain('super-secret-access-token');
    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(service.decrypt(ciphertext)).toBe('super-secret-access-token');
  });

  it('produces a different ciphertext for the same plaintext (fresh IV)', () => {
    const service = buildService(defaults('a'.repeat(64)));
    const first = service.encrypt('same-token');
    const second = service.encrypt('same-token');
    expect(first).not.toBe(second);
  });

  it('rejects tampered ciphertext', () => {
    const service = buildService(defaults('a'.repeat(64)));
    const ciphertext = service.encrypt('token');
    const tampered =
      ciphertext.slice(0, -2) + (ciphertext.endsWith('==') ? 'AB' : '==');
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('supports hex keys and accepts arbitrary strings (hashed)', () => {
    const hexService = buildService(defaults('a'.repeat(64)));
    const plainService = buildService(defaults('any-passphrase'));
    const hex = hexService.encrypt('t');
    expect(hexService.decrypt(hex)).toBe('t');
    const plain = plainService.encrypt('t');
    expect(plainService.decrypt(plain)).toBe('t');
  });

  it('uses the development key when unset (non-production)', () => {
    const service = buildService(defaults(undefined));
    const ciphertext = service.encrypt('dev-token');
    expect(service.decrypt(ciphertext)).toBe('dev-token');
  });

  it('refuses to start without a key in production', () => {
    const production = jest.fn((name: string) => {
      if (name === 'NODE_ENV') return 'production';
      return undefined;
    });
    expect(() => buildService(production)).toThrow('TOKEN_ENCRYPTION_KEY');
  });
});

describe('TokenEncryptionService (Nest DI)', () => {
  it('is registrable through the Nest testing module', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenEncryptionService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    const service = module.get(TokenEncryptionService);
    const ciphertext = service.encrypt('x');
    expect(service.decrypt(ciphertext)).toBe('x');
  });
});
