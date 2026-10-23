begin;
-- Keep event timestamps typed until JSON serialization, including fallback event times.
create or replace function private.ops_detail(s public.shipments) returns jsonb language sql stable security definer set search_path='' as $$
 select private.ops_shipment(s)||jsonb_build_object(
 'items',coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'sku',p.sku,'name',p.name,
 'expected_qty',i.expected_qty,'received_qty',i.received_qty,'damaged_qty',i.damaged_qty) order by i.product_id)
 from public.shipment_items i join public.products p on p.id=i.product_id where i.shipment_id=s.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'notes',coalesce(e.details->>'notes',''),
 'verified_at',coalesce((e.details->>'verified_at')::timestamptz,e.created_at),'recorded_at',e.created_at,
 'evidence_ids',coalesce(e.details->'evidence_ids','[]'::jsonb)) order by e.created_at,e.id)
 from public.shipment_events e where e.shipment_id=s.id),'[]'::jsonb),
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'label',e.mime_type,'verified',
 exists(select 1 from storage.objects o where o.bucket_id='parcelcare-evidence' and o.name=e.object_path)) order by e.id)
 from public.evidence e where e.shipment_id=s.id),'[]'::jsonb), 'allowed_events',private.ops_allowed(s));
$$;

commit;
