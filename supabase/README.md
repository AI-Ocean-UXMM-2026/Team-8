# ParcelCare V4 database

This directory implements the database foundation. It does not change the UI, connect the demo to live data, apply anything to a hosted project, or implement the FastAPI business routes.

Developer setup and shared staging runbook: [DATABASE-WORKFLOW.md](../docs/DATABASE-WORKFLOW.md). SET-08 provides identity verification and user-scoped database interfaces; native Auth/Storage acceptance remains pending. CI executes isolated security tests and fresh PostgreSQL 17 migrations using test-only Auth/Storage stand-ins; no hosted migrations run automatically.

## Contents and owners

- `migrations/20261021000100_be1_identity.sql`: warehouses, SMEs, profiles/memberships and scoped authorization helpers.
- `...00200_be1_operations.sql`: products, shipments/items/events, riders, assignments, tracking, evidence, handover/POD, receipts, and receipt stock movements.
- `...00300_be2_cases.sql`: cases/timelines, approvals/notifications, policies, analyses/actions/jobs, audit and outbox. BE2 owns future domain changes; BE1 reviews tenant relationships.
- `...00400_be1_security.sql`: RLS, grants, indexes and private evidence bucket/policies.
- `...00500_be1_commands.sql`: audited transactional receipt/decision/evidence/read-state functions.
- `...00600_be1_tracking.sql`: consented tracking commands, latest-location access audit, termination backstops, and retention purge function.
- `...00700_be1_invariants.sql`: delivery-mode guards and pending approval uniqueness.
- `seed.sql`: fictitious one warehouse/five SMEs/15 shipments/two cases plus one isolated warehouse/SME/shipment for permission tests. No Auth users, credentials, rider identities, or real GPS are seeded into a hosted system.
- `tests/`: isolated PGlite PostgreSQL integration suite. Its test-only Auth/Storage stand-ins never belong in hosted migrations.

Migration timestamps are stable ordering identifiers. Do not edit these files after the team has applied them to a shared environment: add a new uniquely named migration instead. Database setup is BE1-owned; author additive BE2 domain migrations separately and review cross-table dependencies together.

## Current security and mutation model

Users authenticate through Supabase Auth. `profiles.id` references an existing Auth user. Only trusted operators/backend onboarding can create memberships; clients cannot grant themselves roles. Roles are `owner`, `staff`, `sme`, `rider`; active membership is authoritative. An SME membership always includes its SME and warehouse; other roles are warehouse-scoped.

Every application table has RLS. Warehouse staff see their warehouse, SME members see their SME, riders see assigned shipments rather than warehouse inventory. Composite foreign keys stop cross-tenant product, case, policy, approval, evidence, and assignment references. Profiles are self-readable only. Internal analysis/job/audit/stock-movement records are staff-only; outbox and raw coordinates are not exposed to normal users. SME read state is per user.

Authenticated clients have SELECT plus specific RPC execution, not arbitrary table INSERT/UPDATE/DELETE. The database denies direct stock adjustments, role changes, approval edits, and case closure. Do not relax these grants to make a screen work. Backend features must use the existing user-scoped RPC or implement another reviewed, narrowly authorized command. A service key bypasses RLS; any later service-role path must enforce explicit trusted context and tenant filters.

## Database commands available now

Call these via Supabase RPC using the actual user's session JWT. A backend can forward that user context; changing a frontend role string has no effect.

1. `receive_shipment(p_shipment uuid, p_key uuid, p_items jsonb, p_final boolean = true, p_notes text = '')` returns receipt ID, missing/damaged totals, and final flag. `p_key` is a stable per-operation UUID.

   ```json
   [{"product_id":"30000000-0000-4000-8000-000000000001","received_qty":90,"damaged_qty":0}]
   ```

   Quantities are increments for this receipt, not replacement totals. Staff-only; locks the shipment/products, posts available/quarantined stock and append-only movements, creates/matches discrepancy cases, and records audit/outbox atomically. Exact retry returns the original result; changed payload with the same key fails. Product IDs must be unique in the request. Overreceipts are rejected for staff review. Shortage becomes a case only on final receipt; observed damage may create a case immediately. Final receipt closes receiving, so a later remainder needs a separate follow-up shipment/workflow, not a second final receipt against the same shipment. Missing/damaged case types stay separate. Automatic investigation is not run inside this function; a later worker consumes the outbox.

2. `decide_approval(p_approval uuid, p_decision text, p_note text = '')` is own-SME-only. The request's options determine valid decisions. Exact same-actor retry is idempotent; conflicting decisions fail. `await_remainder` stays awaiting information; other accepted choices await physical verification. This function never edits inventory, declares capacity, marks delivery complete, or closes the case. Backend must create policy-valid requests/options; current schemas do not implement every case-specific completion rule.
3. `register_evidence(p_shipment uuid, p_mime text, p_size bigint, p_sme_visible boolean = true)` reserves a generated object path. Then upload to `parcelcare-evidence` using that user token and exact path; metadata registration alone is not proof that an object exists. JPEG/PNG/PDF and 10 MiB are the configured limits. Staff can reserve internal evidence; an SME/rider cannot mark evidence internal. Download reads require parent authorization. Overwrite/delete are denied; use a new evidence ID. The actual Storage API enforces upload MIME/size; the metadata does not scan or validate file content.
4. `mark_notification_read(p_notification uuid)` adds that user's read marker, idempotently.
5. `start_tracking(p_assignment uuid, p_consent boolean)` is assigned-rider-only after accepted pickup; explicit `true` consent is required. Returns/reuses the active session. The browser must first obtain device permission; SQL can record the rider's submitted consent but cannot independently observe browser permission.
6. `record_location(p_session uuid, p_lat float8, p_lon float8, p_accuracy float8, p_recorded timestamptz)` is active assigned-rider-only. Checks coordinates/accuracy, packet time/replay, session and warehouse scope. Repeated identical latest packet returns its ID. New samples are limited to one per 10 seconds; old/out-of-order, distant-future, or terminated-session packets fail.
7. `get_live_location(p_session uuid)` returns at most one point, status, accuracy, device/server timestamps. Own-SME or authorized warehouse/assigned-rider only while session remains active. It records location-view access without copying coordinates into audit. No raw-history user grant. Empty = `unavailable`, point older than 60 seconds = `stale`.
8. `stop_tracking(p_session uuid)` is assigned-rider/staff-only; idempotently ends sharing. Delivery/cancellation or assignment completion/cancellation also terminate active sessions via database triggers. New session requires a new explicit start. Inactive memberships and invalid assignments block access.

