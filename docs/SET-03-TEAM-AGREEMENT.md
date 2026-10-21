# SET-03 — file ownership and review agreement

Status: prepared for FE1 + BE1 ratification. Role assignments below follow IMPLEMENTATION-PLAN-V4.md. Actual names, GitHub handles, staging access and team acceptance are still pending. This document does not grant access or enforce GitHub settings.

## File owners

One owner coordinates each shared file. Other contributors request that owner's review before changing it. Tests follow their feature owner. Planned paths below acquire the same owner when introduced.

| Paths / scope | Owner | Peer reviewer |
| --- | --- | --- |
| `src/app/warehouse/`, `src/app/demo/warehouse/`, `src/app/login/`, `src/app/foundation/`, frontend auth, warehouse, inventory, shipments and React case panels | FE1 | FE2 |
| `src/shared/`, root frontend routes/layout/styles, `package.json`, `package-lock.json`, Next/TypeScript/Tailwind config, frontend build scripts | FE1 | FE2; BE1 for API/auth changes |
| SME/rider routes and React SME/rider/tracking/approvals/notifications features | FE2 | FE1 |
| Existing legacy JavaScript, `src/features/workspace/`, `dist/`, `public/vendor/`, legacy bridge and regression scripts | FE1 | FE2 |
| `api/app/core/`, application/router composition, health/identity/operations/inventory/shipments/deliveries/tracking/evidence features, Python requirements | BE1 | BE2 |
| Backend exceptions/AI/approvals/notifications/policies and worker business behavior | BE2 | BE1 |
| `api/app/contracts.py`, `contracts/openapi.json`, `contracts/generated/`, operation fixtures | BE1 | BE2 + FE1 when browser contracts change |
| `contracts/fixtures/cases/` | BE2 | BE1 + affected frontend consumer |
| `.github/workflows/`, database test infrastructure, shared database configuration and baseline seed | BE1 | BE2; FE1 for frontend CI/dependency changes |
| `supabase/migrations/*_be1_*.sql` (identity/operations/shared schema) | BE1 | BE2 |
| `supabase/migrations/*_be2_*.sql` (cases/AI/policies) | BE2 | BE1 |
| Team agreement and cross-domain architecture documents | FE1 + BE1 coordinate | Both leads review changes |

Generated contracts are published by BE1 from schema source; never hand-edit generated DTOs. FE1 coordinates all legacy bridge changes even where the filename resembles another domain. Cross-table tenancy, auth, RLS and permission changes require the backend peer's review; affected frontend consumers also review contract changes.

## PR review and branches

- Frontend pair: FE1 ↔ FE2. Backend pair: BE1 ↔ BE2. An author cannot approve their own change.
- Use `feat/SET-03-short-description`, `fix/TASK-ID-short-description`, or `docs/TASK-ID-short-description`; replace TASK-ID with the actual checklist task. One task per branch and PR.
- Branch from the current remote default branch; target that default branch in the PR. Do not commit directly to it. Update the task branch before final review; avoid unrelated changes and shared working directories.
- Request the path owner's review when editing another owner's file. Cross-domain PRs need both domain reviews. Resolve review conversations before merging.
- Include task ID, owner, reviewers, contracts/tables, migration dependencies, validation results and screenshots for visible changes. Use the repository PR template.

## Required checks and repository settings

The existing `.github/workflows/checks.yml` defines these four jobs. Require all four on every PR:

| Check job | Coverage |
| --- | --- |
| `frontend` | Typecheck, frontend tests, legacy regressions, production build, legacy and warehouse browser suites |
| `backend-contracts` | Backend tests, contract fixtures/generated drift, migration conventions |
| `database-security` | Fresh isolated database and security/operation tests |
| `fresh-postgres17` | Fresh PostgreSQL 17 migrations, seeds and native concurrency checks |

A repository administrator must configure default-branch protection/rules to require PRs, peer approval, resolved conversations, fresh approval after changes, and the four actual check contexts emitted by Actions. For cross-domain PRs obtain both reviews even if the global minimum is one. This local change does not configure remote rules or establish that CI passed. Real handles are required before adding an effective CODEOWNERS file; role labels are not GitHub accounts.

For local validation use the commands in `docs/M0-SET07-11.md`; backend checks need Python development requirements and browser checks need Playwright Chromium or installed Chrome. Record failed/unavailable checks explicitly in the PR.

## Shared staging migrations

BE1 is the designated operator role; BE2 reviews each migration plan. The real operator and staging permissions must be confirmed before execution. FE1/FE2 request database changes through the backend owner. BE2 may author migrations but does not independently apply them to shared staging.

Apply only reviewed migrations from a merged default-branch commit. Follow `docs/DATABASE-WORKFLOW.md`: confirm staging project reference, record commit/migration list and backup/restore point, validate a fresh local database, inspect migration history and dry-run, then obtain staging approval before BE1 applies once. Never reset shared staging, rewrite applied migrations, auto-seed it or make dashboard-only schema edits. Record operator, reviewer, commit, UTC time and post-apply smoke results. If BE1 is unavailable, pause shared staging changes until the team explicitly appoints a substitute.

## Ratification record

| Item | Confirmation |
| --- | --- |
| FE1 name / GitHub handle / acceptance date | Pending |
| FE2 name / GitHub handle | Pending |
| BE1 name / GitHub handle / acceptance date | Pending |
| BE2 name / GitHub handle | Pending |
| Staging operator access and exact staging project | Pending; do not store secrets here |
| Administrator / branch rules / required-check evidence | Pending |

SET-03 remains unchecked until FE1 and BE1 record agreement and the operator assignment is confirmed. Remote enforcement is tracked separately from documenting this agreement.
