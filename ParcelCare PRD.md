# ParcelCare — Lean B2B Product Requirements Document

**Version:** 4.0 | **Date:** 2026-10-21 | **Status:** Revised product scope + 1-day buildathon implementation priorities + post-demo hypotheses

> **Positioning:** ParcelCare is an AI-assisted warehouse and logistics exception resolution workspace for 3PL warehouses serving SMEs. It makes basic inventory/shipment status visible, investigates operational issues, coordinates SME approvals, and records verified resolutions. **No end-customer interface.**

## 1. Executive summary

**Buyer:** 3PL warehouse operator. **System users:** warehouse owner/staff, SME employees, and warehouse-employed riders (restricted mobile interface). **Courier models:** (1) in-house riders with ParcelCare GPS and delivery events; (2) third-party courier companies with handover records and external tracking links, no ParcelCare courier GPS. **End customer:** out of scope. ParcelCare is **not** a replacement for a full WMS, courier fleet app, or ERP.

**Problem:** Supplier-to-warehouse delays/damage, receiving quantity mismatches, missing/damaged stock, wrong picks and warehouse-to-SME delivery failures generate manual investigation, back-and-forth messages, delayed SME updates, and repeated approvals.

**Solution:** Record a problem once; deterministic rules detect discrepancies; OpenAI helps classify and investigate from recorded data; a backend policy layer executes safe internal actions, creates SME notifications and approval requests; warehouse staff handles physical verification and exceptions that need a human.

**North-star outcome:** Verified minutes of warehouse staff work avoided per exception, without sacrificing inventory accuracy or SME trust.

## 2. Scope decisions

### Must build for one-day demo (P0)
1. Warehouse dashboard with stock and shipment summary, exception queue, and case details.
2. SME dashboard limited to its own shipments, stock overview, exception timeline and approval decision.
3. Minimal inventory references: SKU, SME, expected/received quantity, available/quarantined status; manual receiving/dispatch events.
4. Inbound receipt discrepancy/damage and outbound courier delay/failure reported by warehouse staff.
5. Case creation or matching, evidence, case timeline, priority and ownership.
6. Actual OpenAI structured triage/investigation grounded in seeded Supabase records.
7. Policy-checked actions: create SME notification, request information/approval, record a proposed correction, escalate to staff.
8. Case progression and verified closure; basic audit records.
9. In-house rider mini interface: assigned delivery, pickup/start, location sharing with permission, report exception, delivery confirmation/POD.
10. Warehouse and SME live delivery map for active in-house rider shipments, with stale-location indication.
11. Third-party courier handover evidence and external tracking reference (no internal live map).
12. Demo data: one warehouse, five SMEs, 10–20 shipments, 2–3 cases.

### Explicitly exclude from one-day demo
- Route optimization, turn-by-turn navigation, automatic ETA guarantees, third-party courier GPS/API/webhooks, SMS/WhatsApp/email delivery, end-customer tracking/portal, supplier portal, advanced forecasting, billing, full WMS, autonomous inventory edits, production-grade reporting, full historical migration.
- Do **not** remove authorization boundaries in a publicly accessible demo. Use seeded fictitious data and test SME isolation. If secure isolation cannot be implemented in time, use a controlled local demo rather than exposing multi-tenant data publicly.

### Post-demo (P1/P2)
P1: durable stock movement ledger, hardened authentication/RLS, GPS session resilience/background mobile tracking assessment, notification provider, richer SME policies, SLA worker, ROI analytics. Optional third-party courier integrations only if commercial access and permissions permit. P2: integrations with existing WMS/ERP, advanced forecasting, multi-warehouse, courier data adapters. Future roadmap is not a demo commitment.

## 3. Operating model and exception types

**Inbound:** Supplier → Warehouse. Staff records expected vs actual receipt and condition; mismatch/damage creates exception. AI summarizes evidence, identifies impacted SME/SKUs, requests clarification/approval; staff verifies physical stock.

**Inside warehouse:** Missing inventory, storage damage, wrong SKU picked, short pick. Staff reports verified observation; AI retrieves shipment and stock references, recommends recount/quarantine/repick; staff performs physical actions.

**Outbound:** Warehouse → SME using either **in-house rider** or **third-party courier**. For in-house delivery, warehouse assigns rider; rider confirms pickup and starts a consented GPS session; warehouse and the correct SME view live location with last-updated timestamp; rider reports exceptions and captures proof of delivery. For third-party delivery, staff records courier company, waybill, external tracking URL, verified handover timestamp and evidence. ParcelCare does not track external rider GPS. Transport loss/damage reported after verified handover is initially attributed to the third-party carrier for investigation, subject to packaging/condition evidence, contract and applicable law; do not auto-declare final legal liability.

