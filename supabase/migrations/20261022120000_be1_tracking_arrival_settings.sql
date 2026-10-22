begin;
create table public.warehouse_tracking_settings (
 warehouse_id uuid primary key references public.warehouses(id),
 live_gps_enabled boolean not null default true,
 demo_simulation_enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.warehouse_tracking_settings enable row level security;
revoke all on public.warehouse_tracking_settings from public,anon,authenticated;
create function public.tracking_settings(p_warehouse uuid,p_value jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.memberships where warehouse_id=p_warehouse and profile_id=auth.uid() and active) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_value is not null then
  if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_value->'live_gps_enabled') is distinct from 'boolean' or jsonb_typeof(p_value->'demo_simulation_enabled') is distinct from 'boolean' then raise exception 'invalid_settings' using errcode='22023'; end if;
  insert into public.warehouse_tracking_settings(warehouse_id,live_gps_enabled,demo_simulation_enabled)
  values(p_warehouse,(p_value->>'live_gps_enabled')::boolean,(p_value->>'demo_simulation_enabled')::boolean)
  on conflict(warehouse_id) do update set live_gps_enabled=excluded.live_gps_enabled,demo_simulation_enabled=excluded.demo_simulation_enabled,updated_at=now();
  if not (p_value->>'live_gps_enabled')::boolean then update public.tracking_sessions set status='stopped',ended_at=now() where warehouse_id=p_warehouse and status='active'; end if;
  perform private.audit(p_warehouse,null,'tracking_settings_changed',p_warehouse,p_value);
 end if;
 return coalesce((select to_jsonb(t)-'warehouse_id' from public.warehouse_tracking_settings t where warehouse_id=p_warehouse),'{"live_gps_enabled":true,"demo_simulation_enabled":true}'::jsonb);
