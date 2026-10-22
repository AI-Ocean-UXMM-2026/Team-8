# ParcelCare — Team-8

Independent AI maker–checker: [workflow, configuration and testing](docs/AI-MAKER-CHECKER.md).

Current product requirements: [Standard PRD (Word)](ParcelCare_Standard_PRD.docx) · [Readable Markdown copy](ParcelCare%20PRD.md).

Project repository: **AI-Ocean-UXMM-2026/Team-8**. Continue all development here. English and Myanmar interface modes are available from the language bar; the choice persists locally. See [report UX and language modes](docs/REPORT-UX-LANGUAGES.md) for preview links, localization rules and verification.
SME navigation has three pages: **Orders / Requests**, **Delivery Tracking**, and **Reports**. Stock arrivals and available stock are inside Orders. Open `/?workspace=sme` for the SME demo.

Office Staff dashboard: open `/office` for the responsive React exception queue, AI readiness indicators, evidence details and escalation workflow. It uses fictitious browser-local demo data; real Auth/domain API integration is pending. See [design decisions and reference provenance](docs/office-dashboard-design.md). Validate with `npm run build` and `npm run test:office`.

Design system: **shadcn/ui Vega / Teal & Yellow (400)**, preset `b5JNedagS`. Run the project and open `/design-system` for the interactive component reference. See [the current design guide](ParcelCare_Design_System_v2_Brand_Aligned.md). Existing operational screens share its theme; the old `dist/` appearance is preserved only as a reference.

The deployable application now runs on **Next.js / React / TypeScript**, with **Python/FastAPI** foundations and optional **Supabase / OpenAI** client factories. Its interface and demo behavior are preserved through the existing feature scripts; live integrations are disabled. See [MIGRATION.md](MIGRATION.md) for local commands, migration limits, checks, and Render **Web Service** settings. Run `npm ci` then `npm run dev` from this directory.

The notes below describe the original `dist/` prototype, preserved for comparison.

HTML, Tailwind CSS and jQuery. Open dist/index.html or serve dist using `python3 -m http.server 8765 --directory dist`.

## Walkthrough
1. SME → My Reports → Report warehouse issue. Submit a reference, warehouse issue type, description and requested outcome.
2. Warehouse → SME Reports → Open report → Assign to me → Start review → Start investigation.
3. Request more information if necessary; switch to SME to reply.
4. Warehouse proposes a written resolution. The report stays Awaiting SME Confirmation.
5. SME confirms and closes, or supplies a reason and reopens the report.

Only SME confirmation closes a report. There is no automatic closure. Report status is separate from order/delivery status. Five warehouse issue categories are supported; courier failed-delivery and courier-delay reporting are excluded. Evidence is text references in this prototype, not uploads. Browser-local storage only; workspace switching simulates roles rather than real authentication. No live API, GPS or backend.

Validation: `node check-reports.cjs` covers transitions, required notes, information requests, reopen and SME-only closure. Browser visual/click QA was blocked by the browser approval gate in this session.

Priority: Warehouse Manager → Priority settings · MMK & categories. Configure three ascending MMK thresholds and risk profiles for any category. Product impact forms accept multiple affected product lines (quantity × unit price). Missing settings/data routes to Manager with Priority pending. Category incident priorities, manager overrides and settings history are supported. Editable starter thresholds: Normal 50,000 MMK, High 200,000 MMK, Critical 1,000,000 MMK. These are application defaults, not an industry standard. Existing demo fixtures lack product prices/categories and therefore move to Manager pending configuration. `node check-priority.cjs` checks priority boundaries, totals, incident escalation and missing-data routing; the older checks exercise the base workflow without loading the priority extension.

Integrated priority verification: `node check-priority-reports.cjs` loads the report, maker/checker, rule and priority modules together. It checks 25 synthetic scenarios against the starter thresholds, multi-product totals, category incidents, missing/invalid inputs, manager overrides, Human-rule precedence and settings changes. It does not change browser reports or settings. Priority and AI/Human routing remain independent: a Critical priority alone does not create a Human rule.

Integration: authenticated warehouse pages remain at `/warehouse`; the Office Staff demo is at `/office`. Shared `/api/me` retains its actor_id contract; `/api/profile` supplements it with profile details. Evidence upload and expiring-download adapters supplement the shared domain RPCs.

Courier workspace: `/demo/courier` is the isolated, tab-persisted in-house courier preview; `/courier` uses authenticated rider membership and the delivery/case APIs. The UI shares warehouse layout tokens and supports assignment acceptance, verified pickup, attached-evidence proof submission and issue reporting. Proof requires warehouse/SME confirmation; the courier cannot mark a delivery complete. New file uploads and location sharing are not provided in this view. Demo cases remain in courier demo storage, separate from the warehouse demo. `node scripts/check-courier-ui.mjs` checks the browser flow against a running preview.

### Shipment GPS viewer

