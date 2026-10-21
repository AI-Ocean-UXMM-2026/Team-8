# ParcelCare V4 team implementation checklist

Source: [PRD V4](ParcelCare_PRD_v4_B2B_Live_GPS.md). Architecture and collaboration details: [IMPLEMENTATION-PLAN-V4.md](IMPLEMENTATION-PLAN-V4.md). Four people: two frontend, two backend. Deployment deferred. This checklist replaces earlier PRD-based scope; no customer portal is planned.

Checkboxes track completed, verified V4 implementation. Prototype resemblance or partial implementation does not count as completion. Use task IDs as issue titles. For each issue record owner, branch/PR, dependency, acceptance evidence, and status (todo/in progress/blocked/review/done). Tick a box only when its implementation is fully finished, integrated locally, and relevant checks pass. Leave partial work and unresolved external dependencies unchecked. Team approvals and live deployment remain separate where required. Developer aliases below need actual names at kickoff.

Database progress (21 October 2026): migrations, RLS, private evidence policies, fictitious seeds, and receipt/decision/tracking RPCs now exist in [supabase/](supabase/README.md), with an isolated SQL integration suite. They have not been applied to hosted Supabase. DB-02/03/04/07/08/09 have database-layer implementation/test evidence but remain unchecked pending team review, native Supabase/Auth/Storage testing, and the remaining API/worker work. SET-08 adds configured Supabase Auth verification and `/api/me`; DB-01 remains unchecked pending native Auth integration acceptance. The demo UI still uses fictitious data.

## Owner register

M0 SET-01–06 implementation: see [foundation handoff](docs/M0-FOUNDATION.md), [planned OpenAPI](contracts/openapi.json), [fixtures](contracts/fixtures/operations), and React preview at `/foundation`. SET-01–03 await real names, write-access verification and team agreement. SET-04–06 are implemented and verified locally; their boxes are checked. Live operational APIs, hosted deployment and team setup remain separate tasks.

SET-07–11 implementation and validation: [delivery evidence](docs/M0-SET07-11.md), [shared API client](docs/SHARED-API.md), [database workflow](docs/DATABASE-WORKFLOW.md), [versioned policies](docs/V4-POLICY.md), and [CI checks](.github/workflows/checks.yml). SET-04–11 are complete as locally verified foundation implementations; SET-07 transport defects are fixed and covered by regression tests. The M0 team-access gate remains open because SET-01–03 are pending. CI is added and locally validated; its first GitHub/PostgreSQL 17 runner execution awaits pushing this branch.

- FE1 — name: __________ — warehouse React UI; shared frontend integration/config.
- FE2 — name: __________ — SME/rider React UI; shared tracking/approval/notification UI.
- BE1 — name: __________ — auth/database; operational APIs/GPS; backend integration/config.
- BE2 — name: __________ — cases/AI/policies; approvals/notifications APIs.

FE1 owns `src/app/warehouse`, warehouse/inventory/shipments/exceptions React modules, and shared UI/config. FE2 owns `src/app/sme`, `src/app/rider`, and SME/rider/tracking/approvals/notifications frontend modules. BE1 owns backend core/identity/inventory/shipments/deliveries/tracking/evidence; BE2 owns exceptions/ai/policies/approvals/notifications backend. Thin role routes follow the same owner. Backend tests and fixtures follow their domain owner. Shared files have one editor; ask that owner for changes.

## M0 — agree boundaries and unblock all four people

- [ ] SET-01 — All: assign real names; confirm V4 replaces old courier/customer/closure scope.
- [ ] SET-02 — All: resolve shared GitHub write access; give each teammate a separate clone and task branch. The previous migration push was denied; do not assume the team can push yet.
- [ ] SET-03 — FE1 + BE1: agree file owners, PR review pairs, required checks, branch conventions, and who applies shared staging migrations.
- [x] SET-04 — All: freeze IDs, enums, errors, pagination, timestamps, evidence references, and idempotency rules; BE1 publishes OpenAPI/DTO generation process.
- [x] SET-05 — BE1 + BE2: write success/forbidden/pending/stale/error fixtures, including the 100 expected/90 received scenario and both delivery modes.
- [x] SET-06 — FE1: create React shared layout and styled Tailwind/shadcn primitives matching the existing visual design; freeze legacy globals and migration scripts under FE1.
- [x] SET-07 — FE1: create one API transport with mock/live adapters; FE2 consumes it rather than inventing a second client. Keep server mutations in FastAPI.
- [x] SET-08 — BE1: add shared auth/database/error/audit/outbox interfaces and compose domain routers without putting business logic in `main.py`.
- [x] SET-09 — BE1: establish per-developer database/secrets workflow, migration naming, isolated test seeds, and shared staging procedure. Keep secrets out of commits/chat/browser bundles.
- [x] SET-10 — All: define closure evidence per case type, priority rules, action allowlist, GPS intervals/staleness/retention, and who confirms delivery/physical handling.
- [x] SET-11 — FE1 + BE1: add CI for frontend type/build/tests, backend tests, contract drift, fresh migrations, and domain security checks. No automatic deployment is required now.

