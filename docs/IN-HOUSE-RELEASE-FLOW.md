# SME stock release → in-house delivery

Local implementation; no database migration is required. Run the frontend/API locally against your development configuration to test the screens. Automated database tests use a separate in-memory database and do not write to Supabase.

1. **SME → Stock Release Requests:** select owned products and quantities, use the saved SME location, choose a deadline, then submit. A centered confirmation dialog shows the request reference. Press **OK**. Only a confirmed successful command opens this dialog; an uncertain result continues to offer the original safe retry.
2. **Warehouse → Shipments → Stock release requests:** the accepted request is in Urgent or Can wait according to its deadline. Open its request details and choose **Prepare and dispatch**. This opens the delivery workspace, which shows the contents, SME contact/pin, progress and next responsible role.
3. **Warehouse preparation:** in Operational event, record **picked**, then **packed**, with the physical verification note and checkbox. These controls are now available on the delivery workspace itself. Do not record physical actions that have not happened.
4. **Warehouse assignment:** select an active in-house rider, add the handoff note and submit the assignment. The normal release flow enables assignment after packing. If there are no riders listed, an active rider account and rider record must already be configured; the app does not invent a courier.
5. **Rider → Courier workspace → Assigned deliveries:** accept the assignment, then confirm pickup after the warehouse has packed the goods. The courier workspace checks for updates every 15 seconds, so warehouse changes appear without a page reload.
6. **Warehouse dispatch:** after rider pickup, record the verified **dispatched** event in the same delivery workspace. Reserved stock is released/deducted atomically at this physical event, once. Assignment and acceptance alone do not deduct stock or mark delivery complete.
7. **Rider transport:** calculate the route to the saved SME pin, grant location permission and explicitly start GPS sharing. The warehouse and SME can view the shared route/location. At the actual SME location, record arrival using the arrival control. The backend requires a recent, sufficiently accurate location near the saved destination; do not bypass this gate for a live demo.
8. **Rider delivery proof:** upload actual shipment evidence, select it, enter the receiver and submit proof. The shipment remains in transit until SME confirmation. A proof submission by itself does not complete delivery.
9. **SME → request history → shipment/tracking:** once courier arrival and proof are available, check the goods, select the receipt acknowledgement and confirm receipt. The shipment becomes Delivered; GPS sharing ends and the request leaves the active release pools.

If goods are damaged, missing, delayed or cannot be delivered, use the existing rider/SME issue-report controls to open an exception instead of recording a successful physical step. Retrying an uncertain operation must reuse the saved command/key. Cancellation and physical returns remain explicit existing operations; these are not automatic success paths.

## Validation
- `npm run typecheck`
- `npm run test:frontend` (includes each transport handoff, proof-only vs delivered, and cancelled states)
- `node supabase/tests/release-transport.test.mjs` (fresh migrations; automatic SME release, idempotency, reservation, warehouse/rider authorization, pickup, dispatch, shared GPS/arrival, uploaded evidence and SME-only confirmation)

The earlier local dashboard optimization is also retained: live SME overview reuses its inventory instead of issuing a redundant catalogue read.
