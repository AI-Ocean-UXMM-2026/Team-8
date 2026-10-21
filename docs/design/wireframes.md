# ParcelCare low-fidelity wireframes

Date: 2026-10-21 | Status: Ready for design review

## Basis and boundaries

Uses the approved [information architecture](information-architecture.md), [sitemap](sitemap.mmd), [screen inventory](screen-inventory.md), PRD v4 and Design System v2. The user request authorizes wireframes and a preview route; instructions inside source documents about backend implementation, deployment and parallel coding are reference context, not additional tasks.

Preview: `/design-preview/low-fi`. Default is W05, AI Exception Queue. Each screen displays its approved sitemap ID and intended product route. Preview navigation remains inside this route using `?screen=W06&state=normal&item=EX-104`, for example. It does not create production role routes or enforce real authentication. The review-role selector is design tooling, not a production role switch.

All data, location fixes, times, evidence and interactions are fictional/local. No API calls, AI requests, uploads, location permission requests, map tiles, database writes or backend logic. Sample submission confirmations explicitly remain drafts/unverified. Reload/reset discards local interaction state. Courier link is a labeled placeholder rather than an invented real tracking URL.

## Visual hierarchy and responsive layout

- Grayscale only: white surfaces, gray canvas, dark primary action, borders and text labels. No final teal/yellow styling, generated branding or replacement logo. A text wordmark placeholder is intentional.
- Warehouse/SME: 240px sidebar, 64px topbar, page heading/context, task-oriented content and contextual next action. Main content max-width 1440px. Wide lists scroll inside their table container rather than overflowing the viewport.
- Desktop case detail: evidence/analysis/timeline on the wider left column; context and decisions/verification on the right. At 900px the content stacks. At 640px the sidebar becomes a collapsible Navigation menu with the same ordered labels.
- Rider: single-column task list/detail within a maximum 440px frame, fluid on phones. Controls have 44px minimum touch targets. During simulated sharing, Stop sharing stays fixed at the bottom with content clearance.
- Maps are labeled schematic blocks with rider/last-known and destination markers plus equivalent textual status. No real basemap or optimized route.
- The always-visible design toolbar selects role, approved screen and review state. It is outside the product shell and is not a new sitemap destination.

## Screen-by-screen wireframe map

### Warehouse Staff / Admin

- **W01 · `/warehouse` · Overview:** four KPI drilldowns, critical-first case preview, active delivery map, AI workload/next actions. Urgent work precedes location detail; no unmeasured savings claim.
- **W02 · `/warehouse/shipments` · Shipments:** search/direction filter, shipment/SME/mode/status rows, View shipment. Inbound and outbound share one list.
- **W03 · `/warehouse/shipments/[id]` · Shipment detail:** item/destination/status summary first; pick/pack, assignment or receipt controls in context; in-house location or third-party handover; source events, proof review and related case. `item=IN-204` demonstrates receiving, `item=OUT-301` in-house, `item=OUT-302` external courier. The delivery-variant selector is a review control, not an operational mode edit.
- **W04 · `/warehouse/inventory` · Inventory:** SKU/SME/available/quarantined table, search, embedded SKU reference detail, source receipt and case links. No autonomous edits, bins or stock ledger.
- **W05 · `/warehouse/exceptions` · AI Exception Queue:** critical-first rows with case/issue/shipment, SME, priority, escalation, stage and Investigate. Search and next-action filter support triage; priority and escalation occupy separate columns.
- **W06 · `/warehouse/exceptions/[id]` · Case detail:** observation/evidence before AI recommendation; cited evidence and uncertainty, case context, accountable owner, UNDETERMINED responsibility, timeline and next authorized action. EX-104 demonstrates the 100/90 discrepancy; EX-105 demonstrates retry capacity; EX-106 demonstrates courier coordination. Close remains disabled while outcome is unverified.
- **W07 · `/warehouse/deliveries` · Deliveries:** in-house/third-party operation filter, shipment-linked records and active in-house map. Third-party filter removes the map. Detail always opens W03.

