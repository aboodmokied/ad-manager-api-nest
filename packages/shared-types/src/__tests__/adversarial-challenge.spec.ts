import {
  CurrencyCode,
  CurrencyMicros,
  MICROS_MULTIPLIER,
  CENTS_MULTIPLIER,
  dollarsToMicros,
  microsToCents,
  centsToMicros,
  formatMicros,
  Platform,
  PlatformNormalizedException,
  PlatformNormalizedExceptionDto,
  ErrorCategory,
  CampaignStatus,
  VALID_STATUS_TRANSITIONS,
  isValidStatusTransition,
  GoogleCampaignOverrideSchema,
  GoogleCreativeAdOverrideSchema,
  GoogleTargetingSetOverrideSchema,
  MetaCampaignOverrideSchema,
  MetaCreativeAdOverrideSchema,
  MetaTargetingSetOverrideSchema,
} from '../index';

describe('Adversarial Challenge Test Suite — Milestone 2 (Shared Types & Contracts)', () => {
  // =========================================================================
  // 1. FINANCIAL PRECISION & CURRENCY MATH STRESS-TESTING
  // =========================================================================
  describe('Financial Precision & Currency Stress Tests', () => {
    describe('Sub-cent precision amounts', () => {
      it('converts minimal sub-cent amount (0.000001 -> 1n micro)', () => {
        expect(dollarsToMicros('0.000001')).toBe(1n);
        expect(dollarsToMicros(0.000001)).toBe(1n);
      });

      it('converts negative minimal sub-cent amount (-0.000001 -> -1n micro)', () => {
        expect(dollarsToMicros('-0.000001')).toBe(-1n);
        expect(dollarsToMicros(-0.000001)).toBe(-1n);
      });

      it('handles various sub-cent fractional amounts up to 6 decimal places', () => {
        expect(dollarsToMicros('0.000002')).toBe(2n);
        expect(dollarsToMicros('-0.000002')).toBe(-2n);
        expect(dollarsToMicros('0.000009')).toBe(9n);
        expect(dollarsToMicros('-0.000009')).toBe(-9n);
        expect(dollarsToMicros('0.000010')).toBe(10n);
        expect(dollarsToMicros('0.000099')).toBe(99n);
        expect(dollarsToMicros('0.000100')).toBe(100n);
        expect(dollarsToMicros('0.009999')).toBe(9_999n);
      });

      it('truncates decimals beyond 6 decimal places without precision explosion', () => {
        expect(dollarsToMicros('0.0000019')).toBe(1n);
        expect(dollarsToMicros('-0.0000019')).toBe(-1n);
        expect(dollarsToMicros('0.0000001')).toBe(0n); // 0.1 micro truncates to 0
        expect(dollarsToMicros('0.123456789012345')).toBe(123_456n);
        expect(dollarsToMicros('-0.123456789012345')).toBe(-123_456n);
      });
    });

    describe('Zero and boundary empty/whitespace values', () => {
      it('handles zero in string and number variants', () => {
        expect(dollarsToMicros(0)).toBe(0n);
        expect(dollarsToMicros('0')).toBe(0n);
        expect(dollarsToMicros('0.0')).toBe(0n);
        expect(dollarsToMicros('0.000000')).toBe(0n);
        expect(dollarsToMicros('-0')).toBe(0n);
        expect(dollarsToMicros('-0.0')).toBe(0n);
        expect(dollarsToMicros('-0.000000')).toBe(0n);
        expect(dollarsToMicros('+0')).toBe(0n);
      });

      it('handles empty or whitespace strings as 0n', () => {
        expect(dollarsToMicros('')).toBe(0n);
        expect(dollarsToMicros('   ')).toBe(0n);
        expect(dollarsToMicros('.')).toBe(0n);
        expect(dollarsToMicros('-.')).toBe(0n);
        expect(dollarsToMicros('+.')).toBe(0n);
      });
    });

    describe('Negative numbers and sign handling', () => {
      it('converts whole and fractional negative amounts', () => {
        expect(dollarsToMicros('-1')).toBe(-1_000_000n);
        expect(dollarsToMicros(-1)).toBe(-1_000_000n);
        expect(dollarsToMicros('-0.50')).toBe(-500_000n);
        expect(dollarsToMicros(-0.5)).toBe(-500_000n);
        expect(dollarsToMicros('-10.05')).toBe(-10_050_000n);
        expect(dollarsToMicros('-99.99')).toBe(-99_990_000n);
      });

      it('handles explicit positive prefix sign', () => {
        expect(dollarsToMicros('+1')).toBe(1_000_000n);
        expect(dollarsToMicros('+0.000001')).toBe(1n);
        expect(dollarsToMicros('+100.50')).toBe(100_500_000n);
      });
    });

    describe('Large amounts ($100M+)', () => {
      it('accurately converts $100 Million without 64-bit integer overflow', () => {
        const hundredMillionDollars = '100000000';
        const expectedMicros = 100_000_000_000_000n; // 100 trillion micros
        expect(dollarsToMicros(hundredMillionDollars)).toBe(expectedMicros);
        expect(dollarsToMicros(100_000_000)).toBe(expectedMicros);
        expect(dollarsToMicros('-100000000')).toBe(-expectedMicros);
      });

      it('handles $100 Million with fractional cents and sub-cents', () => {
        expect(dollarsToMicros('100000000.99')).toBe(100_000_000_990_000n);
        expect(dollarsToMicros('100000000.000001')).toBe(100_000_000_000_001n);
        expect(dollarsToMicros('-100000000.000001')).toBe(
          -100_000_000_000_001n,
        );
      });

      it('handles $1 Billion enterprise ad budgets', () => {
        const billionMicros = 1_000_000_000_000_000n; // 1 quadrillion micros
        expect(dollarsToMicros('1000000000')).toBe(billionMicros);
        expect(formatMicros(billionMicros, CurrencyCode.USD)).toBe(
          '1000000000.00 USD',
        );
      });
    });

    describe('microsToCents and centsToMicros Round-Trips', () => {
      it('perfectly round-trips integer cents through micros and back', () => {
        const testCentValues = [
          0n,
          1n,
          -1n,
          5n,
          -5n,
          99n,
          -99n,
          100n, // $1.00
          -100n,
          1050n, // $10.50
          -1050n,
          10_000_000_000n, // $100M in cents
          -10_000_000_000n,
        ];

        for (const cents of testCentValues) {
          const micros = centsToMicros(cents);
          const roundTrippedCents = microsToCents(micros);
          expect(roundTrippedCents).toBe(cents);
        }
      });

      it('fuzz tests 1,000 cent values across random positive and negative ranges', () => {
        for (let i = 0; i < 1000; i++) {
          const randomCent = BigInt(
            Math.floor((Math.random() - 0.5) * 20_000_000),
          );
          const micros = centsToMicros(randomCent);
          expect(microsToCents(micros)).toBe(randomCent);
        }
      });

      it('satisfies quotient-remainder identity for sub-cent micros: centsToMicros(microsToCents(M)) + (M % 10000n) === M', () => {
        const subCentMicros = [
          1n,
          -1n,
          9_999n,
          -9_999n,
          10_001n,
          -10_001n,
          12_345_678n,
          -12_345_678n,
          99_999_999_999n,
          -99_999_999_999n,
        ];

        for (const m of subCentMicros) {
          const cents = microsToCents(m);
          const reconstructed = centsToMicros(cents) + (m % CENTS_MULTIPLIER);
          expect(reconstructed).toBe(m);
        }
      });
    });

    describe('formatMicros human-readable formatting', () => {
      it('formats single-digit cents with leading zero padding (10.05 USD)', () => {
        const tenPointZeroFive = 10_050_000n;
        expect(formatMicros(tenPointZeroFive, CurrencyCode.USD)).toBe(
          '10.05 USD',
        );
      });

      it('formats negative single-digit cents (-5.02 EUR)', () => {
        const minusFivePointZeroTwo = -5_020_000n;
        expect(formatMicros(minusFivePointZeroTwo, CurrencyCode.EUR)).toBe(
          '-5.02 EUR',
        );
      });

      it('formats zero and exact cents padding', () => {
        expect(formatMicros(0n)).toBe('0.00 USD');
        expect(formatMicros(10_000_000n)).toBe('10.00 USD');
        expect(formatMicros(-10_000_000n)).toBe('-10.00 USD');
        expect(formatMicros(10_010_000n)).toBe('10.01 USD');
        expect(formatMicros(10_090_000n)).toBe('10.09 USD');
        expect(formatMicros(-10_010_000n)).toBe('-10.01 USD');
      });

      it('formats small negative fractions correctly', () => {
        expect(formatMicros(-50_000n, CurrencyCode.USD)).toBe('-0.05 USD');
        expect(formatMicros(-10_000n, CurrencyCode.USD)).toBe('-0.01 USD');
        expect(formatMicros(-250_000n, CurrencyCode.SAR)).toBe('-0.25 SAR');
      });

      it('formats $100M accurately', () => {
        const hundredMillion = 100_000_000_000_000n;
        expect(formatMicros(hundredMillion, CurrencyCode.USD)).toBe(
          '100000000.00 USD',
        );
        expect(formatMicros(-hundredMillion, CurrencyCode.USD)).toBe(
          '-100000000.00 USD',
        );
      });

      it('handles all CurrencyCode values', () => {
        const amount = 50_000_000n; // 50 units
        expect(formatMicros(amount, CurrencyCode.USD)).toBe('50.00 USD');
        expect(formatMicros(amount, CurrencyCode.EUR)).toBe('50.00 EUR');
        expect(formatMicros(amount, CurrencyCode.SAR)).toBe('50.00 SAR');
        expect(formatMicros(amount, CurrencyCode.AED)).toBe('50.00 AED');
        expect(formatMicros(amount, CurrencyCode.EGP)).toBe('50.00 EGP');
        expect(formatMicros(amount, CurrencyCode.GBP)).toBe('50.00 GBP');
      });
    });
  });

  // =========================================================================
  // 2. PLATFORMNORMALIZEDEXCEPTION DTO SERIALIZATION & CATEGORIES
  // =========================================================================
  describe('PlatformNormalizedException Adversarial Tests', () => {
    it('properly serializes and deserializes across network/IPC boundaries (JSON round-trip)', () => {
      const originalDto: PlatformNormalizedExceptionDto = {
        platform: Platform.META,
        errorCategory: 'RATE_LIMITED',
        isRetryable: true,
        humanReadableMessageAr: 'تم تجاوز معدل الطلبات المسموح به لمنصة ميتا.',
        rawPlatformError: {
          error: {
            message: 'User request limit reached',
            code: 17,
            is_transient: true,
            error_subcode: 2446079,
          },
        },
        statusCode: 429,
        retryAfterSeconds: 120,
      };

      const exception = new PlatformNormalizedException(originalDto);
      const dto = exception.toDto();

      // Ensure toDto() produces a clean JSON serializable object
      const jsonString = JSON.stringify(dto);
      const parsedDto = JSON.parse(
        jsonString,
      ) as PlatformNormalizedExceptionDto;

      expect(parsedDto).toEqual(originalDto);

      // Verify reconstitution
      const reconstitutedException = new PlatformNormalizedException(parsedDto);
      expect(reconstitutedException).toBeInstanceOf(
        PlatformNormalizedException,
      );
      expect(reconstitutedException).toBeInstanceOf(Error);
      expect(reconstitutedException.errorCategory).toBe('RATE_LIMITED');
      expect(reconstitutedException.isRetryable).toBe(true);
      expect(reconstitutedException.statusCode).toBe(429);
      expect(reconstitutedException.retryAfterSeconds).toBe(120);
      expect(reconstitutedException.message).toBe(exception.message);
      expect(reconstitutedException.toDto()).toEqual(dto);
    });

    it('handles DTO without optional statusCode and retryAfterSeconds', () => {
      const dtoWithoutOptionals: PlatformNormalizedExceptionDto = {
        platform: Platform.GOOGLE,
        errorCategory: 'CREATIVE_REJECTED',
        isRetryable: false,
        humanReadableMessageAr:
          'تم رفض الإعلان الإبداعي بسبب انتهاك سياسة العلامات التجارية.',
        rawPlatformError: {
          policyViolationDetails: {
            violatingText: 'SuperBrand',
            policyName: 'TRADEMARKS',
          },
        },
      };

      const ex = new PlatformNormalizedException(dtoWithoutOptionals);
      expect(ex.statusCode).toBeUndefined();
      expect(ex.retryAfterSeconds).toBeUndefined();
      expect(ex.toDto().statusCode).toBeUndefined();
      expect(ex.toDto().retryAfterSeconds).toBeUndefined();
      expect(ex.toDto().platform).toBe(Platform.GOOGLE);
    });

    it('handles complex nested rawPlatformError with arrays and nulls', () => {
      const complexRawError = {
        meta: null,
        batch: [
          { code: 400, message: 'Invalid field placement' },
          { code: 403, message: 'Forbidden scope' },
        ],
        details: {
          traceId: 'tr-abc-123',
          timestamp: '2026-10-24T22:00:00Z',
        },
      };

      const ex = new PlatformNormalizedException({
        platform: Platform.SNAPCHAT,
        errorCategory: 'VALIDATION_ERROR',
        isRetryable: false,
        humanReadableMessageAr: 'بيانات غير صالحة',
        rawPlatformError: complexRawError,
      });

      expect(ex.rawPlatformError).toEqual(complexRawError);
      expect(ex.toDto().rawPlatformError).toEqual(complexRawError);
    });

    it('strictly covers all 6 ErrorCategory values without missing variants', () => {
      const requiredCategories: ErrorCategory[] = [
        'AUTH_EXPIRED',
        'RATE_LIMITED',
        'CREATIVE_REJECTED',
        'BUDGET_TOO_LOW',
        'PLATFORM_OUTAGE',
        'VALIDATION_ERROR',
      ];

      for (const category of requiredCategories) {
        const ex = new PlatformNormalizedException({
          platform: Platform.TIKTOK,
          errorCategory: category,
          isRetryable:
            category === 'RATE_LIMITED' || category === 'PLATFORM_OUTAGE',
          humanReadableMessageAr: `اختبار تصنيف: ${category}`,
          rawPlatformError: { category },
        });

        expect(ex.errorCategory).toBe(category);
        expect(ex.name).toBe('PlatformNormalizedException');
        expect(ex.toDto().errorCategory).toBe(category);
      }
    });

    it('verifies standard Error prototype chain and stack preservation', () => {
      const ex = new PlatformNormalizedException({
        platform: Platform.X,
        errorCategory: 'PLATFORM_OUTAGE',
        isRetryable: true,
        humanReadableMessageAr: 'انقطاع مؤقت في منصة إكس.',
        rawPlatformError: {},
      });

      expect(ex instanceof Error).toBe(true);
      expect(ex instanceof PlatformNormalizedException).toBe(true);
      expect(ex.stack).toBeDefined();
      expect(typeof ex.stack).toBe('string');
      expect(ex.toString()).toContain(
        'PlatformNormalizedException: [X] PLATFORM_OUTAGE: انقطاع مؤقت في منصة إكس.',
      );
    });
  });

  // =========================================================================
  // 3. CAMPAIGN STATUS LIFECYCLE & TRANSITION MATRIX
  // =========================================================================
  describe('Campaign Status Lifecycle State Machine Stress Tests', () => {
    const allStatuses = Object.values(CampaignStatus);

    it('verifies all 8 CampaignStatus values exist', () => {
      expect(allStatuses).toHaveLength(8);
      expect(allStatuses.sort()).toEqual(
        [
          'DRAFT',
          'FAILED',
          'LIVE',
          'PARTIALLY_LIVE',
          'PAUSED',
          'PRE_VALIDATING',
          'PROCESSING_MEDIA',
          'QUEUED_FOR_PUBLISH',
        ].sort(),
      );
    });

    it('exhaustively tests complete 8x8 (64 transitions) state matrix', () => {
      for (const from of allStatuses) {
        const allowedTargets = VALID_STATUS_TRANSITIONS[from];
        expect(allowedTargets).toBeDefined();

        for (const to of allStatuses) {
          const isValid = isValidStatusTransition(from, to);
          const isAllowedInMap = allowedTargets.includes(to);

          expect(isValid).toBe(isAllowedInMap);
        }
      }
    });

    it('forbids self-transitions for all states', () => {
      for (const status of allStatuses) {
        expect(isValidStatusTransition(status, status)).toBe(false);
      }
    });

    it('allows failure transition to FAILED from every pre-live and active state', () => {
      const statesThatCanFail = [
        CampaignStatus.DRAFT,
        CampaignStatus.PRE_VALIDATING,
        CampaignStatus.PROCESSING_MEDIA,
        CampaignStatus.QUEUED_FOR_PUBLISH,
        CampaignStatus.PARTIALLY_LIVE,
        CampaignStatus.LIVE,
        CampaignStatus.PAUSED,
      ];

      for (const status of statesThatCanFail) {
        expect(isValidStatusTransition(status, CampaignStatus.FAILED)).toBe(
          true,
        );
      }
    });

    it('allows recovery transitions from FAILED back to PRE_VALIDATING and DRAFT', () => {
      expect(
        isValidStatusTransition(
          CampaignStatus.FAILED,
          CampaignStatus.PRE_VALIDATING,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(CampaignStatus.FAILED, CampaignStatus.DRAFT),
      ).toBe(true);
      // But forbids direct jump from FAILED to LIVE or QUEUED_FOR_PUBLISH
      expect(
        isValidStatusTransition(CampaignStatus.FAILED, CampaignStatus.LIVE),
      ).toBe(false);
      expect(
        isValidStatusTransition(
          CampaignStatus.FAILED,
          CampaignStatus.QUEUED_FOR_PUBLISH,
        ),
      ).toBe(false);
    });

    it('validates partial-live recovery loop transitions', () => {
      // PARTIALLY_LIVE can be retried by going to QUEUED_FOR_PUBLISH
      expect(
        isValidStatusTransition(
          CampaignStatus.PARTIALLY_LIVE,
          CampaignStatus.QUEUED_FOR_PUBLISH,
        ),
      ).toBe(true);
      // PARTIALLY_LIVE can become full LIVE when remaining platforms succeed
      expect(
        isValidStatusTransition(
          CampaignStatus.PARTIALLY_LIVE,
          CampaignStatus.LIVE,
        ),
      ).toBe(true);
      // PARTIALLY_LIVE can be PAUSED
      expect(
        isValidStatusTransition(
          CampaignStatus.PARTIALLY_LIVE,
          CampaignStatus.PAUSED,
        ),
      ).toBe(true);
    });

    it('safely returns false for unrecognized or garbage status inputs without throwing', () => {
      expect(
        isValidStatusTransition(
          'NON_EXISTENT' as CampaignStatus,
          CampaignStatus.LIVE,
        ),
      ).toBe(false);
      expect(
        isValidStatusTransition(
          CampaignStatus.DRAFT,
          'INVALID' as CampaignStatus,
        ),
      ).toBe(false);
      expect(
        isValidStatusTransition('' as CampaignStatus, '' as CampaignStatus),
      ).toBe(false);
    });
  });

  // =========================================================================
  // 4. PLATFORM SCHEMA ADVERSARIAL STRESS-TESTS (Google Ads RSA & Meta Ads)
  // =========================================================================
  describe('Platform Override Schemas Stress Tests', () => {
    describe('Google Ads RSA Headlines and Descriptions', () => {
      it('rejects headlines longer than 30 characters', () => {
        const invalidHeadlinePayload = {
          adFormat: 'RESPONSIVE_SEARCH_AD' as const,
          headlines: [
            { text: 'Valid Headline 1' },
            { text: 'Valid Headline 2' },
            {
              text: 'This headline is way too long and exceeds thirty characters',
            }, // 58 chars
          ],
          descriptions: [
            { text: 'Valid description 1' },
            { text: 'Valid description 2' },
          ],
        };

        const result = GoogleCreativeAdOverrideSchema.safeParse(
          invalidHeadlinePayload,
        );
        expect(result.success).toBe(false);
      });

      it('rejects RSA with fewer than 3 headlines', () => {
        const payload = {
          adFormat: 'RESPONSIVE_SEARCH_AD' as const,
          headlines: [{ text: 'Headline 1' }, { text: 'Headline 2' }],
          descriptions: [{ text: 'Description 1' }, { text: 'Description 2' }],
        };
        const result = GoogleCreativeAdOverrideSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('rejects RSA with more than 15 headlines', () => {
        const headlines = Array.from({ length: 16 }, (_, i) => ({
          text: `Headline ${i + 1}`,
        }));
        const payload = {
          adFormat: 'RESPONSIVE_SEARCH_AD' as const,
          headlines,
          descriptions: [{ text: 'Description 1' }, { text: 'Description 2' }],
        };
        const result = GoogleCreativeAdOverrideSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('rejects descriptions longer than 90 characters', () => {
        const payload = {
          adFormat: 'RESPONSIVE_SEARCH_AD' as const,
          headlines: [
            { text: 'Headline 1' },
            { text: 'Headline 2' },
            { text: 'Headline 3' },
          ],
          descriptions: [
            { text: 'Valid description 1' },
            { text: 'A'.repeat(91) }, // 91 chars
          ],
        };
        const result = GoogleCreativeAdOverrideSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('validates customerId format (123-456-7890 or 1234567890)', () => {
        expect(
          GoogleCampaignOverrideSchema.safeParse({ customerId: '123-456-7890' })
            .success,
        ).toBe(true);
        expect(
          GoogleCampaignOverrideSchema.safeParse({ customerId: '1234567890' })
            .success,
        ).toBe(true);
        expect(
          GoogleCampaignOverrideSchema.safeParse({ customerId: 'invalid-id' })
            .success,
        ).toBe(false);
        expect(
          GoogleCampaignOverrideSchema.safeParse({ customerId: '12-345-6789' })
            .success,
        ).toBe(false);
      });
    });

    describe('Meta Ads Overrides Stress Tests', () => {
      it('rejects primary text exceeding 2200 characters', () => {
        const payload = {
          pageId: '1234567890',
          headline: 'Valid Headline',
          primaryText: 'x'.repeat(2201),
        };
        const result = MetaCreativeAdOverrideSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('rejects headline exceeding 255 characters', () => {
        const payload = {
          pageId: '1234567890',
          headline: 'x'.repeat(256),
          primaryText: 'Valid primary text',
        };
        const result = MetaCreativeAdOverrideSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('rejects missing pageId for Meta ad creative', () => {
        const payload = {
          headline: 'Valid Headline',
          primaryText: 'Valid primary text',
        };
        const result = MetaCreativeAdOverrideSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });

      it('enforces at least 1 publisher platform in targeting set', () => {
        const payload = {
          optimizationGoal: 'LINK_CLICKS' as const,
          publisherPlatforms: [],
        };
        const result = MetaTargetingSetOverrideSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });
  });
});
