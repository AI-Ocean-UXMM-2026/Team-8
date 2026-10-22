# Warehouse → SME route, arrival and receipt

## Implemented behavior

- Scope: in-house outbound Warehouse → SME delivery. No SME → customer tracking is added.
- Live routing requests ORS car routing first, then bicycle, then walking only for verified no-route/snap failures. Auth/quota/provider outages do not trigger another mode. Every result labels its mode. No straight-line fallback is generated.
- Demo uses a fixed, provider-generated OSRM driving geometry (183 road points, about 4.1 km) from OpenStreetMap in Yangon, captured 22 October 2026. It is a fictitious preview, not live GPS. No paid key or device location is used in this demo.
- Courier: choose PC-OUT-0003 → View route & GPS → Move vehicle. Each click advances one tenth of route distance over 900 ms, following every intervening road segment. Repeated clicks during movement are ignored. It stops at the destination.
- Within 100 m: Courier can Confirm arrival. The vehicle icon becomes yellow; Warehouse/SME see Arrived, awaiting SME confirmation and a toast.
- SME: Confirm goods received (Demo) changes the icon to green and displays successful delivery. Live receipt additionally requires the existing recorded delivery proof, physical receipt acknowledgement and a confirmation dialog. Warehouse staff cannot substitute for the SME.
- Arrival itself never sets shipment status to delivered. Live arrival checks the assigned rider, in-transit state, current saved route, a fresh active-session fix, accuracy <=100 m and distance <=100 m on the server. It records an auditable shipment event; repeat arrival is idempotent.
- Live viewers refresh arrival state every five seconds; persistent arrival/success text remains after the toast disappears. Arrival is a recorded event, not an ongoing live GPS guarantee.

## Warehouse settings

Open `/demo/warehouse/settings` for browser-local demo controls or `/warehouse/settings` for authenticated warehouse controls.

- Live GPS enabled: separate from simulation. Off ends active warehouse tracking sessions and rejects new sessions, packets and live route requests. On never grants device permission or rider consent.
- Demo simulation enabled: controls demo movement and receipt actions in that browser preview. Demo settings do not mutate production. Public demo cannot be a production configuration authority.
- Live settings can be changed only by the warehouse's staff/owner; active warehouse members can read the effective settings. Values are persisted in Supabase, not trusted from the client.

## Rollout

This change is prepared locally and has NOT been deployed or applied to production Supabase.

1. Apply `20261022120000_be1_tracking_arrival_settings.sql` after the existing migrations through stock categorization. The migration is additive and tested on the isolated database suite.
2. Deploy the API and frontend from this branch together. Updated routing accepts car/bicycle/walking; older database route validation accepts car only.
3. Verify with disposable in-house assignments before using real operations. Existing unconfirmed proofs now require a verified arrival before SME receipt. Turning Live GPS on does not resume old sessions automatically.
4. No paid worker, new provider key or additional location permission is provisioned by this change.

## Acceptance tests

1. Demo: reset; verify no automatic movement. Click once; verify one smooth segment and no extra advancement while waiting. Complete ten steps; verify vehicle stops at destination.
2. Try Confirm arrival before entering 100 m: disabled. Reach destination; confirm. All three same-browser dashboards show yellow/pending and toast; no delivered status yet.
3. Open SME tracking; confirm goods received. Courier and Warehouse turn green/success. Reload: same state. Reset begins a new fictitious trip.
4. Disable demo simulation in Warehouse settings: movement, arrival, reset and demo receipt actions are disabled. Live GPS switch is independent.
5. Real assignment: accept, verify pickup/dispatch, select and verify the SME destination, give explicit routing/GPS consent. Outside 100 m, stale fix, poor accuracy, missing route, wrong rider and wrong SME must be rejected server-side.
6. Confirm live arrival; ensure shipment remains in transit and arrival appears in the recorded timeline. Staff cannot confirm receipt. SME cannot confirm before arrival or without uploaded proof. Own SME confirmation sets delivered once and ends tracking.
7. Turn Live GPS off: existing sessions become stopped; new start/position/routing requests fail. Turn on: rider must explicitly start again. Unrelated warehouse/SME cannot edit settings or read arrival.
8. ORS no-car route tries bicycle; no bicycle tries walking. Exhausted routes show an error with no line. Quota/auth/timeout must not produce an invented route.
9. Check desktop/mobile, EN/MM, map zoom, switching shipments, late map callbacks, yellow/green icon and toast keyboard/screen-reader behavior.

## Verification status

- Frontend automated suite: passed, including click-only progression, arrival/receipt ordering, reset and response validation.
- Backend suite: 63 tests run, 59 passed, 4 external Supabase tests skipped.
- Isolated database suite: passed, including settings permissions, GPS-off session termination/start rejection, arrival geofence, staff/wrong-SME receipt denial and repeat arrival.
- Production build, TypeScript and contracts checks: passed during implementation; final rerun recorded in chat.
- Local browser follow-up after control was enabled: courier click-by-click road movement, shared Warehouse/SME map, arrival gate, yellow pending-arrival icon/toast, SME confirmation to green success, reset and independent admin switches passed. Courier/Warehouse/SME/settings captured warning/error logs were empty.
- Browser inspection exposed old placeholder timeline text; updated it to demo dispatch, movement, courier arrival and SME receipt states.
- Evidence: Team-8/test-results/demo-arrived-yellow.png and demo-sme-confirmed-green.png.
- Responsive override did not change the measured viewport (remained 1280 px); mobile/tablet visual coverage is NOT claimed.
- Real phone GPS, authenticated ORS routing and production end-to-end remain NOT RUN. This is a local demo browser test, not a deployment verification.
