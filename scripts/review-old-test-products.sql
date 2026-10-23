-- READ ONLY. Review these specific legacy sample products before cleanup.
-- A linked product must be preserved with its history, not broadly deleted.
select p.id,p.sme_id,s.name sme,p.sku,p.name,p.available_qty,p.reserved_qty,
 case when p.reserved_qty>0
  or exists(select 1 from public.shipment_items i where i.product_id=p.id)
  or exists(select 1 from public.stock_movements m where m.product_id=p.id)
  or exists(select 1 from private.product_category_commands c where c.product_id=p.id)
  or exists(select 1 from public.sme_orders o where o.warehouse_id=p.warehouse_id
    and exists(select 1 from jsonb_array_elements(o.payload->'lines') l where l->>'product_id'=p.id::text))
 then 'KEEP: referenced or reserved; requires archival plan'
 else 'UNLINKED TEST PRODUCT: eligible for reviewed cleanup' end review
from public.products p left join public.smes s on s.id=p.sme_id
where p.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'::uuid
 and (p.sku like 'TEST-%' or p.name like 'TEST - %') order by s.name,p.sku;
