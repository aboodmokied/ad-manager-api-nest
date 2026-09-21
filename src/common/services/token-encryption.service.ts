import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * Encrypts/decrypts OAuth tokens and 2FA secrets at rest using AES-256-GCM.
 *
 * Format of an encrypted payload: `v1:<base64(iv || authTag || ciphertext)>`.
 * - a fresh 12-byte random IV is generated for every encryption, so the same
 *   plaintext never produces the same ciphertext;
 * - the GCM auth tag guarantees the stored token/secret was not tampered with.
 *
 * The key comes from TOKEN_ENCRYPTION_KEY (32 bytes as hex or base64, or any
 * string which is hashed with SHA-256). A development key is used when the
 * variable is unset outside production; production refuses to start without it.
 */
@Injectable()
export class TokenEncryptionService {
  private readonly logger = new Logger(TokenEncryptionService.name);
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>('TOKEN_ENCRYPTION_KEY');
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';

    if (!raw && nodeEnv === 'production') {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY must be set when NODE_ENV=production',
      );
    }
    if (!raw) {
      this.logger.warn(
        'TOKEN_ENCRYPTION_KEY is not set - using the development encryption key. ' +
          'Set it before deploying outside development.',
      );
    }
    this.key = this.deriveKey(raw ?? 'uacm-dev-encryption-key');
  }

  /** Resolves a 32-byte AES key from the configured value. */
  private deriveKey(raw: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    if (/^[A-Za-z0-9+/]{44}={0,2}$/.test(raw)) {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length === 32) {
        return decoded;
      }
    }
    return createHash('sha256').update(raw).digest();
  }

  /** Encrypts a plaintext token or secret; output is safe to store in the database. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `v1:${Buffer.concat([iv, authTag, encrypted]).toString('base64')}`;
  }

  /** Decrypts a previously encrypted token or secret. Throws when the payload is invalid. */
  decrypt(payload: string): string {
    const [version, body] = payload.split(':');
    if (version !== 'v1' || !body) {
      throw new Error('Unsupported encrypted token payload');
    }
    const data = Buffer.from(body, 'base64');
    if (data.length < 28) {
      throw new Error('Corrupt encrypted token payload');
    }
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