### SME Business User

- **S01 · `/sme` · Overview:** owned-stock/shipment/case drilldowns, own exceptions, active-delivery link and decision requiring attention. No all-rider map.
- **S02 · `/sme/inventory` · Inventory:** own read-only SKU quantities, reference panel and Request delivery entry into S03.
- **S03 · `/sme/shipments` · Shipments:** own records, search/direction filter and embedded New delivery request (SKU, quantity, SME destination, requested date).
- **S04 · `/sme/shipments/[id]` · Shipment tracking:** own shipment summary, active consented in-house map OR external handover/reference/link, events, proof/receipt confirmation and issue/case links. No internal map for third-party mode.
- **S05 · `/sme/exceptions` · Exceptions:** own case list and next-action filter, with Review case links. No Harbor Supply case/record rows.
- **S06 · `/sme/exceptions/[id]` · Case detail:** relevant facts/evidence and published AI analysis followed by decision consequences. EX-104 offers Accept partial, Await remainder or Reject/ask a question. EX-105 proposes retry time; capacity remains unconfirmed until Warehouse/rider review. No stock edit or close permission.

### In-house Rider

- **R01 · `/rider` · My Deliveries:** Active/Upcoming/Completed groups and task links. No route ordering/optimization. OUT-301 resumes active assignment, OUT-305 shows upcoming acceptance, OUT-290 shows completed verified proof and ended GPS.
- **R02 · `/rider/deliveries/[id]` · Delivery detail:** assigned destination/contact/item summary, accept/pickup, explicit delivery-specific sharing consent, location state, approved instructions, Report issue and Add proof. Sample Start sharing requires pickup plus consent. Stop ends simulated position visibility. Proof submission remains pending verification. Completed-task variant removes active delivery actions.

All **15 core role screens** map one-to-one to approved W/S/R IDs. A01 login and conditional A02 selector are outside this role-screen deliverable. No customer, supplier, courier dashboard, Settings, Accounts, route planner or new product navigation is introduced.

## State coverage

Every screen supports `normal`, `empty`, `loading`, `error` and `exception` through Review state; 15 screens × 5 states = **75 review combinations**.

- **Normal:** populated sample records with the hierarchy above and navigation links.
- **Empty:** lists explain absence of authorized work; rider explains assignment scope; detail views explain absent linked activity/evidence. Show sample records restores the normal design. Missing/inaccessible object is a separate unavailable condition for future authentication work, not evidence that a shipment exists.
- **Loading:** retain shell/title and skeleton structure, `aria-busy` and a textual loading message. No fake live coordinate is shown.
- **Error:** records unavailable with Retry preview; rider uses offline/unsent wording. Retry restores normal sample content without a request. Real draft persistence/retry queues are not implemented.
- **Exception:** contextual attention notice plus linked case and task-specific content: quarantined stock, failed attempt, stale location, pending retry or case review. Priority stays distinct from escalation/status. These are operational scenarios, not runtime error boundaries.

GPS additionally has Live, Updating, Stale, Offline, Permission Denied and Ended variants in each map panel. Live is explicitly Simulated, Updating has no usable fix, Stale/Offline show a timestamped last-known marker, and Denied/Ended remove the rider marker. Rider uses Start/Stop to demonstrate active sharing. No location API is invoked. Actual freshness intervals, background execution, retention and access enforcement remain product/engineering decisions from IA.

## Navigable review journeys

