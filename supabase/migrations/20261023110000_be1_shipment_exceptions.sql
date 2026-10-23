begin;
create function public.shipments_queue_read(p_warehouse uuid,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; n integer:=coalesce((p_filters->>'limit')::integer,25);
 flag text:=coalesce(p_filters->>'exceptions','all');
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 if n not between 1 and 100 or flag not in ('all','open','none') then raise exception 'invalid_filters' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.item order by x.id),'[]') into result from (
  select sh.id,private.ops_shipment(sh)||jsonb_build_object('open_cases',c.items) item
  from public.shipments sh
  cross join lateral (
   select coalesce(jsonb_agg(jsonb_build_object('id',ec.id,'type',ec.type) order by ec.id),'[]') items
   from public.exception_cases ec where ec.warehouse_id=sh.warehouse_id and ec.shipment_id=sh.id and ec.status not in ('resolved','closed')
  ) c
  where sh.warehouse_id=p_warehouse
   and (p_filters->>'sme_id' is null or sh.sme_id=(p_filters->>'sme_id')::uuid)
   and (p_filters->>'cursor' is null or sh.id>(p_filters->>'cursor')::uuid)
   and (p_filters->>'direction' is null or sh.direction=p_filters->>'direction')
   and (p_filters->>'status' is null or sh.status=p_filters->>'status')
   and (flag='all' or flag='open' and jsonb_array_length(c.items)>0 or flag='none' and jsonb_array_length(c.items)=0)
  order by sh.id limit n+1
 ) x;
 return jsonb_build_object('items',case when jsonb_array_length(result)>n then result-n else result end,
  'next_cursor',case when jsonb_array_length(result)>n then result->(n-1)->>'id' else null end);
end $$;
revoke all on function public.shipments_queue_read(uuid,jsonb) from public,anon;
grant execute on function public.shipments_queue_read(uuid,jsonb) to authenticated;
commit;
