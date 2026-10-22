# Delivery tracking preview

## Open the preview

- SME (default): `/demo/delivery-preview`
- Courier: `/demo/delivery-preview?role=courier`
- Warehouse: `/demo/delivery-preview?role=warehouse`

This is a separate demo page. Existing dashboard navigation and live tracking remain in place. It uses ParcelCare's logo, cyan/yellow tokens and shared components. It does not request device GPS, calculate new routes or contact production tracking APIs.

## Behavior

The map and details card share one layout. On desktop they sit side by side; on mobile the map sits above the card and the main action stays near the bottom. The large secondary map placeholder is removed. Unknown contact details and ETAs are not invented.

The page reuses the existing road geometry, server-shared demo state, geofence and receipt ordering. Warehouse can select outbound fixture shipments and observe. SME sees its demo shipment and confirms receipt through an acknowledgement checkbox and dialog only after Courier arrival. Courier advances the vehicle, confirms arrival within 100 m and resets the demo. Third-party shipments show external tracking guidance without inheriting the in-house marker or route.

Report a problem opens the existing demo SME warehouse Reports entry point via `workspace=sme&view=reports`. This is the existing separate demo reporting workflow, not a new server-shared report or a real shipment case submission. The new optional `view` parameter leaves old workspace entry behavior unchanged.

The role selector changes public demo presentation only. It does not create production role permissions. Demo settings, actions and data are public fictitious preview data. Shared state remains per server instance and resets on restart. An instance epoch now lets clients recover when a restart resets the revision counter.

## Validation (22 October 2026)

- Frontend suite: 54 tests passed. Includes role-specific action guards, geofence/receipt sequencing, concurrent command protection, invalid response handling and restart epochs.
- TypeScript, contracts and optimized production build passed.
- Browser: Desktop layout inspected; 390px Myanmar mobile and 768px tablet had matching viewport/document widths (no horizontal overflow). Mobile action was 44px tall and inside the viewport.
- Warehouse receipt action absent; early SME receipt and Courier arrival disabled. Double-click movement advanced only one segment.
- Courier ten-step movement → yellow arrival → SME acknowledgement dialog → green Delivery complete verified across role pages. Escape closed the dialog and returned focus to Confirm received.
- Warehouse third-party selection showed no in-house vehicle marker.
- Chrome SME preview received in-app Courier movement without refreshing.
- Admin simulation switch disabled Courier actions; re-enabling restored availability.
- Intentional server interruption showed Reconnecting, outdated-position text and blocked movement. After restart the preview reconnected and returned to the new demo journey.
- Existing Reports entry point displayed Reports and Report warehouse issue.
- No phone GPS permissions, external provider requests or production deployment were performed for this preview.

## Review checklist

1. Open the three role URLs against the same local server.
2. Courier: Reset demo. Move vehicle one step at a time. Check SME/Warehouse movement without refresh.
3. Before arrival, check receipt is unavailable. At the destination, Courier confirms arrival.
4. SME: Confirm received → check acknowledgement → Confirm receipt. Warehouse becomes Delivery complete.
5. Switch to Myanmar and check the mobile bottom action, map controls, keyboard focus and dialog Escape/Back behavior.
6. Disable Demo simulation in Warehouse settings; check actions are unavailable. Re-enable for the next preview.

Evidence is saved in Team-8/test-results as delivery-preview-success-desktop.png and final preview screenshots supplied in chat. Review this preview before replacing any existing page.
