# Report UX and language modes

Canonical repository: https://github.com/AI-Ocean-UXMM-2026/Team-8.git.
Continue work in this repository; the adjacent `parcelcare-prototype` checkout is historical input, not the project remote.

## Review locally

Run `npm ci` and `npm run dev -- --port 3218`, then open:

- `http://localhost:3218/?workspace=manager` — manager reports and priority settings.
- `http://localhost:3218/?workspace=warehouse` — warehouse reports.
- `http://localhost:3218/?workspace=sme` — SME reports.

These are demo workspace selectors, not authentication or authorization. The separate `/warehouse` application retains its existing session checks.

## Behavior

Reports expose search and review-queue filters with priority, review and case status in separate columns. Priority groups are computed from report data. Detail starts with the incident, routing reason and next action; diagnostics and matched rules remain available in disclosures. Settings separate MMK boundaries, category incidents, a required change reason and history.

The language bar offers English and Myanmar as separate interface modes. The choice persists locally as `pc-language-v1`, works across routes and tabs, and is available inside report/settings dialogs. Both language names remain visible so users can recover from an unfamiliar language. Proper names, IDs, entered descriptions, evidence, resolutions and audit text retain their original language; localization is not automatic translation of business records.

`public/locales/my.json` contains interface translations. `public/locales/en.json` normalizes legacy mixed-language interface copy to English before translating it. Add translations whenever adding interface copy; unknown copy falls back to its source text. This is a deterministic local catalog, not a translation API. Legacy and React screens share a text-node adapter (`src/shared/i18n/runtime.js`) without adding wrappers to React-owned text. Its observer handles later renders; original source strings allow reversible switching. Textarea/input contents, user-content regions, raw audit JSON and option submission values are preserved. Visible field labels and accessibility labels translate together. New UI should use complete catalog phrases rather than concatenate English fragments.

`prepare:ui` creates the language bundle and static-reference assets. Source feature scripts, workspace markup/styles and their `dist/` reference remain in parity. The build uses bundled Inter and Noto Sans Myanmar fonts and includes their OFL licenses.

The earlier local information-only routing fix is carried forward: information enquiries without product impact do not require product prices merely to stay in AI review. Human rules retain precedence. No business-rule IDs or permissions changed, and only SME confirmation closes a case.

## Design decisions

Taste Skill: Achromatic ledger, seed 839344689, keeping the existing brand palette and type. Quiet controls, a shared metric strip, explicit urgency labels and responsive labelled report rows follow the queue's main question: “Which report needs review next?” Existing brand teal buttons and 12px panel radii take precedence over the dealt style. Detail answers “Why is this here and what happens next?” Settings answer “What will this configuration change?” No generated photographs or replacement logo assets.

UX Writing Skill: action-led labels, specific validation recovery, consistent review terminology and an explicit distinction between urgency and workflow. No invented priority data: the existing seed and generated records remain demo fixtures.

## Verification

- `npm test`: source/static parity and existing report, maker/checker, rule, autofill and integrated priority regressions.
- `npm run typecheck` and `npm run build`.
- With a server running, `npm run test:report-locales`: desktop (1440), tablet (768), mobile (390), both languages, search, queue filters, unchanged stored reports, form draft preservation, canonical option values, persistence and shared login translation. Screenshots are written to ignored `test-results/`.

No deployment or remote push is included in this change.

Taste inspection of the report entry point passed at 1440, 768 and 390px with zero failures. Its remaining warning is the proportion of 12px metadata in the sparse one-report fixture; these are intentionally secondary labels under the brand typography scale, while report data uses 13–14px. Both language layouts were inspected visually.

## Selected green logistics reference

The user selected the green “Logistics Software” card credited to Ruslan Kosinov in their screenshot. The adaptation uses a white compact sidebar, green active navigation, a soft sage workspace, separate white metric panels, tighter table spacing and lightly tinted detail sections. Existing ParcelCare mark, language modes, semantic priority colors and workflows remain intact. The reference's map is not added to report screens because it would not serve their review task. Shared React workspace colors and selected navigation use the same direction.