**Important:** Warehouse-to-SME is the defined outbound destination for this MVP. No customer fulfillment claims.

## 4. User stories and permissions

| User | Needs | Actions |
|---|---|---|
| Warehouse owner/staff | Overview of all SME inventory, in-house delivery location, and unresolved issues | Record receipt, assign rider, view authorized live GPS, record external handover, report exception, review AI analysis, approve internal actions, close verified case |
| SME staff | Visibility of its own goods, live in-house delivery and timely decisions | See own stock/shipments, live map for own active in-house delivery, review evidence, approve/reject requests, confirm delivery |
| In-house rider | Simple mobile workflow for assigned shipments | Accept assignment, confirm pickup, explicitly start/stop location sharing, update delivery status, report exception, upload POD |

SME A must never see SME B records. Owner/staff can see assigned warehouse records. AI must use tenant-scoped read tools. Every action has actor, time and evidence.

## 5. Main user journeys

### Scenario A — inbound quantity mismatch (primary demo)
1. Staff opens expected receipt: 100 units of SKU-01 for SME-A.
2. Staff records actual 90 units; a deterministic rule creates an open `quantity_mismatch` case for missing 10.
3. AI reads expected/received quantities, SKU, shipment events, policy; outputs type, suggested priority, evidence IDs, summary, and `request_sme_decision` action.
4. Backend records an SME notification and an approval request; SME dashboard immediately shows the case.
5. SME chooses `accept_partial` or `await_remainder`; backend records decision and updates the case. Staff confirms any required physical handling before closure.
6. Warehouse dashboard displays timeline and resolution, with saved handling-time estimate clearly labeled as an assumption unless measured.

### Scenario B — outbound external courier delay
1. Staff enters external courier, waybill, tracking URL and promised SME delivery date.
2. Deadline passes or staff marks `delayed`; system creates/matches case.
3. AI summarizes known events, drafts SME update, and suggests asking courier for revised ETA.
4. SME sees `awaiting_courier_confirmation`; no invented ETA. Staff adds verified courier response; AI can draft follow-up and case closes only after verified outcome.

### Scenario C — in-house rider live delivery and shop-closed exception (primary live-delivery demo)
1. SME requests warehouse-to-SME dispatch; warehouse verifies pick/pack and assigns an employed rider.
2. Rider accepts assignment, confirms physical pickup and opts into delivery-specific location sharing. Backend creates a tracking session tied to shipment, rider and authorized warehouse/SME.
3. Rider mobile interface sends timestamped GPS coordinates at a bounded interval while delivery is active and permitted. Backend validates session and broadcasts recent position to warehouse and **only the associated SME**.
4. Both dashboards show rider marker, `last updated`, and status. If device permission, network or foreground execution stops, show `location unavailable/stale` rather than implying continuous real-time location. No guaranteed ETA.
5. Rider finds SME location closed; reports `recipient_unavailable` with timestamp/evidence. Create-or-match case; AI reads authorized shipment events and policy, classifies priority, and requests SME's verified preferred retry time.
6. SME proposes a time. AI can create a pending reschedule; warehouse/rider confirms capacity before committing. Rider receives approved instruction.
7. Rider later delivers, uploads POD and receiver confirmation; backend verifies evidence before setting `delivered` and closing related case. End GPS session and revoke live-view access.

### Scenario D — third-party courier handover and disputed damage
1. Warehouse completes packing checklist and captures parcel condition, package count and handover evidence.
2. Staff records external carrier, waybill, tracking URL and verified courier acceptance; SME can open courier's own tracking page. ParcelCare shows **no internal live GPS**.
3. If SME reports transit damage/loss, create case with `responsible_party=UNDETERMINED` until evidence is reviewed; flag `suspected_carrier_custody` when the handover evidence supports it.
4. AI gathers packing and handover records, courier statement if provided, and SME evidence. Notify SME that claim is being coordinated; do not invent carrier response or promise compensation.
5. For verified in-transit carrier-caused loss/damage, record `responsible_party=THIRD_PARTY_COURIER` operationally and route claim to carrier under the agreed terms. If packaging defects or pre-handover damage are implicated, escalate and do not assume warehouse has zero liability.
6. Warehouse may still act as SME's coordination/contact point under its service agreement, even where carrier bears transport liability.

