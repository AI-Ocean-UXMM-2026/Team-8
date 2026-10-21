# ParcelCare information architecture

Status: Proposed for review | Date: 2026-10-21 | Scope: PRD v4 P0

## Basis and scope

Sources read: `../../ParcelCare%20PRD.md` (v4.0) and `../../ParcelCare_Design_System_v2_Brand_Aligned.md` (v2.0). These are product reference material, not authorization to execute their implementation, deployment or parallel coding instructions. This deliverable documents IA only.

PRD controls product scope and authorization; the design system supplies interaction conventions. New paths below are proposed, not claims about implemented routes. Preserve the PRD's explicit role homes and exception/shipment detail routes.

Outbound means Warehouse to SME premises/branches. Exclude end customers, public tracking, supplier portals, third-party courier accounts/dashboard/GPS, full WMS, route optimization, billing and autonomous stock edits. Companion files: [sitemap](sitemap.mmd), [flows](user-flows.mmd), [screen inventory](screen-inventory.md).

## Roles and boundaries

- **Warehouse Staff / Admin:** assigned warehouse's SME stock, receipts, shipments, assignments, handovers, authorized active GPS and cases. Record physical verification, review AI, execute authorized actions, resolve and close verified cases. Shared shell; finer Admin/Staff action privileges need confirmation.
- **SME Business User:** own organization's stock, shipments, relevant evidence, decisions and active in-house tracking. Supply information, approve/reject permitted proposals, propose retry time and confirm receipt. Cannot edit stock, assign riders or close Warehouse cases.
- **In-house Rider:** assigned deliveries only, necessary destination/contact/item summary, pickup, explicit GPS sharing, status, issues and POD. No warehouse inventory or full investigation workspace.

Enforce scope on routes, APIs, attachments, notifications, realtime subscriptions and AI retrieval. Hidden navigation does not provide authorization. Cross-tenant object URLs return generic unavailable responses without disclosing existence. SMEs never receive all-rider location feeds.

## Login redirects

1. `/` resolves authenticated membership; unauthenticated users go to proposed `/login`.
2. Warehouse Staff/Admin -> `/warehouse`; SME -> `/sme`; Rider -> `/rider`, where the active task appears first with Resume. Client-selected roles never grant permission.
3. After login, restore an authorized local deep link only after validating role, membership and object access. Reject external return destinations. Otherwise use role home.
4. Expired sessions return to login with a safe return target. Reauthentication rechecks access and never automatically replays approval, receipt, POD or GPS-start submissions.
5. Wrong-role routes show access denied and own-home recovery. Inaccessible objects show generic unavailable. Disabled/missing membership shows contact-your-warehouse guidance and sign out.
6. Multiple authorized roles/memberships: proposed conditional `/select-workspace` selector, server-validated. Single-role users bypass it. Confirm whether needed.
7. Sign out clears scoped views/subscriptions and revokes active rider tracking. Server-side expiry/revocation must end access even if a browser disconnects.

No public registration is assumed. Invitation/password recovery depends on authentication method, not frozen here. Access-denied, not-found and expired-session experiences are states, not sidebar modules.

## Navigation and hierarchy

### Warehouse: five sidebar destinations

1. **Overview** `/warehouse`: stock/inbound/outbound/open-case KPIs, urgent cases, AI handling summary and active in-house map preview. Drilldowns open existing filtered lists. Time-saved estimates must be labeled assumptions unless measured.
2. **Shipments** `/warehouse/shipments`: All/Inbound/Outbound filters plus SME, mode, status and date. Child `/warehouse/shipments/[id]` has Summary, Items, Events, Delivery and Related exceptions sections. Record receipt, pick/pack, assign rider, courier handover and report issue are embedded contextual forms.
3. **Inventory** `/warehouse/inventory`: SME/SKU available/quarantined quantities, receipt/dispatch references and linked cases. SKU detail is an embedded panel. No bins, ledger or full replenishment system.
4. **Exceptions** `/warehouse/exceptions`: criticality/age queue; independent priority, escalation, owner and stage filters. Child `/warehouse/exceptions/[id]` contains summary, evidence, AI investigation, decisions/actions and timeline/audit. No standalone AI chat.
5. **Deliveries** `/warehouse/deliveries`: outbound operational projection with In-house/Third-party filters. In-house assignments and authorized active map; third-party handover records only. Selecting a record opens canonical shipment detail's Delivery section, not a duplicate detail route.

