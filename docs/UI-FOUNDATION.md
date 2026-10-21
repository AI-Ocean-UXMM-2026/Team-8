# ParcelCare UI foundation

Team-8 is the canonical product. Preserve the existing ParcelCare mark. Use the original deployed layout and brand colors from commit 224339b, defined by globals.css and workspace/theme.css. Preserve the updated SME navigation and approved report behavior.

## Theme

The original deployed shadcn theme is the presentation source of truth. Operational and feature tokens resolve to primary, accent, background, foreground and border rather than overriding brand values. Keep semantic warning, danger and priority colors distinct. Preserve saved English/Myanmar language choices and responsive controls.

The previous green UI and layout are preserved on branch `archive/green-ui-2026-10-22` at commit `26d078b`; restore that version only on explicit request.


## Approved ownership

Warehouse investigates, requests information and proposes a resolution. Manager handles escalated decisions and reasoned priority overrides. SME supplies information and confirms a resolution, or reopens with a reason. SME consent is required for proposed returns, disposal, partial shipment or extra charges; routine investigation requires no SME consent. Approval does not itself execute stock or financial mutations.

Preserve existing deterministic priority thresholds and category rules. Priority and escalation are independent. An internal-only closure exception requires explicit policy support; do not expose a generic staff close button.

## Layout and language

SME has Orders / Requests, Delivery Tracking and Reports. Use mobile-first SME layouts and desktop-first warehouse / manager web layouts that also reflow on mobile. Courier implementation is deferred. Keep English-only and Myanmar-only modes with a saved preference; translate interface copy, never user evidence or record identifiers.

Report UI explains responsibility, current step and next action. Keep priority, review queue and case status distinct. Do not invent live GPS, ETA, AI results or delivery evidence. Keep demo behavior explicitly identified.

## Current boundary

The role-switch workspace remains browser-local. Its existing decisions are demonstrations, not authenticated backend authorization. The operational warehouse case page supports only the actions implemented by its API. Guidance about consent is not a new approval submission integration. Backend-connected SME decisions, evidence uploads and courier workflows remain separate implementation work.