Gate: all four developers can run their layer, read the same contracts, and work on disjoint files. Frontend is unblocked by fixtures; backend does not wait for screens.

SET-01–11 working evidence (21 October 2026):

| Task | Implementation status | Evidence / remaining work |
| --- | --- | --- |
| SET-01 | Awaiting team | V4 scope documented in docs/M0-FOUNDATION.md; real names and ratification pending. |
| SET-02 | Awaiting access verification | Separate clone/task-branch procedure documented; each teammate must prove write access. |
| SET-03 | Proposed, awaiting team | Path owners, review pairs, check commands and staging operator role documented; agreement pending. |
| SET-04 | Complete; verified locally | Pydantic models, planned OpenAPI, generated TypeScript and contract conventions published; live routes remain later work. |
| SET-05 | Complete; verified locally | Eleven deterministic schema-validated fixtures, including 100/90 shortage, both delivery modes, pending/forbidden/stale/error. |
| SET-06 | Complete; verified locally | React `/foundation`, shared layout and Tailwind/shadcn-style primitives; legacy files frozen under FE1. |
| SET-07 | Complete; fixes verified locally | One deadline covers token lookup, fetch and body parsing; cancellation retains its reason; late tokens cannot start a fetch. All 10 transport tests, typecheck and production build pass. |
| SET-08 | Complete; verified locally | Auth/database/error/audit/outbox protocols and composed routers; user-scoped Supabase verification; `main.py` contains composition only. Native Auth acceptance remains DB-01. |
| SET-09 | Complete; verified locally | Developer secrets/database runbook, staging procedure, migration-name validator, repeatable isolated seeds and fresh SQL tests. No staging environment was changed. |
| SET-10 | Complete; verified locally | Versioned closure matrix for 10 case types, MMK priority rules, 7 allowed actions and GPS/confirmation policy; backend guards tested. |
| SET-11 | Complete implementation; locally validated | Four CI jobs cover frontend, backend/contracts, security and fresh PostgreSQL 17 migrations. Workflow YAML and local checks pass; first GitHub run pending branch push. |

Validation (21 October 2026): typecheck, production build, legacy regression suite, 10 frontend tests, 11 backend tests, 11 contract fixtures plus OpenAPI/DTO drift checks, migration conventions, 35 isolated SQL integration tests plus CI smoke SQL, and browser desktop/mobile checks all pass. Browser checks also preserve three exact legacy screenshots. CI does not deploy. Native PostgreSQL 17 execution is configured in CI but was not run locally; native Supabase Auth/Storage/Realtime acceptance remains separate.

## BE1 — identity, tenancy, schema (M0; PRD 4, 8, 16)

- [ ] DB-01 — Implement Supabase Auth verification and `/api/me` membership/role contract; never accept client-selected role/SME as permission.
- [ ] DB-02 — Create warehouses, SMEs, profiles/memberships, riders, products, shipments/items/events with scoped FKs/constraints and indexes.
- [ ] DB-03 — Add operational delivery/tracking/evidence tables in domain migrations. Review BE2 case/approval joins for tenant consistency.
- [ ] DB-04 — Implement RLS for warehouse staff, own-SME users, and assigned riders, including nested relations and direct database access.
- [ ] DB-05 — Separate user-scoped and trusted-worker database access; explicitly authorize any privileged service client path.
- [ ] DB-06 — Implement private evidence storage/metadata, allowed file types/size, upload ownership, download authorization/expiry, and no public evidence bucket.
- [ ] DB-07 — Provide shared audit and durable outbox interfaces with actor/time/correlation IDs; mutations and their audit/events commit consistently.
- [ ] DB-08 — Seed fictitious one warehouse/five SMEs/10–20 shipments/rider assignments, plus a separate second warehouse fixture for isolation tests.
- [ ] DB-09 — Test unauthenticated access, forged scope, SME A→B ID substitution, cross-warehouse staff, inactive rider, and private evidence access.

