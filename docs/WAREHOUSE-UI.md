# WH-01 through WH-07: warehouse frontend

The warehouse React routes use the existing green/slate design and one shared API client. `/` is still the frozen legacy reference. No operational business rules were moved into Next.js server actions or API routes.

## Routes and sessions

- `/login`: Supabase password sign-in. Credentials go to configured Supabase Auth, never an application log or fixture endpoint. Successful login starts a fresh warehouse page after the SDK persists the tab session.
- `/warehouse`: live workspace. A Supabase session and a successful backend `/api/me` response with owner/staff membership are required before data loads. Warehouse selection comes only from those verified memberships. There is no role-switch control or automatic fallback to demo data.
- `/demo/warehouse`: explicitly isolated fictitious workspace with tab-local fixture persistence, for frontend development without backend credentials.
- Both workspaces have inventory, shipment list/detail and open-case summaries. Each case now links to a scoped investigation page with its shipment, required checks, history, and versioned actions to start investigation, save a summary, request information or escalate. These actions do not verify physical facts, mutate stock or close a case. Full verification, approval and closure interfaces remain separate work.

Run `npm run dev`, then open `/demo/warehouse`. For live mode, copy `.env.example` to `.env.local` and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Set PARCELCARE_API_URL on the Next.js server to the FastAPI origin (for local development, `http://127.0.0.1:8000`; for deployment, the backend HTTPS origin). Do not point it to the frontend or append `/api`. NEXT_PUBLIC_PARCELCARE_API_URL is supported as a legacy fallback. Restart Next.js after changing local environment settings; redeploy after changing hosted settings. Service-role/OpenAI keys must never be used as public variables. Configure the backend public Supabase key using api/.env.example. Backend `/api/me` remains the authority; a browser-selected warehouse is only a filter, never permission.

Sign-in first authenticates with Supabase, then requests `/api/me` through the Next.js proxy to load workspace memberships. If the workspace service is unavailable, check that FastAPI is running and that PARCELCARE_API_URL points to it. A successful `/api/health` on the frontend alone does not verify the backend connection. Hosting HTML error pages and invalid JSON are reported as upstream service failures rather than successful sign-in responses.

The SDK uses sessionStorage for a tab session, listens for sign-out/refresh and unsubscribes on unmount. Requests retrieve the current token through the shared transport. Resource views distinguish loading, empty, unavailable, expired (401), forbidden (403) and missing (404). Auth callbacks leave the SDK callback before rechecking sessions to avoid its internal auth lock.

## Counts, filters and contracts

Overview counts come from WarehouseOverview rather than calculating them from a paginated browser list. unique_skus counts distinct SME product records; inbound/outbound counts include all recorded shipments of that direction; open cases excludes resolved/closed. Cards link to the corresponding collection/filter. Timestamps display explicitly in Yangon time.

Inventory filters by SME and available/quarantined stock, with shipment references and cursor pagination. Shipment lists filter by SME/direction/status. Detail shows expected/cumulative receipt counts, registered evidence, server-allowed operational events and verified/recorded timestamps.

Warehouse operations APIs are implemented by the operations backend (see WAREHOUSE-OPERATIONS.md). Case read/action APIs are implemented by the exceptions router. Live operation requires those services and migrations to be configured; there is no automatic demo fallback. The case frontend projects the existing FastAPI CaseDetail/CaseAction shapes, validates scope and response versions, and takes the current policy version from the server's source-version token. Native hosted Supabase/Auth/Storage testing remains separate from provider-fake UI tests.

## Receiving and mutation recovery

Received/damaged inputs are incremental quantities for this submission. Damaged is included in received. Quantities must be whole, nonnegative numbers; received cannot exceed remaining expectation; damage cannot exceed received. Partial receipts leave the remainder pending. Final receipts declare any remainder a shortage and cannot be reopened; a later remainder needs a follow-up shipment. A discrepancy requires a note and verified evidence already registered to that shipment. This frontend attaches evidence references; file upload/storage integration remains DB-06/evidence work.

A native confirmation dialog reviews the physical count before posting. A synchronous submission lock prevents double-clicks. The request snapshot and UUID idempotency key are stored before sending, keyed by mode/actor/shipment/operation. On timeout/network/unknown outcome the form locks to that saved request, including after reload; retry reuses its exact key and body. Only a recognized first-attempt rejection allows correction, and a first-attempt stale version triggers a refresh. HTTP 408, malformed responses and other ambiguous failures retain the original key. A rejected retry also retains it because an earlier attempt may already have committed; reconcile it through a valid replay or an authorized operator. Saved counts/stock/case IDs come from the response; a background refresh failure preserves the saved result rather than discarding it.

