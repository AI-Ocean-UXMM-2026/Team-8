# ParcelCare — Standard Product Requirements Document

Source: [ParcelCare_Standard_PRD.docx](ParcelCare_Standard_PRD.docx). This Markdown copy replaces the previous PRD and is generated from the supplied Word document. Requirements describe intended scope, not proof of implementation.

# 1. Product overview

ParcelCare is an AI-first exception resolution workspace for third-party logistics (3PL) warehouses serving SMEs. It helps warehouses identify shipment or inventory exceptions, investigate them using available evidence, coordinate required SME decisions, and track verified resolution. It is not a full warehouse management system (WMS).

# 2. Problem statement

Warehouse teams currently resolve quantity discrepancies, damaged or missing goods, picking errors, and delivery failures through disconnected messages and manual checks. This causes slow triage, unclear ownership, inconsistent SME updates, and repeated staff effort.

# 3. Goals and success measures

- Reduce median time from exception report to first actionable response.

- Increase the share of cases resolved without manual office investigation, while preserving required approvals and physical checks.

- Give each SME timely, accurate visibility into its own cases and decisions.

- Maintain traceable evidence and verified case closure.

MVP measurement: track time to triage, time to resolution, percentage of cases safely auto-advanced, and percentage of cases with complete evidence. Targets require pilot baselines and are not yet validated.

# 4. Users and permissions

| Role | Primary needs |
|----|----|
| Warehouse owner / staff | See warehouse-wide exceptions; verify physical facts; handle escalations; manage delivery assignments. |
| SME representative | See only own inventory/shipment context; receive updates; approve or reject proposed outcomes. |
| In-house rider | See assigned deliveries; report delivery status and exceptions; provide proof of delivery. |

Third-party couriers are external partners, not ParcelCare users in the MVP. End customers have no interface. SME access must be isolated by organization.

# 5. MVP scope

## In scope

- Warehouse exception queue, case details, evidence, timeline and status.

- SME shipment/stock context, case visibility, notifications and approval decisions.

- Rider mobile workflow for assigned in-house deliveries, exception reporting and proof of delivery.

- Inbound quantity/damage exceptions, warehouse handling exceptions, and outbound delivery delay/failure.

- Create-or-match cases by shipment and issue; priority classification and independent escalation flag.

- Evidence-grounded AI investigation and safe policy-authorized workflow actions.

- Third-party courier handover details and external tracking reference.

- Consent-based active-delivery rider location sharing, with last-updated/stale indication, as an MVP feature subject to feasibility.

- AI maker–checker: a primary AI investigates and proposes actions; a separate AI checker independently reviews evidence, classification, priority, and proposed actions before eligible execution. Failed checks block execution and route the case for review.

- AI-assisted stock categorization using product metadata and case description (e.g., perishable vs non-perishable food); uncertain or missing product attributes are flagged for verification.

- Risk-based queue ranking using exception category, case description, perishability, order value, operational impact, and time remaining before SLA breach. Warehouse staff can sort and filter by priority and SLA risk.

- Standard configurable SLA policies for first response and resolution by case type and priority, including deadline tracking, at-risk/overdue flags, and escalation.

## Out of scope

End-customer portal, full WMS/ERP, route optimization, guaranteed ETA, external courier GPS, autonomous physical stock edits, financial compensation, supplier portal, and production-grade integrations.

# 6. Core user journeys

## A. Inbound discrepancy

Warehouse staff records expected and received quantity. A mismatch opens or matches a case. AI analyzes the recorded discrepancy, drafts an explanation and requests an SME decision if policy requires it. The SME accepts partial receipt or waits for remaining goods. Staff verifies physical handling; the case closes only after the outcome is recorded.

## B. In-house delivery failure

Staff assigns a rider; the rider confirms pickup and may start consented location sharing. The rider reports recipient unavailable. ParcelCare opens/matches a case, AI summarizes verified events and requests a preferred retry window. Staff confirms capacity before a reschedule becomes final. Delivery is completed only with appropriate proof.

## C. External courier delay

Warehouse records courier handover and tracking reference. A reported or detected delay opens/matches a case. AI summarizes available facts and updates the SME without inventing an ETA. Staff verifies any courier response; closure requires a recorded outcome.