### Scenario E — warehouse damaged stock (optional stretch)
Staff uploads evidence, AI summarizes affected stock, creates SME decision request; staff physically verifies quarantine/adjustment. AI does not modify stock on its own.

## 6. AI behavior and safeguards

Pipeline: event → deterministic validation/deduplication → tenant-scoped data retrieval → OpenAI structured analysis → deterministic policy check → approved backend action → notification/timeline → human confirmation when needed.

**AI output:** `{exception_type, priority, summary, evidence_ids, recommended_action, requires_human, missing_information}`. Validate with Pydantic; reject unknown action types. Confidence is not a guarantee. No hallucinated courier updates, ETAs, GPS positions, inventory quantities, legal liability findings or SME decisions. AI never starts GPS sharing without rider permission, cannot override location authorization, and cannot declare disputed carrier liability final.

**Automatic P0 actions:** create case summary, update internal non-financial workflow status, create in-app SME notification, request SME approval. **Human-controlled:** stock correction, quarantine confirmation, replacement, financial promise, dispatch, delivery completion. No open-ended AI SQL execution.

Priority (critical/high/normal/low) and escalation (yes/no) are independent. Example: urgent courier delay can receive an immediate automated SME update while staff handles courier contact.

## 7. Interfaces and UI (Next.js + Tailwind + shadcn/ui)

**Warehouse:** `/warehouse` KPI cards (SKUs, inbound, outbound, open cases), SKU inventory table, shipment list, rider assignment, in-house active delivery map, external courier handover records, exception queue; `/warehouse/exceptions/[id]` evidence, AI investigation, status timeline, actions.

**SME:** `/sme` own stock/shipments and exception feed; `/sme/shipments/[id]` live map only when assigned in-house rider has active consented tracking, otherwise external carrier link; `/sme/exceptions/[id]` evidence, current status, approval/reject controls.

**Rider mini interface:** `/rider` mobile-first assigned tasks, pickup, explicit GPS start/stop, status update, exception evidence and POD. **No:** `/customer`, public tracking portal, third-party rider login. External courier links open the courier's website.

Use accessible shadcn/ui Table, Card, Badge, Dialog, Tabs and forms; consistent loading/error/empty states.

## 8. Minimal data model (demo)

- `warehouses(id,name)`
- `smes(id,warehouse_id,name)`
- `products(id,sme_id,sku,name,available_qty,quarantined_qty)` — simplified demo counts, not a full ledger
- `shipments(id,warehouse_id,sme_id,direction,status,expected_at,delivery_mode[in_house|third_party],courier_name,waybill,tracking_url,last_verified_at)`
- `riders(id,warehouse_id,profile_id,active)`; `delivery_assignments(id,shipment_id,rider_id,assigned_at,picked_up_at,completed_at)`
- `tracking_sessions(id,shipment_id,rider_id,status,started_at,ended_at,consent_at,last_location_at)`
- `rider_locations(id,session_id,latitude,longitude,accuracy_m,recorded_at,received_at)` — restrict reads, short retention; never expose other SME locations
- `handover_records(id,shipment_id,courier_name,waybill,accepted_at,package_condition,evidence_ref)`
- `delivery_proofs(id,shipment_id,submitted_by,received_by,evidence_ref,confirmed_at)`
- `shipment_items(id,shipment_id,product_id,expected_qty,received_qty)`
- `shipment_events(id,shipment_id,type,details,source,created_at)`
- `exception_cases(id,shipment_id,type,priority,status,responsible_party[WAREHOUSE|THIRD_PARTY_COURIER|UNDETERMINED],responsibility_basis,summary,created_at,closed_at)`
- `case_events(id,case_id,actor_type,type,payload,created_at)`
- `approvals(id,case_id,sme_id,decision,status,created_at)`
- `notifications(id,sme_id,case_id,message,read_at,created_at)`

For publicly deployed demos add Supabase Auth memberships and RLS; protect SME reads by membership, warehouse staff by warehouse membership. No `service_role` key in frontend. Case updates should be idempotent by `(shipment_id, stage, issue_type, active status)` logic. Stock quantities must never be set by AI-generated text. GPS RLS checks both shipment/SME association and active tracking session. Location history should have limited retention; terminate access on delivery/cancellation.

## 9. API contracts to freeze before parallel coding