Warehouse shipment details now include `#live-courier-tracking`; the shipments table's **Track** action deep-links there. The responsive map uses Leaflet and OpenStreetMap tiles, with coordinates, accuracy and last-updated time shown when the tracking API supplies them. Without GPS it shows a labeled Yangon reference view, never a fabricated courier marker. Demo mode never supplies real coordinates.

Authenticated SMEs can open `/sme/shipments/<shipment UUID>` after sign-in. This view uses `delivery_read` rather than staff-only warehouse operations, checks exact warehouse/SME membership, and reads coordinates only through `get_live_location`. Existing database authorization remains authoritative: warehouse staff may read their warehouse; SME membership must match the shipment; tracking requires an active eligible consented rider session. The viewer polls every 15 seconds, marks positions older than 60 seconds stale, and clears positions on failed reads. This change does not start phone GPS collection or request rider consent automatically.

### Free routing service (openrouteservice)

Routing uses the free ORS Standard API, requested only when an assigned rider explicitly presses **Calculate driving route**. Create a Standard key at https://account.heigit.org/ and set `OPENROUTESERVICE_API_KEY` on the **Python API service** in Render, then redeploy that API. Never expose this key as a `NEXT_PUBLIC_` variable. No paid provider fallback is configured. Free-plan quotas apply; quota/configuration/provider errors preserve GPS viewing and do not produce a fake route. Attribution is shown with route results.

Courier routes are available in `/courier` and `/rider/shipments/<id>`. The rider must accept the active in-house delivery, select and verify a destination pin, and consent to sending their current position and destination to ORS. Current shipment contracts do not store a destination GPS point: the courier-selected pin and calculated route are saved as a route plan, not as a verified shipment address. The route uses `driving-car`; it is not motorcycle navigation, background navigation, live traffic, or a guaranteed ETA. GPS sharing remains a separate consented workflow after pickup. Warehouse/SME tracking uses the same OpenStreetMap map component, authorized active sessions, and exact tenant ownership; no route calculation is required to watch a courier.

ORS requests use the current `https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson` endpoint, as documented in the official [HeiGIT migration announcement](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912). Keep the same Basic/Standard key; do not use the deprecated `api.openrouteservice.org` host. Activation checklist: set the key on the Python API service, deploy the API and frontend code, sign in as an assigned rider, accept the delivery, verify destination, grant route consent, then test a real Yangon route. Compare road suitability and destination with the recipient before field use.

Route plans require `supabase/migrations/20261022005000_be1_shared_route_plans.sql`. Plans expire after 24 hours. Only the assigned rider can save a plan; Warehouse/SME can read it only during an authorized active GPS session. Stopping sharing hides both route and position from viewers. A failed save leaves local navigation available with an explicit unconfirmed-sharing warning.

### GPS across all three dashboards

- Warehouse: overview **Open shipment tracking**, sidebar **GPS tracking**, and `/warehouse/tracking`. Lists all active outbound shipments in the selected warehouse across API pages. Shipment selection opens its authorized GPS map and status.
- SME: dashboard **Track your deliveries**, navigation **GPS tracking**, and `/sme/tracking`. Both the list and selected detail verify the exact warehouse and SME membership; backend JWT/RLS checks remain authoritative.
- Courier: `/courier` has a prominent **Route & GPS** entry. Assigned shipment details expose ORS route planning and separate consented location sharing after verified pickup. `/rider` task links also lead to the same routing/sharing controls in delivery details. No GPS capture starts automatically.
- `/demo` opens the Warehouse overview directly. Switch dashboards through the sidebar: `/demo/sme` opens the SME overview, `/demo/manager` opens the existing Manager report/priority workspace, and `/demo/courier` opens assigned deliveries. GPS remains inside each dashboard at `/demo/warehouse/tracking` and `/demo/sme/tracking`. SME preview is read-only, scoped to one fictitious SME and never returns a live tracking session. Real GPS capture and ORS requests stay disabled in previews. For PC-OUT-0003, use **Start demo movement** in the courier preview to share a clearly labeled illustrative route and simulated marker with the Warehouse/SME previews in the same browser. These previews do not simulate or replace live authentication.

GPS remains foreground-only: leaving the courier page or going offline stops local capture. Active-session authorization and stopped/terminal sessions are enforced by the existing tracking backend. End-to-end real phone GPS verification requires an accepted, picked-up in-house assignment and the rider's explicit permission; preview maps alone do not prove location delivery.

### AI investigation pipeline (local/manual worker)

See [implementation and test guide](docs/AI-PIPELINE-IMPLEMENTATION-AND-TESTS.md). Apply `20261022007000_be2_investigation_execution.sql` before running the updated worker. Configure server-only `SUPABASE_WORKER_KEY`, `OPENAI_API_KEY`, vision-capable `OPENAI_MODEL` and `OPENAI_CHECKER_MODEL`. From `api/`, use `python -m app.worker --once` to process one polling cycle. Automatic actions default OFF (`AI_AUTO_EXECUTE=false`); approved safe actions additionally require SQL policy/source/evidence checks. The optional paid worker configuration is isolated in `render-worker.yaml` and is not part of the existing free web-service blueprint. No paid worker is created by this change.