The mock adapter simulates atomic fixture persistence, replay and version conflicts only within the explicit demo/test dataset. It is not a substitute for database transactions or permission checks. Real receipts must use the backend's atomic RPC/API and authoritative versions. ReceiptResult.stock is an additive optional snapshot; when provided it displays available/quarantined balances from the response.

Outbound controls use the server's allowed_events, require a verification note and physical-step confirmation, and record pick/pack/dispatch in order. They never mark delivery complete. Real allowed_events must enforce stock, assignment and dispatch prerequisites. Third-party shipments have no internal rider dispatch/GPS controls; handover UI belongs to WH-13.

## Validation

`npm run test:frontend` includes warehouse quantity/filter/persistence/partial/final/dispatch scenarios. `npm run test:warehouse` exercises the screens in Playwright, including real SDK session handling against intercepted fictitious Auth/API responses, demo persistence, mobile overflow, native dialog keyboard behavior, lost receipt response/reload/replay, operational events and error states. No real credentials or external service are used.

The warehouse browser script starts a separate Next development process with fictitious public configuration on port 3112. It uses the normal `.next` directory, so run it separately from production builds/dev servers; rerun `npm run build` afterward before `npm start`. Set PLAYWRIGHT_CHANNEL=chrome to use installed Chrome, or install Playwright Chromium. CI runs the warehouse browser suite after the legacy browser checks and performs no deployment.


## Impacting issues fixed after review

- Rapid SME/stock/status filter changes now merge against the current browser URL, preventing earlier selections from being silently lost.
- Unknown mutation outcomes retain their request/key through timeouts, denied retries and reloads. HTTP error status alone no longer discards recovery state.
- Receipt/event responses are validated for shipment identity, version, totals and renderable data before showing success or clearing the saved command. Starting another command clears the previous success banner.
- Same-user token refresh revalidates membership in the background without unmounting unsaved counts, notes or evidence selections. Sign-out, account changes and failed verification still hide the workspace.
- Sign-in controls remain disabled until hydration, preventing native credential submission before the JavaScript handler is installed.

Regression evidence: all 18 frontend tests pass, plus warehouse browser checks for rapid filters, HTTP 408 after a committed receipt, denied retry with the same key, malformed success recovery, same-user token refresh preserving a draft, and sign-in disabled without JavaScript. Typecheck and production build also pass.

## SME/warehouse workflow fixes

The browser-local `/` workspace keeps separate jobs: SME owns orders, read-only inventory, stock-arrival requests and report confirmations; warehouse owns receiving, fulfilment and investigation. Inventory demo records carry an SME owner; product selectors reject another SME's SKU. The demo role picker is not authentication.

An SME stock-arrival request is persisted with its expected count/date and appears in warehouse Receiving requests. Requesting does not alter stock. Warehouse staff record one final verified count and a required note: good units enter available stock, damaged units enter quarantine, and any remaining expectation is recorded as shortage. One atomic browser-storage record contains both counts and request status; duplicate receiving and storage-failure partial updates are rejected. These local requests are not silently bridged into the separate authenticated API dataset.

Warehouse case actions use the existing backend route and the current case/source/policy versions. Unknown submission outcomes retain the same request/key through reload and retry. Demo case actions persist in the warehouse tab dataset, including history, but do not send external notifications. Live notifications remain the responsibility of the existing backend/outbox.

Checks: `npm test` includes dashboard role, ownership, receiving and storage-failure regressions; `npm run test:frontend` covers scoped case responses, persisted action replay and stale versions. With a dev server on port 3218, `npm run test:dashboard-workflows` exercises the SME request → warehouse receipt → SME inventory flow and case investigation/information actions, including Myanmar and mobile rendering.

## SME navigation: three pages

The `/` SME workspace now has exactly three destinations: **Orders / Requests**, **Delivery Tracking**, and **Reports**. It opens on Orders. Stock-arrival requests are an Orders tab, and an expandable read-only available-stock panel replaces the separate inventory page. Warehouse navigation and permissions are unchanged.

Orders can open the selected delivery in Tracking or prefill a report with the order reference. Tracking only lists that SME's orders. It shows recorded status/history and available courier metadata; it never invents a provider, GPS coordinates or ETA. Third-party courier links must be HTTPS with no embedded credentials. Missing provider/link/live data is stated explicitly. This does not connect the local order demo to the live tracking APIs.

The new `src/features/workspace/sme-workspace.js` renderer runs after the existing workflow extensions and reuses their forms, report actions and priority grouping. `dist/sme-workspace.js` preserves the static reference. Run `npm run test:sme-workspace` with the dev server on port 3218 for three-page navigation, scoped stock, order/report handoff, safe courier links and English/Myanmar mobile checks.
