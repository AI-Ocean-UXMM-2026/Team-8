# ParcelCare V4 implementation plan — four-person team

Source of truth: [current Standard PRD](ParcelCare%20PRD.md). The supplied Standard PRD supersedes the earlier V4 requirements; this older implementation plan must be reconciled before using its section references or priorities. Prepared 21 October 2026. This supersedes plans derived from the original PRD. Deployment is deferred at the user's request. This document proposes architecture and delivery order; it does not implement the features.

## 1. Scope and current starting point

Build a B2B warehouse-to-SME exception workspace: warehouse staff, SME employees, and employed riders. No end-customer portal, public tracking links, external courier login, or external-courier GPS. Real OpenAI analysis must use authorized recorded evidence; actions and closure remain governed by deterministic policies and verified outcomes.

Current implementation is a Next.js/TypeScript compatibility migration around the original HTML/Tailwind/jQuery demo. Feature scripts still share global variables and decorate the same renderer. FastAPI exposes only health; Supabase/OpenAI factories are unused. Real auth, schema, RLS, APIs, durable data, and real GPS are not implemented. Existing tests protect demo workflows; they do not prove backend security or V4 completeness.

Preserve current colors, typography, spacing, tables, dialogs, bilingual text, and visual hierarchy as routes become React features. V4 also needs new screens and behavior: real sign-in, separate role routes, SME decisions, and consented GPS. Keep the visual design; do not preserve prototype restrictions that contradict V4. In particular:

- Replace the production role dropdown with authenticated memberships. Keep it only in an explicitly isolated fictitious demo.
- Support outbound failure/delay as V4 cases even though old report rules exclude them.
- Use V4 verified closure: authorized warehouse staff can close after required decisions and physical/outcome evidence. An SME approval is not physical completion, and universal SME-only closure is not a V4 requirement.
- Reassess the 39 prototype rules, maker/checker simulation, and MMK priority thresholds. They are references, not automatically approved V4 policies.
- Do not carry end-customer order/fulfillment assumptions into warehouse-to-SME shipments. Full customer order management is outside this lean scope.

## 2. Four owners with separate frontend/backend responsibilities

Replace the aliases with actual names in the checklist. One owner per path; others contribute through a reviewed request.

**FE1 — warehouse frontend and frontend integration lead**

Own warehouse dashboard, inventory/receipt/shipment screens, assignment/handover forms, warehouse exception details, reusable case panels, and shared frontend layout/design primitives. Integrate approved modules from FE2. Own package manifests/lockfile, global CSS/Tailwind/shadcn setup, `next.config.ts`, and migration scripts. FE1 is the only person editing the legacy bridge during removal.

**FE2 — SME, rider, and tracking frontend**

Own SME dashboard and details, decisions and notifications UI, rider mobile workflow, GPS permission controls, reusable tracking map, location status display, and frontend subscriptions. FE1 imports FE2's map; FE2 imports FE1's public case panels. Do not duplicate map or case-panel implementations.

**BE1 — backend integration lead, auth/database, operational data, deliveries/GPS**

Own identity and authorization, warehouse/SME membership, base migrations, products/shipments/receipts, controlled stock changes, riders/assignments, handovers/POD, tracking sessions/location ingestion/live reads, storage authorization, infrastructure/health, API composition, and realtime policy setup. Own shared Python requirements/settings, core audit/outbox interfaces, CI, and release configuration. This is the busiest shared dependency: deliver auth, schema, and mock contracts first rather than waiting to finish all delivery features.

**BE2 — cases, AI, policy actions, SME approvals/notifications**

Own case matching/lifecycle, deterministic priority and action policy, tenant-scoped OpenAI investigation, AI job handling, decisions, notifications, and case timeline. Own migrations for these tables, with BE1 review for cross-table tenancy. Consume BE1 services for stock/delivery state; never directly mutate their tables from an AI tool.

**Integration and QA are shared work.** FE1 integrates frontend; BE1 integrates backend/schema; BE2 reviews authorization-sensitive operational actions; FE2 checks mobile/GPS flows. Every owner tests their feature. Do not leave testing to a nonexistent fifth teammate.

## 3. Feature folders and file ownership

Keep the current repository root; do not introduce another monorepo move during feature development. The tree below is the target, not a claim that these modules already exist. Prefixes in comments identify owners.

