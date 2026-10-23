# Independent AI maker–checker

## Workflow

1. Warehouse staff opens a case, expands **Evidence, analysis and verification**,
   selects **Operation → Analyze**, adds a note and submits the request.
2. The durable worker claims a leased job for that staff member's warehouse.
   It snapshots case, shipment, inventory, uploaded-evidence metadata and policy.
3. The maker investigates the recorded facts and proposes one allowed action.
   Its output, model, response ID, token usage and proposal hash are checkpointed.
4. A separately configured checker makes a new request with its own prompt and
   original source records. It independently reviews evidence support,
   classification, priority and action authorization, bound to the exact source
   version and proposal hash. It receives no previous AI analyses or conversation.
5. The database rechecks the lease, requester membership, source fingerprint,
   proposal checkpoint, checker verdict and current policy in one transaction.
   Approved, opted-in actions execute once through the existing audited command.
   Rejection/error/staleness blocks automatic execution and routes the case to
   human handling / processing with a review reason and timeline event.
6. Staff sees the maker summary, independent checker checks/findings, model IDs,
   execution status and job stage. Old analyses are labelled **legacy unchecked**
   and cannot authorize automated execution.

`approved` is a review verdict, not permission to change stock or close a case.
`review required` means the checker approved but policy, missing information,
priority changes or human-review requirements prevent automatic execution.
The existing manual staff workflow remains available for human review.

## Automatic actions

Automatic execution is **off by default**. Both the existing policy
`allowed_actions` and its `rules.ai_auto_actions` must authorize the action.
Only `save_summary`, `notify_sme`, `request_information` and `escalate` are eligible.
The maker must explicitly set `requires_human=false`, have no missing information,
and preserve the recorded priority. A checker cannot override these gates.
SME decisions, correction proposals, physical verification, stock changes,
dispatch, delivery confirmation, GPS consent and case closure stay outside this
automatic path. Worker credentials and internal AI results are never public.

Both AIs receive recorded facts and bounded uploaded JPEG/PNG/PDF content through the trusted evidence reader (at most three files / 20 MB combined). Omitted evidence forces human review. With migration `20261023220000_be2_analysis_human_updates.sql`, both also receive the latest 50 original human reports, replies, decisions and verification/review notes. Prior AI analyses are excluded. The prompts prohibit claiming to have inspected unsupplied contents.

## Run automated tests without API keys

From the `Team-8` directory in PowerShell:

```powershell
npm run test:backend
npm run test:database
npm run test:embedded --prefix supabase/tests
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:maker-checker
npm run build
```

The Python and SQL tests use deterministic provider fixtures; they make no paid
model calls and do not change the hosted Supabase project. The native test uses
disposable PostgreSQL 17 and proves two simultaneous worker finishes result in
one analysis and one action. The browser test starts a fixture-only server on
port 3119 and tests the actual case UI at 1440px and 390px. Close other dev
servers/builds for this checkout first; they share the generated `.next` files.
If Chrome is unavailable, install Playwright Chromium and omit
`PLAYWRIGHT_CHANNEL` instead.

| Scenario | Expected result |
| --- | --- |
| Valid pair, current source, opted-in summary action | Approved / executed; one action on replay or concurrent finish |
| Checker rejection or any failed check | Blocked; human review with findings |
| Checker timeout, refusal, invalid JSON/schema or missing configuration | Blocked; failed run and bounded review reason |
| Wrong proposal hash/source or reused maker response ID | Blocked |
| Missing checker / legacy single-model result / proposal substitution | Blocked |
| Changed case, inventory, evidence or policy while AI runs | Blocked as stale |
| Revoked staff membership or closed case | No execution; closed case stays closed |
| Expired lease or forged user/SME worker completion | Rejected; no action |
| Checker approval but missing information or policy opt-in | Approved / review required |
| Physical, stock, approval-dependent or unrecognized action | No automatic execution |