| Method | Endpoint | Response / purpose |
|---|---|---|
| GET | `/api/warehouse/overview` | counts, shipments, cases |
| GET | `/api/inventory` | filtered SME SKU records |
| GET | `/api/shipments` | shipment list |
| POST | `/api/deliveries/{shipment_id}/assign` | warehouse assigns authorized in-house rider |
| POST | `/api/deliveries/{shipment_id}/tracking/start` | rider permission + shipment-bound GPS session |
| POST | `/api/deliveries/{shipment_id}/location` | authenticated rider sends timestamped coordinate; rate-limited |
| POST | `/api/deliveries/{shipment_id}/tracking/stop` | stop session and live sharing |
| GET | `/api/deliveries/{shipment_id}/live` | authorized warehouse/SME last coordinate, status, timestamp |
| POST | `/api/deliveries/{shipment_id}/proof` | rider POD + receiver verification |
| POST | `/api/deliveries/{shipment_id}/handover` | external courier evidence and reference |
| POST | `/api/receipts/{shipment_id}` | `{items:[{product_id,received_qty}],notes}`; triggers discrepancy |
| POST | `/api/exceptions` | `{shipment_id,type,description}`; create/match |
| GET | `/api/exceptions/{id}` | case, evidence, timeline, analysis |
| POST | `/api/exceptions/{id}/analyze` | validated AI output, persisted |
| POST | `/api/exceptions/{id}/actions` | allowed action; audit record |
| GET | `/api/sme/overview` | scoped SME stock, shipments, cases |
| POST | `/api/approvals/{id}/decision` | approve/reject + note |
| GET | `/api/notifications` | scoped in-app messages |

Agree on UUIDs, ISO-8601 timestamps, enums and error envelope `{error:{code,message}}` before coding. Frontend uses mock responses matching the contracts until FastAPI is ready.

## 10. Stack and parallel 1-day execution

Next.js + TypeScript + Tailwind CSS + shadcn/ui; Supabase Postgres/Auth; Python FastAPI on Render; OpenAI API. Frontend can deploy on Vercel or Render. For demo use in-app notifications only.

**First 30 minutes:** agree schema, roles, enums, JSON API examples and shared TypeScript types.

**Parallel workstreams:** (A) Warehouse UI + map, (B) SME UI + map, (C) Rider mobile mini interface + GPS permission, (D) Supabase/FastAPI + Realtime/RLS, (E) AI triage/action planner, (F) integration/QA/deploy (combine roles if fewer people). Frontends start with mock API. AI team starts with fixtures. Merge early and freeze feature scope.

**Hours 0.5–4:** build simultaneously with a simulated GPS feed as frontend fallback. **Hours 4–6:** wire scenario A and in-house scenario C; add third-party handover as a small branch. **Hours 6–8:** test SME isolation, GPS consent, stale/offline handling, action safety, deploy and rehearse. Real mobile background GPS and cross-device live updates are significant delivery risks for one day; if not ready, demonstrate clearly labeled simulated movement rather than claiming production GPS works. Prioritize scenario A plus one complete in-house tracking journey.

**Demo pass criteria:** entering 90/100 triggers exactly one case; AI reads correct 10-unit gap; SME sees only its case; approval persists; warehouse timeline updates; case cannot be closed on an unverified claim. In-house live tracking shows only authorized rider/session location to the correct SME, with last-updated time and an exception report; stop ends sharing. External courier view shows tracking link and explicitly unknown internal GPS/ETA.

## 11. Competitor analysis (product positioning, not audited feature parity)

| Competitor | Known focus | ParcelCare opportunity | Risk |
|---|---|---|---|
| **Extensiv** | 3PL WMS, inventory and client workflows | Exception-first SME coordination without replacing full WMS | Incumbent WMS may add similar workflow |
| **ShipHero** | Warehouse operations, fulfillment and shipping | Lightweight focused exception workspace | Deep existing operational coverage |
| **AfterShip** | Post-shipment tracking, alerts and AI-assisted exceptions | Connect inbound/warehouse issues to SME decisions | AI exception handling is not unique |
| **project44** | Enterprise transport visibility and supply-chain data | Small 3PL warehouse operational focus | Better transport data and integrations |
| **ShipBob** | Fulfillment service and merchant tools | Software for independent warehouse operators | Strong merchant experience |
| **Odoo** | ERP, inventory and warehouse modules | Overlay for exceptions rather than replacing ERP | Configurable workflows and broad ecosystem |

**Claim carefully:** ParcelCare's *proposed* differentiation is **one focused warehouse-to-SME exception workflow from detection to authorized action and evidence-backed closure**. Do not claim competitors lack AI, approvals, or warehouse features without validated feature-by-feature research. Alternative today: spreadsheets + phone/Viber/WhatsApp + courier portal + existing WMS.