SME filter replaces SME Accounts in P0. Policies/courier setup are seeded pending later admin specification; no Settings or reporting suite.

### SME: four sidebar destinations

1. **Overview** `/sme`: own stock, shipments, delivery states, open cases and pending decisions. Links to own shipment map and cases.
2. **Inventory** `/sme/inventory`: owned read-only SKU quantities/reference events, embedded SKU panel and Request delivery entry.
3. **Shipments** `/sme/shipments`: own inbound/outbound/requested shipments with delivery filters. Embedded New delivery request form. Child `/sme/shipments/[id]` shows items/destination/events, delivery, POD and related exceptions. In-house map only for authorized active sharing; third-party external link only.
4. **Exceptions** `/sme/exceptions`: own cases with Needs your decision filter. Child `/sme/exceptions/[id]` shows relevant evidence, analysis, timeline, information request and permitted decision controls.

Requests and Deliveries from the design system are consolidated into Shipments filters/actions. Approval belongs in case detail, not a separate module.

### Rider: one primary destination

**My Deliveries** `/rider`: assigned Active/Upcoming/Completed tasks without optimized ordering. Child `/rider/deliveries/[id]` contains task summary, assignment acceptance, pickup, destination/contact, instructions, active delivery, explicit GPS start/stop, issue and POD steps. These are embedded steps, not primary destinations. Completed tasks retain permitted summaries without live position.

Warehouse uses the design system's 240px sidebar/64px topbar; SME adapts ordered labels to mobile menu. Rider uses task-list/detail/back navigation. Account/sign out lives in the shell. Warehouse/SME in-app notification drawers link directly to authorized objects; rider instructions stay on task. Breadcrumbs use canonical parents and preserve list filters.

## Core objects and content hierarchy

Shipment belongs to warehouse and SME, with direction, items, mode, expected dates and attributed events. Delivery is its outbound projection. Assignment links an employed rider to shipment; consented tracking session links assignment to timestamped coordinates. Third-party handover/reference records attach to shipment without a rider session.

Exception links affected shipment/SKUs, evidence, owner, priority, escalation, analysis, approvals, actions and immutable case events. Notifications point to objects; approvals belong to case and authorized SME. POD belongs to shipment. Proposed visibility policy: internal notes remain internal; SME receives relevant published summary/evidence, not every investigative note. Rider receives approved task instructions only.

## Normal shipment workflow

### Inbound: supplier to warehouse

Staff opens expected receipt, records actual quantity/condition per SKU and evidence. Deterministic comparison checks discrepancy. Matching receipt -> staff confirmation -> verified receipt event/basic stock quantities. Mismatch/damage -> create/match case, preserve actual observations and require staff-confirmed physical handling/quarantine. SME sees own receipt and case. Proposed inbound labels: Expected, Received, Received with discrepancy; confirm enums. No supplier portal or supplier tracking.

### Outbound: warehouse to SME

1. SME submits minimal delivery request: items/quantities, SME destination and requested date; staff may record dispatch where authorized. Warehouse checks stock/details. Missing information or rejection returns to SME with reason; shortage/wrong pick/damage enters exception workflow.
2. Staff records physical Picking then Packed verification and selects mode. Dispatch remains human-controlled.
3. In-house: Warehouse assigns authorized rider -> rider accepts (unavailable/decline returns for reassignment) -> confirms physical pickup -> explicit delivery-specific GPS consent/device permission -> In Transit event. GPS failure never fabricates movement; permission to proceed without GPS is a policy decision.
4. Rider submits POD/receiver confirmation. Pending upload is not Delivered. Backend checks required evidence; incomplete/disputed proof -> Warehouse review. SME may confirm receipt from own shipment. Verified outcome -> Delivered -> terminate tracking/revoke live access. Related cases close only after their own verified resolution.
5. Third-party: verified handover and external-reference flow below; no rider assignment or consent step.

Design-system outbound vocabulary: Requested -> Picking -> Packed -> Assigned -> Picked Up -> In Transit -> Delivered. Assigned applies to in-house only. Third-party uses verified Handed over instead of rider assignment/pickup; attribute transit state to handover/verified report, not courier telemetry. Failure -> Delivery Attempt Failed -> Rescheduled -> In Transit. Permitted cancellation terminates tracking and blocks later task actions. Confirm mode-specific enums separately.

## AI exception investigation and resolution

