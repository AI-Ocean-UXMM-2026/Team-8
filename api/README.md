# BE1 identity and database foundation (DB-01–DB-09)

The FastAPI layer verifies Supabase Auth sessions and forwards the same user's
JWT to PostgREST and private Storage. No client-selected role, warehouse, SME,
actor ID or Auth user metadata grants permission. No service-role client is
available to HTTP routes. The React UI remains the existing demo; FE auth wiring
and OPS/DEL/GPS feature endpoints are separate checklist tasks.

## Run

From `api/`:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements-test.txt
# Copy .env.example to .env if needed, preserving any existing local secrets.
# Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env locally.
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

Use an anon JWT key or `sb_publishable_...` key. `SUPABASE_KEY` is a legacy setting
and is deliberately not used by authenticated routes. Service-role/secret keys
are rejected for this user client. Secrets and sessions must never use a
`NEXT_PUBLIC_` variable, enter Git, or appear in logs/chat. Refresh/sign-in belongs
to the Supabase Auth client; send its current access token on every request.

OpenAPI is available at `/openapi.json` and interactive docs at `/docs`.
Unauthenticated `/health` checks process readiness only, not DB connectivity.
Missing configuration fails closed with 503; missing/invalid/expired sessions
return 401; no active membership returns 403. Hidden evidence returns 404.
Requests/responses and upstream calls carry a UUID `X-Correlation-ID`; invalid
incoming values are replaced. API responses use `Cache-Control: no-store`.

## Identity contract

`GET /api/profile` with `Authorization: Bearer <access-token>` returns:

```json
{
  "user_id": "00000000-0000-4000-8000-000000000001",
  "profile": {"id": "00000000-0000-4000-8000-000000000001", "display_name": "Example"},
  "memberships": [{
    "id": "00000000-0000-4000-8000-000000000002",
    "warehouse_id": "10000000-0000-4000-8000-000000000001",
    "sme_id": "20000000-0000-4000-8000-000000000001",
    "role": "sme"
  }]
}
```

Memberships are active DB records for the verified user. Multiple memberships
are returned; there is no implicit global/current role. Staff/rider memberships
have `sme_id: null`. Profile is nullable. Consumers can select a UI context, but
each server command must authorize the target resource using database RLS/RPCs.

## Evidence contract

1. `POST /api/evidence/reservations` with `{shipment_id, mime_type, size_bytes, sme_visible}`
   returns `{id,bucket,path}` with HTTP 201. Extra fields such as `uploaded_by`
   are rejected. Only JPEG/PNG/PDF, one byte through 10 MiB.
   Internal evidence requires staff authorization in the SQL RPC.
2. `PUT /api/evidence/{id}/content` sends raw file bytes with their actual
   `Content-Type`. Only the reserving user can upload. The API checks reservation
   size, a bounded stream, type and file signature, and uploads under the user's
   JWT without upsert. HTTP 204 means Storage accepted the object. Repeated PUT
   cannot overwrite it; reserve a new evidence ID to replace evidence. A
   signature check is not antivirus or a complete file-format parser.
3. `POST /api/evidence/{id}/download` rechecks metadata RLS and Storage access,
   returning `{url,expires_in:60}`. The bucket stays private. Signed URLs are
   bearer capabilities and may remain usable for their remaining 60 seconds
   after membership revocation; do not log/share/cache them. New URL creation
   requires current authorization.

A reservation is not an upload and an upload is not verified delivery/POD.
Domain completion must separately validate object existence, authorized receiver
confirmation and case-specific evidence. Direct Storage uploads still enforce
bucket MIME/size and RLS; only the API path performs file signature/reservation
size checks. Neither byte signatures nor stored metadata prove an event occurred.

## Audit/outbox and trusted workers

Migration `20261022000100_be1_foundation.sql` adds actor/correlation stamping and
a narrow worker capability. Existing receipt/approval commands already commit
mutation/audit/events in one transaction. New DB commands can call
`private.emit_domain_event(warehouse,sme,action,entity,event_key,payload)` within
their transaction, **after domain authorization**. It emits one audit/outbox pair;
exact retries return null and changed scope/payload under the same key fail.
The helper is not a public RPC and is not granted to users or workers. Old
historical rows can have null correlation IDs; new writes are stamped.