Official vendor sites for follow-up validation: https://www.extensiv.com/ · https://www.shiphero.com/ · https://www.aftership.com/ · https://www.project44.com/ · https://www.shipbob.com/ · https://www.odoo.com/

## 12. Go-to-market and projected adoption (assumptions, NOT actual market data)

**Counting convention:** A **paying customer** is one warehouse company/account; a **seat** is one active warehouse or SME employee; **SME organizations served** are client businesses inside warehouse accounts, not independent paying subscribers. This avoids inflating customer counts.

**Base-case assumptions:** founder-led sales in a small local market; 5 SMEs per warehouse; ~2 warehouse staff + ~1 SME user per SME = **7 core seats per warehouse**, **excluding in-house rider accounts**; $39/warehouse/month introductory subscription (hypothetical price, not validated willingness to pay); 300 exceptions/warehouse/month (illustrative workload). New warehouses onboard gradually; no churn in the simplified projection (optimistic). All counts below are targets, not forecasts supported by customer research.

| Time after launch | Paying warehouses | SME orgs served | Active seats (estimate) | MRR at $39/warehouse | Monthly exception volume |
|---|---:|---:|---:|---:|---:|
| Launch demo | 0 | 0 | 0 | $0 | 0 |
| Month 3 | 3 | 15 | 21 | $117 | 900 |
| Month 6 | 8 | 40 | 56 | $312 | 2,400 |
| Month 12 | 20 | 100 | 140 | $780 | 6,000 |

**Rider-seat note:** The 21/56/140 seat projections below count only warehouse and SME core seats, preserving comparability with v3. If a warehouse uses in-house riders, add an assumed **2 rider accounts per in-house warehouse**; if all projected warehouses are in-house, total users become **27 at month 3, 72 at month 6, 180 at month 12**. Actual delivery-mode mix is unknown and must be measured. GPS usage and map provider fees are excluded from the simple $39 subscription assumption.

**Month-12 scenarios:** conservative 5 warehouses / 35 seats / $195 MRR; base 20 / 140 / $780; optimistic 50 / 350 / $1,950. Scenario values assume same 7 seats and $39 price. These are **planning scenarios, not statistically derived market-size forecasts**.

**Acquisition plan:** Month 0–1: 5–10 warehouse interviews, 2 design partners; Month 2–3: 3 pilots and time-saved measurement; Month 4–6: convert pilots, referrals, outreach to 3PL operators; Month 7–12: integrations and paid rollout. Funnel must be validated: outreach → demo → pilot → paid conversion → retention.

**Validation gates:** At least 2 operators confirm pain; 3 pilot warehouses submit real exception examples; at least 1 agrees to pay; measure weekly active seats, exception resolution time, percent with complete evidence, staff minutes saved and retention. If these fail, revise projections.

## 13. Cost, unit economics and ROI (transparent estimates)

