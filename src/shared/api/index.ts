export { createApiClient, type ApiClient } from './client';
export { createLiveTransport, ApiError, type Schemas } from './transport';
// Import mock.ts explicitly only in demo/development flows. Never fall back on live failure.
