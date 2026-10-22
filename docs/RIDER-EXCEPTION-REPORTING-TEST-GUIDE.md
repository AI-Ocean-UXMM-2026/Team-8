# Live Rider Exception Reporting — Implementation and Test Guide

Scope: remaining-work item 8 only. Separate AI checker, stock categorization, SLA and risk ranking remain outside this change.

## Behavior and rules

- An authenticated, active rider with an active membership may report an accepted, active assignment for an in-house outbound shipment.
- The four supported issues are recipient unavailable, delivery failed, damage in transit and delivery delayed.
- A trimmed description of 1–2,000 characters is required. Evidence is optional; every supplied reference must belong to the same shipment, be accessible to the rider and have a stored uploaded object. Maximum 100 references per request.
- Reports always use the outbound stage. Riders cannot choose priority, responsibility, case state, SME, warehouse or reporter identity.
- A report creates or matches the unresolved case for shipment + outbound stage + issue type. New observations append events without overwriting the original summary.
- Events identify the rider and assignment. Audit and outbox entries commit in the same transaction.
- Reporting never changes shipment status, inventory, approval, responsibility or delivery completion.
- Riders receive only a case acknowledgement, not general case/manager access. Staff and the owning SME use their existing case visibility.
- An idempotency key makes the exact same submission replay once. Reusing the key with changed content is rejected. Authorization is checked before replay. A pending uncertain submission must be retried with its saved key.
- New reports are blocked for unaccepted, completed, cancelled, reassigned, inactive or unauthorized assignments. Same-key replay is allowed only while the rider still has a current active assignment; it returns the original acknowledgement without a new event.
- Priority still follows the existing default. Automatic classification is a separate remaining-work item.

## Deployment prerequisites

1. Apply `supabase/migrations/20261022006100_be1_rider_exception_reporting.sql` to the verified ParcelCare Supabase project. It adds a narrow `rider_report` RPC; it does not broaden general case permissions.
2. Deploy the Python API and Next.js frontend from the same commit.
3. Confirm POST `/api/deliveries/{shipment_id}/report` appears in the API contract.
4. Use test accounts and disposable test shipments. Do not alter real customer shipments for testing. Never share passwords or service keys in reports.

## Test accounts and setup

Prepare Rider A, Rider B, Warehouse Staff, owning SME A and unrelated SME B. Assign a prepared in-house outbound test shipment to Rider A. Prepare an additional unaccepted assignment, a cancelled assignment, a completed shipment and a third-party shipment. Use another shipment's evidence for negative testing.

Use separate browser sessions for roles. Record shipment IDs, case IDs, actor role, time, expected/actual results and any correlation ID. Screenshots must not expose credentials or private recipient data.

## Main manual journey

1. Sign in as Rider A at `/courier` and open the assigned delivery.
2. Accept the assignment if needed. Report delivery issue becomes available.
3. Optionally upload a JPEG, PNG or PDF through Upload evidence, then select its recorded reference.
4. Choose an issue, write a description and tick the confirmation checkbox.
5. Select Review issue report, inspect the confirmation and select Confirm action.
6. Confirm the success message includes a case UUID. Shipment status must remain unchanged.
7. Sign in as Warehouse Staff. Open Open cases, find the shipment/issue and inspect the rider report in its timeline.
8. Sign in as SME A and inspect the related case. SME B must not see it.
9. Repeat the rider reporting journey from `/rider/shipments/<shipment UUID>`. This form uses a browser confirmation instead of the Courier dialog and must produce the same backend result.

## Functional cases

### F01 — Accepted assignment
Submit a valid report from Rider A. Expected: HTTP 201, case acknowledgement, one rider event, one audit entry and one outbox event.

### F02 — Four issue types
Submit each supported type on an eligible test shipment. Expected: four independently classified outbound cases; no unsupported category.

### F03 — Missing description
Submit blank or whitespace-only text. Expected: no successful submission, no case/event created. Whitespace-only is rejected by SQL even if browser validation accepts spaces.

### F04 — Length boundary
Submit 2,000 characters, then 2,001 through an API test. Expected: first accepted, second rejected; no truncation.

### F05 — Confirmation cancellation
Cancel the review dialog/browser confirmation. Expected: no mutation, draft retained.

### F06 — Optional evidence
Submit without evidence. Expected: accepted; no fabricated evidence or physical verification.