**Official pricing reference:** Supabase Pro starts at $25/month (https://supabase.com/pricing); Render charges compute separately from workspace plan (https://render.com/pricing); OpenAI API token pricing is model-specific (https://developers.openai.com/api/docs/pricing). All price pages may change. Hosting line items below other than Supabase are **planning allowances**, not current vendor quotes.

**New cost risk in v4:** live location ingestion/storage, Supabase Realtime egress/connections, map tiles/geocoding and mobile device/battery support can increase variable costs; obtain provider quotes and load-test before pricing. GPS should be active only during assigned delivery and retained minimally.

**Illustrative monthly SaaS operating budget at early scale (v3 baseline, excludes incremental live-GPS/map cost):** Supabase Pro $25; Render API compute allowance $10–25; frontend hosting allowance $0–20; OpenAI reserve $5–25; monitoring/email/domain allowance $5–15. **Total: $45–110/month**, excluding engineering labor, support, taxes, currency fees, overages, and paid messaging. Validate actual plan before purchase. At 3 customers and $39 each, gross MRR $117; at 20, $780. Gross MRR is **not profit**.

**OpenAI worked example (using GPT-4.1 mini listed $0.40/M input and $1.60/M output tokens as a reference, subject to model availability):** 300 cases × (3,000 input + 800 output tokens) = 0.9M input and 0.24M output = **$0.744/warehouse/month** for one analysis per case, before retries, extra calls, tools, attachments, or other overhead. Real usage may be materially higher; log actual tokens and spend. Reference: https://developers.openai.com/api/docs/models/gpt-4.1-mini.

**Warehouse labor-value example:** 300 cases/month × 20 minutes manual baseline = 100 hours. If 60% of cases reduce handling from 20 to 5 minutes, time saved = 300 × 0.60 × (20−5) / 60 = **45 hours/month**. At an **assumed** MMK 5,000/hour, gross capacity value = **MMK 225,000/month**. This is **not** proven salary savings or layoffs; actual cash savings require reduced overtime/hiring or redeployment. A $39 subscription converted to MMK requires a contemporaneous, clearly specified FX rate; do not assert positive net ROI without validating wage, software and operating costs.

**Service economics:** Revenue = paying warehouses × monthly subscription. Contribution margin requires revenue minus AI, hosting variable usage, onboarding/support and payment fees. With 3 warehouses, early shared hosting can consume much of MRR. A viable business needs sufficient retention and paid conversions, not only attractive model-token cost.

## 14. Roadmap after demo

**Month 1:** interviews, stable auth/RLS, GPS privacy/retention policy, reliable stock movement ledger, real SME pilot, audit and error handling. **Month 3:** 3 warehouse pilots target, baseline vs assisted time measurements, configurable SME policies, optional email. **Month 6:** 8 paying warehouse target (conditional), courier/WMS imports, SLA reporting. **Month 12:** 20 paying warehouse base-case target (conditional), repeatable onboarding, evidence-backed ROI dashboard and retention tracking.

## 15. Risks and decision log

- Real local warehouse workflows and demand are **not validated** by this PRD; run interviews.
- External courier tracking remains on courier's website; ParcelCare records handover evidence and available facts. In-house rider GPS is visible only to authorized warehouse staff and the shipment's SME during active tracking.
- Physical inventory and approvals remain human-controlled.
- No end-customer interface; a minimal **in-house rider** interface is now in scope. No third-party rider app.
- AI-native means evidence-grounded investigation plus authorized action, not a chatbot.
- Demo may simulate courier events, but simulation must be labeled clearly.
- Pricing, adoption and savings figures are **assumptions** until measured.
- Protect SME segregation before allowing public multi-user access. Explicit rider GPS consent, active-session access, retention limits and stale-location handling are mandatory.
- Third-party transport liability depends on contract, evidence and law; a handover record is important but does not by itself extinguish warehouse obligations to its SME customer.

## 16. Delivery responsibility and GPS acceptance criteria (v4 additions)

**Operational responsibility (not legal determination):** Warehouse owns correct stock, picking, packing, labeling, safe packaging, and verifiable handover. With an in-house rider, warehouse operates the transportation and investigates its delivery failures. With an external carrier, carrier operates transportation after accepted handover, but contract/evidence determine financial responsibility and warehouse may still owe SME communication/claims coordination. Use `UNDETERMINED` until sufficient evidence exists; AI may suggest a party but cannot issue a final legal finding.

**GPS minimum:** Rider explicitly opts in when starting an assigned delivery; browser/mobile permission required; coordinates timestamped, authenticated and tied to active session; near-real-time map for warehouse and only relevant SME; stale indicator after configurable interval; tracking stops at delivery, cancellation or explicit stop; no public sharing links; short location retention; audit who accessed live location. A browser-based PWA may pause background GPS when screen is locked, so production continuous background tracking may require native mobile implementation. Do not promise continuous tracking from a browser alone.

**Definition of done:** (1) warehouse assigns rider; (2) rider starts consented GPS; (3) two authenticated authorized dashboard viewers see updated timestamped position; (4) unrelated SME cannot access position; (5) rider reports failure and AI opens/matches case; (6) SME reschedule request requires actual capacity confirmation; (7) verified POD ends tracking and closes case; (8) external courier never shows fabricated ParcelCare GPS; (9) loss/damage case keeps evidence and disputed liability distinct.

**MVP trade-off:** One-day demo should prioritize live foreground GPS (or clearly marked simulation), not background reliability, automatic ETA or routing. Secure role scoping is not optional even for demo deployments.

## 17. Sources and further reading

- Prior ParcelCare PRD v2.0, PRD v3.0 and one-day MVP notes (internal project artifacts; revised scope supersedes their rider/customer interface sections).
- Supabase official pricing: https://supabase.com/pricing
- Render official pricing: https://render.com/pricing
- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- OpenAI GPT-4.1 mini reference: https://developers.openai.com/api/docs/models/gpt-4.1-mini
- Vendor product sites linked in competitor section. This is a preliminary competitor landscape, not a feature audit or Myanmar market share survey.
