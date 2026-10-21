# Office Staff dashboard

Route: `/office`. Uses the existing Next.js/React/TypeScript stack, shadcn
Vega components, Geist, Phosphor and primary/secondary shade-400 design tokens.

## Reference provenance

Mobbin was authenticated in Codex during the preceding setup. However, this
implementation session exposes no Mobbin tools; an MCP resource lookup returned
`unknown MCP server 'mobbin'`. No Mobbin screens were retrieved or analyzed.
The reference-research portion remains pending until the server is loaded in a
new/reloaded session. Do not represent the following choices as Mobbin findings.
No third-party branding, screens or screen assets were copied.

## Layout and UX rationale

- Operations: fixed, quiet navigation; a compact summary row; a dominant queue;
  a secondary rail for work context. Avoid making charts compete with tasks.
- Customer support: searchable case rows, explicit ownership, status-specific
  queues and a contextual detail dialog with facts, evidence and next steps.
- Logistics: shipment and SME references stay visible; receiving, warehouse and
  delivery problems share a queue without losing their operational context.
- Priority, AI readiness and workflow are separate indicators. Escalation changes
  workflow/owner and records a reason, without silently increasing priority.
- Evidence comes before suggested actions. Demo recommendations are explicitly
  illustrative. No model is called, no stock changes occur and no action claims
  physical verification or final responsibility.
- Mobile: a navigation drawer, wrapped filters, two-column summary cards, a
  contained horizontally scrollable table and stacked detail content.

## Interaction and integration boundaries

Search, priority/SME/assignee filters, queue tabs, case details, assignment,
verification requests, escalation, new reports and same-issue report matching
work with fictitious fixtures. Changes persist in browser-local demo storage.
The role and timeline are simulations, not authenticated identity or a server
audit log. The dashboard must be wired to authorized FastAPI domain APIs before
real use. Backend authorization and human verification remain mandatory.

Validation: `npm run build`, then `node scripts/check-office.mjs`. The browser
suite exercises actions, persistence, duplicate matching, unchanged priority on
escalation and mobile layout. Screenshots are written to `test-results/office-*`.
