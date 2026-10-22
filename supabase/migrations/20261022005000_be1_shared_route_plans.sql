begin;
create table public.shipment_route_plans (
 shipment_id uuid primary key references public.shipments(id),
 assignment_id uuid not null references public.delivery_assignments(id),
 warehouse_id uuid not null, sme_id uuid not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 request_key uuid not null, requested_at timestamptz not null,
 saved_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours',
 foreign key(sme_id,warehouse_id) references public.smes(id,warehouse_id)
);
alter table public.shipment_route_plans enable row level security;
revoke all on public.shipment_route_plans from public,anon,authenticated;
grant select on public.shipment_route_plans to authenticated;
grant all on public.shipment_route_plans to service_role;
create function private.can_read_route_plan(s uuid,a uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.shipments x join public.delivery_assignments d on d.shipment_id=x.id
 join public.riders r on r.id=d.rider_id
 where x.id=s and d.id=a and x.delivery_mode='in_house' and x.status not in ('delivered','cancelled')
 and d.cancelled_at is null and d.completed_at is null and r.active
 and ((r.profile_id=auth.uid() and private.is_assigned_rider(s)) or
 (private.can_read_tenant(x.warehouse_id,x.sme_id) and exists(select 1 from public.tracking_sessions t
 where t.assignment_id=a and private.can_read_tracking(t.id)))));
$$;
create policy route_plans_read on public.shipment_route_plans for select to authenticated using
 (expires_at>now() and private.can_read_route_plan(shipment_id,assignment_id));
create function public.route_plan_read(p_shipment uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.shipment_route_plans;
begin
 if not private.can_read_shipment(p_shipment) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into p from public.shipment_route_plans where shipment_id=p_shipment and expires_at>now()
 and private.can_read_route_plan(shipment_id,assignment_id);
 if p.shipment_id is null then return null; end if;
 return p.payload||jsonb_build_object('shipment_id',p.shipment_id,'assignment_id',p.assignment_id,'saved_at',p.saved_at,'expires_at',p.expires_at);
end $$;
create function public.route_plan_write(p_shipment uuid,p_payload jsonb,p_key uuid,p_requested_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.shipments; a public.delivery_assignments; p public.shipment_route_plans; point jsonb;
begin
 select * into s from public.shipments where id=p_shipment for update;
 select d.* into a from public.delivery_assignments d join public.riders r on r.id=d.rider_id
 where d.shipment_id=p_shipment and d.cancelled_at is null and d.completed_at is null and r.active
 and r.profile_id=auth.uid() and private.is_assigned_rider(p_shipment) order by d.assigned_at desc limit 1 for update of d;
 if a.id is null then raise exception 'forbidden' using errcode='42501'; end if;
 if a.accepted_at is null or s.direction<>'outbound' or s.delivery_mode<>'in_house' or s.status in ('delivered','cancelled')
 then raise exception 'route_not_allowed' using errcode='22023'; end if;
 if p_requested_at is null or p_requested_at>now()+interval '1 minute' or p_requested_at<now()-interval '30 minutes'
 or p_key is null or p_payload->>'provider' is distinct from 'openrouteservice' or p_payload->>'profile' is distinct from 'car'
 or p_payload->>'destination_source' is distinct from 'courier_selected' or p_payload->>'traffic_aware' is distinct from 'false'
 or jsonb_typeof(p_payload->'coordinates') is distinct from 'array'
 then raise exception 'invalid_route' using errcode='22023'; end if;
 if jsonb_array_length(p_payload->'coordinates') not between 2 and 10000
 or jsonb_typeof(p_payload->'distance_m') is distinct from 'number' or (p_payload->>'distance_m')::numeric<0
 or jsonb_typeof(p_payload->'duration_ms') is distinct from 'number' or (p_payload->>'duration_ms')::numeric<0
 then raise exception 'invalid_route' using errcode='22023'; end if;
 for point in select value from jsonb_array_elements((p_payload->'coordinates')||jsonb_build_array(p_payload->'origin',p_payload->'destination')) loop
  if jsonb_typeof(point) is distinct from 'array' then raise exception 'invalid_route' using errcode='22023'; end if;
  if jsonb_array_length(point)<>2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number'
  then raise exception 'invalid_route' using errcode='22023'; end if;
  if (point->>0)::numeric not between -180 and 180 or (point->>1)::numeric not between -90 and 90
  then raise exception 'invalid_route' using errcode='22023'; end if;
 end loop;
 select * into p from public.shipment_route_plans where shipment_id=p_shipment;
 if p.assignment_id=a.id and (p.request_key=p_key or p.requested_at>p_requested_at) then
  return public.route_plan_read(p_shipment);
 end if;
 insert into public.shipment_route_plans(shipment_id,assignment_id,warehouse_id,sme_id,payload,request_key,requested_at)
 values(s.id,a.id,s.warehouse_id,s.sme_id,p_payload,p_key,p_requested_at)
 on conflict(shipment_id) do update set assignment_id=excluded.assignment_id,payload=excluded.payload,
 request_key=excluded.request_key,requested_at=excluded.requested_at,saved_at=now(),expires_at=now()+interval '24 hours';
 perform private.audit(s.warehouse_id,s.sme_id,'route_plan_shared',s.id);
 return public.route_plan_read(p_shipment);
end $$;
revoke all on function public.route_plan_read(uuid),public.route_plan_write(uuid,jsonb,uuid,timestamptz) from public,anon;
grant execute on function public.route_plan_read(uuid),public.route_plan_write(uuid,jsonb,uuid,timestamptz) to authenticated;
revoke all on function private.can_read_route_plan(uuid,uuid) from public,anon;
grant execute on function private.can_read_route_plan(uuid,uuid) to authenticated;
create index shipment_route_expiry_idx on public.shipment_route_plans(expires_at);
create or replace function public.run_retention(p_hours integer default 24) returns bigint
language plpgsql security definer set search_path='' as $$
declare n bigint; r bigint;
begin
 if p_hours<1 or p_hours>720 then raise exception 'invalid_retention' using errcode='22023'; end if;
 delete from public.rider_locations where received_at<now()-make_interval(hours=>p_hours);
 get diagnostics n=row_count;
 delete from public.shipment_route_plans where expires_at<=now() or saved_at<now()-make_interval(hours=>p_hours);
 get diagnostics r=row_count;
 return n+r;
end $$;
revoke all on function public.run_retention(integer) from public,anon,authenticated;
grant execute on function public.run_retention(integer) to service_role;
commit;
