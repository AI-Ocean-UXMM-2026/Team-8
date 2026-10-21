import type { components } from '../../../contracts/generated/api';

export type Schemas = components['schemas'];
export type ApiRequest = {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
export type Transport = <T>(request: ApiRequest) => Promise<T>;

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string,
    public readonly correlationId: string | null = null) { super(message); this.name = 'ApiError'; }
}

export const isUUID = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Bound providers/body readers even when their promises do not support cancellation.
// A late completion is ignored and cannot advance the request to its next step.
function abortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return operation();
    }).then(value => {
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    });
  });
}

export function validateRequest(request: ApiRequest) {
  // Only internal API paths. Never send tokens to a URL supplied by a record.
  const pathname = request.path.split('?')[0];
  if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(pathname) || pathname.includes('//') || /[#\\\r\n]/.test(request.path)) {
    throw new ApiError(400, 'INVALID_PATH', 'Invalid API path.');
  }
  if (request.method === 'POST' && (!request.idempotencyKey || !isUUID(request.idempotencyKey))) {
    throw new ApiError(400, 'IDEMPOTENCY_REQUIRED', 'A stable UUID idempotency key is required.');
  }
}

export function createLiveTransport({ baseUrl, getAccessToken, fetcher = fetch, timeoutMs = 15_000 }: {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Transport {
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    !(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) {
    throw new Error('API origin must use HTTPS (HTTP is allowed for localhost only).');
  }
  return async <T>(request: ApiRequest): Promise<T> => {
    validateRequest(request);
    request.signal?.throwIfAborted();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout.signal]) : timeout.signal;
    let correlationId: string | null = null;
    try {
      const token = await abortable(getAccessToken, signal);
      if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      let response: Response;
      try {
        response = await abortable(() => fetcher(new URL(request.path, base), {
          method: request.method, credentials: 'omit', redirect: 'error', cache: 'no-store', signal,
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}`,
            ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(request.idempotencyKey ? { 'Idempotency-Key': request.idempotencyKey } : {}) },
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        }), signal);
      } catch {
        signal.throwIfAborted();
        throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the API.');
      }
      correlationId = response.headers.get('X-Correlation-ID');
      let data: unknown;
      try { data = await abortable(() => response.json(), signal); }
      catch {
        signal.throwIfAborted();
        throw new ApiError(response.status, 'INVALID_RESPONSE', 'API returned an unreadable response.', correlationId);
      }
      signal.throwIfAborted();
      if (!response.ok) {
        const envelope = data as { error?: { code?: unknown; message?: unknown } };
        throw new ApiError(response.status,
          typeof envelope?.error?.code === 'string' ? envelope.error.code : 'HTTP_ERROR',
          typeof envelope?.error?.message === 'string' ? envelope.error.message : 'Request failed.', correlationId);
      }
      return data as T;
    } catch (error) {
      if (signal.aborted) {
        if (timeout.signal.aborted && signal.reason === timeout.signal.reason) {
          throw new ApiError(0, 'REQUEST_TIMEOUT', 'Request timed out. Retry with the same idempotency key.', correlationId);
        }
        throw signal.reason;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
