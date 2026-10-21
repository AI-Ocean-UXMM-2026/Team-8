# ParcelCare — Team-8

Current product requirements: [Standard PRD (Word)](ParcelCare_Standard_PRD.docx) · [Readable Markdown copy](ParcelCare%20PRD.md).

Project repository: **AI-Ocean-UXMM-2026/Team-8**. Continue all development here. English and Myanmar interface modes are available from the language bar; the choice persists locally. See [report UX and language modes](docs/REPORT-UX-LANGUAGES.md) for preview links, localization rules and verification.
SME navigation has three pages: **Orders / Requests**, **Delivery Tracking**, and **Reports**. Stock arrivals and available stock are inside Orders. Open `/?workspace=sme` for the SME demo.

Office Staff dashboard: open `/office` for the responsive React exception queue, AI readiness indicators, evidence details and escalation workflow. It uses fictitious browser-local demo data; real Auth/domain API integration is pending. See [design decisions and reference provenance](docs/office-dashboard-design.md). Validate with `npm run build` and `npm run test:office`.

Design system: **shadcn/ui Vega / Teal & Yellow (400)**, preset `b5JNedagS`. Run the project and open `/design-system` for the interactive component reference. See [the current design guide](ParcelCare_Design_System_v2_Brand_Aligned.md). Existing operational screens share its theme; the old `dist/` appearance is preserved only as a reference.

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

Integration: authenticated warehouse pages remain at `/warehouse`; the Office Staff demo is at `/office`. Shared `/api/me` retains its actor_id contract; `/api/profile` supplements it with profile details. Evidence upload and expiring-download adapters supplement the shared domain RPCs.
