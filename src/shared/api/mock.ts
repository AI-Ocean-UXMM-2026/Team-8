import receipt from '../../../contracts/fixtures/operations/receipt-100-90.json';
import inHouse from '../../../contracts/fixtures/operations/delivery-in_house.json';
import thirdParty from '../../../contracts/fixtures/operations/delivery-third_party.json';
import empty from '../../../contracts/fixtures/operations/empty.json';
import forbidden from '../../../contracts/fixtures/operations/forbidden.json';
import stale from '../../../contracts/fixtures/operations/stale.json';
import invalid from '../../../contracts/fixtures/operations/invalid.json';
import pending from '../../../contracts/fixtures/cases/analysis-pending.json';
import caseSuccess from '../../../contracts/fixtures/cases/shortage-case.json';
import approval from '../../../contracts/fixtures/cases/approval-pending.json';
import providerError from '../../../contracts/fixtures/cases/provider-error.json';
import { ApiError, type Transport, type ApiRequest, validateRequest } from './transport';

export type MockScenario = 'success' | 'empty' | 'forbidden' | 'stale' | 'invalid' | 'provider-error';
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

// Fictitious development adapter, never an authentication/authorization simulator.
export function createMockTransport({ scenario = 'success' }: { scenario?: MockScenario } = {}): Transport {
  const replay = new Map<string, { fingerprint: string; result: unknown }>();
  let receiptPosted = false;
  return async <T>(request: ApiRequest): Promise<T> => {
    validateRequest(request);
    request.signal?.throwIfAborted();
    const url = new URL(request.path, 'https://mock.invalid');
    const fingerprint = canonical({ path: url.pathname, body: request.body ?? null });
    const key = `${request.method}:${url.pathname}:${request.idempotencyKey}`;
    const previous = request.method === 'POST' ? replay.get(key) : undefined;
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used for a different payload.');
      return structuredClone(previous.result) as T;
    }
    const forced = { forbidden, stale, invalid, 'provider-error': providerError }[scenario as 'forbidden' | 'stale' | 'invalid' | 'provider-error'];
    if (forced) throw new ApiError(forced.status, forced.body.error.code, forced.body.error.message);
    let result: unknown;
    if (request.method === 'GET' && url.pathname === '/api/shipments') {
      const offset = url.searchParams.get('cursor');
      if (offset && offset !== 'mock-page-2') throw new ApiError(422, 'VALIDATION_ERROR', 'Unknown mock cursor.');
      const all = scenario === 'empty' ? [] : [...inHouse.body.items, ...thirdParty.body.items];
      const limit = Number(url.searchParams.get('limit') ?? 25);
      const start = offset ? 1 : 0;
      result = { ...empty.body, items: all.slice(start, start + limit), next_cursor: start === 0 && limit === 1 && all.length > 1 ? 'mock-page-2' : null };
    } else if (request.method === 'GET' && url.pathname === caseSuccess.path) result = caseSuccess.body;
    else if (request.method === 'GET' && url.pathname === approval.path) result = approval.body;
    else if (request.method === 'POST' && url.pathname === pending.path) result = pending.body;
    else if (request.method === 'POST' && url.pathname === receipt.path) {
      if (canonical(request.body) !== canonical(receipt.request)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'This mock supports only the published 100/90 receipt request.');
      }
      if (receiptPosted) throw new ApiError(409, 'STALE_VERSION', 'This fixture receipt has already been posted.');
      receiptPosted = true;
      result = receipt.body;
    } else throw new ApiError(404, 'NOT_FOUND', 'No fixture exists for this operation.');
    if (request.method === 'POST') replay.set(key, { fingerprint, result: structuredClone(result) });
    return structuredClone(result) as T;
  };
}
