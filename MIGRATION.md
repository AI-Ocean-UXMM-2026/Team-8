# Stack migration and first deployment

## Current scope

The deployable frontend runs on Next.js, React, and TypeScript. The existing markup, CSS, Burmese/English text, fixtures, interactions, and localStorage keys are preserved. Next.js renders the workspace directly; there is no iframe or redirect to the old HTML page.

This is a compatibility migration: jQuery interactions and the bundled Tailwind runtime remain to preserve the interface. It is not a complete rewrite of every widget into React components. Feature owners can replace implementations incrementally, checking screenshots and workflows. Do not let React and jQuery both manage the same DOM subtree.

Editable frontend code lives in `src/features/` under workspace, reports, deliveries, policies, priority, and exceptions. `scripts/prepare-ui.mjs` generates the ordered browser bundle and markup module before development/build. Preserve script ordering: features decorate earlier renderers and share classic-script lexical scope. Restart development after editing those legacy feature scripts so the bundle regenerates. Original `dist/` is a frozen comparison baseline, not the deployed application source.

The Python/FastAPI service has a health endpoint and server-only Supabase/OpenAI client factories. Integrations are intentionally unused in demo mode. This step does not add real login, shared database persistence, business API routes, live AI calls, or database migrations. Workspace switching remains a demo simulation, not authentication.

## Local development (PowerShell)

From `parcelcare-prototype`:

```powershell
npm ci
npm run dev
```

Open http://localhost:3000. No credentials or environment variables are required for the demo UI.

Optional Python service, from `parcelcare-prototype/api`:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

Health URL: http://127.0.0.1:8000/health. Provider environment variable names are in `api/.env.example`; keep server secrets out of public Next.js variables. Configure providers when implementing authenticated backend features.

## Verification

```powershell
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
```

The migration check compares extracted source against the original baseline. Existing tests cover reports, approvals, rules, and priority. Browser verification starts production Next.js and a baseline static server on ports 3100 and 3101; it compares four workspace contents, screenshots without external map tiles, report submission, and persistence. Evidence goes to ignored `test-results/`.

The strict baseline equality assertion protects this migration. When intentionally changing features later, replace the relevant assertion with approved behavior rather than editing the baseline to hide regressions.

Verified locally on 21 October 2026: production build and TypeScript checks passed; all existing workflow/rule/priority checks passed. Chromium found identical content for SME, warehouse, manager, and rider workspaces. Desktop screenshots of SME, warehouse, and manager matched byte-for-byte; report submission and persistence passed with no browser runtime errors. Python dependencies were installed and verified using local Python 3.14; the Render configuration targets Python 3.12, which has not been run locally.

## Render web deployment

Push the application source, `package.json`, `package-lock.json`, scripts, and public assets to GitHub. Generated `public/workspace.js` and `src/features/workspace/generated.ts` are created during the build and remain ignored.

Create a Render **Web Service**, Node runtime:

- Root directory: `parcelcare-prototype` if it is a folder inside the GitHub repository; leave blank if its contents are the repository root.
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start -- --port $PORT`
- Health check: `/api/health`
- Node version: 24, also recorded in `.node-version`.

Use a Web Service for this Next.js application. Earlier Static Site instructions applied to the original HTML prototype.

`render.yaml` describes both services using the current Git repository root. For a Blueprint, select `render.yaml` as its path; the web root is `.` and API root is `api`. Manual setup above is sufficient for the first demo; Python is optional until the UI uses backend routes.

Optional Python service settings:

- Root directory: `api`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`
- Python version: 3.12.8, as configured in the Blueprint.

After deployment check health, all workspaces, report submission, manager queue, priority settings, and refresh persistence. Demo data remains browser-local and does not sync across teammates. Existing localStorage on another deployment domain does not automatically transfer to the new origin.

## Subsequent work

Implement real identities, RLS, warehouse/SME data, transactional inventory, and exception APIs before enabling privileged database mutations or AI tools. Feature folders are available for parallel team work. This migration preserves existing behavior rather than adding the full PRD.

References: [Next.js scripts](https://nextjs.org/docs/app/guides/scripts), [Render deployment](https://render.com/docs/deploy-nextjs-app), [Supabase Python initialization](https://supabase.com/docs/reference/python/initializing), [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling).
