# ParcelCare Map and GPS Regression Report

Date: 22 October 2026. Target: https://parcelcare-team8.onrender.com

## Fixed in this change

- Legacy rider live map rebuilt Leaflet on every coordinate update. It now uses the same persistent map controller as Warehouse/SME, updates existing markers and preserves route bounds.
- A late resize or map-click callback after removal could touch a destroyed map. The controller now ignores callbacks after destruction and cleanup is idempotent.
- GPS start obtained a position but discarded it, waiting for another watch callback before publishing. It now publishes the first consented fix before reporting successful sharing.
- Concurrent Stop requests could race. Stop calls now share one pending request; a new session cannot start while the previous server stop is unconfirmed.
- Late coordinate-write responses could overwrite stopped-state feedback. Updates now check the session generation.
- Invalid positions in a watch callback and unavailable browser storage now produce bounded feedback rather than an unhandled error.
- Tile fetch failures now show a map warning; the location API remains independent of the tile server.
- Future GPS timestamps, invalid coordinates, reversed route expiry and malformed shared-route shipment IDs fail validation.
- The illustrative shared demo route now applies only to PC-OUT-0003, rather than every eligible demo shipment.
- The earlier completed-demo restart fix remains: destination arrival stops simulated sharing and permits replay.

## Executed checks

- Frontend suite: 50 passing tests, including eight map/GPS regression tests.
- API suite: 60 tests run, 56 passing and four skipped integration checks. Provider behavior is tested with fakes, not live routing credentials.
- Local database suite: passing foundation, warehouse, assignment, private tracking access, shared-route authorization, stop/revocation, stale location and retention checks.
- Production build, TypeScript and API contract checks: passing.
- Public deployed HTTP smoke checks: Warehouse/SME/Courier pages and route bundles, Leaflet JS/CSS, one Yangon OpenStreetMap tile and API health all returned expected responses.
- Unauthenticated deployed GPS and shared-route requests returned 401.

These public HTTP checks do not execute browser JavaScript and do not prove map rendering or a phone GPS journey.

## Deployed browser follow-up after app restart

Browser access was restored. Verified on parcelcare-team8.onrender.com:

- SME tracking rendered OpenStreetMap tiles successfully (all four inspected tiles loaded), route and markers; console warnings/errors were empty.
- Courier PC-OUT-0003 replay restarted the completed simulation. The cyan marker advanced; Warehouse and SME displayed the same shared simulation. Completion returned the Replay control.
- Warehouse PC-OUT-0004 did not inherit the illustrative route or location: it displayed GPS unavailable and a neutral Yangon reference map. Switching back restored PC-OUT-0003.
- SME zoom in/out worked. Myanmar mobile layout had no document horizontal overflow; map remained inside its container. Tablet viewport switching and returning to the normal viewport completed without map errors.
- Courier and Warehouse captured console warning/error lists were empty.
- Evidence: Team-8/test-results/gps-warehouse-live-browser.png.

These are deployed demo-browser tests, not proof of real phone GPS or authenticated ORS routing. Real permission/capture, authenticated route calculation, cross-account GPS delivery, provider/network failures and full desktop/tablet/mobile visual QA remain NOT RUN. No precise location permission was granted or transmitted during this follow-up.

## Manual live test checklist

1. Open Courier, Warehouse tracking and SME tracking. Check logo/header layout and absence of browser errors at 390, 768 and 1440px widths.
2. Demo: open PC-OUT-0003, Start demo movement, verify its cyan marker advances in the Warehouse/SME preview in the same browser, wait for completion and replay. Other demo shipments must not inherit this route.
3. Zoom and pan. New GPS points must move the marker without remount/flicker or resetting zoom on an unchanged route.
4. Switch shipments, change routes, navigate away/back and resize. Verify no stale marker, duplicate map or `_leaflet_pos` error.
5. With a disposable accepted/picked-up live assignment, the rider explicitly consents and grants location permission. Start sharing and verify the first position is sent promptly.
6. Use a separate device/browser for Warehouse and SME so the courier page remains foreground. Warehouse sees its warehouse shipment; SME sees only its own shipment; unrelated users are denied.
7. Calculate an ORS route after verifying the destination and provider consent. Confirm route/destination identity, saved/unconfirmed sharing feedback, and route visibility during an eligible sharing session.
8. Deny location permission, disable the network and simulate provider/quota failure. No false sharing success or invented route/ETA may appear.
9. Stop sharing, double-click Stop, navigate away or hide the courier tab. Local capture stops; authorized viewers clear the active session on their next successful refresh. A failed server stop remains explicitly unconfirmed and blocks a new session until resolved.
10. Let the recorded fix age past 60 seconds. The UI must label it stale even during a slow read. Stale position is not a current-location guarantee.
11. Check English/Myanmar controls and error messages. Never clear browser data or grant precise location automatically as part of this test.

Foreground-only sharing is intentional. Hiding the courier tab stops capture; this change does not enable background tracking.

## Repeatable commands

```sh
npm run test:maps
npm run test:frontend
npm run test:backend
npm run test:database
npm run build
npm run typecheck
npm run test:contracts
node scripts/check-map-public.mjs
```