### F07 — Uploaded evidence
Upload valid same-shipment evidence and submit its ID. Expected: ID retained in report event; warehouse can inspect the shipment evidence subject to existing access rules.

### F08 — Invalid evidence
Use another shipment's evidence, a missing object, an unknown UUID or over 100 IDs. Expected: rejected without partial case/event writes.

### F09 — Create-or-match
Submit the same issue for the same unresolved shipment with a fresh key and different observation. Expected: same case ID, an additional rider event, original summary retained.

### F10 — Existing resolved case
On disposable fixtures, resolve/close the old case using the authorized workflow, then report the same issue on a still-eligible shipment. Expected: new active case; old case remains unchanged.

### F11 — Double-click / exact retry
Repeat the identical request with the same key. Expected: identical acknowledgement and no duplicate event/outbox entry.

### F12 — Changed retry payload
Reuse the key with different text/type/evidence. Expected: idempotency conflict and no additional writes.

### F13 — Uncertain network result
Interrupt the response after submission in a controlled test. Expected: UI says outcome unconfirmed; retry uses saved payload/key; no false success or new-key duplicate. Refresh and retry the original request.

### F14 — No delivery side effects
Compare shipment status, version, quantities, proofs and approvals before/after reporting. Expected: report does not mutate physical delivery or stock state.

## Authorization cases

### A01 — Signed out
Call the endpoint without a token. Expected: 401 before database mutation.

### A02 — Another rider
Rider B reports Rider A's shipment. Expected: 403; no writes.

### A03 — Unaccepted assignment
Rider A reports before accepting. Expected: UI disabled/hidden; forged direct request rejected.

### A04 — Cancelled / reassigned / completed
Try each in isolation. Expected: former rider cannot submit or replay after losing active assignment.

### A05 — Inactive membership or rider
Deactivate the test rider membership/record. Expected: access rejected even with an existing token.

### A06 — Terminal / third-party / inbound
Attempt new reports for delivered, cancelled, third-party or inbound shipments. Expected: rejected; no new cases.

### A07 — Forged fields
Send stage, priority, SME, warehouse or actor fields in the request. Expected: API rejects extra fields. Forged role headers do not grant authority.

### A08 — Manager operations
Rider attempts case read, close, priority/owner change, approval or generic case commands. Expected: existing authorization denies access; report privilege grants none of these.

### A09 — Warehouse and SME visibility
Warehouse staff and owning SME can inspect the report through existing case access. Unrelated SME cannot. Rider acknowledgement exposes no approvals, analyses or other case internals.

## UI and accessibility cases

### U01 — Both entry points
Test `/courier` and `/rider/shipments/<id>`. Expected: equivalent reporting eligibility, issue types, validation and acknowledgement.

### U02 — Keyboard and screen reader
Use Tab, Shift+Tab, Enter and Escape. Expected: labeled controls, visible focus, accessible error/status messages and confirmation cancellation. Verify dialog focus behavior manually.

### U03 — Responsive and language
Test 390px mobile, 768px tablet and 1440px desktop in English and Myanmar. Expected: readable labels, no horizontal form overflow, usable touch targets, preserved draft and logic.

### U04 — Stale eligibility
Open the form, then cancel/reassign/complete the shipment in another session. Submit the old form. Expected: server rejects; UI never claims success. Refresh shows current assignment state.

## Automated checks

Run from the Team-8 root:

```sh
npm run test:database
npm run test:backend
npm run test:frontend
npm run test:contracts
npm run check:migrations
npm run build
npm run typecheck
```

Database regression coverage includes accepted-assignment enforcement, staff/unrelated-SME denial, create-or-match, exact replay, payload conflict, invalid issue/note/evidence, rider event attribution, owning-SME visibility, valid uploaded evidence, supported types, terminal assignment denial and unchanged shipment state. API tests cover auth, request validation, narrow RPC forwarding and database authorization errors. Frontend tests cover command routing, acknowledgement validation and matching/retry behavior.

Automated database tests use local PGlite fixtures. They do not prove production migration application or live-browser success. Mark manual cases PASS only after executing them; mark unrun cases NOT RUN and record the blocker.

## Release acceptance

Release is complete only when the migration and matching application commit are deployed, a real test rider submits successfully from both entry points, Warehouse sees the case/event, the owning SME can inspect it, unrelated access is denied, and uncertain-retry behavior has been checked. Demo success alone is insufficient.
