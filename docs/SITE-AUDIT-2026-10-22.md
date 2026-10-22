# Site audit — 22 October 2026

Target: https://parcelcare-team8.onrender.com/. Source updated by fast-forward to
`acefe6b`; existing uncommitted API fixes were retained.

## Fixed

- A clean production build failed during prerendering with `cn is not a function`
  from the root layout. The local utility now composes the existing `clsx` and
  `tailwind-merge` dependencies instead of re-exporting from `cn`.
- Automatic polling cancelled pending reads every 15 seconds, before the live
  transport's 75-second deadline. Shared portal polling now waits for pending
  reads; courier-location polling permits only one in-flight refresh. Explicit
  refresh, shipment changes and unmount still cancel obsolete requests.
- GPS freshness depended on another render or response. An independent clock
  now changes positions older than 60 seconds to “Last known location,” even
  while a refresh is pending.

## Verification

- `npm ci --include=dev --cache .npm-cache`: completed; audit reported zero vulnerabilities.
- `npm run build`: passed, including prerendering all 28 static pages.
- `npm run typecheck`: passed.
- `npm test`: all existing workflow checks passed.
- `npm run test:frontend`: 38 tests passed after the API follow-up, including
  gateway-response handling and recovery.
- `npm run test:backend`: 45 passed; four native Supabase integration tests skipped
  because the required environment is not enabled.
- `node scripts/check-tracking-polling.mjs`: passed. Fixture authentication and
  intercepted API responses verify reads slower than two polling intervals,
  non-overlapping GPS refreshes, independent stale-position labels, and explicit
  refresh clearing an old position. Run again with `npm run test:tracking`.
- Live login, warehouse overview, warehouse tracking, SME tracking and courier
  overview were checked at 390px and 1440px: no page overflow or JavaScript
  runtime errors observed. These checks did not submit real operational data.

Browser evidence is in ignored `test-results/`, including
`tracking-stale-regression.png`. The regression uses fictitious coordinates and
does not request device location.

## Release status and limits

The API fixes and build utility fix were pushed in `f0141df`, followed by the
verified Render service references in `51f0d3a`. Git's stored credentials and
Render browser access were available during the follow-up investigation.
The live frontend API was verified to return JSON HTTP 401 for an intentionally
invalid diagnostic token after deployment; see [API connection verification](API-CONNECTION-FIX.md).
The remaining polling fixes, regression script and documentation are included
in the subsequent source commit. Real account sign-in, native database
authorization and live rider GPS still need verification with an authorized
configured environment. A Git push alone does not verify deployment.

An obsolete local `.next/dev` generated route cache also blocked the initial
build; it was moved to `test-results/dev-cache-before-audit` before rebuilding.
Do not run `prepare:ui` or another build concurrently with the dev browser test:
generated file changes can trigger HMR reloads during its timing assertions.
