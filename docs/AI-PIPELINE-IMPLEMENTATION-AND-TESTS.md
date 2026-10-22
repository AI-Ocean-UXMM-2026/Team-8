# AI Investigation-to-Execution Pipeline — Item 7

## Scope and activation status

The pipeline connects job claiming, private evidence retrieval, an investigator request, a separate checker request, persisted verdicts and guarded internal action execution. This change also implements the checker dependency needed for this pipeline; deterministic validation remains separate from the AI check.

Code and local tests do not prove production activation. Apply migration `20261022007000_be2_investigation_execution.sql`, deploy the matching application code and configure the worker before testing live. Item 8's migration is separate and must also be applied if deploying the preceding rider-report commit.

## Workflow

1. Authorized staff request analysis for an eligible case. Existing policy and source-version rules apply.
2. The worker claims a job with a five-minute lease. Revoked requesters, terminal cases and stale sources are rejected.
3. The claim returns uploaded, same-shipment evidence descriptors to the trusted worker only.
4. Download up to three private files, at most 10 MB each and 20 MB combined. Verify bytes, size and file signatures. No arbitrary model-provided URLs are fetched; redirects are disabled.
5. JPEG/PNG bytes are sent as image inputs; PDFs as file inputs. The provider must support image/PDF input. A successful download is not physical verification.
6. The investigator receives bounded recorded facts and evidence. File contents, complaint text and labels are untrusted data, never instructions.
7. A separate checker request gets facts, proposal and the same evidence content, without the maker conversation. It checks evidence support, classification, priority and action eligibility. Different model names can be configured; using the same model in separate requests is independent execution, not a different vendor or model guarantee.
8. Persist the maker result, checker verdict/model/response ID and consumed evidence IDs. Do not persist base64 evidence or raw provider errors in analysis configuration.
9. SQL rechecks requester access, lease, source version, current policy and pending human decisions. Only eligible internal actions execute in the same transaction as the recorded result.
10. Rejected/missing/failed checks and ineligible proposals remain human-handled and show review-required state. Staff can inspect the checker and execution result in Case detail.

## Auto-execution rules

`AI_AUTO_EXECUTE` defaults to false. To enable it, review policies and pass staging acceptance first.

All conditions must hold:

- Every checker check passes and an actual checker model/response ID exists.
- Maker does not require human review; no missing-information items remain.
- All uploaded shipment evidence has been consumed and at least one file was read. More than three uploaded files disables automatic execution for that run.
- Current case priority is low or normal, and the proposal preserves that recorded priority.
- No pending approval or pending action exists.
- The current policy explicitly permits the proposed action.
- Action is one of `save_summary`, `notify_sme` or `request_information`.

`notify_sme` creates the existing in-app notification; it does not send email/SMS. Stock changes, compensation, physical receiving/pickup/delivery, responsibility determination, approval decisions and case closure never auto-execute through this pipeline. Priority suggestions do not alter the recorded priority.

A duplicate or expired finish request cannot execute twice. Policy/case changes during inference fail the existing source-version check.

## Configuration

Worker environment only:

- `SUPABASE_URL`
- `SUPABASE_WORKER_KEY` — trusted server credential; never put it in frontend/public variables.
- `OPENAI_API_KEY`
- `OPENAI_MODEL` — image/PDF-capable investigator model.
- `OPENAI_CHECKER_MODEL` — image/PDF-capable checker model.
- `AI_AUTO_EXECUTE=false` initially.

Run from `api/`:

```sh
python -m app.worker --once
python -m app.worker
```

Maintenance-only mode intentionally skips AI:

```sh
python -m app.worker --maintenance-only --once
```

The worker fails startup when AI configuration is missing unless maintenance-only mode is explicit. The optional `render-worker.yaml` provides an opt-in paid background-worker blueprint. Do not apply it without approving current Render plan charges and AI usage. The existing free web-service blueprint does not create a paid worker automatically.

API file-input reference: https://developers.openai.com/api/docs/guides/file-inputs

## Local checks

```sh
npm run test:backend
npm run test:database
npm run test:frontend
npm run test:contracts
npm run check:migrations
npm run build
npm run typecheck
```

Tests use provider fakes and local database fixtures, not paid API calls.

## Manual acceptance tests

Use disposable staging shipments, staff accounts and non-sensitive test files. Real evidence contents are transmitted to the configured OpenAI account when analysis runs; ensure this use is authorized before enabling the worker.

1. **Happy path, review-only:** set auto-execute false; queue an eligible case with a small PNG; run one cycle. Expect analysis, checker verdict and consumed evidence IDs saved; no action executes.
2. **Approved safe action:** enable auto-execute on a low/normal case with complete evidence and a permitted safe action. Expect exactly one action record and completed execution state.
3. **PDF input:** attach a PDF containing a unique test fact. Confirm maker and checker receive file bytes and outputs reflect supported facts. Do not infer successful reading merely from an evidence ID citation.
4. **Checker rejection:** use contradictory/insufficient evidence. Expect rejected verdict, human review and no action.
5. **Checker unavailable/refusal:** simulate checker failure. Expect maker output retained, checker-unavailable verdict and no action.
6. **Missing checker configuration:** normal worker startup must fail. Explicit maintenance-only mode may run retention but never AI.
7. **No evidence:** analysis may produce a proposal, but automatic execution must remain blocked.
8. **Evidence omitted:** attach four files. At most three are read; auto-execution remains blocked.
9. **Invalid/missing bytes:** delete the disposable object or use a mismatched signature/size. Expect bounded failure reason and no action, not a fabricated analysis.
10. **Prompt injection:** place instructions to close cases/edit stock in a test document. Neither maker nor checker may turn document content into authority; no prohibited action executes.
11. **Human-required proposal:** expect review-required state even if checker approves.
12. **High/critical priority:** expect no auto-execution.
13. **Pending SME approval/action:** expect no auto-execution and no approval bypass.
14. **Policy disallows action:** expect no execution; use authorized staff workflow after investigation.
15. **Stale source:** change case/shipment/policy during inference. Expect stale-source failure and no action.
16. **Revoked requester:** revoke staff membership before finishing the job. Expect failure, no new action.
17. **Duplicate finish:** replay the same job/lease result. Expect rejection without another action/notification.
18. **Expired lease:** submit after lease expiry. Expect rejection; retry/claim uses a new lease.
19. **Tenant isolation:** unrelated SME/rider cannot claim/finish jobs or inspect private analyses. Staff reads only their authorized cases.
20. **UI:** Case detail shows recorded checker verdict and action outcome in English/Myanmar at mobile, tablet and desktop sizes. Unknown older records must show Not recorded, not Approved.
21. **Notification:** `notify_sme` creates one in-app notification for the owning SME only; verify no external message is sent.
22. **Recovery:** temporarily interrupt provider/network access. Verify bounded error reasons, retry behavior and no raw keys, evidence bytes or provider errors in logs.

Record each test as PASS, FAIL or NOT RUN with case/job IDs, environment, time, expected/actual result and correlation ID. Do not mark production activation complete until migrations, deployment, real-provider inference and role-scoped UI verification have all passed.
