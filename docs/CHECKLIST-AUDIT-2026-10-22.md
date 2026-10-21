# Checklist audit — 22 October 2026

## Latest follow-up: five completed features

The user subsequently authorized backend implementation. The follow-up completes **SMEUI-01, SMEUI-03, SMEUI-04, SMEAPI-04 and CASE-11** with local acceptance evidence in [SME-FIVE-FEATURES.md](SME-FIVE-FEATURES.md). Current checklist count is **41 checked and 75 open, out of 116 tasks**. Only these five additional checkmarks are recorded in this batch.

The original audit below is historical: its missing-feature descriptions, test counts, no-backend-edit restriction and failed native smoke result describe the earlier checkout. The current portal/notification/seed work and native SQL results are documented in the follow-up report. Hosted service acceptance, peer review, team agreements and deployment are not implied by local checks.

## Original read-only audit (historical)

Scope: every task ID in TEAM-FEATURE-CHECKLIST.md, including deferred pilot/future work. Per-PR process checkboxes are not feature implementation claims. Backend Python, backend tests, SQL migrations/seeds and database test source were not edited. Previously uncommitted SET-02/03 work was preserved.

## Evidence and limits

- Frontend unit suite: 21 tests pass (three new case projection/filter/detail tests).
- Backend unit suite: 19 tests pass after installing pinned requirements into ignored root .venv.
- Contract fixtures: 12 pass; OpenAPI and generated TypeScript drift pass after regenerating from unchanged backend source.
- npm test and check:migrations pass (12 migrations).
- Isolated PGlite: 35 historical foundation checks, nine operations scenarios and four case/AI lifecycle groups pass with test Auth/Storage stand-ins.
- Additional read-only probes pass: AI evidence/type/action/priority/human guards, unsafe tracking URL rejection and worker RPC restriction.
- Current complete schema inspection: 30 public tables, all 30 RLS-enabled, no public table without RLS.
- Native PostgreSQL test was actually attempted with the optional Windows engine installed locally (no dependency manifest/lockfile change). It FAILS before concurrency execution because native-smoke.sql expects exactly 28 RLS tables after all migrations; current count is 30. This diagnostic is not a reason to skip the failing gate or mark OPS-07 complete. Backend test SQL remains untouched.
- Production build passes with the new live/demo case detail routes. Browser verification results are appended below after execution.
- Hosted Supabase Auth/Storage, actual OpenAI, real rider phone/Realtime, GitHub permissions, shared staging and pilot acceptance were not performed.

## Changes in this audit

Added page-local queue filters and read-only case detail/shared panels with explicit unavailable states; no manufactured owner, analysis, verification or liability. Added isolated demo detail lookup and regression coverage. Regenerated published contracts from existing backend source; corrected the frontend case response union. Legacy browser comparison now excludes only Leaflet-generated map DOM (tile request timing) while retaining map accessibility and exact comparison of the remaining interface.

Missing backend features and the failed database smoke assertion require backend changes and are left open under the user's no-backend-edits rule. Missing frontend work is explicitly listed below and is not claimed as implemented by this audit. A whole-product implementation is not complete.

## Task-by-task result

