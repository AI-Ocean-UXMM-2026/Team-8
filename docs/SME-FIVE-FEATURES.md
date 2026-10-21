# SME workflow: five-feature batch

This batch completes SMEUI-01, SMEUI-03, SMEUI-04, SMEAPI-04 and CASE-11 locally. It finalizes previously started work and adds persisted decision display, superseded-request handling, recipient-state tests and repeatable case timelines. Other in-progress features keep their existing checklist status.

| Task | Result | Main implementation |
| --- | --- | --- |
| SMEUI-01 | Authenticated `/sme` dashboard shows own stock, shipments, cases and pending decisions. Membership choices come from verified `/api/me`; loading, unavailable, expired-session and empty views are explicit. | `src/app/sme/layout.tsx`, `src/features/auth/session.tsx`, `src/features/portal/sme.tsx` |
| SMEUI-03 | `/sme/exceptions/[id]` consumes the shared case panels and provides SME information/decision controls. Staff operations are absent. The selected SME and returned case must agree. | `src/features/portal/sme.tsx`, `src/features/exceptions/case-panels.tsx`, `src/features/exceptions/controls.tsx` |
| SMEUI-04 | Offered accept-partial, await-remainder and reject choices require a note. Persisted choices, notes and timestamps survive reload. Cancelled/superseded requests are disabled. An uncertain submission retains its original request/key across reload and retry. A decision does not verify delivery or close a case. | `src/features/portal/decision.tsx`, `src/features/warehouse/command.ts`, case integration migration |
| SMEAPI-04 | Scoped notification feed, case links and per-user read/unread commands. Repeated read/unread is safe; one actor cannot erase another actor's read marker. Both mutation responses are empty HTTP 204. | exceptions router, workspace-features migration, shared API client, `Notifications` |
| CASE-11 | BE2's separate seed adds two representative cases, request timelines, approvals and notifications. It runs after the base and operations fixtures and never rewrites a saved decision or posts stock. | `supabase/seeds/cases.sql` |

Implementation ownership remains FE2 for the three SME UI tasks and BE2 for notification/case-domain work, following the existing owner register. Dependencies are the verified identity/tenant contracts, shared transport and BE1 base/operations fixtures. This is local work on `main`; no PR, peer approval or shared staging migration is claimed.

## Local validation

Final result: **41/116 checked, 75 open**. Backend: **40 passed, 4 native Supabase tests skipped**; frontend: **21 passed**; contracts: **12 fixtures plus drift passed**. Fresh SQL suites, native PostgreSQL 17, portal and warehouse browser suites, typecheck, production build and `git diff --check` pass.

- `npm run test:portals`: provider/API fixtures exercise real browser sign-in/session gates, own-SME dashboard, mobile/desktop screenshots, empty/error/expired views, shared case panels, information submission, all three receipt choices, stale rejection, superseded requests, lost-response reload/replay and notification persistence/failure/link/empty states. The script also retains the existing rider regression checks.
- `npm run test:backend`: HTTP contract checks cover authenticated token forwarding, notification UUID validation, empty 204 responses, expired/anonymous requests and forbidden-recipient errors. Native Supabase tests remain explicitly gated.
- `npm run test:database` and `npm run test:embedded --prefix supabase/tests`: execute fresh migrations, real SQL recipient isolation/read markers, cross-SME denial, seed relationship consistency, repeated seeds and preservation of a decided approval. The embedded suite uses disposable PostgreSQL 17 and retains concurrent-operation checks.
- Frontend tests, typecheck, production build, contract drift and migration checks are required before checking the five items. The portal browser script is included in the frontend CI job; this does not claim a GitHub runner execution.

The browser fixtures are fictitious. Local SQL tests provide Auth/Storage/Realtime stand-ins; they do not certify hosted Supabase services. No hosted migrations, Auth-user provisioning, external messages, model calls, Git push or deployment are part of this batch.

## Open the UI

Run `npm.cmd run dev`, open `/login`, select **SME**, and sign in with an existing Auth user whose verified active membership has role `sme` and the correct warehouse/SME. Selecting the workspace does not grant permissions. Fictitious SQL Auth rows have no password and are not usable sign-in credentials.

## Optional fixture order

Only in an isolated disposable database: apply the schema migrations, then `supabase/seed.sql`, `supabase/seeds/operations.sql`, and `supabase/seeds/cases.sql`. Do not run the test bootstrap or optional seeds on shared staging. CASE-11 does not edit the BE1 base seed. The integration suites load these files automatically and verify that rerunning the BE2 seed preserves recorded decisions.

## Integration with updated main

The five conflicting files were resolved by combining both implementations. The incoming warehouse table, metrics, search, stage/sort controls, investigation actions, fonts, language assets and supplied PRD remain. Issue/priority/handling/owner/state filters still reach the backend before pagination; search, stage and sorting remain page-local and are labeled accordingly. The investigation screen exposes the shared case panels and authorized advanced controls under **Evidence, analysis and verification**. Demo records do not acquire live command permissions.

Both API client surfaces and both sets of package scripts remain available. The demo adapter preserves filtered lists as well as persisted investigation actions. A regression test places a matching case after a nonmatching one, verifies filtering before pagination, escalates it, and checks that filtered results and the reloaded detail agree. The combined frontend suite has 24 tests. Browser checks use the incoming **on hold** receipt wording and distinguish uploaded fixture evidence from physical verification.

Merge validation passed: typecheck, 24 frontend tests, 12 contract fixtures and generated-contract drift, migration conventions, legacy regressions, legacy/warehouse/portal browser suites, production build, and the production-server English/Myanmar desktop/mobile case UI checks. Conflict resolution changed no backend logic or schema. Hosted migrations and deployment were not performed.