Gate: same-tenant authorized actions work; unauthorized direct API/database/storage reads and writes fail. Auth is mandatory before a shared real-data pilot, not a later optional polish task.

## FE1 — warehouse shell, inventory, receiving (M0–M1; PRD 2, 5A, 7)

- [ ] WH-01 — Build authenticated `/warehouse` route and login/session states with current visual styling. Hide/disable demo-only role switching in real mode.
- [ ] WH-02 — Render KPI cards for SKUs, inbound/outbound shipments, and open cases using agreed API fields/definitions; counts link to filtered lists.
- [ ] WH-03 — Build SME-filtered SKU inventory with available/quarantined status and shipment references.
- [ ] WH-04 — Build expected receipt form, received/damaged quantities, evidence, notes, partial/final semantics, and submission validation.
- [ ] WH-05 — Prevent accidental double-submit; show authoritative persisted receipt/stock/case results and recoverable server errors.
- [ ] WH-06 — Build shipment list/detail/manual receiving/dispatch event controls for warehouse-to-SME flow; display verified timestamps.
- [ ] WH-07 — Implement loading/error/empty/forbidden states, keyboard accessible dialogs/forms, and bilingual text without redesigning the interface.

Dependencies: SET fixtures unblock UI immediately; DB/OPS contracts required for real integration.

## BE1 — inventory and shipment operations (M1; PRD 3, 5A, 8–9)

- [ ] OPS-01 — Implement `GET /api/warehouse/overview`, `/api/inventory`, `/api/shipments`, and agreed shipment create/detail/event endpoints with scoped reads.
- [ ] OPS-02 — Implement `POST /api/receipts/{shipment_id}` with nonnegative quantities, damaged ≤ received, owned product lines, and agreed partial/final behavior.
- [ ] OPS-03 — Atomically post receipt/good/quarantined counts and audit/outbox records. Define overreceipt and repeated partial receipt handling explicitly.
- [ ] OPS-04 — Add idempotency keys/version checks so retry or concurrent receipt submission cannot double stock or case events.
- [ ] OPS-05 — Publish separate quantity mismatch/damage facts to BE2; do not let AI calculate the authoritative difference.
- [ ] OPS-06 — Implement staff-confirmed pick/pack/dispatch and authorized stock/quarantine correction commands; prevent invalid status changes and unavailable-stock dispatch.
- [ ] OPS-07 — Test 90/100 → gap 10 exactly once, damage separation, duplicate receipts, concurrent operations, and cross-SME product references.

Gate: source records, stock, event and audit agree after success, retry, or failure. Inventory writes are owned here, not in BE2 tool code.

## BE2 — cases, matching, lifecycle, policies (M1–M3; PRD 5–6, 8–9)

- [ ] CASE-01 — Create case/event/policy/analysis/action/job migrations and domain schemas; add warehouse/SME relationships with BE1 review.
- [ ] CASE-02 — Implement case create/match/get APIs for inbound mismatch/damage, warehouse observations, delivery failure/delay, and handover dispute.
- [ ] CASE-03 — Deduplicate active cases by shipment + stage + issue type with a concurrency-safe rule. Append repeated evidence instead of losing it or merging unrelated problems.
- [ ] CASE-04 — Agree and enforce state transitions; keep priority, human handling, approval, action progress, and shipment state independent.
- [ ] CASE-05 — Implement deterministic action allowlist and priority policy. Document which prototype rules/thresholds survive V4 and why.
- [ ] CASE-06 — Create timeline/action events with actor, time, evidence and policy reference; scope sensitive fields for SME vs staff.
- [ ] CASE-07 — Implement audited escalation, information requests, internal safe status updates, proposed correction, and actionable staff tasks.
- [ ] CASE-08 — Implement verified closure command, required evidence/decision checks, and invalid/stale action rejection. Notify only after the authoritative transaction commits.
- [ ] CASE-09 — For disputed loss/damage default to UNDETERMINED; store responsibility basis and operational suggestions separately from verified attribution.
- [ ] CASE-10 — Test concurrent same-issue reports, same-shipment different issues, stale policies/decisions, unauthorized actions, and closure before confirmation.
- [ ] CASE-11 — Add a separate deterministic seed file for 2–3 representative cases/approvals/notifications linked to BE1's five-SME/10–20-shipment seed; coordinate IDs and seed order without editing BE1's seed file.

Dependencies: BE1 identity/evidence/events contracts. Work with seeded fixtures until actual operations integrate.