GPS defaults (10-second send limit, 60-second stale threshold, 24-hour raw retention) are implementation starting values, not PRD mandates. Change them in a new migration after team agreement. `private.purge_expired_locations()` is worker-only; call it on an approved schedule using a trusted SQL worker. No scheduler is automatically installed here, so old records are not physically purged until that job is wired. Latest-location reads already exclude history beyond retention. Do not expose `private` through PostgREST just to run the purge.

There is no Realtime subscription policy/publication yet. The live RPC supports authorized polling first; private Broadcast/Postgres Changes integration and stop/revocation testing remain backend work. SQL cannot erase coordinates already received by a client. Frontend must clear its marker and stop its watcher/subscription after termination.

## Validate locally without Supabase credentials

From the application root:

```powershell
npm ci --prefix supabase/tests
npm test --prefix supabase/tests
```

Tests execute every migration and seed against real PostgreSQL SQL semantics through PGlite (currently PostgreSQL 18). They set database roles/auth claims and exercise RLS, constraints, transaction rollback, receipt retries, decision guards, storage policy predicates, tracking consent/stop/stale handling, and purge permissions. Test tooling is isolated from the frontend package/lockfile.

Latest local verification: all seven migrations and the repeatable seed executed successfully; 35 integration scenarios passed on 21 October 2026.

Limitations: the bootstrap substitutes only the necessary Supabase-managed Auth/Storage schema surface; it does not run GoTrue, PostgREST, Storage upload requests, private Realtime, or a native multi-connection server. It cannot prove true simultaneous transaction behavior or full Supabase/PostgreSQL 17 compatibility. The native Supabase checks below remain required before shared use. Never run `tests/bootstrap.sql` outside the isolated test engine.

## Run native local Supabase (when Docker and CLI are available)

From the repository root, with Supabase CLI installed:

```powershell
supabase start
supabase db reset --local
supabase db lint --local
```

`db reset --local` recreates ONLY your local development database and applies migrations/seeds. Do not use it against shared/production data. Ports/settings are in `config.toml`; local Studio is http://127.0.0.1:54323. Local PostgreSQL target is 17.

Create Auth users using local Studio/Auth Admin API, then assign memberships using the provisioning recipe below. Test sign-in, `/rest/v1` reads/RPCs and actual Storage API uploads with each user's JWT. Never substitute a service-role token for an SME/rider in isolation tests. Re-run tenant, consent, rate, cancellation, retention and evidence scenarios against that stack.

## Provision an existing Auth user (trusted operator only)

No default passwords are committed. First create/invite the user through Supabase Auth; then run trusted SQL with their real Auth UUID. Example staff membership:

```sql
begin;
insert into public.profiles(id,display_name)
values ('<actual-auth-user-uuid>','Warehouse staff');
insert into public.memberships(profile_id,warehouse_id,role)
values ('<actual-auth-user-uuid>','10000000-0000-4000-8000-000000000001','staff');
commit;
```

For SME access use role `sme` and include the appropriate `sme_id` from the same warehouse. For a rider create role `rider` membership and a `riders` row referencing that profile/warehouse. Do not assign roles from user-editable Auth metadata. No end-customer account exists in this model.

## Apply to hosted Supabase later

No hosted project has been created, linked, reset, or changed. Once a development Supabase project is selected, a designated owner should inspect existing schema, link the correct project and review migration changes first:

```powershell
supabase login
supabase link --project-ref YOUR_DEVELOPMENT_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Confirm the selected development project before executing. Existing unrelated schemas/data need review rather than blindly applying a new-project baseline. Hosted seed data is optional: these migrations do not create Auth users or silently populate application fixtures; load fictitious `seed.sql` only in a development environment. Configure API `SUPABASE_URL` and server/user-scoped credentials locally without committing secrets. The current UI remains the demo until API/auth wiring is implemented.

## Remaining backend work

Auth verification/identity endpoint, user-scoped clients, onboarding/CRUD commands, assignment acceptance/pickup/dispatch, handover/POD and evidence existence verification, case-specific verified closure, approval creation/action policies, AI schema/evidence validation/jobs, outbox consumer, GPS retention scheduling, private Realtime and concurrent native tests. Append-only receipt movements exist, but full reservations/reversals/stock reconciliation are not yet a complete inventory ledger.

Do not mark all DB checklist items complete simply because migrations exist. Use this package as the reviewed schema foundation and implement domain API behavior in the owning backend feature folders.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [database functions](https://supabase.com/docs/guides/database/functions), [migration workflow](https://supabase.com/docs/guides/local-development/database-migrations).
