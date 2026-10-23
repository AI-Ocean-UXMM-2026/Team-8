# Exception demonstration refresh

Run `scripts/apply-demo-exception-refresh.sql` in the Supabase SQL Editor before deploying the UI/API. This bundles the queue-summary migration, reviewed cleanup and scenario seed in one transaction. Any error rolls back the whole refresh. The final result should report 15 synthetic cases, 12 open, 4 SLA breaches and 2 at risk immediately after a first import. Existing real cases are additional to these figures.

## Cleanup boundary
The cleanup uses the exact 42 product IDs, four shipment IDs and three SLA fixture cases supplied in the 2026-10-23 preflight. No prefix-wide deletion, CASCADE or truncation is used. A shipment with release, rider assignment, receipt, evidence or unrelated case activity is retained. Products used by releases, remaining shipments, reservations or stock ledgers are preserved. Remaining legacy product/shipment labels lose the TEST prefix, while IDs and historical release payloads stay intact. The bottled-water product referenced by a release is retained as a legacy record. The 120 new catalogue products are outside the cleanup allowlist.

Every removed or renamed row is backed up in `private.demo_cleanup_backup`, batch `legacy-fixtures-20261023`, with its source table and original JSON. Historical audit records and command idempotency records are retained, so internal audit payloads can still contain original TEST wording. Unexpected foreign-key dependencies abort the transaction rather than cascading deletion. Restoration would require an administrator to replay these backups in dependency order; this is not an automatic restore command.

## Synthetic scenarios
`data/demo/exception-scenarios.json` documents three scenarios per canonical SME. The seed links existing SME-owned SKUs and creates 15 illustrative shipment/case records: 5 New, 4 Investigating/Processing, 3 Waiting, 3 Resolved. Two Waiting cases have actual pending SME approvals and notifications. No stock movement, AI verdict, uploaded evidence, GPS point or physical shipment event is fabricated. The three resolved cases are explicitly synthetic outcomes: the required verifier foreign key points to the workspace maintainer solely to satisfy fixture ownership, and the resolution note states that no physical verification was performed. These are demonstrations, not actual verified incidents.

Provenance is stored in `private.demo_exception_scenarios`, risk context and a system case event. A second run preserves progress and original SLA clocks. The seed derives timestamps from existing SLA policies, without modifying those policies. Four cases start overdue; two start at risk. Counts change naturally as time passes or cases are handled. Existing SLA escalation scheduling will process breached cases; the seed does not run the global scheduler or invent escalations.

## Manual checks
1. Exception Management: four KPI cards; SLA breaches shows the distinct open overdue cases. Counts use the whole filtered queue, before pagination. Text search only filters displayed rows and is excluded from KPI totals.
2. Click SLA breaches: scope becomes Open, SLA risk becomes Overdue; every displayed case must be overdue. A case overdue for both first response and resolution is counted once.
3. Board: New, Investigating and Waiting have cases. Choose Case scope: All to see the three Resolved examples.
4. Open an unhandled case: inspect its SME/product context, synthetic system event and SLA deadlines. Request a real AI investigation to demonstrate maker/checker behavior; no result has been pre-generated.
5. SME: review the pending redelivery or partial-receipt decision, submit an available decision, then return to the warehouse case to continue the existing workflow.
6. Verify the recent stock-release request and reserved quantity still exist. Inventory should show the 120 new products plus only retained legacy records with real history.
7. Refresh the page after an SLA clock crosses a deadline to confirm the KPI and flags update. The existing scheduler controls automatic escalation.

Checks: TypeScript, frontend case-summary/board tests, API contract drift, and `node supabase/tests/demo-exceptions.test.mjs` (fresh database, fixture import, queue counts, missing/foreign access, unchanged stock, repeat seed, cleanup backups and protected history).