## BE2 — real OpenAI investigation (M1; PRD 5A–D, 6)

- [ ] AI-01 — Implement tenant-scoped shipment/inventory/events/evidence/policy read tools; every tool receives trusted auth context.
- [ ] AI-02 — Define the PRD structured output with Pydantic and enum actions; validate evidence IDs and missing information against retrieved records.
- [ ] AI-03 — Implement analyze endpoint/job persistence, source version tracking, bounded retry/timeouts, refusal/failure states, and rerun behavior.
- [ ] AI-04 — Persist actual model/configuration, usage, facts/evidence, result, and audit IDs. Distinguish verified facts from assumptions; do not expose hidden reasoning.
- [ ] AI-05 — Dispatch only allowed backend actions after checking current permissions, source/policy state, and approvals. Never execute free-form SQL or generated stock quantities.
- [ ] AI-06 — Test output schema with provider fakes and a small explicitly configured real-model scenario; expected gap is 10 from recorded data, not a model-invented count.
- [ ] AI-07 — Test injection-like complaint text, invented evidence, unknown action, other-SME retrieval, timeout/refusal, repeated actions, and unavailable courier information.

Gate: real OpenAI output is persisted and useful, while policy enforcement remains correct even when the model is wrong. Model selection and costs are configuration decisions, not assumptions copied from the PRD's worked example.

## FE1 — warehouse exception and delivery screens (M1–M3; PRD 5, 7)

- [ ] WH-08 — Build exception queue with type, priority, human mode, owner and state filters; no conflation of urgency with manager approval.
- [ ] WH-09 — Build `/warehouse/exceptions/[id]` with evidence, factual AI summary, missing information, timeline, allowed actions, and verification controls.
- [ ] WH-10 — Export shared read-only case panels for FE2's SME screen; keep action controls role-specific.
- [ ] WH-11 — Wire analyze/propose/escalate/verify-close actions and pending/failure states to BE2 APIs.
- [ ] WH-12 — Build in-house rider assignment and confirmed capacity controls; embed FE2's tracking component without duplicating it.
- [ ] WH-13 — Build external courier handover form with carrier, waybill, HTTPS tracking URL, accepted timestamp, package condition/count and evidence.
- [ ] WH-14 — Display external courier updates as verified/pending facts and disputed responsibility; never display fabricated internal GPS/ETA or final legal conclusions.
- [ ] WH-15 — Add warehouse integration tests and approved screenshots for existing/new V4 views; preserve old `dist/` reference separately.

## BE2 — SME decisions and in-app notifications (M1–M3; PRD 5A–D, 8–9)

- [ ] SMEAPI-01 — Implement scoped `/api/sme/overview` by composing BE1 authorized read services with case/approval feeds.
- [ ] SMEAPI-02 — Implement approval requests/options and `/api/approvals/{id}/decision`; bind actor to correct SME and immutable request context.
- [ ] SMEAPI-03 — Persist `accept_partial` / `await_remainder`, reject/note, timestamps, and downstream case effects. An approval is not automatic physical completion.
- [ ] SMEAPI-04 — Implement `/api/notifications`, read/unread command, links, and persisted recipient scope. Use in-app delivery only for P0.
- [ ] SMEAPI-05 — Couple request/notification/timeline through transaction/outbox and deduplicate retry delivery; prevent duplicate or conflicting decisions.
- [ ] SMEAPI-06 — Implement preferred retry-time proposal and pending reschedule; invoke BE1 capacity workflow rather than promising availability.
- [ ] SMEAPI-07 — Refresh scoped feeds through agreed polling/private realtime; test approval persists and warehouse updates after SME decision.

## FE2 — SME dashboard, evidence, decisions (M0–M3; PRD 4–5, 7)

- [ ] SMEUI-01 — Build authenticated `/sme` own-stock/shipment/case dashboard with shared primitives and fixtures.
- [ ] SMEUI-02 — Build `/sme/shipments/[id]` using shared tracking component for active in-house delivery, external tracking link for third-party mode.
- [ ] SMEUI-03 — Build `/sme/exceptions/[id]` from FE1 public case panels plus SME-specific information/decision controls.
- [ ] SMEUI-04 — Implement accept-partial/await-remainder/reject/note; show pending, persisted, rejected and superseded request states.
- [ ] SMEUI-05 — Implement preferred retry time and distinguish proposed vs capacity-confirmed instruction.
- [ ] SMEUI-06 — Add notification feed/read state, evidence download, and verified receiver confirmation where required.
- [ ] SMEUI-07 — Test cross-SME URLs, expired sessions, conflicting decisions, and phone/desktop loading/error/empty states. UI hiding is not authorization.

