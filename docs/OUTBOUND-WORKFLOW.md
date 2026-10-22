# Outbound shipment workflow

Current SME order semantics: common warehouse stock is delivered **to the ordering SME**. See [SME shared stock](SME-SHARED-STOCK.md). Staff can explicitly select common or legacy SME stock; the accounting and physical-return rules below still apply.


Warehouse staff can create an outbound shipment on `/warehouse/shipments`, select one SME's inventory, enter a reference and quantities, review, and confirm. The existing SME order acceptance path remains available. Direct creation does not reserve stock; SME orders do. Both paths check physical stock when it leaves the warehouse.

For in-house delivery: set the destination, assign a rider, obtain rider acceptance, record pick and pack on shipment details, record rider pickup, then dispatch. Dispatch debits stock. Rider arrival, delivery proof and the SME's receipt confirmation remain separate gates.

For a third-party delivery: record carrier acceptance with uploaded evidence, waybill, package count, condition and acceptance time. The tracking URL is optional. The first handover debits stock for both direct shipments and SME orders; retries and later handovers of the same shipment cannot debit it again. Insufficient stock rolls back the handover and accounting together. Staff record subsequent carrier updates.

## Cancellation and physical returns

Both delivery modes expose cancellation. Cancellation stops the delivery/assignment and releases an unconsumed SME order reservation. It does not increase stock.

To receive goods back, staff first cancel the outbound shipment, then use **Receive returned goods** in delivery management. Submit the quantities physically received this time, the damaged quantity included in that count, a verification note and uploaded evidence belonging to the shipment. Multiple partial returns are allowed up to each product's shipped quantity. Good units increase available stock; damaged units increase quarantine. A shipment cancelled before dispatch/handover cannot create returned stock. An already delivered shipment is outside this cancellation-return workflow.

Counts, stock movements, shipment version, timeline, audit, outbox and replay result commit atomically. The shipment remains cancelled, and exception cases still require their own verification and closure. Pending submissions survive reload and retry with their original key and payload.

Historical external shipments without a recorded stock debit are rejected by the return command to prevent stock inflation. Reconcile these records with evidence before using a separate authorized stock correction; this migration does not invent historical movements.

## Installation and verification

Apply `supabase/migrations/20261023000300_be1_outbound_returns.sql` after the SME order migration, then restart the API and update the frontend. Local development files do not apply migrations or deploy hosted services automatically.

- `npm run test:outbound:database`: both handover paths, duplicate/repeated handover, insufficient stock rollback, cancellation without restocking, in-house and external returns, partial/damaged counts, bounds, atomic rollback, authorization, replay, audit and outbox.
- `npm run test:outbound:browser`: mobile direct-creation review, lost-response reload/replay, navigation, external cancellation, partial damaged return, lost-return replay and remaining counts. Uses fixture API/Auth responses, not live shipments.
- `npm run test:backend`: return API validation and user-scoped RPC dispatch, alongside existing workflows.
- `npm run test:database`: includes the outbound database regression suite.

Browser tests can use `PARCELCARE_TEST_BUILD=1` to isolate Next.js build files from the user's running development server. The outbound browser runner sets this automatically. Tests using that folder must run sequentially. Native Supabase Auth/Storage and production deployment still require their own environment.

The warehouse regression runner also supports a production fixture build. Public client settings must be supplied at build time, not only when starting the server:

```powershell
$env:PARCELCARE_TEST_BUILD='1'
$env:NEXT_PUBLIC_SUPABASE_URL='https://parcelcare-fixture.supabase.test'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture'
$env:NEXT_PUBLIC_PARCELCARE_API_URL='http://127.0.0.1:3112'
npm.cmd run build
$env:PARCELCARE_TEST_PRODUCTION='1'
npm.cmd run test:warehouse
```
