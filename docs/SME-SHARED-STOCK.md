# SME self-delivery from common warehouse stock

The current flow is **Warehouse → SME**: an SME orders products from its warehouse's shared catalog; the warehouse accepts and prepares the request; a rider or courier delivers to that SME; the existing evidence/receipt gates determine completion. External supplier onboarding and replenishment are outside this feature.

## Stock and compatibility

Migration `20261023000400_be1_shared_stock_sme_delivery.sql` introduces common products through `products.sme_id = null`. It creates no products or quantities and never merges historical SME-owned balances. Those legacy products, receipts, shipments, commands and orders remain readable and usable through the legacy staff workflows. Existing saved uncertain order requests keep their original wire shape and replay keys.

New order requests identify `order_kind: sme_self_delivery` and can reserve only common products belonging to the selected warehouse. Shipment `sme_id` identifies the recipient. Product/warehouse foreign keys and legacy-owner triggers prevent cross-warehouse or cross-SME legacy lines. Product ownership cannot change in place. Shared products have warehouse-unique SKUs. Raw shared product rows remain unavailable to SMEs; the catalog RPC exposes only ID, warehouse, SKU, product name and currently orderable quantity, without other tenants' reservations or shipment IDs.

Reservations use product row locks in product ID order. Pending/accepted orders reserve units until cancellation/rejection or physical dispatch/handover. In-house dispatch and external courier handover post stock once, retaining the existing wrapper chain and return ledger. Evidenced good/damaged returns go back to the original common product's available/quarantine quantities. Staff inventory distinguishes common stock from legacy SME stock. Warehouse-created outbound shipments can choose either explicitly; direct creation retains its existing non-reserving behavior.

## Delivery profile and order snapshot

`GET /api/orders/catalog?warehouse_id=...` returns `WarehouseCatalogItem[]` to active warehouse staff/owners or SMEs in that warehouse. Riders and other warehouses cannot read it.

`GET/PUT /api/orders/delivery-profile?warehouse_id=...&sme_id=...` reads or saves the SME's shop/contact name, phone, address, Maps link, coordinates and instructions. Only that SME can save it; warehouse staff have scoped read access. The order form prefills saved values, requires a fresh pin confirmation, and allows order-specific edits. **Save SME delivery address** explicitly updates the default without submitting an order. **Save this address for future SME orders** saves the default atomically with a successful order; existing profiles default this checkbox off.

New order contact fields are `recipient_name` and `recipient_phone`. Legacy `customer_name`/`customer_phone` inputs and saved order payloads remain supported. The database retains compatible aliases in the immutable order snapshot. Later profile changes or repeated submissions do not modify an existing snapshot or overwrite a more recent profile. Warehouse/rider shipment screens show the SME delivery contact and confirmed location.

The Google Maps resolver follows only allowlisted Maps hosts and bounded redirects. Links without readable marker coordinates preserve the form and allow place search or a manual map pin. Viewport coordinates alone are never treated as the delivery pin. No user GPS is assumed to be the SME's location.

## Demo and verification

Browser-only fixtures provide separate, explicitly fictitious common products; legacy balances are never used as common stock. SME demo orders and profiles persist within the browser session. Warehouse demo approval creates an outbound shipment addressed to that SME. The dashboard's former SME-to-warehouse demo generation now requests delivery from warehouse stock to the SME instead. English/Myanmar copy describes the same direction.

- `npm run test:shared-stock:database`: fresh migrations, catalog privacy, two SMEs sharing a product, reservations/release, profile isolation, immutable snapshots, replay, legacy guards, dispatch/handover and evidenced returns.
- `npm run test:embedded --prefix supabase/tests`: native PostgreSQL, including two simultaneous SME requests contending for the same common product; one commits and the other rolls back when stock is insufficient.
- `npm run test:orders:browser`: real local Maps resolver, missing-marker fallback, SME pin confirmation, profile prefill/update, snapshot preservation, lost-response reload/replay, cancellation, warehouse acceptance/rejection and mobile layout.
- Frontend, backend, contract drift, migration conventions, typecheck, localization and build checks cover integration. Browser/API fixtures do not certify hosted services.

## Rollout

Apply the new migration **after** outbound-return migration `20261023000300`, restart the API, then update the frontend. Prepare verified common product/balance records through the warehouse's inventory setup process; an empty common catalog is expected until this is done. No production stock is inferred from legacy records. Existing unrelated workspace changes are retained. This implementation does not apply hosted migrations or deploy services; COD/pricing and external-supplier replenishment remain separate work.