```text
src/
  app/                              # thin routes, no business rules
    layout.tsx                      # FE1
    login/page.tsx                  # FE1
    warehouse/                     # FE1 routes
      page.tsx
      inventory/page.tsx
      shipments/page.tsx
      shipments/[id]/page.tsx
      exceptions/[id]/page.tsx
    sme/                           # FE2 routes
      page.tsx
      shipments/[id]/page.tsx
      exceptions/[id]/page.tsx
    rider/page.tsx                 # FE2
  features/
    auth/                          # FE1, with BE1 auth contract
    warehouse/                     # FE1: overview composition
    inventory/                     # FE1: SKU/receipt interfaces
    shipments/                     # FE1: warehouse shipment workflows
    exceptions/                    # FE1: React case panels; legacy file frozen
    sme/                           # FE2: own-data views
    rider/                         # FE2: mobile task/pickup/POD
    tracking/                      # FE2: shared map/consent/location state
    approvals/                     # FE2: SME decision controls
    notifications/                 # FE2
  shared/
    ui/                            # FE1: styled shadcn primitives
    api/                           # FE1: transport; generated DTOs under contracts
    session/                       # FE1: auth adapters
api/app/
  main.py                          # BE1: router registration only
  core/                            # BE1: settings, auth, db, audit, outbox/errors
  features/
    identity/                      # BE1: warehouse/SME membership lookup
    inventory/                     # BE1: products, receipts, human stock actions
    shipments/                     # BE1: events and status transitions
    deliveries/                    # BE1: assignments, handover, POD, capacity
    tracking/                      # BE1: sessions, coordinates, live authorization
    evidence/                      # BE1: private upload/download authorization
    exceptions/                    # BE2: cases, timeline, closure guards
    ai/                            # BE2: schemas, prompts, scoped read tools/jobs
    approvals/                     # BE2: SME requests/decisions
    notifications/                 # BE2: in-app delivery/read state
    policies/                      # BE2: allowlisted actions and priority
supabase/
  migrations/                      # each author owns unique domain migrations
  seeds/                           # BE1 baseline; BE2 separate cases seed
contracts/
  openapi.json                     # generated, published by BE1
  generated/                      # generated TypeScript, no hand edits
  fixtures/operations/             # BE1
  fixtures/cases/                  # BE2
tests/
  e2e/warehouse/                   # FE1
  e2e/sme-rider/                   # FE2
  integration/operations/           # BE1
  integration/cases/                # BE2
```

Inside a React feature colocate `components/`, `api.ts`, `types.ts` for UI-only types, `hooks/`, meaningful tests, and an `index.ts` public export. Inside a Python feature colocate `router.py`, `schemas.py`, `service.py`, `repository.py`, and tests as needed. Avoid empty boilerplate folders. Across-feature calls use public services or DTOs, never another feature's internal repository.

The existing `reports`, `policies`, `priority`, `deliveries/rider-map.js`, `exceptions/maker-checker.js`, and `workspace` files are legacy reference code. FE1 coordinates bridge changes; owners build new modules without editing these shared scripts in parallel. React and jQuery must never own the same DOM subtree.

## 4. Contracts before parallel implementation

Use FastAPI/Pydantic models as the API schema source; publish OpenAPI and generate TypeScript DTOs. FE1's API transport attaches the authenticated token; FastAPI verifies it, resolves memberships, and applies authorization to every entity lookup. No business mutation should be independently reimplemented in Next.js. Browser Supabase access is limited to authentication and explicitly authorized realtime/storage flows.

The existing server-only Supabase factory is not an authorization layer. For normal user database operations, propagate a verified user context so RLS applies. If a privileged credential is necessary for a trusted worker/function, authorize and scope it explicitly; possession of an SME/shipment UUID is never permission.

Freeze these before wiring features:

- UUIDs; ISO-8601 UTC timestamps; integer nonnegative stock quantities; consistent pagination; nullable/required fields; error envelope `{error:{code,message}}`.
- Role/membership vocabulary; warehouse/SME/rider scope; permission differences between reading facts, making decisions, and physical completion.
- Independent shipment state, case state, urgency, handling mode, approval state, action outcome, delivery mode, and operational responsible party.
- PRD AI response schema: `exception_type`, `priority`, `summary`, `evidence_ids`, `recommended_action`, `requires_human`, `missing_information`. Restrict actions to an enum and validate that cited evidence belongs to the authorized context.
- Event envelope proposed by this plan: `event_id`, `event_type`, `warehouse_id`, `sme_id`, `entity_id`, `actor_id`, `occurred_at`, `schema_version`, `idempotency_key`, `payload`.
- Versioned JSON fixtures for success, empty, forbidden, stale, pending, invalid input, and provider failure. Frontend mock mode must implement the same transport contract as live mode; do not scatter fixture arrays through components.

**PRD endpoint ownership (section 9):**

- BE1: warehouse overview, inventory, shipment list, receipts, assignment, tracking start/location/stop/live, proof, and external handover.
- BE2: create/get/analyze/action exception, SME overview aggregation, approval decision, notifications. BE1 exposes scoped inventory/shipment read services for BE2's SME overview; BE2 does not query around them with a privileged client.

Additional contracts are necessary but not specified by the PRD endpoint list: identity/me, shipment creation/detail/manual events/dispatch, rider assigned tasks/accept/pickup, evidence upload/download, confirmation of POD, reschedule request/capacity confirmation, notification read, and verified case closure. Freeze names and examples in the foundation milestone; label these as planned additions, not existing APIs. Example candidate routes: `/api/me`, `/api/rider/assignments`, `/api/shipments/{id}`, `/api/evidence`, `/api/exceptions/{id}/close`.

## 5. Data model and invariants

Implement the PRD section 8 entities, plus the following explicitly proposed supporting records. Table ownership determines which feature writes them.

- BE1: warehouses, SMEs, products, shipments/items/events, riders, assignments, tracking sessions, locations, handover records, delivery proofs. Add profiles/memberships and private evidence metadata because authentication and uploads need persistent ownership.
- BE2: cases/events, approvals, notifications. Add persisted analyses, action executions, versioned policies, and retryable analysis jobs for reproducible AI behavior.
- BE1 owns shared audit/event-outbox schema and writer API; BE2 adds case data through that API. Additive migrations are authored separately and reviewed together; never give every developer an uncoordinated copy of a shared base migration.

All child references must preserve tenant association: shipment item product belongs to its SME, assignment rider belongs to the warehouse, approval SME matches case, evidence matches its parent. Use FKs/constraints where possible and scoped checks for remaining relationships. RLS covers joins, storage, and location visibility, not just top-level tables.

Receipt posting is atomic and idempotent: receipt quantities, inventory counts, shipment event, discrepancy event/outbox, and audit must agree. Record good stock separately from damage/quarantine. Add damaged quantity to receipt details because the minimal sample payload omits it although damage is in scope. Define partial vs final receipt semantics so remaining expected stock is not prematurely declared missing. Stock correction is a separate staff-authorized, audited operation; it is never parsed from an AI response.

Deduplicate active cases using shipment, operational stage, and issue type under a database concurrency guard. Tracking ID or shipment ID alone cannot merge unrelated damage and shortage. The exact active-state set must be agreed and used consistently by API, unique constraint/transaction logic, and retry jobs.

Approval records include the request options, requester, authorized SME actor, decision/time, and policy version. Distinguish `accept_partial`, `await_remainder`, rejected requests, pending proposals, and confirmed execution. An accepted reschedule proposal is not committed until actual capacity is confirmed.

Closure checks are case-specific: required decisions, verified physical/outcome evidence, and no outstanding mandatory action. `accept_partial` requires receipt handling verification; `await_remainder` remains pending until its agreed completion condition. External-courier delay does not resolve when an ETA request is sent. POD confirmation must atomically end tracking, record verified delivery, and publish a completion event; case closure validates the corresponding criteria and records its actor rather than blindly closing all shipment cases.

## 6. GPS, maps, and external-courier boundary

FE2 implements permission and foreground geolocation controls; BE1 owns session state and ingestion. Assignment, pickup, consent, and active session must be valid before accepting a position. Validate latitude/longitude range, accuracy, timestamps, replay/duplicates, assignment identity, and rate limits; preserve client-recorded and server-received timestamps. Reject delayed packets after session termination.

