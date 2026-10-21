begin;

-- Additive: never rewrite the already shared schema baseline.
alter table public.audit_records add column if not exists correlation_id uuid;
alter table public.outbox_events add column if not exists correlation_id uuid;
alter table public.outbox_events add column if not exists actor_id uuid references public.profiles(id);
alter table public.outbox_events add column attempts integer not null default 0;
alter table public.outbox_events add column lease_token uuid;
alter table public.outbox_events add column leased_until timestamptz;

create function private.request_correlation_id() returns uuid
language plpgsql set search_path = '' as $$
declare value text;
begin
  value := nullif(current_setting('parcelcare.correlation_id',true),'');
  if value is not null then return value::uuid; end if;
  begin
    value := (nullif(current_setting('request.headers',true),'')::jsonb ->> 'x-correlation-id')::uuid::text;
  exception when invalid_text_representation then value := null;
  end;
  if value is null then value := gen_random_uuid()::text; end if;
  perform set_config('parcelcare.correlation_id',value,true);
  return value::uuid;
end $$;

create function private.stamp_domain_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.correlation_id := private.request_correlation_id();
  new.actor_id := coalesce(auth.uid(),new.actor_id);
  return new;
end $$;
create trigger audit_context before insert on public.audit_records
for each row execute function private.stamp_domain_record();
create trigger outbox_context before insert on public.outbox_events
for each row execute function private.stamp_domain_record();

-- BE2/BE1 SQL commands can use this interface within their existing transaction.
-- Not an HTTP RPC and not callable by users: caller must already authorize scope.
create function private.emit_domain_event(w uuid,s uuid,action text,entity uuid,event_key text,payload jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare event_id uuid;
begin
  insert into public.outbox_events(warehouse_id,sme_id,event_type,entity_id,idempotency_key,payload)
    values(w,s,action,entity,event_key,payload) on conflict(idempotency_key) do nothing
    returning id into event_id;
  if event_id is not null then
    perform private.audit(w,s,action,entity,payload);
  elsif not exists(select 1 from public.outbox_events e where e.idempotency_key=event_key
    and e.warehouse_id=w and e.sme_id=s and e.event_type=action
    and e.entity_id=entity and e.payload=emit_domain_event.payload) then
    raise exception 'idempotency conflict' using errcode='22023';
  end if;
  return event_id;
end $$;

-- Dedicated SQL worker capability. No login, table grants or RLS bypass.
create role parcelcare_worker nologin noinherit;
grant usage on schema private to parcelcare_worker;
grant execute on function private.purge_expired_locations() to parcelcare_worker;

create function private.claim_outbox(p_warehouse uuid,p_limit integer default 25)
returns setof public.outbox_events language plpgsql security definer set search_path = '' as $$
begin
  if p_warehouse is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid claim scope or limit' using errcode='22023';
  end if;
  return query
  with pending as (
    select id from public.outbox_events
    where warehouse_id=p_warehouse and processed_at is null
      and (leased_until is null or leased_until<now())
    order by created_at,id for update skip locked limit p_limit
  )
  update public.outbox_events e set lease_token=gen_random_uuid(),
    leased_until=now()+interval '60 seconds', attempts=e.attempts+1
  from pending where e.id=pending.id returning e.*;
end $$;

create function private.ack_outbox(p_warehouse uuid,p_event uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.outbox_events set processed_at=now(),lease_token=null,leased_until=null
  where id=p_event and warehouse_id=p_warehouse and lease_token=p_lease
    and leased_until>now() and processed_at is null;
  return found;
end $$;
revoke all on function private.request_correlation_id(),private.stamp_domain_record(),
  private.emit_domain_event(uuid,uuid,text,uuid,text,jsonb),private.claim_outbox(uuid,integer),
  private.ack_outbox(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.claim_outbox(uuid,integer),private.ack_outbox(uuid,uuid,uuid) to parcelcare_worker;
commit;
