# Warehouse operations backend

The OPS-01 through OPS-07 implementation lives in `api/app/features/operations/` and migration `20261021000800_be1_warehouse_operations.sql`. FastAPI verifies identity and staff membership, then invokes reviewed RPCs with the caller's JWT. Database functions repeat warehouse authorization; no service-role credential is used for warehouse requests.

Implemented routes include warehouse overview/directory, inventory and shipment lists, shipment creation/detail, open case summaries, incremental receipts, physical pick/pack/dispatch events, and stock corrections. `contracts/openapi.json` labels implemented routes separately from planned APIs. Lists use UUID keyset cursors and a maximum page size of 100. Staff with multiple warehouses must supply an authorized `warehouse_id`; the warehouse UI forwards its selected scope for detail and mutations.

Every mutation requires a UUID `Idempotency-Key`. Receipt, event and correction commands also require `expected_version`. Successful results are persisted by warehouse, actor, command kind and key; an identical retry returns its original result even after later changes. Reusing a key with another payload fails. Failed transactions leave no command result, stock, case or event behind. Responses with uncertain outcomes must be retried using the original key.

Receipts contain incremental counts, not replacement totals. Damaged units are included in received units and enter quarantine; good units enter available stock. Overreceipt is rejected. Partial receipts defer shortage creation until finalization; 90 received of 100 expected produces shortage 10 independently of damage. Receipt case events and separate quantity/damage outbox facts carry authoritative numerical counts and evidence references. Stock changes, source records, audit and outbox commit atomically with correlation IDs.

Dispatch requires ordered pick/pack events, an active assigned rider with accepted/picked-up assignment, physical verification time and sufficient available stock. Third-party shipments cannot use internal dispatch. Corrections require the current product version, notes and uploaded evidence for the same SME. They cannot produce negative stock. Referenced receipt/event evidence must be uploaded and belong to that shipment.

Shipment row locks protect versions; product locks use a consistent order across receipt and dispatch. An advisory transaction lock serializes command keys, including shipment creation and key reuse across entities. The old unversioned receipt RPC is no longer executable by authenticated clients.

## Validation

Run from the repository root:

```powershell
npm.cmd run test:backend
npm.cmd run test:database
npm.cmd run test:contracts
npm.cmd run check:migrations
npm.cmd run test:frontend
npm.cmd run typecheck
npm.cmd run build
```

The database suite runs all migrations, 35 foundation checks and nine warehouse operation scenarios on an isolated PGlite database. API tests verify scope, strict input validation, required keys/versions, pagination and redacted database errors. Frontend tests cover the shared transport and warehouse receipt/event recovery.

The native runner uses a separate, disposable PostgreSQL database with `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` configured:

```powershell
npm.cmd ci --prefix supabase/tests
npm.cmd run test:native --prefix supabase/tests
```

It applies migrations and seeds, repeats operation checks and uses two real connections to prove lock contention for duplicate receipts, competing versions, shared-product receipts and competing/retried dispatches. CI provides an empty PostgreSQL 17 service. For a temporary local engine, `npm.cmd run test:embedded --prefix supabase/tests` starts a loopback-only database under ignored `test-results/` and stops it after the run.

Native Supabase Auth/Storage acceptance, hosted migrations, assignment/pickup endpoints, evidence upload/download APIs and outbox consumers remain separate work. This implementation does not establish a live pilot or complete the case/AI lifecycle.

Local verification on 21 October 2026: 19 backend tests, 35 foundation checks plus nine operation scenarios, 18 frontend tests, 12 contract fixtures and drift checks, migration conventions, typecheck, production build and legacy regressions passed. Both browser suites passed using `PLAYWRIGHT_CHANNEL=chrome`; the legacy suite preserved all three reference screenshots exactly. A clean database-test dependency install with optional binaries omitted also passed. Native multi-connection execution remains unverified locally: no PostgreSQL service is installed and the embedded Windows binary package was unavailable. Run the PostgreSQL 17 CI job before completing OPS-07.
