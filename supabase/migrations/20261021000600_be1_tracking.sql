begin;
create function public.start_tracking(p_assignment uuid,p_consent boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.delivery_assignments; s public.shipments; t uuid;
begin
  select * into a from public.delivery_assignments where id=p_assignment for update;
  select * into s from public.shipments where id=a.shipment_id;
  if a.id is null or not exists(select 1 from public.riders r join public.memberships m on m.profile_id=r.profile_id and m.warehouse_id=r.warehouse_id
    where r.id=a.rider_id and r.profile_id=auth.uid() and r.active and m.active and m.role='rider')
    then raise exception 'forbidden' using errcode='42501'; end if;
  if p_consent is distinct from true or a.accepted_at is null or a.picked_up_at is null or a.cancelled_at is not null or a.completed_at is not null
    or s.delivery_mode<>'in_house' or s.status in ('delivered','cancelled') then raise exception 'tracking_not_allowed' using errcode='22023'; end if;
  select id into t from public.tracking_sessions where assignment_id=a.id and status='active';
  if t is not null then return t; end if;
  insert into public.tracking_sessions(shipment_id,warehouse_id,sme_id,rider_id,assignment_id,consent_at)
    values(s.id,s.warehouse_id,s.sme_id,a.rider_id,a.id,now()) returning id into t;
  perform private.audit(s.warehouse_id,s.sme_id,'tracking_started',t);
  return t;
end $$;

create function public.record_location(p_session uuid,p_lat double precision,p_lon double precision,p_accuracy double precision,p_recorded timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.tracking_sessions; previous public.rider_locations; loc uuid;
begin
  select * into t from public.tracking_sessions where id=p_session for update;
  if t.id is null or not private.can_read_tracking(t.id) or not exists(select 1 from public.riders where id=t.rider_id and profile_id=auth.uid() and active)
    then raise exception 'forbidden' using errcode='42501'; end if;
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

create function public.get_live_location(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tracking_sessions; l public.rider_locations;
begin
  select * into t from public.tracking_sessions where id=p_session;
  if t.id is null or not private.can_read_tracking(t.id) then raise exception 'forbidden' using errcode='42501'; end if;
  select * into l from public.rider_locations where session_id=t.id and received_at>now()-interval '24 hours' order by recorded_at desc limit 1;
  perform private.audit(t.warehouse_id,t.sme_id,'live_location_viewed',t.id);
  return jsonb_build_object('session_id',t.id,'status',case when l.id is null then 'unavailable'
    when l.recorded_at<now()-interval '60 seconds' then 'stale' else 'live' end,
    'latitude',l.latitude,'longitude',l.longitude,'accuracy_m',l.accuracy_m,'recorded_at',l.recorded_at,'received_at',l.received_at);
end $$;

create function public.stop_tracking(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tracking_sessions;
begin
  select * into t from public.tracking_sessions where id=p_session for update;
  if t.id is null or not (private.is_staff(t.warehouse_id) or
    (private.is_assigned_rider(t.shipment_id) and exists(select 1 from public.riders where id=t.rider_id and profile_id=auth.uid())))
    then raise exception 'forbidden' using errcode='42501'; end if;
  if t.status='active' then
    update public.tracking_sessions set status='stopped',ended_at=now() where id=t.id;
    perform private.audit(t.warehouse_id,t.sme_id,'tracking_stopped',t.id);
  end if;
end $$;

-- Backstop: trusted operational writes cannot leave tracking accessible after
-- terminal delivery/cancellation or an assignment's completion/revocation.
create function private.end_tracking_on_shipment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('delivered','cancelled') then
    update public.tracking_sessions set status=case when new.status='delivered' then 'completed' else 'cancelled' end,
      ended_at=now() where shipment_id=new.id and status='active';
  end if;
  return new;
end $$;
create trigger shipment_tracking_end after update of status on public.shipments for each row execute function private.end_tracking_on_shipment();
create function private.end_tracking_on_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cancelled_at is not null or new.completed_at is not null then
    update public.tracking_sessions set status=case when new.completed_at is not null then 'completed' else 'cancelled' end,
      ended_at=now() where assignment_id=new.id and status='active';
  end if;
  return new;
end $$;
create trigger assignment_tracking_end after update of completed_at,cancelled_at on public.delivery_assignments for each row execute function private.end_tracking_on_assignment();

create function private.purge_expired_locations() returns bigint
language plpgsql security definer set search_path = '' as $$
declare affected bigint;
begin
  delete from public.rider_locations where received_at<now()-interval '24 hours';
  get diagnostics affected = row_count;
  return affected;
end $$;
create index location_retention_idx on public.rider_locations(received_at);
revoke all on function public.start_tracking(uuid,boolean),public.record_location(uuid,double precision,double precision,double precision,timestamptz),
  public.get_live_location(uuid),public.stop_tracking(uuid) from public,anon;
grant execute on function public.start_tracking(uuid,boolean),public.record_location(uuid,double precision,double precision,double precision,timestamptz),
  public.get_live_location(uuid),public.stop_tracking(uuid) to authenticated;
revoke all on function private.end_tracking_on_shipment(),private.end_tracking_on_assignment(),private.purge_expired_locations() from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.purge_expired_locations() to service_role;
commit;
