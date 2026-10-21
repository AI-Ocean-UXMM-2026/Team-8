# Developer database, secrets and staging procedure

SET-09 publishes the workflow. Real teammate accounts/staging permissions are still SET-01–03. No shared or hosted database was changed.

## Per developer

Use a separate clone/task branch and a separate local Supabase stack. Install Docker/Supabase CLI; in the repository root run `supabase start`, then `supabase db reset --local` and `supabase db lint --local`. These commands target only your own local stack. Concurrent stacks on one host need unique project IDs and non-overlapping ports in a local uncommitted config/worktree; never connect a second clone to another developer’s data directory. An individual Supabase development project is an alternative when Docker is unavailable; it must be dedicated to that developer and never shared staging.

From the repository root create `.venv` with `python -m venv .venv`, then install with `.venv\Scripts\python.exe -m pip install -r api/requirements-dev.txt` on Windows (use `.venv/bin/python` elsewhere). npm scripts automatically select this local environment; CI uses setup-python. Run the backend from `api/` using `..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`. Copy api/.env.example to api/.env for backend settings. The web demo needs no credentials. Never commit a real `.env`, paste secrets into issues/chat, or expose OpenAI/service keys through NEXT_PUBLIC variables. Only the public/publishable Supabase key plus the verified user's access token is used for user database operations. Legacy SUPABASE_KEY is unused and must not be repurposed as a service-role shortcut. CORS_ORIGINS is an explicit JSON array of local web origins.

Provision local Auth users yourself via Studio and the trusted membership recipe in supabase/README.md. No shared passwords. Never use a service-role token to stand in for an SME/rider security test. Real data and GPS are excluded from seeds/screenshots.

## Migrations and seeds

Create additive files named `YYYYMMDDHHMMSS_be1_description.sql` or `_be2_...sql`. Allocate a unique UTC timestamp, sort after dependencies, use begin/commit and obtain the domain owner's review. Never rewrite a migration already applied to shared staging. FE developers request database changes from their backend owner. BE1 owns identity/operations, BE2 cases/policies; cross-tenant keys require both reviewers. `npm run check:migrations` enforces naming/order uniqueness and transaction boundaries.

`supabase/seed.sql` is a repeatable fictitious baseline with a second warehouse for isolation tests. It must not reset live stock. `supabase/tests/bootstrap.sql` is test-only, substitutes Auth/Storage primitives and must never be applied to Supabase. Use `npm ci --prefix supabase/tests`, then `npm run test:database` for a fresh isolated PostgreSQL engine on every run. CI additionally applies all migrations to an ephemeral PostgreSQL 17 with those test stand-ins. Native Supabase Auth/Storage and concurrent multi-user tests remain required before a real pilot.

## Shared staging runbook (BE1 operates, BE2 reviews)

1. Confirm the exact staging project reference and branch/migration set with the team; record operator/reviewer and backup/restore point. Do not use production or personal projects.
2. Rebase the task branch, review `git diff`, run all local checks and a fresh local reset/lint/security suite. Ensure migrations sort correctly and do not rewrite applied versions.
3. Link only the confirmed staging project (`supabase link --project-ref CONFIRMED_STAGING_REF`). Compare `supabase migration list`, run `supabase db push --dry-run`, and attach the migration names and redacted plan to the PR/change record.
4. After authorized staging approval, BE1 runs `supabase db push` once. Do not reset shared staging. Do not auto-seed staging; use explicit fictitious data only if the team authorizes it.
5. Verify membership isolation, receipt retry/rollback, private evidence, and GPS stop behavior with real Auth/Storage. Record applied versions, checks and any failure. A failure blocks integration; restore using the reviewed backup or author a forward fix rather than rewriting history.

CI does not apply hosted migrations or deploy. Staging credentials live only in the operator's local secret store or approved CI environment when a later deployment workflow is explicitly introduced.
