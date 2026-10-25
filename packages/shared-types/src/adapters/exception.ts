import { Platform } from '../enums/platform.enum';

export type ErrorCategory =
  | 'AUTH_EXPIRED'
  | 'RATE_LIMITED'
  | 'CREATIVE_REJECTED'
  | 'BUDGET_TOO_LOW'
  | 'PLATFORM_OUTAGE'
  | 'VALIDATION_ERROR';

export interface PlatformNormalizedExceptionDto {
  errorCategory: ErrorCategory;
  isRetryable: boolean;
  humanReadableMessageAr: string;
  rawPlatformError: Record<string, unknown>;
  platform: Platform;
  statusCode?: number;
  retryAfterSeconds?: number;
}

export class PlatformNormalizedException extends Error {
  readonly errorCategory: ErrorCategory;
  readonly isRetryable: boolean;
  readonly humanReadableMessageAr: string;
  readonly rawPlatformError: Record<string, unknown>;
  readonly platform: Platform;
  readonly statusCode?: number;
  readonly retryAfterSeconds?: number;

  constructor(params: PlatformNormalizedExceptionDto) {
    super(
      `[${params.platform}] ${params.errorCategory}: ${params.humanReadableMessageAr}`,
    );
    this.name = 'PlatformNormalizedException';
    this.errorCategory = params.errorCategory;
    this.isRetryable = params.isRetryable;
    this.humanReadableMessageAr = params.humanReadableMessageAr;
    this.rawPlatformError = params.rawPlatformError;
    this.platform = params.platform;
    this.statusCode = params.statusCode;
    this.retryAfterSeconds = params.retryAfterSeconds;
    Object.setPrototypeOf(this, PlatformNormalizedException.prototype);
  }

  toDto(): PlatformNormalizedExceptionDto {
    return {
      errorCategory: this.errorCategory,
      isRetryable: this.isRetryable,
      humanReadableMessageAr: this.humanReadableMessageAr,
      rawPlatformError: this.rawPlatformError,
      platform: this.platform,
      statusCode: this.statusCode,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}
