# SME outbound delivery orders

SMEs can open `/sme/orders` from the dashboard or sidebar, select their own warehouse stock, enter customer contact/address/instructions, paste a Google Maps link, confirm the delivery pin, review and submit. Link resolution supports coordinate query links and place markers. Short links follow at most five redirects, only to explicitly allowed Google Maps hosts; no credentials are forwarded. Links without a readable marker retain the form and offer place search or manual map selection. Viewport coordinates are never treated as a customer marker.

Warehouse staff review requests on `/warehouse/shipments`. Accepting selects in-house or third-party delivery and atomically creates an outbound shipment with the confirmed destination. Rejection requires a reason. SMEs can cancel pending requests. Customer details, confirmed pin and the original link are available to authorized warehouse staff, the owning SME and the assigned rider on shipment screens. Existing dispatch, courier handover and tracking continue from the shipment.

Stock reservations use product row locks in product ID order. Pending and accepted orders reserve stock until cancellation/rejection or physical dispatch/handover. Inventory projections show remaining orderable stock. A database constraint prevents other stock-changing operations consuming reserved units. In-house dispatch releases its reservation in the same transaction as the existing stock posting. Third-party order handover posts stock once. Failed commands roll back their changes; actor-scoped idempotency keys prevent duplicate orders/actions. The shared saved-command hook retains an uncertain submission in session storage across reload and retries it with its original key and body.

Apply `supabase/migrations/20261023000200_be1_sme_orders.sql` after existing migrations to the intended database before using the new API. The earlier delivery-destination migration is required. This change does not apply hosted migrations or deploy services. Restart the API after updating it. New order functions use the authenticated user's database connection; no service credentials are added. Demo accounts do not expose live order commands.

Validation:

- `npm run test:orders:database`: fresh migrations, ownership, authorization, replay/conflict, stock guard, reservation release, acceptance and destination transfer, failed dispatch rollback, dispatch replay, assigned rider customer access, warehouse cancellation and third-party stock posting/replay.
- `npm run test:orders:browser`: isolated authenticated browser fixtures, actual local Maps resolver, unreadable-link recovery, pin confirmation, review/submit, lost-response reload/replay, SME cancellation, mobile layout, warehouse acceptance and rejection. Uses port 3118 and fictitious records; no live orders are created.
- Order link parsing tests run in `npm run test:frontend`; API validation/isolation tests run in `npm run test:backend`. Order SQL tests also run with `npm run test:database`.

COD and delivery fees are not included; their business rules have not been specified.
