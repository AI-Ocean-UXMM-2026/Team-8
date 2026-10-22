import { ApiError } from '../api/transport';
// Unknown write outcomes must keep the same request recoverable. Never turn a
// timeout into a claim that a write failed, and never expose raw server errors.
export function safeError(error: unknown, unconfirmedWrite = false): string {
  if (unconfirmedWrite) return 'We could not confirm whether your changes were saved. Retry the same request before entering another.';
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has ended. Sign in to continue.';
    if (error.status === 403) return 'Your account cannot access this record. Contact your warehouse operator if you need access.';
    if (error.status === 404) return 'This record is unavailable. Refresh the list or ask your warehouse operator.';
    if (error.status === 409) return 'This record has changed. Refresh it before trying again.';
    if (error.status === 422 || error.status === 400) return 'Check the required fields and quantities, then try again.';
    if (error.status === 429) return 'Too many requests. Wait a moment and try again.';
    if (error.code === 'NETWORK_ERROR' || error.status === 0) return 'Check your connection and try again.';
  }
  return 'The service is unavailable. Try again shortly or contact your warehouse operator.';
}