1. Trigger from receipt discrepancy/damage, warehouse observation, rider failure, staff courier delay/loss/damage report, or passed expected date. P0 supports manual delay report; automated SLA worker is P1.
2. Backend validates and creates/matches active case by shipment/stage/issue type. Duplicate reports append evidence/events rather than a second case.
3. Open -> AI Investigating: tenant-scoped retrieval supplies facts/policy/evidence. Structured output: type, priority, summary, evidence IDs, recommended action, human requirement and missing information.
4. Deterministic policy/structure validation rejects unsupported evidence and unauthorized/unknown actions. Timeout/failure/insufficient data leaves Retry analysis/manual investigation on Warehouse case. Never invent fallback findings.
5. Permitted backend actions publish summary, non-financial workflow status, in-app SME notification or information/approval request. Show proposed analysis separately from verified facts and executed actions.
6. Needs SME: notification -> own case -> proposal/consequences/evidence -> decision. Example 100 expected/90 received: `accept_partial` or `await_remainder`. Other proposals support approve/reject and note. Rejection/clarification returns to human review or revised proposal. Validate proposal version and prevent duplicate/conflicting decisions.
7. Needs Warehouse: staff confirms recount, repick, quarantine, correction or physical execution. Approval alone never changes stock. Stock edits, replacement, financial promises, dispatch and completion are human-controlled.
8. Needs Courier: staff contacts courier outside ParcelCare, records verified response/source/time and publishes SME update. Show Awaiting courier confirmation and unknown ETA until evidence exists. No courier dashboard.
9. Action Scheduled -> physical execution -> outcome/evidence verification -> Resolved -> Warehouse confirms Closed. Failed execution, missing evidence or dispute remains in review. Proposed staff-authorized reopen appends audit events rather than overwriting history; confirm policy.

Stages: Open, AI Investigating, Awaiting SME / Human Review, Action Scheduled, Resolved, Closed. Priority: Critical/High/Normal/Low. Escalation independently: AI Handling/Needs SME/Needs Warehouse/Needs Courier. Owner identifies accountable staff. A Critical case may await SME; case closure does not imply shipment delivery.

Shop-closed path: rider reports `recipient_unavailable` with evidence -> create/match case -> AI requests SME preferred retry time -> SME proposes -> pending reschedule -> Warehouse/rider confirms actual capacity -> approved instruction on rider task -> retry -> verified POD -> Delivered/tracking ends -> related case verified/resolved/closed. Rescheduling never silently restarts GPS.

## In-house GPS visible to Warehouse and SME

Warehouse Overview preview, Deliveries map and shipment Delivery section share the same scoped active-session data. SME Overview links to own shipment map; no all-rider SME map or public tracking page.

Assignment -> pickup -> rider consent -> browser permission -> server validates active session -> bounded timestamped updates -> authorized Warehouse and associated SME broadcast. Show coordinate-recorded time, freshness and delivery status separately; delayed receipt of an old fix cannot make it Live. Audit location access. No guaranteed ETA, routing or unrelated SME stops/trails.

- **Updating:** active permission/session but waiting for usable fix; do not claim Live prematurely.
- **Live:** recent valid coordinate within agreed freshness threshold; last updated visible.
- **Stale:** threshold exceeded; any authorized retained marker says last known.
- **Offline:** current position unavailable due to connection/device; timestamp remains explicit.
- **Permission Denied:** rider sees recovery instructions; viewers see unavailable, no fabricated marker.
- **Ended:** stop, completion, cancellation, reassignment/revocation or session expiry ends live subscription/access. Shipment events remain; historical coordinates follow separate limited retention/access policy.

Stop sharing is always reachable while active. Restart needs rider action, permission validation and applicable consent. Browser lock/background pauses may produce Stale/Unavailable, never a continuous-tracking promise. Every simulated map must say Simulated. Interval, freshness, accuracy, retention and expiry values are unresolved policy decisions, not invented requirements.

## Third-party handover and external tracking

1. Warehouse shipment Delivery section records company, waybill, optional HTTPS tracking URL, expected date, package count/condition, packing and handover evidence.
2. Staff verifies actual courier acceptance/time/evidence. Incomplete form does not prove custody transfer; remain Packed / Awaiting handover until accepted.
3. Warehouse/associated SME see handover facts, attributed status, last verified time and Open courier tracking. Link opens labeled external courier website; validate permitted HTTPS destination and never append ParcelCare credentials. Missing/invalid link shows reference and ask-warehouse guidance.
4. Opening external tracking does not update internal status. Staff records verified external responses with provenance; SME may confirm receipt. A waybill/URL alone never establishes Delivered.
5. Delay/loss/damage -> existing case flow. Start responsibility UNDETERMINED; supporting handover evidence may add `suspected_carrier_custody`. Review packing/handover/SME evidence and courier statement. Verified carrier-caused transit issue can be recorded operationally THIRD_PARTY_COURIER and claim coordinated outside the app. Packaging/pre-handover concerns remain under Warehouse review. AI cannot make final legal findings or promise compensation.
6. Warehouse remains coordination point as applicable. Record verified claim outcome before closure. No courier login, map, GPS, API/webhook feed or route management in P0.

