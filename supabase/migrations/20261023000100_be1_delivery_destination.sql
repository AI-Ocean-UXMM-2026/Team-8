begin;
alter table public.shipments add column delivery_destination jsonb;
create function public.delivery_destination(p_shipment uuid, p_value jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.shipments;
begin
 select * into s from public.shipments where id=p_shipment for update;
 if s.id is null or not private.can_read_shipment(s.id) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_value is not null then
  if not private.is_staff(s.warehouse_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if s.direction <> 'outbound' or s.status in ('delivered','cancelled')
   or jsonb_typeof(p_value->'latitude') <> 'number' or jsonb_typeof(p_value->'longitude') <> 'number'
   or not (p_value ?& array['latitude','longitude','label'])
   or (p_value->>'latitude')::numeric not between -90 and 90
   or (p_value->>'longitude')::numeric not between -180 and 180
   or jsonb_typeof(p_value->'label') is distinct from 'string'
   or coalesce(length(btrim(p_value->>'label')),0) not between 1 and 500 then
   raise exception 'invalid_destination' using errcode='22023';
  end if;
  update public.shipments set delivery_destination=p_value where id=s.id;
  return p_value;
 end if;
 return s.delivery_destination;
end $$;
revoke all on function public.delivery_destination(uuid,jsonb) from public,anon;
grant execute on function public.delivery_destination(uuid,jsonb) to authenticated;
commit;
