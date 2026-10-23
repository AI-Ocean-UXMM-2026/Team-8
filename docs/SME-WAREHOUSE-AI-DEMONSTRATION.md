# SME → Warehouse → AI: live demonstration guide

Prepared 23 October 2026 for https://parcelcare-team8.onrender.com.

This guide describes the signed-in application. `/demo` uses fictitious browser data; the old Manager workspace uses deterministic rule checks. Neither proves that the live AI worker is running. Local automated tests use fixtures and make no paid model calls.

## Approved Warehouse appearance

Preserve the Warehouse interface identified by the user’s 23 October, 5:37 PM screenshot: white left sidebar, teal selected navigation, ParcelCare branding, Warehouse overview heading with its warehouse illustration, and the existing four summary cards with the yellow open-cases accent. Card columns remain responsive to available width. Apply exception workflow fixes within this interface; do not replace the operational dashboard with the Canva illustration preview. `/design-preview/illustrated` remains a separate optional preview. Desktop dashboard, navigation and header styling are unchanged by this PR; the shared-shell CSS adjustment only removes an incorrect desktop margin below 768px.

## 1. Before the presentation

Use two independent signed-in sessions: one test SME and one staff member of its warehouse. The app stores authentication in session storage, so sign in separately in each browser/tab. Keep the same warehouse/SME selected throughout. Use test shipments and genuine test evidence; avoid changing real stock for a presentation.

Have the operator deploy the frontend and Python API/worker changes together and apply `supabase/migrations/20261023220000_be2_analysis_human_updates.sql` after preceding migrations. The change makes fresh AI analyses include original reports, SME replies and human decisions (up to the latest 50 relevant notes). Older analyses are historical records and do not gain these inputs retrospectively.

The frontend needs the project's public Supabase configuration and the correct server-to-server `PARCELCARE_API_URL`. The API needs its public Supabase configuration. The trusted worker separately needs `SUPABASE_URL`, `SUPABASE_WORKER_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_CHECKER_MODEL`. Enter secrets privately in the deployment settings. A working sign-in screen does not verify worker configuration.

Hosted inspection found **no active resolution policy for the Golden Bloom case** `e8d00000-0000-4000-8000-000000000001`. This prevents staff actions and AI analysis. There is currently no resolution-policy editor on Admin settings (that page manages tracking). A trusted Supabase operator can review and run `scripts/setup-exception-demo-policy.sql` for this exact case/SME. It creates a missing manual-review policy, preserves existing policies, and leaves automatic AI actions disabled. Do not run it against another project without reviewing the target UUID.

The warehouse/SME must have an active resolution policy. Its allowed actions determine which commands staff can use. Leave `AI_AUTO_EXECUTE=false` for the first demonstration. Even when enabled, automatic actions also require explicit policy opt-in and both AI checks. Do not enable stock changes or closure through AI.

For a local worker, from `api/`, use the project's virtual-environment Python:

```sh
../.venv/bin/python -m app.worker --once
# Continuous processing instead:
../.venv/bin/python -m app.worker
```

Use the continuously running deployed worker during the presentation. The worker checks for work every five seconds; each model call has its own timeout. The UI refreshes while visible, normally every 15 seconds. If necessary, reload to read current server state; do not submit repeated Analyze requests merely because the first is still queued.

## 2. Recommended 10–15 minute story

Demonstrate a receiving discrepancy: an inbound shipment expected 100 units, with a verified received count of 90. Only use these figures if they match the selected test shipment. A note alone does not change the recorded receipt quantities. For a real arithmetic demonstration, Warehouse must have recorded the physical receipt using the receiving workflow beforehand.

Say: “The SME reports an issue. Warehouse investigates the source records. One AI proposes a next step; a separate checker reviews it. Authorized people make decisions and verify physical outcomes before closure.”

### Step A — SME submits the report

1. Sign in at `/login` as the test SME. Open **Report Cases** in the SME sidebar (`/sme/reports`).
2. Under **New report**, choose the SME's inbound shipment. Record its reference for the audience.
3. Select **Quantity mismatch**, stage **Inbound delivery**. Describe the observed discrepancy and requested outcome. Example, only for matching test records: “Expected 100 units; receipt shows 90. Please reconcile the remaining 10 against the supplier receipt and receiving record.”
4. Optionally attach a PNG, JPEG or PDF using **Attach evidence**, then choose that uploaded record in **Evidence (optional)**. Files are limited to 10 MB each. “Uploaded” means stored, not physically verified.
5. Click **Review report**. Show shipment, stage, issue, description and selected evidence. Use **Back to edit** to correct anything, then **Submit report**.
6. The app opens `/sme/exceptions/<case-id>`. Record this exact UUID. Show **Case facts**, **Timeline** and **Verification requirements**. Return to Report Cases to show the same case in history.

Expected: the case belongs to this shipment and SME; no stock, delivery or payment is changed by reporting. If an active case already exists for the same shipment/stage/type, the backend reuses it and records another report event. Do not claim every submission always creates a new case.