| Task | Status | Evidence / remaining work |
| --- | --- | --- |
| SET-01 | External | Names/scope ratification not recorded. No invented team acceptance. |
| SET-02 | External | Access runbook and local branch exist; individual clones/new-branch pushes are unverified. |
| SET-03 | External | Ownership/review/check/staging agreement and PR template exist; ratification and remote rules pending. |
| SET-04 | Verified locally | Existing foundation implementation; docs/M0-FOUNDATION.md and M0-SET07-11.md; current contract, unit, type/build and migration checks apply. Remote CI enforcement is separate. |
| SET-05 | Verified locally | Existing foundation implementation; docs/M0-FOUNDATION.md and M0-SET07-11.md; current contract, unit, type/build and migration checks apply. Remote CI enforcement is separate. |
| SET-06 | Verified locally | Existing foundation implementation; docs/M0-FOUNDATION.md and M0-SET07-11.md; current contract, unit, type/build and migration checks apply. Remote CI enforcement is separate. |
| SET-07 | Verified locally | Existing foundation implementation; docs/M0-FOUNDATION.md and M0-SET07-11.md; current contract, unit, type/build and migration checks apply. Remote CI enforcement is separate. |
| SET-08 | Verified locally | Existing foundation implementation; docs/M0-FOUNDATION.md and M0-SET07-11.md; current contract, unit, type/build and migration checks apply. Remote CI enforcement is separate. |
| SET-09 | Verified locally | Existing foundation implementation; docs/M0-FOUNDATION.md and M0-SET07-11.md; current contract, unit, type/build and migration checks apply. Remote CI enforcement is separate. |
| SET-10 | Verified locally | Existing foundation implementation; docs/M0-FOUNDATION.md and M0-SET07-11.md; current contract, unit, type/build and migration checks apply. Remote CI enforcement is separate. |
| SET-11 | Verified locally | Existing foundation implementation; docs/M0-FOUNDATION.md and M0-SET07-11.md; current contract, unit, type/build and migration checks apply. Remote CI enforcement is separate. |
| DB-01 | Verified locally | SupabaseAuthenticator calls Auth.get_user before active membership lookup; /api/me and forged role/scope tests pass. Native provider acceptance remains separate. |
| DB-02 | Verified locally | Identity/operations migrations create scoped keys/constraints/indexes. Fresh isolated schema, tenant and foreign-key tests pass. |
| DB-03 | Partial | Delivery/tracking/evidence migrations exist. Requested cross-domain review and native acceptance not recorded. |
| DB-04 | Verified locally | All 30 current public tables enable RLS; isolation/storage/GPS tests pass with test Auth/Storage primitives. Native smoke has an outdated table-count assertion. |
| DB-05 | Verified locally | Distinct per-user JWT clients and a worker-only RPC allowlist exist; user-token isolation and privileged-RPC rejection tests pass. |
| DB-06 | Partial | Private bucket/metadata, type/size limits, evidence registration and authorized 60-second download URL exist. Complete upload authorization/client flow and native Storage verification remain. |
| DB-07 | Verified locally | Shared audit/outbox protocols and atomic SQL mutation writes exist. Receipt/case/decision integration tests pass. |
| DB-08 | Partial | Baseline has five main SMEs, 15 main shipments, second warehouse and two cases. Baseline seed has no rider assignments; tests add them dynamically. |
| DB-09 | Verified locally | Isolated tests cover anonymous/forged scope, other SME/warehouse, inactive rider and private evidence. Hosted acceptance is still required before pilot. |
| WH-01 | Verified locally | Existing warehouse React screens; docs/WAREHOUSE-UI.md, frontend unit tests and warehouse browser suite. Live provider acceptance remains separate. |
| WH-02 | Verified locally | Existing warehouse React screens; docs/WAREHOUSE-UI.md, frontend unit tests and warehouse browser suite. Live provider acceptance remains separate. |
| WH-03 | Verified locally | Existing warehouse React screens; docs/WAREHOUSE-UI.md, frontend unit tests and warehouse browser suite. Live provider acceptance remains separate. |
| WH-04 | Verified locally | Existing warehouse React screens; docs/WAREHOUSE-UI.md, frontend unit tests and warehouse browser suite. Live provider acceptance remains separate. |
| WH-05 | Verified locally | Existing warehouse React screens; docs/WAREHOUSE-UI.md, frontend unit tests and warehouse browser suite. Live provider acceptance remains separate. |
| WH-06 | Verified locally | Existing warehouse React screens; docs/WAREHOUSE-UI.md, frontend unit tests and warehouse browser suite. Live provider acceptance remains separate. |
| WH-07 | Verified locally | Existing warehouse React screens; docs/WAREHOUSE-UI.md, frontend unit tests and warehouse browser suite. Live provider acceptance remains separate. |
| OPS-01 | Verified locally | Existing operational routes/user-scoped atomic RPCs; 19 backend tests and nine isolated operation scenarios pass. |
| OPS-02 | Verified locally | Existing operational routes/user-scoped atomic RPCs; 19 backend tests and nine isolated operation scenarios pass. |
| OPS-03 | Verified locally | Existing operational routes/user-scoped atomic RPCs; 19 backend tests and nine isolated operation scenarios pass. |
| OPS-04 | Verified locally | Existing operational routes/user-scoped atomic RPCs; 19 backend tests and nine isolated operation scenarios pass. |
| OPS-05 | Verified locally | Existing operational routes/user-scoped atomic RPCs; 19 backend tests and nine isolated operation scenarios pass. |
| OPS-06 | Verified locally | Existing operational routes/user-scoped atomic RPCs; 19 backend tests and nine isolated operation scenarios pass. |
| OPS-07 | Blocked verification | Native PostgreSQL command fails at native-smoke.sql: expected 28 RLS tables, current schema has 30. Concurrency suite is not reached. Backend SQL preserved. |
| CASE-01 | Partial | Case/policy/analysis/action/job migrations and Pydantic CaseDetail/commands exist; requested domain review not recorded. |
| CASE-02 | Partial | Generic create/match/get routes and SQL support the issue enums; full inbound/warehouse/delivery/handover route acceptance is not tested. |
| CASE-03 | Partial | Active unique index, row locks and repeated-report events exist; sequential deduplication passes. Native simultaneous case-report testing remains. |
| CASE-04 | Partial | Separate fields and guarded commands exist. Complete agreed transition-matrix acceptance has not been demonstrated. |
| CASE-05 | Verified locally | Versioned deterministic priority/action policy and V4-POLICY.md explain defaults; priority boundaries and action/physical guard tests pass. |
| CASE-06 | Verified locally | Scoped case events/actions record actor/time/evidence/policy; detail projection restricts staff analyses and SME-visible events. Case integration tests pass. |
| CASE-07 | Partial | Escalation/information/workflow/proposed-correction commands exist; complete actionable staff-task lifecycle is not verified. |
| CASE-08 | Verified locally | Staff-only version/source-aware close requires evidence/decisions/physical facts. All-type policy guards and await-remainder closure integration pass; notifications/outbox commit in the transaction. |
| CASE-09 | Partial | UNDETERMINED default and separate responsibility_basis exist. Attribution workflow and disputed external outcomes lack end-to-end validation. |
| CASE-10 | Partial | Sequential report/conflict/forbidden/closure checks pass; actual concurrent case reports and full stale decision/policy matrix remain. |
| CASE-11 | Missing | No separate BE2 case/approval/notification seed file exists. Existing two cases are in the shared baseline seed; backend seed files were not changed. |
| AI-01 | Partial | Worker claims a scoped, bounded shipment/inventory/evidence/policy snapshot. Complete retrieval/tool isolation acceptance is not present. |
| AI-02 | Partial | Investigation Pydantic output and evidence/action validation exist; audit probes pass. Full PRD schema acceptance/provider fixtures remain. |
| AI-03 | Partial | Analyze route, durable jobs, leases, bounded retries/source checks and refusal paths exist. Provider/API lifecycle acceptance is incomplete. |
| AI-04 | Partial | Model/configuration/tokens/provider ID/output/source version are persisted in SQL and exercised with a fake result. Actual provider persistence is unverified. |
| AI-05 | Partial | Model recommendations are bounded; staff backend action guards exist. Complete approved action-dispatch lifecycle is not verified. |
| AI-06 | External | SQL fake-provider lifecycle proves recorded gap 10. No explicitly configured real-model acceptance run was performed. |
| AI-07 | Partial | Read-only audit probes reject invented evidence, wrong type and unknown actions. Full complaint injection/other-SME/refusal/timeout/repeated-action matrix remains. |
| WH-08 | Partial | NEW: page-local type/priority/handling/state filters and open/all scope. Owner data is absent from the list contract; no owner or server-wide filter is claimed. |
| WH-09 | Partial | NEW: live/demo detail routes show evidence, supplied AI/missing-info/timeline/requirements. Role-specific command and verification controls remain missing. |
| WH-10 | Verified locally | NEW: src/features/exceptions/index.ts exports reusable read-only CasePanels and caseView; consumed by warehouse detail, available to FE2. |
| WH-11 | Missing | No analyze/propose/escalate/verify-close UI wiring. Existing analyzeCase client lacks the newer required CaseCommand body; do not use it as complete integration. |
| WH-12 | Missing | No React rider assignment/capacity controls or shared live tracking component. |
| WH-13 | Missing | Backend handover command exists; no React handover form. |
| WH-14 | Partial | New read-only case panel preserves UNDETERMINED and supplied facts. Full verified/pending external courier UI remains missing. |
| WH-15 | Partial | Warehouse browser suite and new case screenshots exist; full V4 screens and approved visual reference coverage remain incomplete. |
| SMEAPI-01 | Partial | /api/sme/overview calls tenant_feed using shared inventory/shipment projections. Own-SME dashboard/API response acceptance is incomplete. |
| SMEAPI-02 | Partial | Approval creation/decision and policy-version binding exist. Immutable request-context/stale case-version acceptance needs further checks. |
| SMEAPI-03 | Verified locally | Decision SQL records actor/note/time and updates intent without physical closure; await_remainder, duplicate/conflicting and other-SME integration checks pass. |
| SMEAPI-04 | Partial | Notifications feed and per-user mark-read endpoint exist; explicit unread command is missing. |
| SMEAPI-05 | Partial | Approval/notification/event writes are transactional and retry-safe in tested cases; full outbox delivery consumer is missing. |
| SMEAPI-06 | Partial | Preferred-at proposal and separate capacity command exist; complete retry/capacity workflow acceptance remains. |
| SMEAPI-07 | Missing | No authenticated SME feed polling/realtime consumer or warehouse-refresh acceptance after SME decision. |
| SMEUI-01 | Missing | No authenticated src/app/sme routes or modern SME feature module. Legacy role switching is a fictitious prototype and does not meet this task. |
| SMEUI-02 | Missing | No authenticated src/app/sme routes or modern SME feature module. Legacy role switching is a fictitious prototype and does not meet this task. |
| SMEUI-03 | Missing | No authenticated src/app/sme routes or modern SME feature module. Legacy role switching is a fictitious prototype and does not meet this task. |
| SMEUI-04 | Missing | No authenticated src/app/sme routes or modern SME feature module. Legacy role switching is a fictitious prototype and does not meet this task. |
| SMEUI-05 | Missing | No authenticated src/app/sme routes or modern SME feature module. Legacy role switching is a fictitious prototype and does not meet this task. |
| SMEUI-06 | Missing | No authenticated src/app/sme routes or modern SME feature module. Legacy role switching is a fictitious prototype and does not meet this task. |
| SMEUI-07 | Missing | No authenticated src/app/sme routes or modern SME feature module. Legacy role switching is a fictitious prototype and does not meet this task. |
| DEL-01 | Partial | assign/accept/pickup commands and rider assignment route exist. New delivery workflow has no dedicated successful API/database acceptance suite. |
| DEL-02 | Partial | Packing/pickup guards and assignment cancellation/tracking triggers exist; reassignment prerequisite/session integration remains unverified. |
| DEL-03 | Partial | Proof/confirm commands and evidence checks exist; complete private proof upload and receiver confirmation acceptance remain. |
| DEL-04 | Partial | Confirm records delivered/completed and durable outbox; tracking terminal trigger exists. New delivery completion acceptance is not demonstrated. |
| DEL-05 | Partial | Handover command validates acceptance/waybill/condition/evidence; unsafe tracking-link schema probes pass. Full real handover validation remains. |
| DEL-06 | Partial | Courier event command and generic case reports exist; full staff-verified deadline/failure linkage acceptance remains. |
| DEL-07 | Partial | Capacity table/command with approval/assignment checks exists; rider UI and complete stale/duplicate capacity tests are missing. |
| DEL-08 | Missing verification | Existing tracking/operations tests are not a complete new delivery cancellation/reassignment/POD/handover dispute suite. |
| GPS-01 | Verified locally | Authenticated start/stop routes and assignment/rider/consent/pickup SQL prerequisites pass isolated tests. |
| GPS-02 | Missing | No modern authenticated rider/session/geolocation/shared tracking React implementation. Legacy simulated rider-map.js is excluded. |
| GPS-03 | Missing | No modern authenticated rider/session/geolocation/shared tracking React implementation. Legacy simulated rider-map.js is excluded. |
| GPS-04 | Verified locally | Position Pydantic bounds plus SQL token/scope/time/replay/deduplication/rate checks exist; isolated location tests pass. |
| GPS-05 | Verified locally | Latest-live route/RPC returns recorded/received times, status and accuracy; warehouse/own-SME authorization tests pass. |
| GPS-06 | Missing | No modern authenticated rider/session/geolocation/shared tracking React implementation. Legacy simulated rider-map.js is excluded. |
| GPS-07 | Missing | No private Realtime channel policy and no React reconnect/subscription implementation. SQL RLS alone does not complete Realtime. |
| GPS-08 | Partial | Database stop/terminal/reassignment hooks revoke access and reject late packets. Required FE2 marker/subscription cleanup is absent. |
| GPS-09 | Partial | Live-view audit and worker-only retention function are tested. No configured retention scheduler/operational execution is present. |
| GPS-10 | External | Actual rider phone/two authenticated viewers/private Realtime acceptance has not been run. |
| GPS-11 | Missing verification | Database stale/stop checks exist; required real browser/rider reconnect/restart/revocation acceptance is missing. |
| GPS-12 | Verified locally | Legacy simulation is visibly labeled and isolated from live routes; no simulated coordinate-to-real-evidence path exists. React live GPS is not implemented. |
| E2E-A | Not accepted | Complete live scenario/approved visual/security/recovery evidence is missing; isolated demo/unit checks do not satisfy this gate. |
| E2E-C | Not accepted | Complete live scenario/approved visual/security/recovery evidence is missing; isolated demo/unit checks do not satisfy this gate. |
| E2E-B | Not accepted | Complete live scenario/approved visual/security/recovery evidence is missing; isolated demo/unit checks do not satisfy this gate. |
| E2E-D | Not accepted | Complete live scenario/approved visual/security/recovery evidence is missing; isolated demo/unit checks do not satisfy this gate. |
| E2E-E | Not accepted | Complete live scenario/approved visual/security/recovery evidence is missing; isolated demo/unit checks do not satisfy this gate. |
| E2E-SEC | Not accepted | Complete live scenario/approved visual/security/recovery evidence is missing; isolated demo/unit checks do not satisfy this gate. |
| E2E-VIS | Not accepted | Complete live scenario/approved visual/security/recovery evidence is missing; isolated demo/unit checks do not satisfy this gate. |
| E2E-REC | Not accepted | Complete live scenario/approved visual/security/recovery evidence is missing; isolated demo/unit checks do not satisfy this gate. |
| P1-01 | Partial | Append-only receipt/dispatch/correction facts exist; reservations/reversals/reconciliation/adjustment approval acceptance are incomplete. |
| P1-02 | Missing | Auth/RLS foundations exist, but full onboarding/invitations/revocation/backup-restore hardening is not implemented. |
| P1-03 | Partial | Durable analysis worker, retry/source/usage metadata exist. Full dead-letter/cost/replay/operational acceptance remains. |
| P1-04 | Missing | No approved field-tested privacy/retention/reconnect/background tracking assessment. |
| P1-05 | Missing | No selected external notification provider/preferences/delivery worker; external sending was not performed. |
| P1-06 | Missing | No SLA/deadline worker with repeatable timezone/retry acceptance. |
| P1-07 | Missing | No measured handling-time/ROI recording feature; forecasts are not evidence. |
| P1-08 | External | Approved real-data pilot/security signoff/operator feedback not available; no pilot performed. |
| P1-09 | Partial | render.yaml and development deployment notes exist; complete monitoring/secrets/rollout/rollback preparation remains. Deployment is deferred. |
| P2-01 | Future decision | Explicit future scope requires real demand/access/measurements and a product decision. No speculative integration or scope expansion was implemented. |
| P2-02 | Future decision | Explicit future scope requires real demand/access/measurements and a product decision. No speculative integration or scope expansion was implemented. |
| P2-03 | Future decision | Explicit future scope requires real demand/access/measurements and a product decision. No speculative integration or scope expansion was implemented. |
| P2-04 | Future decision | Explicit future scope requires real demand/access/measurements and a product decision. No speculative integration or scope expansion was implemented. |
| P2-05 | Future decision | Explicit future scope requires real demand/access/measurements and a product decision. No speculative integration or scope expansion was implemented. |

