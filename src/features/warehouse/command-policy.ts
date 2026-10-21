import { ApiError } from '../../shared/api';

// A rejection of a retry says nothing about an earlier attempt's commit outcome.
// Keep its key until a valid replay succeeds or an operator reconciles the record.
export function canReleaseCommand(error: unknown, retrying: boolean): boolean {
  if (retrying || !(error instanceof ApiError)) return false;
  const known: Record<number, string[]> = {
    400: ['VALIDATION_ERROR'], 401: ['UNAUTHENTICATED'], 403: ['FORBIDDEN'],
    404: ['NOT_FOUND'], 409: ['STALE_VERSION', 'STOCK_UNAVAILABLE'], 422: ['VALIDATION_ERROR'],
  };
  return known[error.status]?.includes(error.code) ?? false;
}
