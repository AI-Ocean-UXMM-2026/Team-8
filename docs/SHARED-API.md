# One frontend API client (SET-07)

FE1 and FE2 import `createApiClient` from `src/shared/api`. It consumes the generated schemas from contracts/generated/api.d.ts. Add agreed endpoints here as their domain contracts land; never create another fetch wrapper or Next.js mutation route.

```ts
import { createApiClient, createLiveTransport } from './shared/api';
const api = createApiClient(createLiveTransport({
  baseUrl: 'http://localhost:8000',
  getAccessToken: async () => sessionStore.currentAccessToken(),
}));
const shipments = await api.listShipments({ limit: 25 });
```

The session store in this example is supplied by the later auth UI; it is not implemented here. Read the token for each request, never retain a client-selected role/SME as permission. Live mutation routes are still planned and can return 404 until domain APIs are built. Network/auth/server failures are errors, never a reason to load fixtures. Do not use a service key or persist tokens in this client. The browser API origin must be HTTPS, except local HTTP development. Server CORS explicitly permits the frontend origin.

```ts
import { createApiClient } from './shared/api';
import { createMockTransport } from './shared/api/mock';
const demo = createApiClient(createMockTransport({ scenario: 'success' }));
```

Mock mode is selected explicitly by a demo/preview entry point. Import it separately to keep fixtures out of live bundles. Each instance isolates its fixture state. Available scenarios: success, empty, forbidden, stale, invalid, provider-error. The receipt mock only accepts the published 100/90 request; it does not emulate arbitrary real receiving. It implements replay/conflicting keys/stale duplicates to unblock frontend behavior. Mock responses are cloned and both delivery modes paginate with an opaque cursor.

For commands, generate one UUID idempotency key per user intent and reuse it across retries. Supply the authoritative expected_version from the last read. The transport never automatically retries a POST. `ApiError` carries status/code/message/correlationId; handle sign-in (401), forbidden (403), stale/conflict (409), validation (422), provider failure (503), timeout and network states. AbortSignal cancels abandoned requests and an explicit timeout bounds live fetch. Reconcile the persisted response before rendering success.

Validation: `npm run test:frontend` exercises shared mock/live behavior without external network calls. The `/foundation` preview uses this same client for the fixture shipment list.

Transport deadline covers token lookup, fetch and response-body parsing. Cancellation retains its original reason at every stage. A timed-out token lookup may finish inside the session provider later, but its result is ignored and cannot send a request. Timers and abort listeners are cleaned up after settlement.