## Shared experience rules

Loading, empty, unavailable, permission-denied, offline, validation, upload failure and retry states offer contextual recovery. Offline rider submissions remain visibly unsent until server acknowledgement; draft POD cannot advance status. Revalidate permissions/current state on mutations; conflicts refresh rather than duplicate actions.

Evidence shows actor/source/time/verification. Case audit history is immutable with role-scoped projection. Confirmation dialogs explain consequential/destructive/financial actions and approvals. In-app notifications only. Keep shipment, case, tracking, priority, escalation and responsibility labels distinct.

Follow supplied brand, Inter/Noto Sans Myanmar, accessible dark-teal actions, restrained yellow AI accent and text/icon status labels. Keyboard-accessible tables/dialogs, map text alternatives and rider targets at least 44px. No new logo or frontend is implemented by this document.

## Assumptions and ambiguities for review

- **A1 Scope precedence:** PRD P0 overrides broader design-system IA. Defer SME Accounts, Settings, ledger/history and standalone SME Requests/Deliveries. Confirm consolidation.
- **A2 Staff/Admin:** shared shell; confirm action rights for assignment, internal approval, operational responsibility and close/reopen. No admin-management pages committed.
- **A3 Requests:** PRD scenario C/design checklist imply minimal dispatch request, but create-request endpoint, destination fields and rejection model are absent from contracts. Embedded request is a proposal requiring schema/API agreement, not purchasing/replenishment scope.
- **A4 Auth:** invited/seeded membership assumed. Confirm provider, recovery/invitation, multi-role/membership and conditional selector.
- **A5 States:** confirm inbound labels, third-party Handed over mapping, rejection/cancellation and authority to set In Transit/Delivered.
- **A6 Verification:** confirm POD/receiver confirmation requirements and verifier; SME confirmation sufficiency remains undecided. Never auto-complete from unverified upload.
- **A7 GPS:** confirm interval/freshness/accuracy/retention/expiry, logout/reassignment revocation and whether dispatch can proceed without GPS. Foreground or labeled simulation for P0.
- **A8 Privacy:** confirm SME-visible rider contacts, evidence and published AI summaries versus internal notes. Riders receive minimum assigned-task data.
- **A9 Inventory-only cases:** PRD includes damaged/missing stock but case model/API assumes shipment. Until contract clarified require relevant shipment/SKU, never fabricate linkage. Future stock-only cases can reuse case detail.
- **A10 Courier:** staff-verification/SME-confirmation assumption; confirm claim outcome evidence and operational responsibility authority under business agreement. No integration assumed.
- **A11 Retry:** SME time remains pending until Warehouse/rider capacity confirmed; confirm offline instruction acknowledgement. No scheduler or optimizer module.
- **A12 Stock:** use PRD available/quarantined counts/reference events. Design-system reserved/damaged fields/movement history need later model agreement.
- **A13 Ownership:** PRD requires ownership but minimal schema lacks owner; confirm field and whether escalation permits simultaneous needs. IA assumes accountable Warehouse owner and one next-action escalation.
- **A14 SME issue intake:** scenario D implies SME damage report; proposed shipment issue form needs explicit API permissions and evidence visibility agreement.

## Review acceptance checks

- Every route, attachment and live subscription rechecks tenant/assignment; unrelated SMEs cannot read case evidence or GPS.
- Normal inbound and both outbound paths complete without customer UI or full WMS.
- 90/100 creates one case, correctly shows ten-unit gap, persists SME decision and requires physical verification before closure.
- AI failure, SME rejection and missing evidence preserve human review paths.
- Consented GPS updates reach two authorized viewers with timestamps; stop/delivery/cancel revokes access; stale/offline never appears Live.
- Retry needs capacity confirmation and external courier never displays internal GPS or invented ETA.
- AI prose cannot authorize stock edits, dispatch, compensation or delivery completion.
- Routes and embedded surfaces agree with sitemap and inventory; all proposed ambiguities remain visible for review.
