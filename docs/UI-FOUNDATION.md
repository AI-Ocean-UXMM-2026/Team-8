# ParcelCare UI foundation

Team-8 is the canonical product. Preserve the existing ParcelCare mark. Use the green logistics theme; layout may change to improve the existing workflows.

## Theme

Workspace tokens live in `src/features/workspace/styles.css`: primary #176d50, hover #11553e, mint #eaf5ee, canvas #f4f7f5, ink #1d3028. React Tailwind brand uses the same primary in `src/app/foundation.css`. Keep semantic warning, danger and priority colors separate from brand green. Use Inter and Noto Sans Myanmar, visible focus and 44px mobile controls.

## Approved ownership

Warehouse investigates, requests information and proposes a resolution. Manager handles escalated decisions and reasoned priority overrides. SME supplies information and confirms a resolution, or reopens with a reason. SME consent is required for proposed returns, disposal, partial shipment or extra charges; routine investigation requires no SME consent. Approval does not itself execute stock or financial mutations.

Preserve existing deterministic priority thresholds and category rules. Priority and escalation are independent. An internal-only closure exception requires explicit policy support; do not expose a generic staff close button.

## Layout and language

SME has Orders / Requests, Delivery Tracking and Reports. Use mobile-first SME layouts and desktop-first warehouse / manager web layouts that also reflow on mobile. Courier implementation is deferred. Keep English-only and Myanmar-only modes with a saved preference; translate interface copy, never user evidence or record identifiers.

Report UI explains responsibility, current step and next action. Keep priority, review queue and case status distinct. Do not invent live GPS, ETA, AI results or delivery evidence. Keep demo behavior explicitly identified.

## Current boundary

The role-switch workspace remains browser-local. Its existing decisions are demonstrations, not authenticated backend authorization. The operational warehouse case page supports only the actions implemented by its API. Guidance about consent is not a new approval submission integration. Backend-connected SME decisions, evidence uploads and courier workflows remain separate implementation work.