Screenshots: `test-results/maker-checker-<state>-<width>.png` (ignored by Git).

## Configure a real run

Apply the preceding project migrations and then
`supabase/migrations/20261022006000_be2_ai_maker_checker.sql` to your selected
Supabase project through the normal reviewed migration process. Deploy the
updated worker after the migration; old worker results fail closed.

The worker requires these **server-only** settings:

```dotenv
SUPABASE_URL=<your existing project URL>
SUPABASE_WORKER_KEY=<trusted worker/service-role credential, entered privately>
OPENAI_API_KEY=<your API credential, entered privately>
OPENAI_MODEL=gpt-5.4-mini
OPENAI_CHECKER_MODEL=gpt-5.4
```

Model defaults are recommendations, not verified account access. Both models
support structured outputs: [maker model](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[checker model](https://developers.openai.com/api/docs/models/gpt-5.4).
Each run makes up to two model calls, with 45-second timeouts and no SDK retries.
Both IDs remain configurable; there is no implicit checker-model fallback.

For local testing, set these in `api/.env` without overwriting existing values.
From the repository root:

```powershell
Set-Location api
..\.venv\Scripts\python.exe -m app.worker --once
# Or omit --once to continuously process queued jobs.
```

An optional `render.worker.yaml` supplies the production worker definition. It
is separate from the web Blueprint because deploying it creates a billable
worker. It has not been applied automatically. The existing API deployment was
inspected on 22 October 2026 and had no `OPENAI_API_KEY`, `OPENAI_MODEL`,
`OPENAI_CHECKER_MODEL` or `SUPABASE_WORKER_KEY` configured. Those credentials
cannot be inferred from a public Supabase key or a ChatGPT subscription.

## Exercise the real workflow

1. Use a test warehouse/SME and a staff account with active membership. Start
   with automatic execution disabled; create an exception with recorded facts,
   such as expected 100 / received 90. Upload any relevant evidence normally.
2. Start the configured worker and submit **Analyze** from that case's details.
   The warehouse page polls for results. Check maker/checker model names, four
   checks, findings, verdict, execution status and the timeline. An approved run
   can correctly remain **review required**.
3. For an execution test, a trusted operator can explicitly opt in **only**
   `save_summary` for this test SME by creating a new policy version. Replace
   the SME UUID below; do not enable a global policy for the exercise.

```sql
begin;
select id from public.smes where id='<test-sme-uuid>'::uuid for update;
with latest as (
 select * from public.resolution_policies where sme_id='<test-sme-uuid>'::uuid
 order by version desc limit 1
)
insert into public.resolution_policies(id,warehouse_id,sme_id,version,allowed_actions,rules)
select gen_random_uuid(),warehouse_id,sme_id,version+1,allowed_actions,
 jsonb_set(rules,'{ai_auto_actions}','["save_summary"]'::jsonb)
from latest
returning id,version;
commit;
```

4. Refresh the case and request a **new** analysis. If both AIs approve a summary
   action without missing information or human requirements, confirm **executed**,
   the recorded summary and exactly one linked action. Neither stock nor delivery
   status should change. Otherwise the UI explains why human review is required.
   Do not force a real model to approve merely to make a test green.
5. For a stale-source test, change the case/shipment from a second staff tab
   while the AI runs. Confirm execution is blocked. Use the deterministic tests
   above for guaranteed rejection/timeout/forgery scenarios rather than relying
   on unpredictable model output or altering production credentials.
6. Remove the test opt-in by creating another policy version with
   `rules.ai_auto_actions=[]`. Existing review results do not transfer to new
   source/policy versions.

No hosted migration, paid worker provisioning or real-model call is implied by
passing local tests. Real activation requires the selected project's credentials
and a running worker; they are not supplied by the fixture tests.

Full signed-in walkthrough: [SME → Warehouse → AI demonstration guide](SME-WAREHOUSE-AI-DEMONSTRATION.md).