## Browser evidence

The extended warehouse browser suite passes using installed Chrome: demo receipt/stock persistence, rapid filters, modal keyboard behavior, live SDK session/provider-fake API flows, lost receipt/HTTP 408/reload/denied-retry replay, malformed-response protection, dispatch and empty/401/403/503 states. New case checks cover combined filters, empty results, detail navigation, honest unavailable AI/evidence state, 404, desktop/mobile layout and no runtime errors.

Screenshots (ignored local artifacts): test-results/warehouse-case-desktop.png and test-results/warehouse-case-mobile.png. Visual inspection of the mobile screenshot found no horizontal overflow. These are generated verification screenshots, not a claim of team-approved visual references.

The legacy browser suite also passes after the Leaflet DOM comparison correction: four role interfaces match outside generated map internals, the SME/warehouse/manager screenshots match byte-for-byte, report submission/reload persistence and responsive foundation checks pass without runtime errors. GPS-12 is checked only for demo isolation/labeling, not actual location sharing.

Initial audit checklist: 116 feature tasks audited; 36 checked, 80 open (partial, missing, external or deferred). Fifteen checkmarks were added in this audit: thirteen existing local backend/schema behaviors, WH-10 shared read-only frontend panels and GPS-12 existing demo isolation. No remote push, commit, hosted migration or backend source modification was performed.
