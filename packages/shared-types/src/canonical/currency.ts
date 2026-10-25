/**
 * Financial precision: All monetary values are represented as BigInt micros
 * 1 Standard Currency Unit (e.g., 1.00 USD) = 1,000,000 Micros.
 * Zero float/number types permitted for currency storage or math.
 */
export type CurrencyMicros = bigint;

/** Supported ISO-4217 Currency Codes */
export enum CurrencyCode {
  USD = 'USD',
  EUR = 'EUR',
  SAR = 'SAR',
  AED = 'AED',
  EGP = 'EGP',
  GBP = 'GBP',
}

/** Micro conversion constant: 1 unit = 1,000,000 micros */
export const MICROS_MULTIPLIER = 1_000_000n;
export const CENTS_MULTIPLIER = 10_000n; // 1 cent = 10,000 micros

/** Converts whole dollars/units to Micros BigInt */
export function dollarsToMicros(dollars: number | string): CurrencyMicros {
  const str = String(dollars).trim();
  const isNegative = str.startsWith('-');
  const cleanStr = isNegative || str.startsWith('+') ? str.slice(1) : str;
  const parts = cleanStr.split('.');
  const whole = BigInt(parts[0] || '0') * MICROS_MULTIPLIER;
  const fractional = parts[1]
    ? BigInt(parts[1].slice(0, 6).padEnd(6, '0'))
    : 0n;
  const total = whole + fractional;
  return isNegative ? -total : total;
}

/** Converts Micros BigInt to Cents (for Meta Ads) */
export function microsToCents(micros: CurrencyMicros): bigint {
  return micros / CENTS_MULTIPLIER;
}

/** Converts Cents to Micros BigInt */
export function centsToMicros(cents: bigint | number): CurrencyMicros {
  return BigInt(cents) * CENTS_MULTIPLIER;
}

/** Formats Micros to Human-Readable Currency String */
export function formatMicros(
  micros: CurrencyMicros,
  currency: CurrencyCode = CurrencyCode.USD,
): string {
  const isNegative = micros < 0n;
  const absMicros = isNegative ? -micros : micros;
  const whole = absMicros / MICROS_MULTIPLIER;
  const remainder = absMicros % MICROS_MULTIPLIER;
  const cents = (remainder / 10_000n).toString().padStart(2, '0');
  const formatted = `${whole.toString()}.${cents}`;
  return `${isNegative ? '-' : ''}${formatted} ${currency}`;
}
