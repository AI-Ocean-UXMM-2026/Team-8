# ParcelCare — Team-8

Project repository: **AI-Ocean-UXMM-2026/Team-8**. Continue all development here. English and Myanmar interface modes are available from the language bar; the choice persists locally. See [report UX and language modes](docs/REPORT-UX-LANGUAGES.md) for preview links, localization rules and verification.

M0 SET-01–06 foundation: see [handoff and contract conventions](docs/M0-FOUNDATION.md). Run `npm run dev` and open `/foundation` for the new React shared layout/components. `/` remains the prototype reference. Generate DTOs with `npm run contracts:generate`; validate fixtures and drift with `npm run test:contracts`. Operational APIs remain later tasks.

SET-07–11 adds the [shared client/backend interfaces, database workflow, policy and CI](docs/M0-SET07-11.md). Install `api/requirements-dev.txt` into a root `.venv` for Python checks. The identity API verifies configured Supabase Auth; UI sign-in is added by the warehouse frontend below; operational APIs remain later tasks. GitHub Actions runs checks without deployment. The demo still uses fictitious local data.

WH-01–07 frontend: [warehouse UI and integration notes](docs/WAREHOUSE-UI.md). Run `npm run dev` and open `/demo/warehouse` for the isolated warehouse demo. `/login` and `/warehouse` use configured Supabase Auth and backend identity; operational endpoints still require OPS implementation. Run `npm run test:warehouse` for the warehouse browser suite.

The deployable application now runs on **Next.js / React / TypeScript**, with **Python/FastAPI** foundations and optional **Supabase / OpenAI** client factories. Its interface and demo behavior are preserved through the existing feature scripts; live integrations are disabled. See [MIGRATION.md](MIGRATION.md) for local commands, migration limits, checks, and Render **Web Service** settings. Run `npm ci` then `npm run dev` from this directory.

The notes below describe the original `dist/` prototype, preserved for comparison.

HTML, Tailwind CSS and jQuery. Open dist/index.html or serve dist using `python3 -m http.server 8765 --directory dist`.

## Walkthrough
1. SME → My Reports → Report warehouse issue. Submit a reference, warehouse issue type, description and requested outcome.
2. Warehouse → SME Reports → Open report → Assign to me → Start review → Start investigation.
3. Request more information if necessary; switch to SME to reply.
4. Warehouse proposes a written resolution. The report stays Awaiting SME Confirmation.
5. SME confirms and closes, or supplies a reason and reopens the report.

Only SME confirmation closes a report. There is no automatic closure. Report status is separate from order/delivery status. Five warehouse issue categories are supported; courier failed-delivery and courier-delay reporting are excluded. Evidence is text references in this prototype, not uploads. Browser-local storage only; workspace switching simulates roles rather than real authentication. No live API, GPS or backend.

Validation: `node check-reports.cjs` covers transitions, required notes, information requests, reopen and SME-only closure. Browser visual/click QA was blocked by the browser approval gate in this session.

Priority: Warehouse Manager → Priority settings · MMK & categories. Configure three ascending MMK thresholds and risk profiles for any category. Product impact forms accept multiple affected product lines (quantity × unit price). Missing settings/data routes to Manager with Priority pending. Category incident priorities, manager overrides and settings history are supported. Editable starter thresholds: Normal 50,000 MMK, High 200,000 MMK, Critical 1,000,000 MMK. These are application defaults, not an industry standard. Existing demo fixtures lack product prices/categories and therefore move to Manager pending configuration. `node check-priority.cjs` checks priority boundaries, totals, incident escalation and missing-data routing; the older checks exercise the base workflow without loading the priority extension.

Integrated priority verification: `node check-priority-reports.cjs` loads the report, maker/checker, rule and priority modules together. It checks 25 synthetic scenarios against the starter thresholds, multi-product totals, category incidents, missing/invalid inputs, manager overrides, Human-rule precedence and settings changes. It does not change browser reports or settings. Priority and AI/Human routing remain independent: a Critical priority alone does not create a Human rule.
