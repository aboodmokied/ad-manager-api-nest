import {
  Platform,
  PlatformNormalizedException,
  PlatformNormalizedExceptionDto,
  ErrorCategory,
} from '../index';

describe('PlatformNormalizedException & Adapter Errors', () => {
  it('instantiates correctly as an Error subclass', () => {
    const errorDto: PlatformNormalizedExceptionDto = {
      platform: Platform.META,
      errorCategory: 'RATE_LIMITED',
      isRetryable: true,
      humanReadableMessageAr:
        'تم تجاوز الحد الأقصى للطلبات في منصة ميتا، يرجى المحاولة لاحقاً.',
      rawPlatformError: {
        error: {
          code: 80004,
          error_subcode: 2446079,
          message:
            'There have been too many calls to this ad-account. Wait a bit and try again.',
        },
      },
      statusCode: 429,
      retryAfterSeconds: 60,
    };

    const ex = new PlatformNormalizedException(errorDto);

    expect(ex).toBeInstanceOf(Error);
    expect(ex).toBeInstanceOf(PlatformNormalizedException);
    expect(ex.name).toBe('PlatformNormalizedException');
    expect(ex.platform).toBe(Platform.META);
    expect(ex.errorCategory).toBe('RATE_LIMITED');
    expect(ex.isRetryable).toBe(true);
    expect(ex.humanReadableMessageAr).toBe(
      'تم تجاوز الحد الأقصى للطلبات في منصة ميتا، يرجى المحاولة لاحقاً.',
    );
    expect(ex.statusCode).toBe(429);
    expect(ex.retryAfterSeconds).toBe(60);
    expect(ex.message).toContain('[META] RATE_LIMITED');
  });

  it('serializes to DTO accurately via toDto()', () => {
    const params: PlatformNormalizedExceptionDto = {
      platform: Platform.GOOGLE,
      errorCategory: 'AUTH_EXPIRED',
      isRetryable: false,
      humanReadableMessageAr:
        'انتهت صلاحية جلسة حساب إعلانات جوجل. يرجى إعادة ربط الحساب.',
      rawPlatformError: {
        status: 'UNAUTHENTICATED',
        code: 16,
        details:
          'The caller does not have permission to execute the specified operation.',
      },
      statusCode: 401,
    };

    const ex = new PlatformNormalizedException(params);
    const dto = ex.toDto();

    expect(dto).toEqual({
      platform: Platform.GOOGLE,
      errorCategory: 'AUTH_EXPIRED',
      isRetryable: false,
      humanReadableMessageAr:
        'انتهت صلاحية جلسة حساب إعلانات جوجل. يرجى إعادة ربط الحساب.',
      rawPlatformError: params.rawPlatformError,
      statusCode: 401,
      retryAfterSeconds: undefined,
    });
  });

  it('supports all defined ErrorCategory values', () => {
    const categories: ErrorCategory[] = [
      'AUTH_EXPIRED',
      'RATE_LIMITED',
      'CREATIVE_REJECTED',
      'BUDGET_TOO_LOW',
      'PLATFORM_OUTAGE',
      'VALIDATION_ERROR',
    ];

    for (const cat of categories) {
      const ex = new PlatformNormalizedException({
        platform: Platform.TIKTOK,
        errorCategory: cat,
        isRetryable: cat === 'RATE_LIMITED' || cat === 'PLATFORM_OUTAGE',
        humanReadableMessageAr: `خطأ تجريبي من فئة ${cat}`,
        rawPlatformError: {},
      });
      expect(ex.errorCategory).toBe(cat);
      expect(ex.message).toContain(cat);
    }
  });
});
