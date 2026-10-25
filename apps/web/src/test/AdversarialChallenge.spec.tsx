import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  CreateCampaignForm,
  CreateCampaignFormSchema,
  HeadlineItemSchema,
  DescriptionItemSchema,
} from '../components/forms/CreateCampaignForm';
import { CreateWorkspaceForm } from '../components/forms/CreateWorkspaceForm';
import { WorkspaceProvider } from '../components/providers/workspace-provider';
import {
  Platform,
  UnifiedCampaignObjective,
  MetaSpecialAdCategoryEnum,
  dollarsToMicros,
  microsToCents,
  centsToMicros,
  formatMicros,
  CurrencyCode,
  MICROS_MULTIPLIER,
  CENTS_MULTIPLIER,
  CreateWorkspaceSchema,
} from '@uacm/shared-types';

describe('Adversarial Challenge — Form Validation & Financial Precision (Milestone 4)', () => {
  // =========================================================================
  // 1. CAMPAIGN FORM BOUNDARY CONDITIONS
  // =========================================================================
  describe('Campaign Name Boundaries', () => {
    const baseValid = {
      name: 'Valid Campaign',
      objective: UnifiedCampaignObjective.TRAFFIC,
      dailyBudgetDollars: '25.00',
      targetPlatforms: [Platform.META],
      googleOverrides: {
        headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
        descriptions: [{ text: 'D1' }, { text: 'D2' }],
      },
      metaOverrides: {
        specialAdCategory: 'NONE' as const,
        placements: {
          facebookFeed: true,
          instagramFeed: true,
          instagramStories: true,
          reels: true,
        },
      },
    };

    it('rejects empty campaign name', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        name: '',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe(
          'Campaign name must be at least 3 characters',
        );
      }
    });

    it('rejects 1-character campaign name', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        name: 'A',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe(
          'Campaign name must be at least 3 characters',
        );
      }
    });

    it('rejects 2-character campaign name', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        name: 'AB',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe(
          'Campaign name must be at least 3 characters',
        );
      }
    });

    it('accepts exact 3-character campaign name (lower boundary)', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        name: 'ABC',
      });
      expect(res.success).toBe(true);
    });

    it('accepts exact 100-character campaign name (upper boundary)', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        name: 'X'.repeat(100),
      });
      expect(res.success).toBe(true);
    });

    it('rejects 101-character campaign name (exceeds upper boundary)', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        name: 'X'.repeat(101),
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe(
          'Campaign name cannot exceed 100 characters',
        );
      }
    });

    it('accepts valid Arabic campaign name', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        name: 'حملة إطلاق موسم الرياض ٢٠٢٦',
      });
      expect(res.success).toBe(true);
    });
  });

  // =========================================================================
  // 2. DAILY BUDGET BOUNDARY CONDITIONS
  // =========================================================================
  describe('Daily Budget Boundaries & Validation', () => {
    const baseValid = {
      name: 'Budget Test Campaign',
      objective: UnifiedCampaignObjective.LEAD_GENERATION,
      dailyBudgetDollars: '50.00',
      targetPlatforms: [Platform.GOOGLE],
      googleOverrides: {
        headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
        descriptions: [{ text: 'D1' }, { text: 'D2' }],
      },
      metaOverrides: {
        specialAdCategory: 'NONE' as const,
        placements: {
          facebookFeed: true,
          instagramFeed: true,
          instagramStories: true,
          reels: true,
        },
      },
    };

    it('rejects empty budget string', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        dailyBudgetDollars: '',
      });
      expect(res.success).toBe(false);
    });

    it('rejects zero budget ("0" and "0.00")', () => {
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '0',
        }).success,
      ).toBe(false);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '0.00',
        }).success,
      ).toBe(false);
    });

    it('rejects negative budget ("-1.00", "-50", "-0.01")', () => {
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '-1.00',
        }).success,
      ).toBe(false);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '-50',
        }).success,
      ).toBe(false);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '-0.01',
        }).success,
      ).toBe(false);
    });

    it('rejects budget below 1.00 boundary ("0.99")', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        dailyBudgetDollars: '0.99',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(
          res.error.issues.some((i) => i.message.includes('at least 1.00')),
        ).toBe(true);
      }
    });

    it('accepts exact 1.00 minimum budget boundary ("1.00" and "1")', () => {
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '1.00',
        }).success,
      ).toBe(true);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '1',
        }).success,
      ).toBe(true);
    });

    it('rejects non-numeric budget values ("abc", "$50", "50 USD")', () => {
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: 'abc',
        }).success,
      ).toBe(false);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '$50',
        }).success,
      ).toBe(false);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '50 USD',
        }).success,
      ).toBe(false);
    });

    it('rejects sub-cent fractional budgets ("0.001", "10.005", "50.123")', () => {
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '0.001',
        }).success,
      ).toBe(false);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '10.005',
        }).success,
      ).toBe(false);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '50.123',
        }).success,
      ).toBe(false);
    });

    it('rejects exponential or malformed number strings ("1e5", "NaN", "Infinity")', () => {
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '1e5',
        }).success,
      ).toBe(false);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: 'NaN',
        }).success,
      ).toBe(false);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: 'Infinity',
        }).success,
      ).toBe(false);
    });

    it('accepts valid 1-decimal and 2-decimal budget ("25.5", "25.50")', () => {
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '25.5',
        }).success,
      ).toBe(true);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '25.50',
        }).success,
      ).toBe(true);
    });

    it('accepts large enterprise budgets ("1000000.00")', () => {
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '1000000.00',
        }).success,
      ).toBe(true);
    });
  });

  // =========================================================================
  // 3. TARGET PLATFORM SELECTION BOUNDARIES
  // =========================================================================
  describe('Target Platforms Boundaries', () => {
    const baseValid = {
      name: 'Platform Test Campaign',
      objective: UnifiedCampaignObjective.SALES,
      dailyBudgetDollars: '100.00',
      googleOverrides: {
        headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
        descriptions: [{ text: 'D1' }, { text: 'D2' }],
      },
      metaOverrides: {
        specialAdCategory: 'NONE' as const,
        placements: {
          facebookFeed: true,
          instagramFeed: true,
          instagramStories: true,
          reels: true,
        },
      },
    };

    it('rejects empty platform array', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        targetPlatforms: [],
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe(
          'Select at least one platform',
        );
      }
    });

    it('accepts single platform selection', () => {
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          targetPlatforms: [Platform.META],
        }).success,
      ).toBe(true);
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          targetPlatforms: [Platform.GOOGLE],
        }).success,
      ).toBe(true);
    });

    it('accepts all 4 platforms', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        targetPlatforms: [
          Platform.META,
          Platform.GOOGLE,
          Platform.TIKTOK,
          Platform.SNAPCHAT,
        ],
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid platform values', () => {
      const res = CreateCampaignFormSchema.safeParse({
        ...baseValid,
        targetPlatforms: ['PINTEREST' as any],
      });
      expect(res.success).toBe(false);
    });
  });

  // =========================================================================
  // 4. GOOGLE RSA CONSTRAINTS (HEADLINES & DESCRIPTIONS)
  // =========================================================================
  describe('Google RSA Character & Count Constraints', () => {
    describe('Headline Item Schema', () => {
      it('rejects empty headline text (0 chars)', () => {
        expect(HeadlineItemSchema.safeParse({ text: '' }).success).toBe(false);
      });

      it('accepts 1 character headline (lower boundary)', () => {
        expect(HeadlineItemSchema.safeParse({ text: 'A' }).success).toBe(true);
      });

      it('accepts exact 30 characters headline (upper boundary)', () => {
        expect(
          HeadlineItemSchema.safeParse({ text: 'H'.repeat(30) }).success,
        ).toBe(true);
      });

      it('rejects 31 characters headline (exceeds boundary by 1)', () => {
        const res = HeadlineItemSchema.safeParse({ text: 'H'.repeat(31) });
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error.issues[0].message).toBe(
            'Google headline cannot exceed 30 characters',
          );
        }
      });
    });

    describe('Description Item Schema', () => {
      it('rejects empty description text (0 chars)', () => {
        expect(DescriptionItemSchema.safeParse({ text: '' }).success).toBe(
          false,
        );
      });

      it('accepts 1 character description (lower boundary)', () => {
        expect(DescriptionItemSchema.safeParse({ text: 'D' }).success).toBe(
          true,
        );
      });

      it('accepts exact 90 characters description (upper boundary)', () => {
        expect(
          DescriptionItemSchema.safeParse({ text: 'D'.repeat(90) }).success,
        ).toBe(true);
      });

      it('rejects 91 characters description (exceeds boundary by 1)', () => {
        const res = DescriptionItemSchema.safeParse({ text: 'D'.repeat(91) });
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error.issues[0].message).toBe(
            'Google description cannot exceed 90 characters',
          );
        }
      });
    });

    describe('Headline Count Boundaries', () => {
      const baseValid = {
        name: 'RSA Count Test',
        objective: UnifiedCampaignObjective.TRAFFIC,
        dailyBudgetDollars: '50.00',
        targetPlatforms: [Platform.GOOGLE],
        metaOverrides: {
          specialAdCategory: 'NONE' as const,
          placements: {
            facebookFeed: true,
            instagramFeed: true,
            instagramStories: true,
            reels: true,
          },
        },
        googleOverrides: {
          descriptions: [{ text: 'D1' }, { text: 'D2' }],
        },
      };

      it('rejects fewer than 3 headlines (count = 2)', () => {
        const res = CreateCampaignFormSchema.safeParse({
          ...baseValid,
          googleOverrides: {
            ...baseValid.googleOverrides,
            headlines: [{ text: 'H1' }, { text: 'H2' }],
          },
        });
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(
            res.error.issues.some((i) =>
              i.message.includes('at least 3 headlines'),
            ),
          ).toBe(true);
        }
      });

      it('accepts exact 3 headlines (lower count boundary)', () => {
        const res = CreateCampaignFormSchema.safeParse({
          ...baseValid,
          googleOverrides: {
            ...baseValid.googleOverrides,
            headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
          },
        });
        expect(res.success).toBe(true);
      });

      it('accepts exact 15 headlines (upper count boundary)', () => {
        const headlines = Array.from({ length: 15 }, (_, i) => ({
          text: `Headline ${i + 1}`,
        }));
        const res = CreateCampaignFormSchema.safeParse({
          ...baseValid,
          googleOverrides: {
            ...baseValid.googleOverrides,
            headlines,
          },
        });
        expect(res.success).toBe(true);
      });

      it('rejects 16 headlines (exceeds upper count boundary)', () => {
        const headlines = Array.from({ length: 16 }, (_, i) => ({
          text: `Headline ${i + 1}`,
        }));
        const res = CreateCampaignFormSchema.safeParse({
          ...baseValid,
          googleOverrides: {
            ...baseValid.googleOverrides,
            headlines,
          },
        });
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(
            res.error.issues.some((i) =>
              i.message.includes('at most 15 headlines'),
            ),
          ).toBe(true);
        }
      });
    });

    describe('Description Count Boundaries', () => {
      const baseValid = {
        name: 'RSA Desc Count Test',
        objective: UnifiedCampaignObjective.TRAFFIC,
        dailyBudgetDollars: '50.00',
        targetPlatforms: [Platform.GOOGLE],
        metaOverrides: {
          specialAdCategory: 'NONE' as const,
          placements: {
            facebookFeed: true,
            instagramFeed: true,
            instagramStories: true,
            reels: true,
          },
        },
        googleOverrides: {
          headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
        },
      };

      it('rejects fewer than 2 descriptions (count = 1)', () => {
        const res = CreateCampaignFormSchema.safeParse({
          ...baseValid,
          googleOverrides: {
            ...baseValid.googleOverrides,
            descriptions: [{ text: 'Only one description' }],
          },
        });
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(
            res.error.issues.some((i) =>
              i.message.includes('at least 2 descriptions'),
            ),
          ).toBe(true);
        }
      });

      it('accepts exact 2 descriptions (lower count boundary)', () => {
        const res = CreateCampaignFormSchema.safeParse({
          ...baseValid,
          googleOverrides: {
            ...baseValid.googleOverrides,
            descriptions: [{ text: 'Desc 1' }, { text: 'Desc 2' }],
          },
        });
        expect(res.success).toBe(true);
      });

      it('accepts exact 4 descriptions (upper count boundary)', () => {
        const res = CreateCampaignFormSchema.safeParse({
          ...baseValid,
          googleOverrides: {
            ...baseValid.googleOverrides,
            descriptions: [
              { text: 'D1' },
              { text: 'D2' },
              { text: 'D3' },
              { text: 'D4' },
            ],
          },
        });
        expect(res.success).toBe(true);
      });

      it('rejects 5 descriptions (exceeds upper count boundary)', () => {
        const res = CreateCampaignFormSchema.safeParse({
          ...baseValid,
          googleOverrides: {
            ...baseValid.googleOverrides,
            descriptions: [
              { text: 'D1' },
              { text: 'D2' },
              { text: 'D3' },
              { text: 'D4' },
              { text: 'D5' },
            ],
          },
        });
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(
            res.error.issues.some((i) =>
              i.message.includes('at most 4 descriptions'),
            ),
          ).toBe(true);
        }
      });
    });

    describe('Google Customer ID Boundaries', () => {
      const checkCid = (cid?: string) =>
        CreateCampaignFormSchema.safeParse({
          name: 'CID Test',
          objective: UnifiedCampaignObjective.TRAFFIC,
          dailyBudgetDollars: '50.00',
          targetPlatforms: [Platform.GOOGLE],
          metaOverrides: {
            specialAdCategory: 'NONE' as const,
            placements: {
              facebookFeed: true,
              instagramFeed: true,
              instagramStories: true,
              reels: true,
            },
          },
          googleOverrides: {
            customerId: cid,
            headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
            descriptions: [{ text: 'D1' }, { text: 'D2' }],
          },
        });

      it('accepts empty or omitted customerId', () => {
        expect(checkCid('').success).toBe(true);
        expect(checkCid(undefined).success).toBe(true);
      });

      it('accepts valid 10-digit hyphenated format (123-456-7890)', () => {
        expect(checkCid('123-456-7890').success).toBe(true);
      });

      it('accepts valid 10-digit unhyphenated format (1234567890)', () => {
        expect(checkCid('1234567890').success).toBe(true);
      });

      it('rejects invalid customerId formats', () => {
        expect(checkCid('12-345-6789').success).toBe(false);
        expect(checkCid('123456789').success).toBe(false); // 9 digits
        expect(checkCid('12345678901').success).toBe(false); // 11 digits
        expect(checkCid('abc-def-ghij').success).toBe(false);
      });
    });
  });

  // =========================================================================
  // 5. META OVERRIDES CONSTRAINTS
  // =========================================================================
  describe('Meta Overrides Constraints', () => {
    const checkMeta = (metaPartial: Record<string, any>) =>
      CreateCampaignFormSchema.safeParse({
        name: 'Meta Test',
        objective: UnifiedCampaignObjective.LEAD_GENERATION,
        dailyBudgetDollars: '50.00',
        targetPlatforms: [Platform.META],
        googleOverrides: {
          headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
          descriptions: [{ text: 'D1' }, { text: 'D2' }],
        },
        metaOverrides: {
          specialAdCategory: 'NONE' as const,
          placements: {
            facebookFeed: true,
            instagramFeed: true,
            instagramStories: true,
            reels: true,
          },
          ...metaPartial,
        },
      });

    it('accepts valid adAccountId formats (act_123456789, empty string)', () => {
      expect(checkMeta({ adAccountId: 'act_123456789' }).success).toBe(true);
      expect(checkMeta({ adAccountId: '' }).success).toBe(true);
    });

    it('rejects invalid adAccountId without act_ prefix or non-digits', () => {
      expect(checkMeta({ adAccountId: '123456789' }).success).toBe(false);
      expect(checkMeta({ adAccountId: 'act_xyz' }).success).toBe(false);
      expect(checkMeta({ adAccountId: 'act_' }).success).toBe(false);
    });

    it('validates all Meta special ad categories', () => {
      for (const cat of MetaSpecialAdCategoryEnum.options) {
        expect(checkMeta({ specialAdCategory: cat }).success).toBe(true);
      }
      expect(checkMeta({ specialAdCategory: 'INVALID_CATEGORY' }).success).toBe(
        false,
      );
    });
  });

  // =========================================================================
  // 6. FINANCIAL PRECISION & BIGINT MICROS ARITHMETIC
  // =========================================================================
  describe('Financial Precision & BigInt Micros Conversions', () => {
    it('verifies 1 unit = 1,000,000 micros constant', () => {
      expect(MICROS_MULTIPLIER).toBe(1_000_000n);
      expect(CENTS_MULTIPLIER).toBe(10_000n);
      expect(dollarsToMicros(1)).toBe(1_000_000n);
      expect(dollarsToMicros('1.00')).toBe(1_000_000n);
    });

    it('converts integer dollar amounts to BigInt micros exactly', () => {
      expect(dollarsToMicros(0)).toBe(0n);
      expect(dollarsToMicros(50)).toBe(50_000_000n);
      expect(dollarsToMicros(100_000)).toBe(100_000_000_000n);
    });

    it('avoids JS floating-point multiplication errors (e.g. 0.07 * 1e6)', () => {
      // In JS: 0.07 * 1_000_000 = 70000.00000000001
      // dollarsToMicros string-based parsing must yield exact 70,000n
      expect(dollarsToMicros('0.07')).toBe(70_000n);
      expect(dollarsToMicros('0.1')).toBe(100_000n);
      expect(dollarsToMicros('0.2')).toBe(200_000n);
      expect(dollarsToMicros('0.3')).toBe(300_000n);
    });

    it('converts micro-cents (sub-cent) precision properly', () => {
      expect(dollarsToMicros('0.000001')).toBe(1n); // 1 micro
      expect(dollarsToMicros('0.000010')).toBe(10n); // 10 micros
      expect(dollarsToMicros('0.000100')).toBe(100n);
      expect(dollarsToMicros('0.001000')).toBe(1_000n);
      expect(dollarsToMicros('0.010000')).toBe(10_000n); // 1 cent = 10,000 micros
    });

    it('truncates precision beyond 6 decimal places', () => {
      // 7th decimal digit is truncated at micros precision
      expect(dollarsToMicros('0.0000001')).toBe(0n);
      expect(dollarsToMicros('0.0000019')).toBe(1n);
    });

    it('converts negative currency amounts correctly', () => {
      expect(dollarsToMicros('-25.50')).toBe(-25_500_000n);
      expect(dollarsToMicros('-0.01')).toBe(-10_000n);
      expect(dollarsToMicros('-0.000001')).toBe(-1n);
      expect(dollarsToMicros('-0')).toBe(0n);
      expect(dollarsToMicros('-0.00')).toBe(0n);
    });

    it('handles explicit positive signs ("+15.50")', () => {
      expect(dollarsToMicros('+15.50')).toBe(15_500_000n);
    });

    it('microsToCents rounds/truncates to whole cents', () => {
      expect(microsToCents(25_500_000n)).toBe(2550n);
      expect(microsToCents(25_509_999n)).toBe(2550n);
      expect(microsToCents(-25_500_000n)).toBe(-2550n);
      expect(microsToCents(0n)).toBe(0n);
    });

    it('centsToMicros converts cents to exact micros', () => {
      expect(centsToMicros(2550n)).toBe(25_500_000n);
      expect(centsToMicros(2550)).toBe(25_500_000n);
      expect(centsToMicros(1)).toBe(10_000n);
      expect(centsToMicros(0)).toBe(0n);
    });

    it('guarantees round-trip preservation for cents', () => {
      const testCents = [0n, 1n, 50n, 100n, 2550n, 999999n];
      for (const c of testCents) {
        expect(microsToCents(centsToMicros(c))).toBe(c);
      }
    });

    it('formats micros to human-readable string without float loss', () => {
      expect(formatMicros(100_000_000n, CurrencyCode.USD)).toBe('100.00 USD');
      expect(formatMicros(25_500_000n, CurrencyCode.SAR)).toBe('25.50 SAR');
      expect(formatMicros(0n, CurrencyCode.EUR)).toBe('0.00 EUR');
      expect(formatMicros(50_000n, CurrencyCode.AED)).toBe('0.05 AED');
      expect(formatMicros(10_000n, CurrencyCode.GBP)).toBe('0.01 GBP');
      expect(formatMicros(-15_750_000n, CurrencyCode.USD)).toBe('-15.75 USD');
      expect(formatMicros(-500_000n, CurrencyCode.USD)).toBe('-0.50 USD');
      expect(formatMicros(-10_000n, CurrencyCode.USD)).toBe('-0.01 USD');
    });
  });

  // =========================================================================
  // 7. INTERACTIVE FORM TESTING (REACT TESTING LIBRARY)
  // =========================================================================
  describe('CreateCampaignForm Interactive Boundary Tests', () => {
    it('blocks submission and renders validation errors when boundary rules are violated', async () => {
      const handleSubmitSuccess = vi.fn();

      render(
        <WorkspaceProvider>
          <CreateCampaignForm onSubmitSuccess={handleSubmitSuccess} />
        </WorkspaceProvider>,
      );

      const nameInput = screen.getByTestId('input-campaign-name');
      const budgetInput = screen.getByTestId('input-daily-budget');
      const submitBtn = screen.getByTestId('submit-campaign-btn');

      // Set invalid 2-char name and $0 budget
      fireEvent.change(nameInput, { target: { value: 'AB' } });
      fireEvent.change(budgetInput, { target: { value: '0.00' } });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('error-campaign-name')).toHaveTextContent(
          'Campaign name must be at least 3 characters',
        );
        expect(screen.getByTestId('error-daily-budget')).toHaveTextContent(
          'Daily budget must be at least 1.00',
        );
      });

      expect(handleSubmitSuccess).not.toHaveBeenCalled();
    });

    it('blocks submission when headline exceeds 30 characters', async () => {
      const handleSubmitSuccess = vi.fn();

      render(
        <WorkspaceProvider>
          <CreateCampaignForm onSubmitSuccess={handleSubmitSuccess} />
        </WorkspaceProvider>,
      );

      const nameInput = screen.getByTestId('input-campaign-name');
      const headlineInput0 = screen.getByTestId('headline-input-0');
      const submitBtn = screen.getByTestId('submit-campaign-btn');

      fireEvent.change(nameInput, { target: { value: 'Valid Campaign Name' } });
      fireEvent.change(headlineInput0, { target: { value: 'A'.repeat(31) } });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('headline-error-0')).toHaveTextContent(
          'Google headline cannot exceed 30 characters',
        );
      });

      expect(handleSubmitSuccess).not.toHaveBeenCalled();
    });

    it('blocks submission when description exceeds 90 characters', async () => {
      const handleSubmitSuccess = vi.fn();

      render(
        <WorkspaceProvider>
          <CreateCampaignForm onSubmitSuccess={handleSubmitSuccess} />
        </WorkspaceProvider>,
      );

      const nameInput = screen.getByTestId('input-campaign-name');
      const descInput0 = screen.getByTestId('description-input-0');
      const submitBtn = screen.getByTestId('submit-campaign-btn');

      fireEvent.change(nameInput, { target: { value: 'Valid Campaign Name' } });
      fireEvent.change(descInput0, { target: { value: 'B'.repeat(91) } });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('description-error-0')).toHaveTextContent(
          'Google description cannot exceed 90 characters',
        );
      });

      expect(handleSubmitSuccess).not.toHaveBeenCalled();
    });

    it('allows adding headlines up to 15 items and then disables Add button', async () => {
      render(
        <WorkspaceProvider>
          <CreateCampaignForm />
        </WorkspaceProvider>,
      );

      const addBtn = screen.getByTestId('add-headline-btn');
      // Default form starts with 3 headlines
      expect(screen.getAllByTestId(/^headline-input-/)).toHaveLength(3);

      // Add 12 more headlines to reach 15
      for (let i = 0; i < 12; i++) {
        fireEvent.click(addBtn);
      }

      expect(screen.getAllByTestId(/^headline-input-/)).toHaveLength(15);
      expect(addBtn).toBeDisabled();
    });

    it('allows adding descriptions up to 4 items and then disables Add button', async () => {
      render(
        <WorkspaceProvider>
          <CreateCampaignForm />
        </WorkspaceProvider>,
      );

      const addBtn = screen.getByTestId('add-description-btn');
      // Default form starts with 2 descriptions
      expect(screen.getAllByTestId(/^description-input-/)).toHaveLength(2);

      // Add 2 more descriptions to reach 4
      fireEvent.click(addBtn);
      fireEvent.click(addBtn);

      expect(screen.getAllByTestId(/^description-input-/)).toHaveLength(4);
      expect(addBtn).toBeDisabled();
    });

    it('prevents deselecting the only remaining platform', async () => {
      render(
        <WorkspaceProvider>
          <CreateCampaignForm />
        </WorkspaceProvider>,
      );

      const googleToggle = screen.getByTestId('platform-toggle-google');
      const metaToggle = screen.getByTestId('platform-toggle-meta');

      // Initial state has META and GOOGLE
      // Deselect GOOGLE -> META remains
      fireEvent.click(googleToggle);

      // Try deselecting META (the last one)
      fireEvent.click(metaToggle);

      // Should still be selected (togglePlatform guards against deselecting the last one)
      expect(metaToggle.className).toContain('bg-primary');
    });
  });

  // =========================================================================
  // 8. CREATE WORKSPACE FORM SLUG & BOUNDARY CHECK
  // =========================================================================
  describe('CreateWorkspaceSchema & Form Empty Slug Behavior', () => {
    it('verifies CreateWorkspaceSchema behavior with empty string slug vs undefined', () => {
      // When slug is undefined, schema passes
      const resUndefined = CreateWorkspaceSchema.safeParse({
        name: 'Growth Ops',
        slug: undefined,
        baseCurrency: CurrencyCode.USD,
      });
      expect(resUndefined.success).toBe(true);

      // When slug is omitted, schema passes
      const resOmitted = CreateWorkspaceSchema.safeParse({
        name: 'Growth Ops',
        baseCurrency: CurrencyCode.USD,
      });
      expect(resOmitted.success).toBe(true);

      // Test whether empty string slug is accepted or rejected by schema
      const resEmptyString = CreateWorkspaceSchema.safeParse({
        name: 'Growth Ops',
        slug: '',
        baseCurrency: CurrencyCode.USD,
      });
      // Documenting the behavior: empty string fails regex /^[a-z0-9-]+$/ and min(2)
      // unless transformed or pre-processed.
      expect(resEmptyString.success).toBe(false);
    });

    it('successfully creates workspace with auto-generated slug when user submits CreateWorkspaceForm with default empty slug', async () => {
      const handleSuccess = vi.fn();

      render(
        <WorkspaceProvider>
          <CreateWorkspaceForm onSuccess={handleSuccess} />
        </WorkspaceProvider>,
      );

      const nameInput = screen.getByLabelText(/Workspace Name \*/i);
      const submitBtn = screen.getByRole('button', {
        name: /Create Workspace/i,
      });

      // User enters valid workspace name but leaves slug empty (defaults to '')
      fireEvent.change(nameInput, {
        target: { value: 'Global Marketing Hub' },
      });
      fireEvent.click(submitBtn);

      // Verify that zodResolver accepts empty slug and submission succeeds with auto-generated slug
      await waitFor(() => {
        expect(handleSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it('rejects invalid explicit slug format in CreateWorkspaceForm', async () => {
      const handleSuccess = vi.fn();

      render(
        <WorkspaceProvider>
          <CreateWorkspaceForm onSuccess={handleSuccess} />
        </WorkspaceProvider>,
      );

      const nameInput = screen.getByLabelText(/Workspace Name \*/i);
      const slugInput = screen.getByLabelText(/Slug/i);
      const submitBtn = screen.getByRole('button', {
        name: /Create Workspace/i,
      });

      fireEvent.change(nameInput, {
        target: { value: 'Global Marketing Hub' },
      });
      fireEvent.change(slugInput, {
        target: { value: 'INVALID_SLUG!' },
      });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(
            'Slug must contain only lowercase alphanumeric characters and hyphens',
          ),
        ).toBeInTheDocument();
      });

      expect(handleSuccess).not.toHaveBeenCalled();
    });
  });
});