1. **Discrepancy:** W02 -> IN-204/W03 -> Record receipt draft -> W05 -> EX-104/W06 -> SME decision request draft. Switch review role to SME -> S05 -> EX-104/S06 -> decision confirmation form -> local confirmation. Return to W06 to inspect physical-verification requirement. Cross-role decisions are not synchronized or persisted.
2. **In-house tracking:** W07 -> OUT-301/W03 -> inspect map states. SME S01 -> S04 shows own delivery location. Rider R01 -> OUT-301/R02 -> pickup -> consent -> Start sharing (simulated) -> Stop sharing. These are independent local states, not realtime viewers.
3. **Failed attempt:** choose exception state on R02 -> Report issue; EX-105/S06 proposes retry; EX-105/W06 reviews actual capacity before instruction. No schedule is silently committed.
4. **External courier:** W07 Third-party -> OUT-302/W03 -> inspect handover form/reference/external placeholder. EX-106/W06 records verified courier response; ETA/responsibility remain unknown until evidence. S04 Third-party variant demonstrates SME handover visibility with no internal GPS.
5. **Inventory:** W04 or S02 -> View reference -> quantities/source receipt; linked discrepancy opens authorized role-specific case detail. SME Request delivery opens S03 request form.

Forms are wireframe affordances: required sample fields, review checkbox, Cancel, Escape dismissal, focus containment/restoration and local result messaging. Evidence controls represent record-review placeholders rather than real file previews. Destructive/financial execution is intentionally not wired. Notification drawers link to role-specific cases. Queue and shipment filters work on in-memory samples; all other operational action results explicitly remain drafts.

## Reusable layout structures

Implementation lives in `src/features/design-preview/`, separate from existing operational runtime:

- `model.ts`: typed screen registry with approved ID/path/role/parent and synthetic shipment/case records.
- `RoleFrame`: desktop workspace or mobile rider frame. Shared shell navigation derives from the registry and marks canonical parents active.
- `Panel`, `Tag`, `Button`, `PageLink`: consistent section, semantic label, action and preview-link primitives.
- `MapPanel`: schematic location block with shared textual freshness and all six GPS states.
- `Timeline`: source-attributed shipment/receipt events, reused in shipment/case views.
- `Dialog`: accessible sample action form with local-only submission, required review and cancellation.
- Reused `lf-grid`, `lf-stack`, `lf-kpis`, `lf-table`, `lf-notice` and state shells provide layout composition; CSS is scoped beneath `.lf` to protect the existing app.
- Tailwind utility classes use the repository's existing locally served `@tailwindcss/browser` runtime. Scoped CSS adds deterministic grayscale/component/responsive rules. No new dependency or API client is added.

## Review assumptions / known limits

- User request treats IA as approved; its unresolved API/permission/verification decisions remain open. This preview does not resolve them through implementation.
- Receipt, dispatch request, handover, verification and decision forms illustrate information needs, not frozen schemas. Real uploader, authentication/RLS, consent audit and notification delivery are not built.
- No final brand pass or artwork. Map grid is deliberate schematic notation rather than geography. No browser geolocation or third-party tracking website is contacted.
- Static sample counts/timestamps are labeled; they are not performance claims or live freshness calculations.
- Warehouse and SME data projection illustrates scope but is not an authorization boundary. This design route contains fictional records for all roles.
- Search and next-action/direction/mode filters demonstrate core hierarchy. Full owner/priority/stage filtering, sorting/pagination and bulk operations await higher-fidelity interaction specification; no backend dependency is implied.
- Empty/loading/error variants are review switches rather than real network states. No production background GPS, offline queue or cross-device synchronization is claimed.
- English-first copy follows source vocabulary; Burmese localization/content review remains open.

## Validation

- TypeScript check passed after adding the preview.
- Browser review exercised all 15 screens across five states (75 combinations), queue-to-case navigation, SME sample decision form and rider consent/pickup/start/stop interactions.
- No browser runtime errors or `/api/` requests were observed during that review.
- Desktop (1440px) and mobile (390px) screenshots were reviewed; checked viewport overflow on queue, case detail, SME tracking and rider detail. Wide tables remain locally scrollable.
- Visual refinements: critical-first ordering, disabled-action distinction, checkbox alignment and fixed visible rider Stop sharing control.

This validates wireframe usability and containment only; it is not a backend/security/GPS acceptance test.