`parcelcare_worker` is NOLOGIN/NOINHERIT, has no application-table privileges and
does not bypass RLS. A trusted DBA can grant that capability to a dedicated SQL
worker login, which then explicitly `SET ROLE parcelcare_worker`. Never grant it
to `anon`, `authenticated`, or a user-facing connection. Its only capabilities:

```sql
select * from private.claim_outbox('<warehouse UUID>', 25);
-- Perform the idempotent downstream action after committing the claim.
select private.ack_outbox('<warehouse UUID>', '<event UUID>', '<lease token>');
select private.purge_expired_locations();
```

Claims are warehouse-filtered, locked with SKIP LOCKED, limited to 100, leased
for 60 seconds, and increment attempts. Expired leases can be reclaimed. Ack
requires matching warehouse/event/current unexpired lease and succeeds once.
Delivery is at least once: consumers must deduplicate by event ID/key. No
worker loop, automatic scheduler, provider transmission, or deployment is
installed by this foundation. BE2 owns domain consumers/retries/dead-letter rules.
Existing service-role SQL purge access is retained for compatibility, but HTTP
code never uses a service key or exposes these private functions.

## Tests and remaining environment gate

```powershell
# from api/
.venv/Scripts/python.exe -m unittest discover -s tests -v
# from application root
npm test --prefix supabase/tests
```

Local evidence on 21 October 2026: 13 API boundary tests and 42 PostgreSQL/PGlite
integration scenarios pass. Four native tests are opt-in and skipped until a
native Supabase stack is configured. API boundary tests fake only the Supabase
HTTP boundary; database tests exercise SQL/RLS with test-only Auth/Storage
stand-ins. These do not prove actual GoTrue/Storage or native concurrent locking.

To run the native gate:

1. Install Docker/Supabase CLI or choose a disposable development Supabase
   project. Apply migrations in order and fictitious seed; never reset shared
   data. See `../supabase/README.md` for local commands.
2. Create six development Auth users through Studio/Admin API: staff, SME A,
   SME B, active rider, second-warehouse staff, inactive rider. No default
   passwords or Auth users are installed by migrations. Run the parameterized
   `../supabase/fixtures/development-identities.sql` with their Auth UUIDs as a
   trusted operator. The inactive rider must have no other active memberships.
   Assignments are seeded without fictional pickup, consent or GPS.
3. Sign in as the test users. In the test process environment set
   `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY`, `TEST_STAFF_TOKEN`,
   `TEST_SME_A_TOKEN`, `TEST_SME_B_TOKEN`, `TEST_OTHER_STAFF_TOKEN`, and
   `TEST_INACTIVE_RIDER_TOKEN`. Do not put tokens into committed files or command
   history. Set `PARCELCARE_NATIVE_TEST=1` and run:

   ```powershell
   .venv/Scripts/python.exe -m unittest discover -s tests -p test_native_supabase.py -v
   ```

Native tests deliberately create evidence records/objects in the disposable
development stack. They exercise Auth, API scope, direct/nested PostgREST,
Storage upload/signed download, private bucket denial and cross-tenant reads.
Reset only that disposable stack afterward. Run `supabase db lint --local` and
review migration grants on native PostgreSQL 17 before integration. Native
multi-connection transaction races remain an OPS acceptance gate.

Docker and Supabase CLI are unavailable in the current workspace environment.
No hosted project was linked, modified or deployed. DB-01–DB-09 implementation
is ready for native environment verification and peer review; checklist boxes
remain open according to the team's review/integration rule.

References: [Auth verification](https://supabase.com/docs/reference/python/auth-getuser),
[Storage downloads and signed URLs](https://supabase.com/docs/guides/storage/serving/downloads),
[Storage RLS](https://supabase.com/docs/guides/storage/security/access-control).

The integrated shared identity endpoint is `/api/me` with the actor_id contract; `/api/profile` is the supplementary profile view. Both SUPABASE_PUBLIC_KEY and SUPABASE_PUBLISHABLE_KEY are accepted.
