-- READ ONLY. Identify legacy fixtures and protect anything used by a release request.
with candidates as (
 select 'product' kind,p.id,p.sku reference,p.name description,
 exists(select 1 from public.sme_orders o where exists(select 1 from jsonb_array_elements(o.payload->'lines') l where l->>'product_id'=p.id::text)) protected_by_release,
 (select count(*) from public.shipment_items i where i.product_id=p.id) linked_rows
 from public.products p where p.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc' and (p.sku like 'TEST-%' or p.name ilike 'TEST%')
 union all select 'shipment',s.id,s.reference,s.status,exists(select 1 from public.sme_orders o where o.shipment_id=s.id),
 (select count(*) from public.exception_cases c where c.shipment_id=s.id)
 from public.shipments s where s.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc' and s.reference like 'TEST-%'
 union all select 'case',c.id,s.reference,c.summary,exists(select 1 from public.sme_orders o where o.shipment_id=c.shipment_id),
 (select count(*) from public.case_events e where e.case_id=c.id)
 from public.exception_cases c join public.shipments s on s.id=c.shipment_id
 where c.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc' and (c.summary ilike 'TEST%' or s.reference like 'TEST-%')
) select * from candidates order by kind,reference,id;