end $$;
revoke all on function public.tracking_settings(uuid,jsonb) from public,anon;
grant execute on function public.tracking_settings(uuid,jsonb) to authenticated;
create table public.shipment_arrivals (
 shipment_id uuid primary key references public.shipments(id),
 warehouse_id uuid not null references public.warehouses(id), sme_id uuid not null,
 assignment_id uuid not null references public.delivery_assignments(id),
 confirmed_by uuid not null, arrived_at timestamptz not null default now(),
 latitude double precision not null, longitude double precision not null,
 foreign key(sme_id,warehouse_id) references public.smes(id,warehouse_id)
);
alter table public.shipment_arrivals enable row level security;
revoke all on public.shipment_arrivals from public,anon,authenticated;
create function public.shipment_arrival(p_shipment uuid,p_confirm boolean default false) returns jsonb
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
create or replace function public.start_tracking(p_assignment uuid,p_consent boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.delivery_assignments; s public.shipments; t uuid;
begin
  select * into a from public.delivery_assignments where id=p_assignment for update;
  select * into s from public.shipments where id=a.shipment_id;
  if a.id is null or not exists(select 1 from public.riders r join public.memberships m on m.profile_id=r.profile_id and m.warehouse_id=r.warehouse_id
    where r.id=a.rider_id and r.profile_id=auth.uid() and r.active and m.active and m.role='rider')
    then raise exception 'forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.warehouse_tracking_settings where warehouse_id=s.warehouse_id and not live_gps_enabled) then raise exception 'gps_disabled' using errcode='22023'; end if;
  if p_consent is distinct from true or a.accepted_at is null or a.picked_up_at is null or a.cancelled_at is not null or a.completed_at is not null
    or s.delivery_mode<>'in_house' or s.status in ('delivered','cancelled') then raise exception 'tracking_not_allowed' using errcode='22023'; end if;
  select id into t from public.tracking_sessions where assignment_id=a.id and status='active';
  if t is not null then return t; end if;
  insert into public.tracking_sessions(shipment_id,warehouse_id,sme_id,rider_id,assignment_id,consent_at)
    values(s.id,s.warehouse_id,s.sme_id,a.rider_id,a.id,now()) returning id into t;
  perform private.audit(s.warehouse_id,s.sme_id,'tracking_started',t);
  return t;
end $$;
create or replace function public.record_location(p_session uuid,p_lat double precision,p_lon double precision,p_accuracy double precision,p_recorded timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.tracking_sessions; previous public.rider_locations; loc uuid;
begin
  select * into t from public.tracking_sessions where id=p_session for update;
  if t.id is null or not private.can_read_tracking(t.id) or not exists(select 1 from public.riders where id=t.rider_id and profile_id=auth.uid() and active)
    then raise exception 'forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.warehouse_tracking_settings where warehouse_id=t.warehouse_id and not live_gps_enabled) then raise exception 'gps_disabled' using errcode='22023'; end if;
  if p_recorded is null or p_recorded>now()+interval '30 seconds' or p_recorded<now()-interval '5 minutes' or p_recorded<t.started_at-interval '30 seconds'
    then raise exception 'invalid_location_time' using errcode='22023'; end if;
  select * into previous from public.rider_locations where session_id=t.id order by recorded_at desc limit 1;
  if previous.recorded_at=p_recorded then
    if previous.latitude=p_lat and previous.longitude=p_lon and previous.accuracy_m=p_accuracy then return previous.id; end if;
    raise exception 'location_replay_conflict' using errcode='22023';
  end if;
  if previous.id is not null and (p_recorded<=previous.recorded_at or now()-previous.received_at<interval '10 seconds')
    then raise exception 'location_rate_or_order' using errcode='22023'; end if;
  insert into public.rider_locations(session_id,latitude,longitude,accuracy_m,recorded_at)
    values(t.id,p_lat,p_lon,p_accuracy,p_recorded) returning id into loc;
  update public.tracking_sessions set last_location_at=p_recorded where id=t.id;
  return loc;
end $$;
create or replace function public.delivery_command(p_kind text,p_shipment uuid,p_key uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.shipments; a public.delivery_assignments; proof public.delivery_proofs; approval public.approvals;
 old private.workflow_commands; req jsonb; result jsonb; v_id uuid; staff boolean; rider boolean; evidence uuid:=(p_body->>'evidence_id')::uuid;
begin
 if auth.uid() is null or p_key is null then raise exception 'forbidden' using errcode='42501'; end if;
 perform set_config('parcelcare.correlation_id',p_correlation::text,true);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'delivery.'||p_kind||p_key::text,0));
 select * into s from public.shipments where id=p_shipment for update;
 if s.id is null or not private.can_read_shipment(s.id) then raise exception 'forbidden' using errcode='42501'; end if;
 staff:=private.is_staff(s.warehouse_id);rider:=private.is_assigned_rider(s.id);
 if p_kind in ('assign','cancel','handover','courier','capacity') and not staff then raise exception 'forbidden' using errcode='42501'; end if;
 if p_kind in ('accept','pickup','proof') and not (staff or rider) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_kind='confirm' and not private.is_sme(s.warehouse_id,s.sme_id) then raise exception 'forbidden' using errcode='42501'; end if;
 req:=jsonb_build_object('shipment',s.id,'body',p_body);
 select * into old from private.workflow_commands where actor_id=auth.uid() and key=p_key and kind='delivery.'||p_kind;
 if old.key is not null then
  if old.request<>req then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return old.result;
 end if;
 if (p_body->>'expected_version')::integer is distinct from s.version then raise exception 'stale_version' using errcode='22023'; end if;
 if coalesce(length(btrim(p_body->>'note')),0) not between 1 and 2000 or s.status in ('delivered','cancelled') then raise exception 'invalid_delivery_command' using errcode='22023'; end if;
 select * into a from public.delivery_assignments where shipment_id=s.id and completed_at is null and cancelled_at is null for update;
 if evidence is not null and not exists(select 1 from public.evidence e join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=e.object_path where e.id=evidence and e.shipment_id=s.id and private.can_read_evidence(e.id)) then raise exception 'invalid_evidence' using errcode='22023'; end if;
 if p_kind='assign' then
  if s.delivery_mode<>'in_house' or s.status not in ('ready','assigned','picked_up','failed','delayed') or not exists(select 1 from public.riders r join public.memberships m on m.profile_id=r.profile_id and m.warehouse_id=r.warehouse_id where r.id=(p_body->>'rider_id')::uuid and r.warehouse_id=s.warehouse_id and r.active and m.active and m.role='rider') then raise exception 'invalid_assignment' using errcode='22023'; end if;
  if a.id is not null then update public.delivery_assignments set cancelled_at=now() where id=a.id; end if;
  insert into public.delivery_assignments(shipment_id,warehouse_id,sme_id,rider_id) values(s.id,s.warehouse_id,s.sme_id,(p_body->>'rider_id')::uuid) returning id into v_id;
  update public.shipments set status='assigned' where id=s.id;
 elsif p_kind='cancel' then
  if a.id is not null then update public.delivery_assignments set cancelled_at=now() where id=a.id; end if;
  update public.shipments set status='cancelled' where id=s.id;
 elsif p_kind in ('accept','pickup') then
  if a.id is null or not exists(select 1 from public.riders r where r.id=a.rider_id and r.profile_id=auth.uid() and r.active) then raise exception 'forbidden' using errcode='42501'; end if;
  if s.status not in ('assigned','picked_up') then raise exception 'invalid_assignment' using errcode='22023'; end if;
  if p_kind='accept' then
   if a.accepted_at is not null then raise exception 'already_accepted' using errcode='22023'; end if;
   update public.delivery_assignments set accepted_at=now() where id=a.id;
  else
   if a.accepted_at is null or a.picked_up_at is not null or not exists(select 1 from public.shipment_events where shipment_id=s.id and type='packed') then raise exception 'pickup_not_allowed' using errcode='22023'; end if;
   update public.delivery_assignments set picked_up_at=now() where id=a.id;
   update public.shipments set status='picked_up' where id=s.id;
  end if;
 elsif p_kind='proof' then
  if a.id is null or a.picked_up_at is null or s.status<>'in_transit' or evidence is null or nullif(btrim(p_body->>'received_by'),'') is null then raise exception 'incomplete_proof' using errcode='22023'; end if;
  insert into public.delivery_proofs(shipment_id,warehouse_id,sme_id,submitted_by,received_by,evidence_id) values(s.id,s.warehouse_id,s.sme_id,auth.uid(),p_body->>'received_by',evidence) returning id into v_id;
 elsif p_kind='confirm' then
  if s.delivery_mode='in_house' and not exists(select 1 from public.shipment_arrivals where shipment_id=s.id and assignment_id=a.id) then raise exception 'courier_arrival_required' using errcode='22023'; end if;
  select * into proof from public.delivery_proofs where id=(p_body->>'proof_id')::uuid and shipment_id=s.id for update;
  if proof.id is null or proof.confirmed_at is not null or proof.submitted_by=auth.uid() or s.status<>'in_transit'
    or not exists(select 1 from public.evidence e join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=e.object_path where e.id=proof.evidence_id) then raise exception 'incomplete_proof' using errcode='22023'; end if;
  update public.delivery_proofs set confirmed_by=auth.uid(),confirmed_at=now() where id=proof.id;
  update public.shipments set status='delivered',last_verified_at=now() where id=s.id;
  update public.delivery_assignments set completed_at=now() where id=a.id;
 elsif p_kind='handover' then
  if s.delivery_mode<>'third_party' or s.status not in ('ready','delayed') or evidence is null
   or nullif(btrim(p_body->>'courier_name'),'') is null or nullif(btrim(p_body->>'waybill'),'') is null
   or nullif(btrim(p_body->>'package_condition'),'') is null or (p_body->>'package_count')::integer is null or (p_body->>'package_count')::integer<=0
   or (p_body->>'accepted_at')::timestamptz is null or (p_body->>'accepted_at')::timestamptz>now() or (p_body->>'accepted_at')::timestamptz<s.created_at
   or (p_body->>'tracking_url') !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$' then raise exception 'invalid_handover' using errcode='22023'; end if;
  insert into public.handover_records(shipment_id,warehouse_id,sme_id,courier_name,waybill,accepted_at,package_condition,package_count,evidence_id,recorded_by)
   values(s.id,s.warehouse_id,s.sme_id,p_body->>'courier_name',p_body->>'waybill',(p_body->>'accepted_at')::timestamptz,p_body->>'package_condition',(p_body->>'package_count')::integer,evidence,auth.uid()) returning id into v_id;
  update public.shipments set status='handed_over',courier_name=p_body->>'courier_name',waybill=p_body->>'waybill',tracking_url=p_body->>'tracking_url',last_verified_at=(p_body->>'accepted_at')::timestamptz where id=s.id;
 elsif p_kind='courier' then
  if s.delivery_mode<>'third_party' or evidence is null or not exists(select 1 from public.handover_records where shipment_id=s.id)
   or p_body->>'status' not in ('handed_over','delayed','failed','delivered') then raise exception 'invalid_courier_update' using errcode='22023'; end if;
  update public.shipments set status=p_body->>'status',last_verified_at=now() where id=s.id;
 elsif p_kind='capacity' then
  select * into approval from public.approvals where id=(p_body->>'approval_id')::uuid for update;
  if a.id is null or approval.id is null or approval.status<>'decided' or approval.decision<>'propose_retry'
   or not exists(select 1 from public.exception_cases c where c.id=approval.case_id and c.shipment_id=s.id and c.status not in ('closed','resolved'))
   or (p_body->>'scheduled_at')::timestamptz is null or (p_body->>'scheduled_at')::timestamptz<=now() then raise exception 'invalid_capacity' using errcode='22023'; end if;
  insert into public.delivery_capacity(approval_id,assignment_id,warehouse_id,sme_id,scheduled_at,confirmed_by,instructions)
   values(approval.id,a.id,s.warehouse_id,s.sme_id,(p_body->>'scheduled_at')::timestamptz,auth.uid(),p_body->>'note') returning id into v_id;
 else raise exception 'invalid_command' using errcode='22023'; end if;
 update public.shipments set version=version+1 where id=s.id;
 insert into public.shipment_events(shipment_id,warehouse_id,sme_id,type,details,source,actor_id)
  values(s.id,s.warehouse_id,s.sme_id,'delivery.'||p_kind,p_body||jsonb_build_object('related_id',v_id),case when staff then 'staff' when rider then 'rider' else 'sme' end,auth.uid());
 perform private.audit(s.warehouse_id,s.sme_id,'delivery.'||p_kind,s.id,p_body);
 insert into public.outbox_events(warehouse_id,sme_id,event_type,entity_id,idempotency_key,payload,actor_id,correlation_id)
  values(s.warehouse_id,s.sme_id,case when p_kind='confirm' then 'delivery.completed' else 'delivery.'||p_kind end,s.id,'delivery:'||auth.uid()::text||':'||p_kind||':'||p_key::text,p_body||jsonb_build_object('shipment_id',s.id,'related_id',v_id),auth.uid(),p_correlation);
 result:=public.delivery_read(s.id);
 insert into private.workflow_commands(actor_id,key,kind,request,result) values(auth.uid(),p_key,'delivery.'||p_kind,req,result);
 return result;
end $$;
create or replace function public.route_plan_write(p_shipment uuid,p_payload jsonb,p_key uuid,p_requested_at timestamptz) returns jsonb
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
 or p_key is null or p_payload->>'provider' is distinct from 'openrouteservice' or coalesce(p_payload->>'profile','') not in ('car','bicycle','walking')
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
commit;