## BE1 — assignments, handover, POD (M2–M3; PRD 3, 5C–D, 9, 16)

- [ ] DEL-01 — Implement assign endpoint and rider-task lookup/accept/pickup contracts; enforce same warehouse, employed/active rider, shipment mode/state.
- [ ] DEL-02 — Implement verified packing/dispatch prerequisites and assignment change handling without orphaned GPS sessions.
- [ ] DEL-03 — Implement private proof upload, receiver confirmation, and proof validation; submission alone is not delivered.
- [ ] DEL-04 — On verified completion atomically record delivery and terminate tracking, then publish a durable event for BE2's case-specific closure checks.
- [ ] DEL-05 — Implement third-party handover endpoint with verified carrier acceptance, waybill, safe link, package condition and evidence.
- [ ] DEL-06 — Implement staff verified courier events/response and manually reported deadline/failure cases; no courier API/webhook required for P0.
- [ ] DEL-07 — Implement capacity confirmation and approved retry instructions consumed by rider UI. Reject duplicate confirmations and stale assignments.
- [ ] DEL-08 — Test cancellation, reassignment, incomplete POD, external mode prohibiting internal tracking, and unverified handover/disputed responsibility.

## FE2 + BE1 — real foreground GPS and private map (M2; PRD 5C, 8–9, 16)

- [ ] GPS-01 — BE1: implement start/stop/session state tied to shipment/rider with explicit consent evidence, assignment and pickup prerequisites.
- [ ] GPS-02 — FE2: implement clear start/stop location controls, browser permission handling, and consent per delivery; never silently start sharing.
- [ ] GPS-03 — FE2: send timestamped coordinates/accuracy at configured bounded frequency; handle denial/offline/foreground pauses and clear watch/subscriptions on stop/logout.
- [ ] GPS-04 — BE1: implement location endpoint validation, authentication, bounds, timestamps/replays, deduplication and rate limits.
- [ ] GPS-05 — BE1: implement latest-live read contract with timestamp/status/accuracy and warehouse/own-SME authorization against active session.
- [ ] GPS-06 — FE2: export one reusable map/status component with last-updated/stale/unavailable indicators for FE1 warehouse and FE2 SME views; no guaranteed ETA.
- [ ] GPS-07 — BE1: configure private Realtime policy/channel access; FE2: implement reconnect/subscription cleanup. Authorized polling is an initial fallback, not a claim that Realtime is already complete.
- [ ] GPS-08 — BE1: end access on stop/delivery/cancel/reassign and reject late packets; FE2: clear old markers and stop new location disclosure/subscriptions.
- [ ] GPS-09 — BE1: audit authorized live-view sessions and implement configured raw-location purge. Exclude coordinates/tokens from general-purpose logs.
- [ ] GPS-10 — All: test on an actual rider phone plus two authenticated viewers; a different SME must fail via direct API and realtime attempts.
- [ ] GPS-11 — FE2 + BE1: test stale/offline/permission denied, stop during reconnect, canceled assignment, browser restart, and session revocation. Document foreground-only limitations.
- [ ] GPS-12 — FE2: isolate and visibly label simulation when used in a demo. Never substitute simulated coordinates into real delivered evidence.

Gate: assignment → consent → authorized live updates → exception → approved retry → verified POD → ended sharing. Foreground GPS requires a secure context; use HTTPS for actual cross-device testing.

## M1–M3 — shared end-to-end acceptance gates

- [ ] E2E-A — All, led by BE2: record 90/100 → exactly one quantity-mismatch case with gap 10 → actual grounded AI → own-SME notice/decision → physical verification → valid closure. `await_remainder` remains open until its completion condition.
- [ ] E2E-C — All, led by FE2: assignment/pickup → consented location → warehouse and associated SME see updates → shop-closed report → matched case → SME preferred time → actual capacity confirmation → verified POD → sharing ends and eligible case closes.
- [ ] E2E-B — All, led by FE1: external delay → verified facts → SME update/awaiting courier confirmation → staff records actual response/outcome → evidence-backed closure; unknown ETA stays unknown.
- [ ] E2E-D — All, led by BE1: packing/handover evidence → transit damage/loss report → UNDETERMINED initially → evidence review/escalation → supported operational attribution with responsibility basis. No internal courier GPS or promised compensation.
- [ ] E2E-E — Optional stretch, BE1 + BE2: warehouse damage evidence → SME request → staff-confirmed quarantine/correction with audit; no autonomous stock edit.
- [ ] E2E-SEC — BE1 + BE2: verify tenant separation, nested records, storage, GPS streams, approval actions, provider tools, unauthorized close and direct URL substitution.
- [ ] E2E-VIS — FE1 + FE2: compare key desktop/mobile views against approved visual references, review focus/keyboard/errors and bilingual text, remove unintended redesigns.
- [ ] E2E-REC — All: restart services/reload clients/retry requests; decisions, jobs, timelines and operational records remain consistent. LocalStorage is not the authoritative data source.

