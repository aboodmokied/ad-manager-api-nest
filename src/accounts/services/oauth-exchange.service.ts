import { Injectable, Logger } from '@nestjs/common';
import { OAUTH_HTTP_TIMEOUT_MS } from '../constants/accounts.constants';

/**
 * Error thrown whenever an exchange against an advertising platform fails.
 * The message never contains tokens, secrets or user data so it is safe to
 * expose to logs and API responses.
 */
export class OAuthExchangeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OAuthExchangeError';
  }
}

interface RequestOptions {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
}

/**
 * Thin typed HTTP client for platform token/campaign endpoints.
 *
 * - enforces a timeout on every request (no hanging callbacks);
 * - parses JSON defensively;
 * - wraps every failure into OAuthExchangeError with a sanitized message;
 * - logs failures **without** ever logging tokens or raw payloads.
 */
@Injectable()
export class OAuthExchangeService {
  private readonly logger = new Logger(OAuthExchangeService.name);

  async getJson(url: string, headers?: Record<string, string>): Promise<any> {
    return this.request(url, { method: 'GET', headers });
  }

  async postForm(
    url: string,
    params: Record<string, string>,
    headers?: Record<string, string>,
  ): Promise<any> {
    return this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: new URLSearchParams(params).toString(),
    });
  }

  async postJson(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<any> {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  private async request(url: string, options: RequestOptions): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OAUTH_HTTP_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: options.method,
          headers: options.headers,
          body: options.body,
          signal: controller.signal,
        });
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          throw new OAuthExchangeError('The advertising platform timed out');
        }
        throw new OAuthExchangeError(
          'Could not reach the advertising platform. Please try again later.',
        );
      }

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const code = this.extractErrorCode(data);
        this.logger.warn(
          `Ad platform API error: HTTP ${response.status}${code ? ` (${code})` : ''}`,
        );
        throw new OAuthExchangeError(
          code
            ? `The advertising platform rejected the request (${code})`
            : `The advertising platform rejected the request (HTTP ${response.status})`,
        );
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Pulls a stable error code from platform error payloads (token-free). */
  private extractErrorCode(data: any): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    if (typeof data.error === 'string') return data.error;
    if (data.error?.code !== undefined) return String(data.error.code);
    if (data.error?.message) return undefined; // messages may leak details
    if (data.error?.error?.code !== undefined) {
      return String(data.error.error.code);
    }
    return undefined;
  }
}
