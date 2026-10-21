# M0 implementation and team handoff

Scope: PRD V4 replaces the legacy customer/courier and universal SME-only closure behavior. The product is warehouse-to-SME. External courier handover is supported; external courier login/GPS and an end-customer portal are excluded. Warehouse verification needs case-specific decisions and physical evidence. Team ratification is pending.

## SET-01–03: team setup

SET-02 has a dedicated [GitHub access recovery and separate-clone runbook](SET-02-GITHUB-ACCESS.md), with per-role verification evidence. A local task branch exists; shared write access remains unverified after the earlier denied push.

SET-03 now has a dedicated [ownership, review, checks and staging agreement](SET-03-TEAM-AGREEMENT.md) and `.github/pull_request_template.md`. Role-level preparation is complete; named team ratification and remote enforcement remain pending.

Names and GitHub usernames remain unassigned. Use FE1, FE2, BE1, BE2 from the checklist until the team supplies them. Do not invent assignments or claim write access from a successful clone.

Each teammate clones the repository separately, runs `git switch -c feat/SET-xx-short-description`, and opens a PR against the default branch. Use `fix/` for fixes and `docs/` for documentation. Never share a working directory or commit credentials. Each developer verifies their GitHub invitation and opens a small task PR to prove write access. No remote push, invitations, branch protection, or team approval was performed by this implementation.

Proposed review pairs: FE1 ↔ FE2 for frontend; BE1 ↔ BE2 for backend. Cross-domain contracts require both integration leads. FE1 owns shared UI, frontend manifests, legacy bridge and migration scripts; FE2 owns SME/rider/tracking UI; BE1 owns contracts, identity/operations and shared backend; BE2 owns cases/AI/approvals. Follow the detailed path ownership in IMPLEMENTATION-PLAN-V4.md. For shared paths request the owner’s review. No CODEOWNERS handles can be configured until real accounts are known.

Before merge run `npm run typecheck`, `npm run build`, `npm test`, `npm run test:contracts`, and the affected backend/security tests. These are documented checks; enforced CI is SET-11. BE1 is the proposed shared staging migration operator, BE2 reviews changes. Staging access and appointment remain unconfirmed. Local isolated SQL checks follow supabase/README.md; never apply migrations to shared staging without coordination.

## SET-04: contract baseline v1

`api/app/contracts.py` is the Pydantic schema source. `npm run contracts:generate` exports OpenAPI and generates browser DTOs. Commit source, OpenAPI and generated DTOs together. `npm run test:contracts` checks fixtures against those schemas. Operational routes remain planned; health and the configured identity route are labeled implemented. See [SET-07–11 delivery](M0-SET07-11.md) for the subsequent foundation changes.

IDs are UUID strings. Timestamps are timezone-aware ISO-8601, emitted in UTC with `Z`. Quantities are nonnegative integers; damaged is a subset of received; good = received − damaged. A final receipt of expected 100 / received 90 creates a shortage of 10; partial receipt does not declare the remainder lost. Receipt lines contain incremental quantities, not cumulative totals. Overreceipt is rejected pending an explicit operational policy. Product ownership and transactional effects must be enforced by the future backend.

Shipment, case and approval enums match existing SQL. Inbound delivery mode is null; outbound mode is `in_house` or `third_party`. Priority, case status, approval status, shipment state and physical completion stay independent; prototype rules are not automatically inherited.

Pagination uses opaque `cursor`, limit 1–100 (default 25), and `{items,next_cursor}`; null ends the collection. Stable ordering is created_at then UUID. Scope comes from verified identity, never a browser-selected role. Errors use `{error:{code,message}}`: 401 UNAUTHENTICATED; 403 FORBIDDEN; 404 NOT_FOUND; 409 STALE_VERSION or IDEMPOTENCY_CONFLICT; 422 VALIDATION_ERROR; 503 PROVIDER_UNAVAILABLE. Messages contain no private tenant details.

Evidence is referenced by UUID, never a public storage URL. Download links are separately authorized and expiring. Mutations require a UUID `Idempotency-Key`; the server scopes it to authenticated actor + tenant + operation, stores request fingerprint and original response atomically, replays identical requests, and rejects changed payloads with 409. Mutable commands carry expected_version; stale versions return 409. Replay lookup precedes version validation. The planned API version field needs backend persistence before live integration; no version migration is claimed here.

## SET-05: deterministic fixtures

`contracts/fixtures/operations` owns receipt and both delivery-mode examples. `contracts/fixtures/cases` owns pending analysis and provider failure examples. All identities are fictitious. Fixtures include method/path/status/schema metadata and the exact response body; UI consumes body through the future SET-07 adapter. They make no live API requests. Regenerate with `python scripts/create-contract-fixtures.py` and validate with `npm run test:contracts`.

## SET-06: React foundation

Visit `/foundation` after `npm run dev`. The shared React shell and shadcn-style Button/Card/Input/Badge primitives use compiled Tailwind and the existing green/slate palette. Keyboard focus, labels, semantic navigation and a mobile layout are included. This is a foundation preview, not an authenticated warehouse dashboard. `/` retains the old demo; role/auth routes belong to later tasks.

FE1 owns all legacy globals: src/features/workspace, existing feature *.js, public/vendor, dist, scripts/prepare-ui.mjs, scripts/sync-rules.py and migration checks. These remain frozen references. Never mount legacy scripts into a React-owned subtree. New work imports src/shared/ui and src/shared/layout instead. The preserved legacy regression suite must continue to pass.

SET-01 to SET-03 remain pending team information, access verification and agreement. SET-04 to SET-06 are implemented, verified locally and checked in the checklist. Live operational APIs and hosted deployment are separate tasks.

## Validation evidence — 21 October 2026

Passed: `npm run typecheck`, `npm run build`, `npm test`, `npm run test:contracts`, and `npm run test:browser` using installed Chrome (`PLAYWRIGHT_CHANNEL=chrome`). Browser verification covers all four legacy roles, exact matching screenshots for SME/warehouse/manager, report persistence, and the React foundation at 1440px and 390px without horizontal overflow or runtime errors. Local screenshots are in ignored `test-results/`. In PowerShell set `$env:PLAYWRIGHT_CHANNEL = 'chrome'` before the browser command, or install Playwright Chromium and use its default. Contract validation requires Python with the project's FastAPI/Pydantic dependencies installed.
