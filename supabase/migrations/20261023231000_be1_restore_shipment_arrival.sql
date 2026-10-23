begin;
-- Restore the arrival objects on deployments missing the original tracking migration.
create table if not exists public.shipment_arrivals (
 shipment_id uuid primary key references public.shipments(id),
 warehouse_id uuid not null references public.warehouses(id), sme_id uuid not null,
 assignment_id uuid not null references public.delivery_assignments(id),
 confirmed_by uuid not null, arrived_at timestamptz not null default now(),
 latitude double precision not null, longitude double precision not null,
 foreign key(sme_id,warehouse_id) references public.smes(id,warehouse_id)
);
alter table public.shipment_arrivals enable row level security;
revoke all on public.shipment_arrivals from public,anon,authenticated;
create or replace function public.shipment_arrival(p_shipment uuid,p_confirm boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.shipments; a public.delivery_assignments; r public.shipment_route_plans; l public.rider_locations; arrived public.shipment_arrivals; h double precision;
begin
 select * into s from public.shipments where id=p_shipment for update;
 if s.id is null or not private.can_read_shipment(s.id) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_confirm then
  if not private.is_assigned_rider(s.id) or s.direction<>'outbound' or s.delivery_mode<>'in_house' or s.status<>'in_transit' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into a from public.delivery_assignments where shipment_id=s.id and cancelled_at is null and completed_at is null;
  select * into arrived from public.shipment_arrivals where shipment_id=s.id and assignment_id=a.id;
  if arrived.shipment_id is not null then return to_jsonb(arrived)||jsonb_build_object('delivered',false); end if;
  select * into r from public.shipment_route_plans where shipment_id=s.id and assignment_id=a.id and expires_at>now();
  select x.* into l from public.rider_locations x join public.tracking_sessions t on t.id=x.session_id
   where t.assignment_id=a.id and t.status='active' and x.recorded_at>=now()-interval '60 seconds' order by x.recorded_at desc limit 1;
  if r.shipment_id is null or l.id is null or l.accuracy_m>100 then raise exception 'arrival_location_required' using errcode='22023'; end if;
  h:=power(sin(radians(l.latitude-(r.payload->'destination'->>1)::double precision)/2),2)+cos(radians(l.latitude))*cos(radians((r.payload->'destination'->>1)::double precision))*power(sin(radians(l.longitude-(r.payload->'destination'->>0)::double precision)/2),2);
  if 6371000*2*asin(sqrt(least(1,greatest(0,h))))>100 then raise exception 'outside_arrival_range' using errcode='22023'; end if;
  insert into public.shipment_arrivals(shipment_id,warehouse_id,sme_id,assignment_id,confirmed_by,latitude,longitude)
  values(s.id,s.warehouse_id,s.sme_id,a.id,auth.uid(),l.latitude,l.longitude)
  on conflict(shipment_id) do update set assignment_id=excluded.assignment_id,confirmed_by=excluded.confirmed_by,latitude=excluded.latitude,longitude=excluded.longitude,arrived_at=now();
  insert into public.shipment_events(shipment_id,warehouse_id,sme_id,type,details,source,actor_id)
   values(s.id,s.warehouse_id,s.sme_id,'delivery.arrival',jsonb_build_object('note','Courier confirmed arrival within 100 m. SME receipt pending.'),'rider',auth.uid());
  perform private.audit(s.warehouse_id,s.sme_id,'courier_arrived',s.id);
 end if;
 select * into arrived from public.shipment_arrivals x where x.shipment_id=s.id and exists(select 1 from public.delivery_assignments d where d.id=x.assignment_id and d.cancelled_at is null);
 if arrived.shipment_id is null then return null; end if;
 return to_jsonb(arrived)||jsonb_build_object('delivered',s.status='delivered');
end $$;
revoke all on function public.shipment_arrival(uuid,boolean) from public,anon;
grant execute on function public.shipment_arrival(uuid,boolean) to authenticated;
commit;
