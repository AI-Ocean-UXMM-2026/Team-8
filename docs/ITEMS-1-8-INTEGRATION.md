# Items 1–8 in Team-8

Team-8 is the target repository. The sibling ParcelCare application uses a different architecture; its Git history is not merged wholesale. Risk, priority and escalation behavior is adapted to Team-8's authenticated Supabase RPCs.

## What this integration adds

- Item 4: database ranking of the entire authorized case queue before pagination. The warehouse queue defaults to risk, with priority, stage, SLA-risk and independent escalation filters applied in the database. Search remains local to the displayed page.
- Item 5: a database trigger classifies all newly inserted cases, including staff, SME, operational and assigned-rider creation paths. It records policy version, numerical contributions and missing attributes. Verified context changes recalculate automatic priority. A manager may override priority or restore automatic classification; context updates preserve an override.
- Item 6: a separate escalation flag, reason, timestamp and actor, with manager controls, case timeline/audit records, queue badges and filters. Setting or clearing the flag does not change priority, handling mode or status. SLA escalation sets the flag through a database trigger.

Existing implementations of items 1, 2, 3, 7 and 8 remain in this repository: independent AI maker–checker; stock category suggestions with verification; configurable SLA policies; evidence-backed investigation/guarded execution; and assigned-rider reports creating warehouse cases.

## Risk policy v1

Scores combine exception category (10–45), description risk signals (0/10/30), staff-verified perishability (0/25), verified order value (0/5/15/25), operational impact (0/15/30), and current SLA risk (0/25/40). Scores of 10, 40 and 100 map to normal, high and critical; lower scores are low. Unknown context is flagged rather than inferred. Description signals represent reported urgency, not verified evidence or authority to execute an action.

Queue risk is calculated at read time; stored classification explains when priority was assigned. SLA progression changes queue rank without silently overriding manager priority. Queue ordering can change between requests as deadlines pass or staff change facts. Product category alone does not prove perishability: warehouse staff must verify the shipment's perishability in its case context.

## Database and deployment

Apply `20261023000200_be2_case_risk.sql` after the preceding migrations, then deploy matching API and frontend code. The API uses the caller's JWT; no worker key is exposed to the browser. Worker setup, provider keys, actual model calls and production migrations require deployment acceptance separately. GitHub merge does not establish that those steps occurred.

## Acceptance workflow

1. Create a courier delay and a damaged-goods report through live authorized workflows. The database assigns priority and records missing attributes; no API may supply a trusted priority directly.
2. Open the case investigation, expand recorded case details and find **Risk, priority and escalation**. Save verified perishability, order value, operational impact and a reason. Check classification and timeline.
3. Open the warehouse case queue: choose **Highest risk first**. Place a higher-risk case beyond the old first-page boundary and verify it is now first. Test priority, SLA-risk, stage and escalation filters before pagination.
4. As an owner/manager, choose a priority override; change risk facts and verify the override remains. Restore automatic priority.
5. Escalate and clear escalation. Verify status, priority and handling mode remain unchanged, and both operations are recorded. Staff without owner membership must be denied manager commands, including direct RPC calls.
6. Run SLA maintenance on a disposable overdue case. Verify the escalation flag and queue filter as well as the existing manager handoff.
7. Repeat creation through receiving/operational and assigned-rider reporting. Confirm the same classification trigger applies and duplicate reports match the existing active case.
8. Run the maker–checker acceptance cases in `AI-PIPELINE-IMPLEMENTATION-AND-TESTS.md`, categorization checks, SLA checks and `RIDER-EXCEPTION-REPORTING-TEST-GUIDE.md`. Live provider acceptance must be recorded separately from mocked automated tests.

Automated checks include backend/contract/frontend suites, risk assertions on PGlite and native PostgreSQL, stale edit/replay guards, tenant isolation, owner-only overrides, independent flags, SLA integration and queue ranking/pagination. No production credentials or paid service are created by tests.
