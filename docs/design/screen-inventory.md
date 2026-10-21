# ParcelCare screen inventory

Proposed P0 IA | 2026-10-21. [Parent specification](information-architecture.md). IDs match `sitemap.mmd`. Routes describe future design, not implemented frontend. Embedded forms/panels do not create additional pages.

## Shared pages

- **A01 Login — `/login`:** authenticate invited/seeded users and redirect using validated membership; includes expired-session and sign-in error states.
- **A02 Workspace selection — `/select-workspace` (conditional):** choose among existing authorized roles/memberships. Omit for single-role accounts; confirm before build.
- `/` is a redirect resolver, not a content page. Access denied, object unavailable/not found and disabled membership are shared recovery states. Authentication callbacks are infrastructure. Recovery/invitation pages depend on authentication-method decision.

## Warehouse Staff / Admin

- **W01 Overview — `/warehouse`:** stock/shipment KPIs, urgent cases, AI workload and active in-house map preview; drill into filtered lists.
- **W02 Shipments — `/warehouse/shipments`:** inbound/outbound list filtered by SME, mode, status and date; entry to operational records.
- **W03 Shipment detail — `/warehouse/shipments/[id]`:** items, receipt/dispatch events, pick/pack verification, assignment or handover, tracking/POD and linked cases. Canonical detail from Deliveries too.
- **W04 Inventory — `/warehouse/inventory`:** SME/SKU available/quarantined counts, basic event references and linked cases; embedded SKU detail.
- **W05 Exceptions — `/warehouse/exceptions`:** prioritized queue with owner, escalation, priority and stage filters.
- **W06 Exception detail — `/warehouse/exceptions/[id]`:** evidence-grounded AI findings, missing information, ownership, decisions, permitted actions, verification and audited resolution/closure.
- **W07 Deliveries — `/warehouse/deliveries`:** outbound operational projection: in-house assignments/map and third-party handover records. Detail opens W03.

## SME Business User

- **S01 Overview — `/sme`:** own stock, current shipments, open cases and decisions requiring attention; link to own active delivery.
- **S02 Inventory — `/sme/inventory`:** owned read-only SKU counts and reference events; start delivery request.
- **S03 Shipments — `/sme/shipments`:** own inbound/outbound/requested shipments and delivery filters; New delivery request entry.
- **S04 Shipment detail — `/sme/shipments/[id]`:** own items, destination, events, POD/receipt confirmation and linked cases; active consented in-house map or external courier reference/link.
- **S05 Exceptions — `/sme/exceptions`:** own case feed including Needs your decision.
- **S06 Exception detail — `/sme/exceptions/[id]`:** relevant evidence/analysis/timeline; supply information, accept partial/await remainder, approve/reject permitted proposals and propose retry time.

## In-house Rider

- **R01 My Deliveries — `/rider`:** assigned Active/Upcoming/Completed tasks, Resume active delivery, accept or report unavailable for reassignment.
- **R02 Delivery detail — `/rider/deliveries/[id]`:** assigned destination/contact/item summary/instructions, pickup/start/status, explicit GPS controls, issue reporting and POD; upcoming/active/completed states.

Total: **16 unconditional routed pages plus one conditional selector** (17 if enabled). Role homes are included; redirect resolver and shared states are not counted as pages.

## Required embedded workflow surfaces

- **E01 SKU panel — W04/S02:** basic quantities, source events and links; SME read-only.
- **E02 Record receipt — W03 inbound:** expected/received quantity, condition and evidence; trigger deterministic discrepancy checks.
- **E03 Pick/pack/dispatch confirmation — W03 outbound:** human-verified preparation and mode selection; no WMS module.
- **E04 Assign rider — W03 in-house:** authorized employed rider, acceptance/unavailability and reassignment.
- **E05 Courier handover — W03 third-party:** company/reference/optional HTTPS link, expected date, package count/condition, acceptance time and evidence; draft versus verified acceptance.
- **E06 Map and tracking status — W01/W07/W03/S04:** active authorized in-house position, freshness/accuracy and required GPS states. S01 links to S04. No third-party map.
- **E07 Report issue — W03/R02; proposed SME intake on S04:** type, notes, SKU/shipment context, evidence and observed time; create/match case.
- **E08 Investigation/actions — W06:** AI evidence references, missing information, retry/manual fallback, owner/priority/escalation and policy-checked actions.
- **E09 SME decision/information form — S06:** current proposal, consequences, notes/evidence and explicit decision or retry-time proposal; revalidate pending version.
- **E10 Verify resolution/close — W06:** actual outcome/evidence, physical confirmation and audited resolve/close; reopen only under agreed policy.
- **E11 New delivery request — S03, launched from S01/S02:** items/quantity/destination/date for Warehouse validation; proposed API/schema required. Saved request links to S04.
- **E12 GPS consent/permission — R02:** delivery-specific opt-in, permission recovery, start/stop; stop always reachable while sharing.
- **E13 POD submission/review — R02 submit/W03 verify/S04 confirm receipt:** receiver confirmation and policy-required evidence. Unverified upload never means Delivered.
- **E14 Notifications drawer — Warehouse/SME shell:** in-app messages/pending-decision links, reauthorized on opening.
- **E15 Timeline/evidence viewer — W03/W06/S04/S06/R02 as authorized:** actor/source/time/verification and role-scoped attachments.
- **E16 Retry capacity confirmation — W06, reflected on W03/R02:** review SME time and confirm Warehouse/rider capacity before approved instruction.
- **E17 Identity/sign out — all shells:** account/workspace context and sign out; revoke active tracking session.

## Cross-cutting states

Loading, empty/filter-no-results, validation, access denied/unavailable, network/offline, upload failure, unsent submission, conflicting/duplicate action, AI unavailable, missing tracking URL, pending/rejected POD and ended GPS offer recovery inside their parent page. Drafts do not appear saved/approved/delivered.

## Deferred/excluded pages

No SME Accounts, policy Settings, standalone Approvals, stock ledger, reports, optimizer, chatbot, supplier/customer portal, public tracking, third-party courier login/dashboard/GPS. Separate SME Requests/Deliveries are consolidated into S03/S04. Authentication invitation/recovery needs a provider decision rather than unrequested page commitments.
