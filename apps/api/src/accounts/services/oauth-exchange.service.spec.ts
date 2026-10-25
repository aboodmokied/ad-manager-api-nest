import {
  OAuthExchangeError,
  OAuthExchangeService,
} from './oauth-exchange.service';

describe('OAuthExchangeService', () => {
  let service: OAuthExchangeService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    service = new OAuthExchangeService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function jsonResponse(
    body: unknown,
    ok = true,
    status = ok ? 200 : 500,
  ): Partial<Response> {
    return {
      ok,
      status,
      json: jest.fn().mockResolvedValue(body),
    } as Partial<Response>;
  }

  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'tok' }));
    const data = await service.getJson('https://api.example.com/token');
    expect(data).toEqual({ access_token: 'tok' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/token',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('throws a sanitized error that never contains tokens from the payload', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'invalid_token',
            message: 'Bad access_token=super-secret-token',
          },
        },
        false,
        401,
      ),
    );
    const error = await service
      .getJson('https://api.example.com/token')
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(OAuthExchangeError);
    expect(error.message).toContain('invalid_token');
    expect(error.message).not.toContain('super-secret-token');
  });

  it('keeps the generic message when the error payload has no usable code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'secret-refresh-token leaked' } },
        false,
        400,
      ),
    );
    const error = await service
      .getJson('https://api.example.com/token')
      .catch((e: Error) => e);
    expect(error.message).not.toContain('secret-refresh-token');
    expect(error.message).toContain('rejected');
  });

  it('reports a timeout with a sanitized message', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValue(abortError);
    const error = await service
      .getJson('https://api.example.com/token')
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(OAuthExchangeError);
    expect(error.message).toContain('timed out');
  });

  it('reports unreachable platforms without leaking the URL', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const error = await service
      .getJson('https://api.example.com/token?access_token=super-secret-token')
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(OAuthExchangeError);
    expect(error.message).not.toContain('super-secret-token');
  });
});
