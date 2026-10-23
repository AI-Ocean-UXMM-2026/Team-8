# SME stock release (3PL)

SMEs arrange their own suppliers. ParcelCare receives and holds SME-owned stock,
then releases it to the SME location/shop. Customer deliveries are outside scope.

## Deployment

1. Run `20261023120000_be1_sme_owned_release.sql` in Supabase.
2. Deploy both API and frontend from the matching commit. The previous shared-stock
   SME screens are intentionally blocked by the new ownership checks.
3. Existing products with no SME remain unassigned. Do not automatically transfer
   ownership: they may already have historical shipment or stock references.
4. For the hackathon only, optionally run `scripts/seed-sme-owned-test.sql`.
   It creates 10 new, clearly marked test products for each named test SME, 25 units
   each. It neither replaces inbound supplier receiving nor changes existing stock.

Internal `/orders` URLs, database names and historical `ORD-` references remain
stable. Existing customer-named payload fields now represent the SME contact.
Old completed shipments remain accessible. Pending requests using unassigned stock
cannot be approved; cancel/reject them and resubmit against SME-owned stock.
Saved uncertain submissions retain their original request key and payload.

## Manual scenarios

1. Sign in as SME A. Its dashboard and Stock Release Requests show only A's products.
   Switch to SME B and verify A's products are absent.
2. Search, filter by category and change pages. Selected quantities remain in the
   release request. Zero-stock products cannot be added.
3. Request 3 units and choose Review release request. The saved SME location/contact
   appears read-only. If missing, complete one-time location setup and save the
   confirmed map pin. Use Edit SME location for future changes, then submit.
   Available-to-request stock decreases by 3; history shows Pending.
4. Cancel the pending request: the 3 reserved units become available again.
5. Submit again; warehouse staff reject with a reason. Reservation is released and
   the SME sees the reason. Other SMEs cannot read or act on this request.
6. Submit again and approve as warehouse staff. A shipment is created for that SME.
   Approval alone does not deduct physical stock a second time.
7. Assign a rider, record the allowed pick/pack/dispatch events, start GPS sharing,
   and follow the existing arrival/proof/SME-receipt workflow. Dispatch deducts stock
   once; retries do not create duplicate movements or shipments.
8. Request more than available stock, or use another SME's product ID in a direct
   request: the server rejects it and rolls back all reservations.
9. Open an old shared-stock request: its history remains. Approving a pending one
   shows an ownership error; rejecting/cancelling releases its legacy reservation.
10. Switch language to Myanmar and check navigation, request actions, quantities
    and SME-location contact labels. No customer destination is offered.

## Automated verification

- `node supabase/tests/catalog.test.mjs`
- `node supabase/tests/shared-stock.test.mjs`
- API: `test_checkout_catalog`, `test_shared_stock`
- `npm run test:frontend`, `npx tsc --noEmit`
- `node scripts/check-orders.mjs` (local browser with simulated Auth/API)