Recovery: after an uncertain submission, use **Retry same report**. If you reloaded, select the same shipment to recover the saved command. It retains the original idempotency key. Do not create a replacement report while the original outcome is uncertain.

### Step B — Warehouse investigates the same case

1. Sign in as staff for the same warehouse. Open **Exceptions** (`/warehouse/exceptions`). Find the recorded case UUID; filters for SME, issue, stage and status can narrow the queue.
2. Open its investigation. Verify the shipment link and SME context match the reported shipment.
3. Under **Investigation action**, choose **Start investigation**, enter a factual **Investigation note**, tick **I reviewed the shipment and confirm this action.**, and click **Record case action**.
4. Expand **Evidence, analysis and verification**. Inspect case facts and uploaded evidence. Use the shipment page to inspect recorded quantities and physical events.
5. To assign ownership, find **Owner and responsibility review**, write a **Review note**, and click **Assign to me**. Responsibility attribution is separate: choosing Warehouse or Third-party courier requires an evidence basis and uploaded evidence. Do not assert blame merely because the AI suggests it.

Expected: the timeline gains a staff action, the state is investigating, and stock/delivery status remains unchanged by investigation notes.

### Step C — Request the real AI analysis

1. Keep **Evidence, analysis and verification** expanded. In **Case actions**, select **Operation → Analyze**.
2. Enter a **Written note** explaining the question, e.g. “Compare recorded expected and received quantities with the attached receipt; identify missing facts and a permitted next action.” Select relevant uploaded evidence if available.
3. Click **Submit case request** once. Show **Analysis queued; awaiting worker result.**
4. Show **AI workflow runs** while the worker progresses through queued, maker and checker stages. Keep the page visible for refresh.
5. When complete, show the recorded maker model, its summary, **Suggested next action**, **Human review required**, and missing information. Then show **Independent AI checker**: evidence support, classification, priority, action authorization, findings, verdict and execution status.

Explain the result accurately:

- **Approved / review required:** the checker agreed, but policy, missing information, risk or human requirements prevent automatic execution. Staff must review and act.
- **Approved / executed:** only the permitted opted-in action executed; verify its recorded action and timeline. It does not mean stock was corrected or the case was closed.
- **Rejected / blocked:** show the checker's findings and follow human review.
- **Error / blocked:** show the bounded failure reason. A timeout/refusal/missing configuration is not an approval.
- **Legacy unchecked:** an older single-model result cannot authorize automatic execution.

PNG/JPEG/PDF evidence can be supplied as bounded private content to the configured models. At most three files and 20 MB combined are read in a run; omitted/unsupported evidence forces human handling. Both independent calls receive the same source records and recent human updates, not a prior AI conversation. AI cannot turn a claimed count into an authoritative receiving event.

### Step D — Ask the SME for missing information

1. Warehouse: in **Investigation action**, choose **Request SME information**. Write the exact missing information, confirm the review checkbox, then **Record case action**. Alternatively choose the policy-permitted `request information` action under Case actions.
2. SME: open **Notifications**, then **Open case**. Show the request in the timeline. In **Provide information**, write the reply and click **Submit case request**. Upload additional evidence if needed.
3. Warehouse: refresh/read the updated case. Show the SME reply in the shared timeline. Resume investigation explicitly if the case remains awaiting information; the reply itself does not complete an investigation.
4. Request a fresh **Analyze** when appropriate. With the new migration and worker code, both AI calls now receive the SME reply. Explain that a new result is based on a new source version.

Expected: both roles see the same case history. If someone changes source data while AI runs, execution is blocked as stale and staff requests a fresh analysis after reviewing the new records.

### Step E — Request and record the SME decision

For the quantity-mismatch example:

1. Warehouse: in **Case actions**, choose **Operation → Allowed action**, then **Allowed action → request sme decision**. Write the verified proposal, then **Submit case request**.
2. SME: open the notification/case. Under **SME decision**, show the offered choices, normally **Accept the partial receipt**, **Wait for the remaining goods**, or **Reject the proposal**. Write a **Decision note**, then **Save decision**.
3. Reload and show the recorded choice. The decision is durable, but it does not change stock, deliver goods or close the case.

Choose **Accept the partial receipt** for the shortest demonstration only when the test SME genuinely accepts that outcome. Choose **Wait for the remaining goods** for the extended branch: Warehouse must later verify `remainder completed`. A rejection needs further investigation or a revised proposal; it is not a completed resolution.

Avoid editing/analyzing the case while an SME approval is pending. Source changes can invalidate the pending proposal. If the backend reports a stale decision, Warehouse reviews current records and issues a new request; the old one is superseded rather than bypassed.

For recipient-unavailable cases, the SME may **Propose a retry time**. It must be in the future. This is a request, not a confirmed courier booking; Warehouse capacity and later proof/receiver confirmation remain separate.

