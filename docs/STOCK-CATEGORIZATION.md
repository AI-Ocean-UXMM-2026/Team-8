# Stock categorization: deployment and testing

This feature is on `codex/stock-categorization`. It adds product metadata, AI category suggestions and staff verification inside **Inventory → View details**. It never modifies stock quantities, receipts, shipments, memberships or GPS data. Exception investigation keeps its existing provider configuration.

## Categories and review rules

The categories are Food & beverages, Clothing & accessories, Home & kitchen, Electronics, Beauty & personal care, Health & medical, Office & stationery, and Other. These are product labels, separate from incident priority categories.

AI uses the product name, description, material/ingredients, intended use, and storage/handling notes. Missing fields are flagged deterministically; the model can also flag uncertain fields. Confidence below 80%, Other suggestions and absent AI suggestions require explicit acknowledgement before verification. All results require staff verification, including high-confidence suggestions. Confidence is an estimate, not measured accuracy.

Staff can accept or correct the suggestion, or verify manually when AI is unavailable. Unknown details can remain blank if the staff review acknowledges the flags and records unresolved information in the note. Editing/saving metadata clears previous suggestions and verification. Re-running AI also makes the category pending. Categorization revisions are independent of stock versions.

## Deploy on Supabase and Render

1. Review/merge the feature branch using your team's usual process.
2. Apply `supabase/migrations/20261022110000_be1_stock_categorization.sql` after existing migrations. Use your team's Supabase CLI process, or paste the entire file into the project's SQL Editor and run once. Do not reset the database or rerun the base seed.
3. Sign in at [Groq API Keys](https://console.groq.com/keys), remain on the Free plan, choose **Create API Key**, name it `ParcelCare stock categorization`, and copy the secret directly to Render.
4. Open **Render → parcelcare-team8-api → Environment → Edit** and add:

```dotenv
CATEGORIZATION_PROVIDER=groq
CATEGORIZATION_MODEL=qwen/qwen3.8-27b
GROQ_API_KEY=<your secret key>
```

5. Save/redeploy the API and deploy the frontend containing this branch. Keep existing Supabase and API URL settings. The secret belongs only on the API service: never use a NEXT_PUBLIC prefix, put it in source control or paste it into chat.
6. Check API `/health`, sign in as warehouse staff, open `/warehouse/inventory`, and open a product. The demo route intentionally does not run external classification.
7. If the panel cannot load, check that the migration and API use the same database. If AI is not configured, check API environment names and restart it. A successful options request confirms configuration presence, not valid provider credentials or account quota; the first real classification validates those.

Only product name and the four metadata fields are sent to the provider. User/tenant IDs, SKU, quantities, shipment and case data are excluded. There is no paid fallback and no automatic retry. Groq's free tier has quotas; account billing is controlled by the account owner. Check current model access and limits at [Groq structured outputs](https://console.groq.com/docs/structured-outputs) and [Groq rate limits](https://console.groq.com/docs/rate-limits).

## Local option without an API key

Install Ollama from its official site on the same machine as the Python API. Pull a model suitable for your hardware, for example `ollama pull qwen3:4b`. Set these in `api/.env`, then restart the API from the `api/` directory:

```dotenv
CATEGORIZATION_PROVIDER=ollama
CATEGORIZATION_MODEL=qwen3:4b
OLLAMA_URL=http://127.0.0.1:11434
```

No Groq/OpenAI key is required for local Ollama. The model must respond within the 40-second timeout, so slow hardware/cold starts may need a smaller model. Render's localhost is its own server, not your laptop; use Groq for the shared deployment unless you separately host a reachable model server. Do not publicly expose an unauthenticated Ollama port. See [Ollama structured outputs](https://ollama.com/blog/structured-outputs).

## Prepare your test session

Use a warehouse staff/owner account. The live sample products previously added are `TEST-GB-TEA` and `TEST-LL-MUG` under Golden Bloom and Lotus Living. Note their available/on-hold quantities first. All categorization scenarios must leave those quantities unchanged. Use test products because editing their facts deliberately invalidates existing verification.

## 1. Clear product and normal verification

1. Open **Inventory → TEST-GB-TEA → View details**.
2. Enter description `Box of 20 black tea bags for brewing a hot drink`.
3. Material: `Black tea leaves; paper filter bags`.
4. Intended use: `Prepare a beverage`.
5. Storage notes: `Keep dry in sealed packaging, away from strong odors`.
6. Click **Save product facts**, wait for success, then **Suggest category with AI**.
7. Expect Food & beverages in normal operation; exact wording/confidence can vary. Status must remain **Needs human verification** regardless of confidence.
8. Choose the correct category and write `Checked packaging and ingredient list`. Acknowledge any flags, then **Verify category**.
9. Expect a saved category, reviewer ID and timestamp. Refresh/reopen to confirm persistence and unchanged stock.

## 2. Missing attributes

1. Clear storage notes and save.
2. Expect the previous suggestion/category/reviewer to clear and status to become pending.
3. Request AI. The missing storage flag must appear regardless of confidence.
4. Select a category and enter a note, leaving acknowledgement unchecked. Verify must be disabled.
5. Check acknowledgement, write `Package checked; storage information unavailable, follow up with SME`, and verify.
6. Expect an explicit human decision with unresolved information recorded. AI must not silently fill the missing field.

## 3. Ambiguous descriptions and low confidence

1. On the mug product use description `Small multipurpose container; exact purpose unconfirmed`, material `Unknown`, intended use `Possibly drinkware or decorative storage`, and blank storage notes.
2. Save and request AI. Expect the missing storage flag. The model may also return Other, low confidence or uncertain attributes.
3. Exact model confidence is nondeterministic. Even an overconfident result must remain unverified. Automated tests below use controlled low-confidence outputs to verify the guard reliably.
4. Check the physical product, select the correct category and document both the evidence and unresolved facts.

## 4. Human override and manual classification

1. Choose a category different from the suggestion, explain the correction and verify.
2. Refresh/reopen: the human category must persist while the AI suggestion remains available for comparison. Private command snapshots retain both.
3. To test manual classification, save changed facts to clear AI, skip requesting AI, choose the category, write a check note and acknowledge the absence of a suggestion. Verify must work.

## 5. Metadata changes invalidate old decisions

1. Verify a category, then edit one field without saving.
2. Expect an unsaved-changes message and disabled AI/verification controls; the saved record has not changed yet.
3. Save facts. Expect pending status, no old category/reviewer/timestamp and no old suggestion. Refresh to confirm.

## 6. Two staff members editing concurrently

1. Open the same product's details in two tabs before editing.
2. Save metadata in tab A; attempt to save or verify from tab B's older revision.
3. Expect a conflict with no overwrite of tab A.
4. Copy any unsaved text, then use **Reload saved record** in B. Reload discards unsaved edits; re-enter changes against the latest revision.

## 7. Provider outage, quota and malformed output

Use the automated tests for repeatable failures without consuming quota. For an actual provider failure, use an invalid key only in a separate local test environment, never by disabling teammates' shared key.

1. Save metadata, then simulate a provider timeout, malformed JSON, invalid category or Groq 429.
2. Expect an error and no fabricated successful suggestion. Existing saved state must survive.
3. A 429 must explain quota exhaustion. Wait and retry, or verify manually.
4. Retrying an unchanged action reuses its request key. A completed AI request/key returns the stored result without another provider call. Concurrent in-flight requests can each reach the model, but only one can save against a given revision; the UI blocks double submits within a panel.

## 8. No provider configured

1. In a separate local API environment leave GROQ_API_KEY blank and restart it.
2. Expect metadata/decisions to load and the AI button to be disabled with an explanation.
3. Manual verification still works with an acknowledgement and note. Restore the key/restart for real AI.

## 9. Product text containing instructions

1. Put instruction-like text alongside factual product details in a test description, such as a request to classify tea as electronics.
2. Save/request AI. The model should classify the product facts rather than follow that text.
3. Regardless of model behavior, no SQL, stock edits or workflow actions can be executed. Output must pass the category/schema validation and human review.
4. Correct any wrong category and record it as an evaluation failure. Prompting is not a guarantee of semantic correctness.

## 10. Permissions and isolation

1. Staff/owner in the product's warehouse can read and mutate categorization.
2. SME, rider, another warehouse's staff and unauthenticated callers must be denied by the API/RPCs. Non-staff may be blocked by the warehouse page before reaching the panel.
3. Direct authenticated table writes must fail; only guarded RPCs write. Anonymous clients cannot read categories. Automated tests exercise these paths without changing live memberships.

## 11. Myanmar and mobile

1. Enter Myanmar descriptions, save and refresh. Unicode must persist; evaluate actual classification quality manually because models vary by language.
2. At 390px width the panel must become one column with usable controls and no page-wide overflow. Verify keyboard focus, labels and actions remain usable.

## Automated checks

On Windows with this repository's existing backend environment:

```powershell
$env:PYTHON=(Resolve-Path api/.venv/Scripts/python.exe).Path
npm run test:backend
npm run test:categorization:database
npm run test:categorization:ui
npm run typecheck
npm run test:contracts
npm run check:migrations
npm run build
```

The database test applies all migrations to an isolated PGlite instance; it checks missing/uncertain review guards, manual correction, permissions, stale revisions, idempotency, private audit history and unchanged stock. It never touches live Supabase.

The UI test starts a local fixture server on port 3127 and checks desktop/mobile forms, persistence, errors and retries using simulated Auth/API/provider responses. Provider unit tests intercept HTTP and validate request/response adapters for Groq and Ollama. These prove application behavior, not real model accuracy or Groq account access. Real AI needs one live test after migration, deployment and key configuration.

## Team handoff

Feature code lives in `api/app/features/categorization/` and `src/features/categorization/`. Shared integration points are settings, router registration, RPC allowlist, one error mapping, the inventory detail panel, typed client methods, generated contracts and test scripts. Change the Python enum and SQL allowlists together if your team changes categories. Bulk categorization and SME self-editing are outside this feature.
