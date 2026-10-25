import {
  CurrencyCode,
  CurrencyMicros,
  MICROS_MULTIPLIER,
  CENTS_MULTIPLIER,
  dollarsToMicros,
  microsToCents,
  centsToMicros,
  formatMicros,
} from '../index';

describe('Currency and Financial Precision Standards', () => {
  describe('dollarsToMicros', () => {
    it('converts standard integer strings and numbers to micros', () => {
      expect(dollarsToMicros('1')).toBe(1_000_000n);
      expect(dollarsToMicros(1)).toBe(1_000_000n);
      expect(dollarsToMicros('100')).toBe(100_000_000n);
      expect(dollarsToMicros(100)).toBe(100_000_000n);
    });

    it('converts fractional dollars accurately up to 6 decimal places', () => {
      expect(dollarsToMicros('1000.50')).toBe(1_000_500_000n);
      expect(dollarsToMicros(1000.5)).toBe(1_000_500_000n);
      expect(dollarsToMicros('0.01')).toBe(10_000n); // 1 cent = 10,000 micros
      expect(dollarsToMicros('0.000001')).toBe(1n); // 1 micro
      expect(dollarsToMicros('0.123456')).toBe(123_456n);
      expect(dollarsToMicros('0.1234567')).toBe(123_456n); // Truncates beyond 6 decimals
    });

    it('handles zero correctly', () => {
      expect(dollarsToMicros('0')).toBe(0n);
      expect(dollarsToMicros(0)).toBe(0n);
      expect(dollarsToMicros('0.00')).toBe(0n);
      expect(dollarsToMicros('')).toBe(0n);
    });

    it('supports negative dollar amounts', () => {
      expect(dollarsToMicros('-10.50')).toBe(-10_500_000n);
      expect(dollarsToMicros(-10.5)).toBe(-10_500_000n);
      expect(dollarsToMicros('-0.25')).toBe(-250_000n);
      expect(dollarsToMicros('-100')).toBe(-100_000_000n);
      expect(dollarsToMicros('-0.000005')).toBe(-5n);
    });

    it('handles explicit positive sign strings', () => {
      expect(dollarsToMicros('+50.25')).toBe(50_250_000n);
      expect(dollarsToMicros('+100')).toBe(100_000_000n);
    });

    it('trims whitespace', () => {
      expect(dollarsToMicros('  75.50  ')).toBe(75_500_000n);
    });
  });

  describe('microsToCents', () => {
    it('converts micros to cents via integer division', () => {
      expect(microsToCents(1_000_000n)).toBe(100n);
      expect(microsToCents(1_000_500_000n)).toBe(100_050n);
      expect(microsToCents(10_000n)).toBe(1n);
      expect(microsToCents(0n)).toBe(0n);
      expect(microsToCents(-10_500_000n)).toBe(-1050n);
    });

    it('discards sub-cent fractional micros', () => {
      // 9,999 micros is less than 1 cent (10,000 micros)
      expect(microsToCents(9_999n)).toBe(0n);
      expect(microsToCents(19_999n)).toBe(1n);
    });
  });

  describe('centsToMicros', () => {
    it('converts cents (bigint or number) to micros', () => {
      expect(centsToMicros(100_050n)).toBe(1_000_500_000n);
      expect(centsToMicros(100_050)).toBe(1_000_500_000n);
      expect(centsToMicros(1n)).toBe(10_000n);
      expect(centsToMicros(0n)).toBe(0n);
      expect(centsToMicros(-25n)).toBe(-250_000n);
      expect(centsToMicros(-25)).toBe(-250_000n);
    });
  });

  describe('formatMicros', () => {
    it('formats positive micros into standard currency string', () => {
      expect(formatMicros(1_000_000n)).toBe('1.00 USD');
      expect(formatMicros(1_000_500_000n)).toBe('1000.50 USD');
      expect(formatMicros(250_000n)).toBe('0.25 USD');
      expect(formatMicros(0n)).toBe('0.00 USD');
    });

    it('supports custom currency codes', () => {
      expect(formatMicros(5_000_000_000n, CurrencyCode.SAR)).toBe(
        '5000.00 SAR',
      );
      expect(formatMicros(750_000_000n, CurrencyCode.AED)).toBe('750.00 AED');
      expect(formatMicros(125_500_000n, CurrencyCode.EUR)).toBe('125.50 EUR');
      expect(formatMicros(99_990_000n, CurrencyCode.EGP)).toBe('99.99 EGP');
      expect(formatMicros(350_000_000n, CurrencyCode.GBP)).toBe('350.00 GBP');
    });

    it('formats negative micros with leading minus sign', () => {
      expect(formatMicros(-10_500_000n, CurrencyCode.USD)).toBe('-10.50 USD');
      expect(formatMicros(-250_000n, CurrencyCode.USD)).toBe('-0.25 USD');
      expect(formatMicros(-1_000_000_000n, CurrencyCode.SAR)).toBe(
        '-1000.00 SAR',
      );
    });

    it('pads single digit cents with leading zero', () => {
      // 5 cents = 50,000 micros
      expect(formatMicros(1_050_000n)).toBe('1.05 USD');
    });
  });

  describe('Constants and Types', () => {
    it('verifies conversion multipliers', () => {
      expect(MICROS_MULTIPLIER).toBe(1_000_000n);
      expect(CENTS_MULTIPLIER).toBe(10_000n);
      expect(MICROS_MULTIPLIER / CENTS_MULTIPLIER).toBe(100n);
    });

    it('verifies CurrencyCode enum values', () => {
      expect(CurrencyCode.USD).toBe('USD');
      expect(CurrencyCode.EUR).toBe('EUR');
      expect(CurrencyCode.SAR).toBe('SAR');
      expect(CurrencyCode.AED).toBe('AED');
      expect(CurrencyCode.EGP).toBe('EGP');
      expect(CurrencyCode.GBP).toBe('GBP');
    });
  });
});
