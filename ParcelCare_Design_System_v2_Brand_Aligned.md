# ParcelCare Design System v2.0 — Official Brand Alignment

**Product:** AI-native B2B warehouse and logistics exception management  
**Audience:** 3PL warehouse operators, SME clients, in-house riders  
**Design direction:** Clean, professional, operational, calm, AI-native  
**Scope:** Warehouse and SME workflows only; end customers out of scope.

## 1. Foundations

### Colors
| Token | Hex | Use |
|---|---|---|
| brand-primary | `#08A6A5` | Official teal: brand, key accents |
| primary | `#087F80` | Accessible primary buttons with white text |
| brand-yellow | `#FCC829` | Official yellow: accents and branded AI highlights |
| brand-yellow-subtle | `#FFF7D6` | Highlight surfaces with dark text |
| primary-hover | `#066768` | Hover and pressed states |
| primary-subtle | `#E6F7F7` | Selected backgrounds |
| canvas | `#F8FAFB` | App background |
| surface | `#FFFFFF` | Cards and dialogs |
| text-primary | `#172B36` | Headings, key metrics |
| text-secondary | `#64748B` | Supporting copy |
| border | `#E3E9EC` | Borders and dividers |
| success | `#16A34A` | Completed, resolved |
| warning | `#D97706` | At risk, awaiting response |
| danger | `#DC2626` | Critical, failed |
| info | `#2563EB` | In transit, investigating |

**Accessibility:** Verify text/background contrast against WCAG AA. Never rely on color alone for operational status; pair with a label and icon.

### Typography
- Latin: Inter; Myanmar: Noto Sans Myanmar fallback.
- Page title: 28px / 600; section: 20px / 600; card: 16px / 600; body: 14px / 400; metadata: 12px / 400.
- Use tabular numerals for inventory counts, coordinates, and timestamps.

### Layout
- 4px spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Sidebar: 240px; topbar: 64px; main content max-width: 1440px.
- Card radius: 12px; button/input radius: 8px; border: 1px.
- Desktop-first Warehouse, responsive SME, mobile-first Rider.

### Official logo and brand rules
- **Source of truth:** user-supplied ParcelCare stork carrying parcel + teal/yellow wordmark (`image(6).png` in project working files). Do not replace with a stock stork or AI-generated approximation.
- **Logo colors:** teal `#08A6A5`, yellow `#FCC829`; preserve the artwork proportions and clear space.
- **Full wordmark:** login, marketing, expanded navigation. **Stork-only icon:** collapsed sidebar/favicon *only when an approved icon asset exists*; do not crop arbitrarily.
- **Logo on white:** preferred. Avoid yellow-on-white for small text. Use dark text on yellow and white text only on contrast-tested darker teal.
- **UI color ratio (guidance):** 75–85% white/neutral, 10–20% teal, 3–5% yellow accent. Keep semantic danger/warning separate from brand yellow.
- **Accessibility:** brand teal `#08A6A5` is best as a graphic/accent on white, not automatically as a white-text button background. Use darker `#087F80` for primary filled buttons; test contrast in final UI.

## 2. Information architecture

### Warehouse dashboard
- Overview: shipment KPIs, urgent exceptions, AI workload, live rider map.
- Shipments: inbound / outbound, lifecycle and handover details.
- Inventory: SKU, available/reserved/damaged quantities, movement records.
- Exceptions: queue, investigation, evidence, priority, escalation, resolution.
- Deliveries: rider assignments, live GPS (in-house only), proof of delivery.
- SME Accounts: organizations, permissions, communications.
- Settings: policies, courier arrangements, notification preferences.

### SME dashboard
- Overview: current stock, requests, delivery statuses, open exceptions.
- Inventory: read-only owned stock and history.
- Requests: replenishment/delivery requests to branches or SME destinations.
- Deliveries: in-house live tracking; external courier tracking link only.
- Exceptions: respond to information requests, review evidence, approve permitted actions.

### Rider mini interface (in-house only)
- My Deliveries: assigned stops and shipment details.
- Active Delivery: Start/Stop GPS sharing, status, destination, call contact.
- Report Issue: exception type, notes, photo evidence.
- Proof of Delivery: receiver name/confirmation and photo/signature as policy permits.

## 3. Core components
- KPI cards: metric, period, delta (if measured), drilldown.
- Status chips: clear text + semantic color + optional icon.
- Data tables: sticky headers, search, filters, sorting, row actions, pagination.
- Exception case panel: shipment, evidence, AI findings, priority, responsible party, actions, audit trail.
- AI recommendation card: summary, confidence/uncertainty, cited evidence, action permissions, approval requirement.
- Timeline: immutable chronological shipment and case events.
- Map panel: rider marker, last-updated timestamp, tracking status, destination, GPS consent state.
- Confirmation dialog: destructive/financial actions and role-based approvals.
- Empty/error/offline states: explain next action and never show stale location as live.

