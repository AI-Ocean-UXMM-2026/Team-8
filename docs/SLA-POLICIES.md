# Configurable SLA policies

## Behavior and permissions

Open **Warehouse → SLA policies** at `/warehouse/sla`. Staff can view deadlines and flags; managers (active warehouse `owner` memberships) can edit targets. There are 40 combinations: ten case types and four priorities. Defaults for first response / resolution are Critical 15 / 240 minutes, High 30 / 480, Normal 120 / 1440, Low 240 / 2880. Clocks run 24/7 without pauses for weekends, nights, SME decisions or courier waits.

At-risk starts at 80% of each target by default, configurable from 50–99%. A pending milestone becomes overdue at its deadline. Completion at/before the deadline is met; completion afterward is breached. A resolved case with no independent response recorded shows response as not required rather than keeping an overdue clock running.

Cases snapshot their targets and policy revision. Editing a policy affects future cases, not existing deadlines. Changing case type/priority snapshots the current matching policy and recalculates from the original case creation time. Reopened cases retain their original clock. First response is recorded by a staff action, verification, review or closure event, or the explicit **Record first response** control. Creating/viewing cases, AI requests and system escalations do not count. Resolution stops through the existing resolved/closed workflow; SLA never bypasses evidence and closure guards.

## Automatic escalation

Supabase Cron checks every minute. Each missed pending milestone creates at most one escalation record and a system case event. The case is assigned to an active owner (deterministically selected if several exist), with human handling. Its workflow status is preserved. No email/external message is sent; use the **Escalated to manager** queue and case history.

Escalation means passing a case to the shared management review queue, regardless of whether a manager account exists. Without an active owner, the case is shown as awaiting management review; individual assignment is optional. Existing unassigned alerts are assigned on the next scheduler run when an owner becomes active. If the assigned manager becomes inactive, open escalated cases transfer to another active owner; if none exists, the obsolete manager assignment is cleared. Alerts and workflow status are preserved, and assignment changes are audited once. Account roles must be configured separately with authorization. The UI explains shared-queue handling when no owner exists and warns if the scheduler heartbeat is absent/older than two minutes.

## Deployment

1. Apply `supabase/migrations/20261022130000_be1_sla_policies.sql` after earlier migrations. It is additive and backfills deadlines from existing creation times and events, so old cases can already be overdue.
2. Apply `supabase/migrations/20261022150000_be1_sla_manager_handoff.sql` to enable manager catch-up and reassignment. Deploy frontend and API. Use the signed-in route; demo workspaces do not configure live policy data.
3. If Supabase Cron was enabled before migration, the named job is registered automatically. Otherwise run `scripts/enable-sla-cron.sql` once in Supabase SQL Editor. It enables pg_cron and schedules `parcelcare-sla-escalations` every minute.
4. Verify actual successful job runs and the heartbeat, not just an active job definition.

The trusted Python worker also invokes the runner during maintenance. Both schedulers can coexist safely through locking and unique milestone records. Cron avoids depending on Render's API service remaining awake. Authenticated API users cannot run the escalation worker. Up to 500 eligible cases are processed per invocation; larger backlogs drain over subsequent runs.

Sources: [Supabase Cron](https://supabase.com/docs/guides/cron), [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart).

## Automated tests

Run from the repo root using the backend Python environment:

```powershell
$env:PYTHON=(Resolve-Path api/.venv/Scripts/python.exe).Path
npm run test:backend
npm run test:frontend
npm run test:sla:database
npm run test:sla:ui
npm run test:contracts
npm run check:migrations
npm run build
```

The database test applies all migrations in isolated PGlite and checks defaults, owner permissions, durations, snapshots, risk/overdue flags, response/completion, automatic assignment, deduplication, no-manager handling, preserved waiting status, paging and tenant guards. API unit tests check authorization, validation, idempotency forwarding and worker capability separation. Browser tests use simulated Auth/API responses at desktop/mobile widths for policy forms, conflicts, filters, staff read-only access and overflow. These are separate from deployed API/database tests.

## Detailed live scenarios

Use labeled test records. Do not shorten normal policies while teammates create real cases.

1. **Policy edit:** as owner, select type/priority, save new whole-minute targets, refresh and verify the revision. Response must be 1–43,200 minutes; resolution must be at least response and at most 43,200; risk must be 50–99%. Staff inputs must be read-only and direct saves denied.
2. **Snapshots:** note an existing case's deadlines, edit its matching policy and confirm those deadlines remain unchanged. A newly created matching case uses the new revision. Type/priority changes recalculate from original creation time.
3. **On track:** a fresh case should show on-track milestones and Yangon-formatted due dates.
4. **Response:** after actually responding, enter at least five characters in the response note and record it. The timestamp persists after refresh, the record button disappears and the flag becomes met/breached. Notes are visible in case history to the SME.
5. **At risk:** at 80% of a 120-minute target, a case aged 96–120 minutes is at risk. It appears under At risk without early escalation.
6. **Overdue:** use a labeled overdue case. Do not manually invoke the runner. Wait through the next minute's Cron run; verify escalation timestamps, system history, human handling and manager assignment or shared management review queue placement.
7. **Deduplication:** allow multiple successful scheduler runs. Each case/milestone must still have one escalation record/event.
8. **Resolution:** resolve through the existing verified workflow. The resolution clock stops as met/breached; future runs do not escalate the case. SLA does not permit unverified closure.
9. **Waiting state:** overdue awaiting-information/decision cases escalate while retaining that status.
10. **Concurrency:** load a policy in two owner tabs, save in A, then save B's stale draft. B must conflict. Reload saved policies explicitly discards its draft. Polling must not silently replace unsaved input.
11. **Isolation:** SME/rider/foreign-warehouse/anonymous users cannot access these SLA APIs. Direct table writes and user calls to the runner are denied.
12. **Manager handoff:** in an isolated test warehouse, trigger an escalation without an active manager, then activate an owner. The next scheduler run assigns the existing alert without duplicating it. Deactivate that owner and verify transfer to another active owner, or an unassigned warning if none remain. Resolved cases must remain unchanged.
13. **Scheduler outage:** stop the scheduler only in an isolated test environment, wait over two minutes and refresh. The warning must appear while deadline flags still calculate. Restore it afterward.

## Live fixtures

Three fixtures are added to TEST-GB-OUT-001: **TEST SLA - overdue response and resolution** (case ID ending 901), **TEST SLA - first response at risk** (902), and **TEST SLA - on-track response recording** (903). Their creation times deliberately simulate elapsed SLA time. They represent fictitious incidents and do not change stock. Fixture 902 eventually becomes overdue as actual time advances. They remain visible for team inspection.

## Related sign-in fix

The separate sign-in hotfix retries only the read-only identity check during Render free-service startup for up to two minutes, with progress text. Password exchange and data mutations are never retried. Invalid credentials/access denials fail immediately; persistent outages still end with an error.
