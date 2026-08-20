import { authenticator } from 'otplib';
import { createHash, randomBytes } from 'crypto';
import { TOTP_ISSUER } from '../constant/auth-messages';

/**
 * Allow a small TOTP window (±1 period) so valid codes still pass when the
 * authenticator device clock drifts by up to 30 seconds.
 */
authenticator.options = { window: 1 };

/** Generates a new base32 TOTP secret. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** Builds the otpauth:// URI shown to the user for their authenticator app. */
export function createTotpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, TOTP_ISSUER, secret);
}

/** Checks a TOTP code against a secret (with the configured ±1 window). */
export function verifyTotpCode(code: string, secret: string): boolean {
  return authenticator.check(code, secret);
}

/** Generates `count` one-time recovery codes in `xxxxx-xxxxx` form. */
export function generateRecoveryCodes(count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const hex = randomBytes(5).toString('hex');
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
  }
  return codes;
}

/** Normalizes a recovery code to its canonical form before hashing. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace('-', '').toUpperCase();
}

/** Hashes a recovery code so only digests are ever stored. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