# 7. Functional requirements

| ID | Requirement | Priority |
|----|----|----|
| FR-01 | Authorized users can view shipment, inventory context and exceptions within their organization scope. | Must |
| FR-02 | Staff or riders can report exceptions; receiving mismatches can trigger a case automatically. | Must |
| FR-03 | System matches an active case for the same shipment and issue before creating another. | Must |
| FR-04 | Each case records type, priority, escalation status, evidence, owner, status and timeline. | Must |
| FR-05 | AI uses authorized records to summarize facts, identify missing evidence and propose permitted actions. | Must |
| FR-06 | Policy layer may auto-create in-app updates, approval requests and internal workflow changes. | Must |
| FR-07 | Actions requiring physical verification, external commitments or SME approval cannot be finalized by AI alone. | Must |
| FR-08 | SMEs can approve/reject requests and view updates only for their own cases. | Must |
| FR-09 | Riders can update assigned delivery status, report exceptions and submit delivery proof. | Must |
| FR-10 | Warehouse can record third-party courier handover and tracking reference. | Must |
| FR-11 | Authorized warehouse and relevant SME can see consented, active in-house rider location with freshness status. | Should |
| FR-12 | Cases close only after required verification and a recorded resolution. | Must |
| FR-13 | Primary AI proposes case classification, evidence-based investigation and actions; an independent checker AI validates them before any eligible automated action. | Must |
| FR-14 | System derives stock perishability from trusted product attributes and AI-assisted text classification; unknown categories require confirmation. | Must |
| FR-15 | Priority ranking combines case severity, perishability, order value, impact and SLA risk under configurable deterministic rules; AI provides recommendations, not unrestricted priority overrides. | Must |
| FR-16 | Warehouse queue supports priority/SLA sorting and displays rationale, response deadline, resolution deadline and breach risk. | Must |
| FR-17 | Configurable SLA policy assigns response and resolution targets per priority/case type; system records breaches and escalates overdue cases. | Must |

# 8. AI behavior and human escalation

AI is the default investigator, not the final authority for unverified facts. On a new case, deterministic validation and duplicate checks run first; AI then analyzes tenant-scoped evidence and recommends an action. The backend independently checks authorization and business policy before executing any safe action.

Maker–checker sequence: AI maker generates structured recommendation → independent AI checker reviews it against evidence and policy → deterministic backend validates allowed actions → execute only low-risk authorized actions. Checker disagreement, uncertainty or missing evidence blocks execution and escalates to staff. Two AI opinions alone never authorize stock edits, financial commitments or physical completion.

Escalate when evidence is insufficient, an action needs physical handling or human approval, a courier claim is disputed, or the requested action is not authorized. Urgency/priority and need for human escalation are separate dimensions. AI must not invent stock counts, delivery events, ETAs, GPS positions or legal responsibility.

# 9. Non-functional requirements

- Security: role-based authorization and SME data isolation for every view and action.

- Reliability: idempotent case creation and durable event/audit history.

- Privacy: rider GPS requires explicit consent and ends when the active session stops; do not expose it to unrelated SMEs.

- Transparency: show evidence sources, current status and whether an action is proposed, pending or verified.

- Usability: mobile-friendly rider workflow; clear empty, loading and error states.

# 10. Acceptance criteria

- Recording 90 received against 100 expected creates exactly one quantity-mismatch case showing a 10-unit discrepancy.

- AI analysis references the actual recorded evidence; a missing fact is identified as unknown.

- The correct SME can view and decide its request; another SME cannot view it.

- A permitted automated notification appears in the case timeline; a physical stock correction requires human confirmation.

- An in-house rider exception appears in the warehouse queue; delivery cannot be marked complete without required proof.

- External courier shipment shows a tracking reference, not a fabricated ParcelCare live location.

- A case cannot be closed until its required resolution checks are satisfied.

- A perishable, time-sensitive case ranks above a less urgent case when policy thresholds require it; order value influences but does not solely determine priority.

- A checker rejection prevents an automated action and creates a visible escalation with rationale.

- Every new case receives the correct SLA deadlines; at-risk and overdue cases are visibly flagged and escalated according to policy.