Proposed starting configuration, **not PRD-mandated values**: send at most once per 10 seconds while a fresh fix is available; show stale after 60 seconds; purge raw locations after 24 hours. Agree and configure these values at kickoff based on privacy, battery, provider limits, and operational needs. Mark absent/denied/offline/stale accurately and show last-updated time; do not infer continuous tracking or guaranteed ETA.

Persist location before notifying viewers. Start with a scoped latest-location endpoint and authorized polling if needed; add Supabase private Realtime for live updates. BE1 owns channel authorization and data minimization; FE2 owns subscriptions/reconnect/UI state. Merely hiding another SME's marker is not access control. RLS for business tables alone does not configure private Broadcast authorization.

On explicit stop, delivery, cancellation, or reassignment, terminate the session and deny new live reads/uploads. Stop broadcasts for that session, send a non-location termination event, invalidate active viewer/subscription state, and clear markers. Do not assume policy updates instantly remove already-connected subscribers; test stop/revocation behavior. Previously received coordinates cannot be recalled, so send only needed recent data and stop further disclosure.

Log authorized live-view sessions/access without storing unnecessary raw coordinates in logs. Retention cleanup must remove expired locations from application reads and stored history. GPS permission is per rider/delivery; AI cannot start it.

Use the same tracking map component in warehouse and SME views. External courier mode shows verified handover evidence and a validated HTTPS external tracking link, with unknown internal GPS/ETA. No synthetic ParcelCare coordinate for external couriers. Any simulated in-house movement is visibly labeled and isolated from real location facts.

## 7. Real AI and deterministic actions

BE2 builds one orchestrator with bounded tenant-scoped read tools, not multiple autonomous agents. Analyze only records the initiating actor/system job may access. Persist source evidence IDs/version, validated output, policy version, model configuration, token usage, execution status, and timestamps.

Run arithmetic, deduplication, transition checks, priority policy overrides, permissions, and action execution outside the model. Structured output constrains shape; application validation must still reject invented evidence IDs, unsupported actions, and requests violating policy. Handle refusal, timeout, malformed output, provider failure, and stale evidence as recoverable states.

P0 automatic allowlist: save summary, update allowed internal non-financial workflow state, create in-app SME notice, request information/approval, and escalate. Corrections are proposals until authorized staff verify and execute. Dispatch, quarantine confirmation, delivery completion, replacements, and financial promises are human-controlled. Responsibility starts UNDETERMINED; AI can suggest evidence-supported operational attribution but cannot decide final legal liability.

Persist analysis jobs/action IDs and use bounded retries; an HTTP request finishing must not lose background work. Recheck current permissions, approval state, source version, and policy immediately before executing a mutation. Couple business changes to audit/outbox records and deduplicate retry deliveries. Case analysis output is never executable SQL.

## 8. Milestones and parallel schedule

No fixed calendar estimate until the team sizes each task. The PRD's one-day schedule is a demo target, not a realistic promise for all production hardening. Build in gates:

**M0 — integration foundation.** BE1 delivers auth/scoped schema and transport contracts; BE2 delivers case schema/action examples; FE1 delivers shared React shell/tokens/API adapter; FE2 builds mobile/maps/SME screens using fixtures. All four can start after initial contract agreement.

**M1 — scenario A, durable receipt-to-decision loop.** BE1 posts 90/100 exactly once; BE2 creates one case, invokes actual OpenAI, requests SME decision, and verifies closure; FE1 wires receipt/case screens; FE2 wires scoped SME decision/timeline. This is the first complete integration gate.

**M2 — scenario C, in-house delivery.** FE2 and BE1 own real foreground GPS and rider actions. FE1 wires map and assignment into warehouse; BE2 connects failure → case → SME preferred time → confirmed capacity → POD completion/closure. Cross-device isolation and stop behavior must pass.

**M3 — scenarios B/D and complete P0.** Add external courier handover/delay/damage coordination, evidence, no internal GPS, and disputed responsibility. Finish stock/shipment summaries, notifications, all role views, audit and realistic errors. Seed one warehouse/five SMEs/10–20 shipments/2–3 cases.

**M4 — P1 pilot readiness.** Durable stock ledger, retry/worker resilience, onboarding, richer policies, privacy/retention enforcement, provider notification integration, SLA jobs, operational observability, backups/restore rehearsal, and measured ROI. Basic auth/RLS, consent, and audit are already M0/P0 requirements; they cannot wait for this hardening stage.