### Step F — Warehouse verifies and closes

1. Finish the actual physical handling outside the AI summary. Upload evidence that supports the performed work.
2. Under **Case actions**, choose **Operation → Verify physical fact**. Select one required fact, select uploaded evidence, write a verification note, submit and confirm. Repeat for each physical fact.
3. For quantity mismatch, the requirements include `count verified`, `physical handling verified` and `sme decision recorded`. The SME decision is recorded through its approval flow, not by ticking a staff verification. If the SME chose to await the remainder, also verify `remainder completed` after it happens.
4. Choose **Operation → Verify and close**, write a resolution note, submit and confirm only after all facts are genuinely verified.
5. Reload the case. Show `closed`, final timeline, and the SME notification. Further action forms should no longer allow changes.

The live application gives final closure to authorized Warehouse staff after database checks. The old browser-local report demo's **Confirm & Close** button belongs to a different workflow and should not be used to explain live closure. AI or SME approval alone cannot close a live case. Stock correction, if required, uses the separate evidenced inventory workflow.

## 3. Short presentation script

- **SME:** “I choose my shipment, describe the issue, attach evidence, review it and submit. I can follow one case reference.”
- **Warehouse:** “I open the same report, assign an investigator and compare it with source records.”
- **AI:** “The maker proposes a next action. A separate checker tests evidence, classification, priority and authorization. A passed review may still require a person.”
- **Collaboration:** “Missing information returns to the SME, and their reply becomes part of the next AI analysis.”
- **Decision:** “The SME accepts or rejects the proposed business outcome.”
- **Completion:** “Warehouse verifies the physical outcome with evidence and closes the case. Every step remains in the history.”

## 4. Failure rehearsal

- **Queued indefinitely:** check the trusted worker, its environment, migrations, job lease and provider connectivity. Never present the demo rule engine as the real AI result.
- **No allowed actions:** an active SME resolution policy is missing or does not permit the action. Have the operator fix the policy before the demonstration.
- **Permission denied:** verify current membership, selected warehouse and shipment SME. Do not switch to another tenant's case as a workaround.
- **Record changed / stale version:** reload, read new events, then decide whether to issue a fresh request. If the previous outcome is uncertain, reconcile the saved command first.
- **Upload outcome unknown:** stay on the page and use **Retry original upload** to resend the exact reserved file. Do not select a different file for that reservation. If you reload, inspect existing evidence before starting another upload.
- **Closure pending:** inspect the listed physical facts, pending actions/approvals and any await-remainder decision. Complete the real missing work; do not fabricate verification notes.
- **High/critical or missing source facts:** human handling is an expected result, not an AI failure. Show the reason and the staff path.

## 5. Acceptance checklist

- SME sees only its own shipments/reports; foreign SME and foreign warehouse requests are denied.
- Report review matches the submitted shipment, stage, issue and evidence.
- Lost acknowledgements replay the original command without duplicate cases/actions.
- Warehouse sees the same report and shared SME replies.
- AI shows real maker/checker model and review/execution states; no fabricated result is substituted.
- A new SME reply is included in fresh AI input; a mid-run reply blocks stale execution.
- Notifications and decisions survive reload.
- AI summaries and SME decisions alone do not change stock or close the case.
- Required evidenced facts and business decisions gate Warehouse closure.
- Desktop/mobile layouts and English/Myanmar modes remain usable.

## 6. Verification record for this change

Hosted inspection: SME sign-in, dashboard, Report Cases/history and an existing Golden Bloom case were read in the deployed application. Warehouse sign-in, the 12-case exception queue and the same case investigation were inspected. The case showed no active policy, no allowed actions, and no AI analysis. Its existing uploaded evidence was visible to both roles. The policy setup SQL has been prepared but not applied to the hosted project. No hosted physical verification, stock correction or case closure was fabricated for testing.

Automated verification uses isolated database fixtures, mocked authentication/API/provider responses and browser UI tests. A passing fixture suite verifies the implementation but does not certify the deployed worker's credentials, account model access or production migrations. The new source-context fix requires deployment and migration before it affects hosted runs.

### Repeatable local checks

From the reviewed checkout:

```sh
npm run test:frontend
npm run test:backend
npm run test:database
npm run test:contracts
npm run check:migrations
node supabase/tests/exception-policy-setup.test.mjs
PLAYWRIGHT_CHANNEL=chrome PARCELCARE_TEST_BUILD=1 npm run test:exception-workflow
PLAYWRIGHT_CHANNEL=chrome PARCELCARE_TEST_BUILD=1 npm run test:maker-checker
npm run build
# With the built application running on port 3218:
npm run test:illustrated-preview
```

The focused SME browser test uses fixture authentication and a fixture API, not hosted accounts. The older broad `test:portals` script has unrelated rider-fixture drift against the newer rider screen; it is not claimed as passing in this recheck. Production model calls and hosted migration application remain an operator acceptance step.
