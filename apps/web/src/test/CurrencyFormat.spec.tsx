import { describe, it, expect } from 'vitest';
import {
  dollarsToMicros,
  microsToCents,
  centsToMicros,
  formatMicros,
  CurrencyCode,
  MICROS_MULTIPLIER,
} from '@uacm/shared-types';

describe('Financial Precision & Currency Formatting', () => {
  it('converts integer dollar amounts to BigInt micros without float errors', () => {
    const micros = dollarsToMicros(100);
    expect(micros).toBe(100_000_000n);
    expect(typeof micros).toBe('bigint');
  });

  it('converts fractional dollars to exact BigInt micros', () => {
    const micros1 = dollarsToMicros('25.50');
    expect(micros1).toBe(25_500_000n);

    const micros2 = dollarsToMicros('0.99');
    expect(micros2).toBe(990_000n);

    const micros3 = dollarsToMicros('1234.567890');
    expect(micros3).toBe(1_234_567_890n);
  });

  it('converts micros to cents and back with zero precision loss', () => {
    const micros = 25_500_000n;
    const cents = microsToCents(micros);
    expect(cents).toBe(2550n);

    const restoredMicros = centsToMicros(cents);
    expect(restoredMicros).toBe(micros);
  });

  it('formats micros to human-readable strings across ISO-4217 currencies', () => {
    expect(formatMicros(100_000_000n, CurrencyCode.USD)).toBe('100.00 USD');
    expect(formatMicros(25_500_000n, CurrencyCode.SAR)).toBe('25.50 SAR');
    expect(formatMicros(75_250_000n, CurrencyCode.EUR)).toBe('75.25 EUR');
    expect(formatMicros(0n, CurrencyCode.AED)).toBe('0.00 AED');
  });

  it('handles negative micros correctly with minus sign prefix', () => {
    const negative = dollarsToMicros('-15.75');
    expect(negative).toBe(-15_750_000n);
    expect(formatMicros(negative, CurrencyCode.USD)).toBe('-15.75 USD');
  });

  it('guarantees 1 standard unit = 1,000,000 micros', () => {
    expect(MICROS_MULTIPLIER).toBe(1_000_000n);
    expect(dollarsToMicros(1)).toBe(1_000_000n);
  });
});