**M5 — conditional P2.** WMS/ERP adapters, multi-warehouse, forecasting, optional commercial courier integrations, and a separate native/background-location feasibility decision. Keep out of the core backlog until validated and explicitly selected. Billing, external messaging, and competitor/pricing projections are not implicit P0 implementation commitments.

Integrate in small slices throughout each milestone. UI work starts with fixtures while backend work proceeds; completion requires live endpoints and database evidence, not a mock-only demonstration.

## 9. Keeping work separate and reducing Git conflicts

1. Start from one shared foundation commit. Repository access is a prerequisite: the last push was denied for `htoomyatmineain`; resolve collaborator permissions or agree an authorized shared remote before attempting team integration. No deployment/push is performed by this plan.
2. Each person uses a separate local clone or worktree and a task branch. Never have teammates editing the same working directory or feature branch. Suggested names: `feat/fe1-receiving-ui`, `feat/fe2-rider-tracking`, `feat/be1-receipts`, `feat/be2-case-triage`.
3. One owner per file. FE1 edits shared frontend config/lockfiles; BE1 edits shared backend config/router registry/CI. Others submit dependency/route registration requests early. Split large manifests/registries into owned feature modules so changes remain small.
4. Unique migrations: `YYYYMMDDHHMMSS_<owner>_<domain>.sql`; reserve dependency order before merging. Two migrations may still conflict semantically despite different names. Review the schema graph and test the combined sequence on a fresh database.
5. Other feature tables are read through scoped interfaces and mutated through owning services. Case code cannot bypass inventory/delivery rules; frontend screens cannot duplicate authorization or AI policy.
6. Contracts change through a short reviewed proposal, including affected consumers, examples, backward compatibility, and tests. BE1 publishes generated OpenAPI/DTOs after merged schema changes; nobody hand-merges generated files.
7. Fetch/update from main before starting and before merging. Keep PRs focused; avoid repository-wide formatting or renames while others work. Never resolve a conflict by blindly taking ours/theirs. After resolving, run the relevant tests and combined build.
8. Each PR names owner, touched contracts/tables, migration dependencies, acceptance evidence, and screenshots for visible changes. Pair reviews: FE1↔FE2, BE1↔BE2; add the affected consumer for cross-layer changes. A peer reviews permission changes.
9. Integration leads merge ready slices into main after required checks; keep main runnable. Do not wait for four large feature branches to finish. Hold a short daily check on contract changes and blockers.
10. Separate seed fixtures from private/real data. Use local Supabase instances or isolated test environments per developer where possible. Shared staging migrations are applied only by BE1 from merged commits; no ad hoc SQL edits that exist only in someone's dashboard.

These boundaries reduce conflict; they cannot guarantee that Git or design conflicts never occur. Resolve shared interfaces before implementation and review combined behavior after merging.

## 10. Release gates and deferred deployment

Use [TEAM-FEATURE-CHECKLIST.md](TEAM-FEATURE-CHECKLIST.md) to track work. M3 P0 completion requires all selected V4 journeys against real auth/database, source-grounded AI, verified decisions/closure, and real foreground GPS or an explicitly labeled demo fallback. A simulated GPS fallback is not completion of a production GPS feature.

Keep the original prototype and screenshots as visual references. New V4 screens need their own approved screenshots. Scope legacy equality tests to frozen demo code; do not preserve obsolete behavior at the expense of V4 correctness. Validate role/SME isolation against live endpoints/RLS/storage/realtime, duplicate/concurrent receipts, case matching, action restrictions, GPS stop/stale states, and external handover semantics.

Deployment work remains on the checklist for later. Before a pilot: migrations succeed from empty and previous schema, required CI passes, seeds are fictitious, secrets are server-only, retention is configured, and restore/error paths are exercised. No public multi-user rollout before tenant/GPS boundaries pass.

## 11. References

- Product requirements: [local PRD V4](ParcelCare%20PRD.md). Market/cost figures in it remain assumptions; this plan does not validate vendor pricing or legal liability.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): database authorization and privileged credential considerations.
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): private Broadcast/Presence use their own authorization policies.
- [MDN watchPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition): browser geolocation requires a secure context and explicit permission.
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): schema-constrained analysis; business authorization remains application responsibility.