## 4. Operational state model

### Shipment
`Requested -> Picking -> Packed -> Assigned -> Picked Up -> In Transit -> Delivered`

Possible branches: `Delivery Attempt Failed -> Rescheduled -> In Transit`; `Cancelled` if policy permits.

### Exception
`Open -> AI Investigating -> Awaiting SME / Human Review -> Action Scheduled -> Resolved -> Closed`

Keep **priority** (`Critical`, `High`, `Normal`, `Low`) independent of **escalation** (`AI Handling`, `Needs SME`, `Needs Warehouse`, `Needs Courier`).

### Responsible party
`WAREHOUSE`, `THIRD_PARTY_COURIER`, `UNDETERMINED`. Assign only after sufficient evidence; contractual terms determine legal liability. Do not automatically disclaim warehouse responsibility for packaging or pre-handover defects.

## 5. Delivery experiences

### In-house rider
Warehouse assigns rider -> rider confirms handover -> rider explicitly starts GPS sharing -> location updates stream to authorized warehouse and SME views -> exception or POD -> tracking session ends.

GPS UX must show `Live`, `Updating`, `Stale`, `Offline`, `Permission Denied`, and `Ended`; display last-updated time. Only expose rider location for assigned active deliveries to authorized roles. Retention and consent require a defined policy. Browser foreground tracking may not work reliably when locked or backgrounded; production-grade background tracking requires additional mobile platform work.

### Third-party courier
Warehouse records courier name, tracking reference, handover time and evidence. SME sees external tracking link if available. No ParcelCare live GPS, courier dashboard, or route management. If a post-handover dispute is reported, retain case and evidence for coordination; assign responsibility based on verified cause and contract.

## 6. UX rules
1. Surface critical exceptions first, but do not confuse urgency with escalation.
2. AI can draft/notify/request evidence automatically when permitted; stock adjustments, compensation, and disputed delivery closure require appropriate verification or approval.
3. Show evidence provenance and action audit log in every case.
4. Never invent GPS location, ETA, courier confirmation, or SME approval.
5. Distinguish manual, courier-reported, rider-reported, and verified statuses.
6. Keep tables scannable; reserve red for truly critical/failed states.
7. Use plain Burmese-English language where operators need it; technical labels may remain in English.

## 7. Component usage examples
- **Primary CTA:** dark teal `#087F80` with white text; hover `#066768`.
- **Selected navigation:** pale teal `#E6F7F7`, dark teal icon/text, left indicator in official teal.
- **AI insight:** white card, thin teal border, small yellow accent mark. Yellow is not a substitute for a warning state.
- **Critical exception:** red status badge with explicit `Critical` text; `Needs Warehouse Review` appears as a separate workflow label.
- **Live map:** neutral map surface, teal rider marker, clearly visible freshness timestamp and `Live/Stale` labels.
- **SME approval:** neutral decision card with teal approve button and outlined request-changes button.
- **Rider mobile:** large 44px+ targets, high-contrast GPS-sharing state, stop-sharing control always visible.

## 8. Suggested Tailwind/shadcn mapping
- Tailwind + shadcn/ui for Button, Card, Badge, Dialog, Sheet, Tabs, Table, Input, Select, Toast.
- Use CSS variables for semantic colors, with light theme as default.
- Icons: Lucide, consistent 18–20px for controls.
- Map: Leaflet or MapLibre for the MVP, with backend realtime location updates and permission-gated views.

## 9. Screen-level MVP acceptance checklist
- Warehouse sees urgent cases and can investigate/approve resolutions.
- SME can request replenishment, view stock, track in-house rider live, and respond to exception prompts.
- Rider can start/stop GPS sharing, report exception, and provide POD.
- External courier shipments show tracking reference/link and handover evidence, but never pretend to provide live GPS.
- Every exception has shipment link, priority, separate escalation, evidence, responsible-party status, and timeline.

## 10. Example design tokens (CSS)
```css
:root {
  --pc-brand-primary: #08A6A5;
  --pc-primary: #087F80;
  --pc-brand-yellow: #FCC829;
  --pc-brand-yellow-subtle: #FFF7D6;
  --pc-primary-hover: #066768;
  --pc-primary-subtle: #E6F7F7;
  --pc-canvas: #F8FAFB;
  --pc-surface: #FFFFFF;
  --pc-text: #172B36;
  --pc-muted: #64748B;
  --pc-border: #E3E9EC;
  --pc-success: #16A34A;
  --pc-warning: #D97706;
  --pc-danger: #DC2626;
  --pc-info: #2563EB;
  --pc-radius-card: 12px;
  --pc-radius-control: 8px;
}
```

*Brand teal/yellow and logo are supplied by the product team; supporting UI colors and interaction patterns are proposed design choices.*