## M4 — full pilot implementation after P0

- [ ] P1-01 — BE1: implement append-only stock movement ledger, reservations/reversals where needed, reconciliation, concurrency tests and audited adjustment approvals. Simplified P0 counts alone are not a durable ledger.
- [ ] P1-02 — BE1: harden onboarding, staff invitations/permissions, session renewal/revocation, storage rules and database backup/restore checks; preserve existing mandatory tenant isolation.
- [ ] P1-03 — BE2: durable job worker/retry/dead-letter handling, provider usage/cost tracking, policy versions, idempotent replay, stale-source analysis invalidation.
- [ ] P1-04 — FE2 + BE1: implement approved GPS retention/privacy controls, reconnect recovery, field battery/network testing, and explicit assessment of native background tracking need. Browser background continuity is not guaranteed.
- [ ] P1-05 — BE2 + FE2: add one selected notification provider with delivery/failure state, recipient preferences, idempotency and approved message content; external messaging is outside P0.
- [ ] P1-06 — BE2: add SLA/deadline worker and repeatable overdue-case rules, with timezone/retry tests; P0 manually reported delay is not the full automated worker.
- [ ] P1-07 — BE2 + FE1: record measured handling times and show baseline/assumptions separately from measured staff minutes saved; do not present PRD forecasts as actual ROI.
- [ ] P1-08 — All: pilot with approved real SME records after security gates; record bugs, operator feedback and evidence completeness; revise workflow before wider rollout.
- [ ] P1-09 — BE1 + FE1: prepare later Render/Supabase environments, secrets, migrations, health/error monitoring and rollout/rollback runbook. Execute deployment only when resumed.

## M5 — explicit future decisions, not hidden core tasks

- [ ] P2-01 — All: validate demand and select WMS/ERP import/export adapters; define reconciliation/ownership before building integrations.
- [ ] P2-02 — All: decide whether multi-warehouse is needed; expand tenancy/membership and test cross-warehouse isolation before rollout.
- [ ] P2-03 — All: assess forecasting with actual data; do not treat projection charts as a committed predictive product.
- [ ] P2-04 — All: consider courier API adapters only after commercial access/permissions; retain third-party GPS exclusion unless a new scope explicitly approves it.
- [ ] P2-05 — All: decide native/background rider tracking separately using measured browser limitations and operating costs.

## Per-PR completion checklist

- [ ] Only owned files/domain touched, or affected owner reviewed the shared-file change.
- [ ] Linked task/PR states behavior, dependencies, modified endpoints/tables, and acceptance evidence.
- [ ] Shared contract changes reviewed by consumers; generated DTOs updated by the integration lead; no hand-edited generated bundle.
- [ ] Migration has a unique filename, dependency order, fresh-database verification, and tenant/constraint review. No rewriting applied migrations.
- [ ] Correct authorization, audit/idempotency and unhappy paths tested for the changed behavior; UI has approved screenshots where visible.
- [ ] Relevant tests/typecheck/build pass; integrate against current main and resolve both Git and semantic conflicts.
- [ ] A peer reviews; main stays runnable; task is marked done only after merged/live-layer verification. Mock UI completion is tracked separately from real integration.

## First actions for the team

1. Assign the four owner aliases and resolve GitHub collaborator access.
2. Complete SET-01 through SET-05 together; create issues from the task IDs with one owner each.
3. Start FE1 WH-01–04, FE2 SMEUI-01/GPS permission UI with fixtures, BE1 DB-01–04/OPS-02 contract, and BE2 CASE-01–03/AI-02 simultaneously.
4. Integrate scenario A first; add real in-house tracking second; add external handover/dispute third. Keep deployment deferred until the team resumes it.

The owner split and small PRs reduce conflicts; no folder structure can guarantee zero conflicts. If two owners need the same file, stop duplicate edits and route the change through its named owner.
