import { OAuthExchangeError } from '../services/oauth-exchange.service';
import { TokenExchangeResult } from '../interfaces/accounts.interfaces';

/** Hard cap so a provider that ignores paging parameters cannot loop forever. */
export const MAX_PAGINATION_PAGES = 100;

/** Default page size used by connectors that paginate with page/page_size. */
export const PAGE_SIZE = 100;

/**
 * Minor units per major unit for currencies without decimal subunits.
 * Everything else falls back to the common 100 (cents).
 */
const MINOR_UNITS_BY_CURRENCY: Record<string, number> = {
  JPY: 1,
  KRW: 1,
  CLP: 1,
  ISK: 1,
  TWD: 1,
  VND: 1,
};

/**
 * Converts a token exchange payload into the unified TokenExchangeResult.
 * Throws a sanitized error (platform name only) when no access token exists.
 */
export function toTokenResult(
  data: any,
  platformName: string,
): TokenExchangeResult {
  if (!data?.access_token) {
    throw new OAuthExchangeError(
      `${platformName} did not return an access token`,
    );
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in:
      data.expires_in !== undefined && data.expires_in !== null
        ? Number(data.expires_in)
        : undefined,
  };
}

/**
 * Converts a platform minor-unit amount into major currency units using the
 * reported currency (defaults to a 2-decimal currency when unknown).
 */
export function fromMinorUnits(
  amount: unknown,
  currencyCode?: string,
): number | undefined {
  if (amount === undefined || amount === null) return undefined;
  const divisor =
    MINOR_UNITS_BY_CURRENCY[(currencyCode ?? '').toUpperCase()] ?? 100;
  return Number(amount) / divisor;
}

/** Converts a platform micro-currency amount (1/1,000,000) into major units. */
export function fromMicroUnits(amount: unknown): number | undefined {
  if (amount === undefined || amount === null) return undefined;
  return Number(amount) / 1_000_000;
}
