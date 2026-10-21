begin;
alter table public.shipments add column version integer not null default 1 check(version>0);
alter table public.products add column version integer not null default 1 check(version>0);
alter table public.audit_records add column correlation_id uuid;
alter table public.outbox_events add column correlation_id uuid;
alter table public.outbox_events add column actor_id uuid references public.profiles(id);

create table private.operation_commands (
  warehouse_id uuid not null references public.warehouses(id), actor_id uuid not null references public.profiles(id),
  kind text not null, key uuid not null, request jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(warehouse_id,actor_id,kind,key)
);
alter table private.operation_commands enable row level security;
revoke all on private.operation_commands from public,anon,authenticated;

create or replace function private.audit(w uuid,s uuid,action text,entity uuid,data jsonb default '{}') returns void
language sql security definer set search_path='' as $$
 insert into public.audit_records(warehouse_id,sme_id,actor_id,action,entity_id,details,correlation_id)
 values(w,s,auth.uid(),action,entity,data,nullif(current_setting('parcelcare.correlation_id',true),'')::uuid);
$$;

create function private.ops_inventory(p public.products) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'warehouse_id',p.warehouse_id,'sme_id',p.sme_id,'sku',p.sku,'name',p.name,
  'available_qty',p.available_qty,'quarantined_qty',p.quarantined_qty,'shipment_ids',
  coalesce((select jsonb_agg(i.shipment_id order by i.shipment_id) from public.shipment_items i where i.product_id=p.id),'[]'::jsonb));
$$;
create function private.ops_shipment(s public.shipments) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'warehouse_id',s.warehouse_id,'sme_id',s.sme_id,'reference',s.reference,
 'direction',s.direction,'delivery_mode',s.delivery_mode,'status',s.status,'version',s.version,'created_at',s.created_at,
 'evidence_ids',coalesce((select jsonb_agg(e.id order by e.id) from public.evidence e where e.shipment_id=s.id
 and exists(select 1 from storage.objects o where o.bucket_id='parcelcare-evidence' and o.name=e.object_path)),'[]'::jsonb));
$$;
create function private.ops_allowed(s public.shipments) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if s.direction<>'outbound' or s.delivery_mode<>'in_house' or s.status not in ('ready','assigned','picked_up') then return '[]'; end if;
 if not exists(select 1 from public.shipment_events where shipment_id=s.id and type='picked') then return '["picked"]'; end if;
 if not exists(select 1 from public.shipment_events where shipment_id=s.id and type='packed') then return '["packed"]'; end if;
 if exists(select 1 from public.delivery_assignments a join public.riders r on r.id=a.rider_id
   where a.shipment_id=s.id and a.cancelled_at is null and a.completed_at is null and a.accepted_at is not null
   and a.picked_up_at is not null and r.active and exists(select 1 from public.memberships m
    where m.profile_id=r.profile_id and m.warehouse_id=s.warehouse_id and m.role='rider' and m.active))
 then return '["dispatched"]'; end if;
 return '[]';
end $$;
create function private.ops_detail(s public.shipments) returns jsonb language sql stable security definer set search_path='' as $$
 select private.ops_shipment(s)||jsonb_build_object(
 'items',coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'sku',p.sku,'name',p.name,
 'expected_qty',i.expected_qty,'received_qty',i.received_qty,'damaged_qty',i.damaged_qty) order by i.product_id)
 from public.shipment_items i join public.products p on p.id=i.product_id where i.shipment_id=s.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'notes',coalesce(e.details->>'notes',''),
 'verified_at',coalesce(e.details->>'verified_at',e.created_at::text),'recorded_at',e.created_at,
 'evidence_ids',coalesce(e.details->'evidence_ids','[]'::jsonb)) order by e.created_at,e.id)
 from public.shipment_events e where e.shipment_id=s.id),'[]'::jsonb),
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'label',e.mime_type,'verified',
 exists(select 1 from storage.objects o where o.bucket_id='parcelcare-evidence' and o.name=e.object_path)) order by e.id)
 from public.evidence e where e.shipment_id=s.id),'[]'::jsonb), 'allowed_events',private.ops_allowed(s));
$$;

create function public.ops_read(p_warehouse uuid,p_kind text,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_sme uuid:=(p_filters->>'sme_id')::uuid; v_cursor uuid:=(p_filters->>'cursor')::uuid;
 v_limit integer:=coalesce((p_filters->>'limit')::integer,25); s public.shipments;
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 if v_limit<1 or v_limit>100 then raise exception 'invalid_limit' using errcode='22023'; end if;
 if v_sme is not null and not exists(select 1 from public.smes where id=v_sme and warehouse_id=p_warehouse)
 then raise exception 'invalid_sme' using errcode='22023'; end if;
 if p_kind='overview' then
  return jsonb_build_object('warehouse_id',p_warehouse,'unique_skus',(select count(*) from public.products where warehouse_id=p_warehouse),
   'inbound_shipments',(select count(*) from public.shipments where warehouse_id=p_warehouse and direction='inbound'),
   'outbound_shipments',(select count(*) from public.shipments where warehouse_id=p_warehouse and direction='outbound'),
   'open_cases',(select count(*) from public.exception_cases where warehouse_id=p_warehouse and status not in ('resolved','closed')),'as_of',now());
 elsif p_kind='directory' then
  return (select jsonb_build_object('warehouse_id',w.id,'name',w.name,'smes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id)
    from public.smes where warehouse_id=w.id),'[]'::jsonb)) from public.warehouses w where w.id=p_warehouse);
 elsif p_kind='detail' then
  select * into s from public.shipments where id=(p_filters->>'shipment_id')::uuid and warehouse_id=p_warehouse;
  if s.id is null then return null; end if;
  return private.ops_detail(s);
 elsif p_kind='stock' then
  return (select jsonb_build_object('product',private.ops_inventory(p),'version',p.version) from public.products p
   where p.id=(p_filters->>'product_id')::uuid and p.warehouse_id=p_warehouse);
 elsif p_kind='inventory' then
  select coalesce(jsonb_agg(x.item order by x.id),'[]'::jsonb) into v_result from
   (select p.id,private.ops_inventory(p) item from public.products p where p.warehouse_id=p_warehouse
    and (v_sme is null or p.sme_id=v_sme) and (v_cursor is null or p.id>v_cursor)
    and (not(p_filters ? 'stock_status') or (p_filters->>'stock_status'='available' and p.available_qty>0)
      or (p_filters->>'stock_status'='quarantined' and p.quarantined_qty>0)) order by p.id limit v_limit+1) x;
 elsif p_kind='shipments' then
  select coalesce(jsonb_agg(x.item order by x.id),'[]'::jsonb) into v_result from
   (select sh.id,private.ops_shipment(sh) item from public.shipments sh where sh.warehouse_id=p_warehouse
    and (v_sme is null or sh.sme_id=v_sme) and (v_cursor is null or sh.id>v_cursor)
    and (not(p_filters ? 'direction') or sh.direction=p_filters->>'direction')
    and (not(p_filters ? 'status') or sh.status=p_filters->>'status') order by sh.id limit v_limit+1) x;
 elsif p_kind='cases' then
  select coalesce(jsonb_agg(x.item order by x.id),'[]'::jsonb) into v_result from
   (select c.id,jsonb_build_object('id',c.id,'shipment_id',c.shipment_id,'stage',c.stage,'type',c.type,'priority',c.priority,
    'status',c.status,'handling_mode',c.handling_mode,'responsible_party',c.responsible_party,'summary',c.summary,
    'evidence_ids',coalesce((select jsonb_agg(distinct e.value) from public.case_events ce,
     lateral jsonb_array_elements(coalesce(ce.payload->'evidence_ids','[]'::jsonb)) e where ce.case_id=c.id),'[]'::jsonb)) item
    from public.exception_cases c where c.warehouse_id=p_warehouse and (v_sme is null or c.sme_id=v_sme)
    and (v_cursor is null or c.id>v_cursor) and (p_filters->>'status'='all' or c.status not in ('resolved','closed'))
    order by c.id limit v_limit+1) x;
 else raise exception 'invalid_read' using errcode='22023'; end if;
 return jsonb_build_object('items',case when jsonb_array_length(v_result)>v_limit then v_result-v_limit else v_result end,
 'next_cursor',case when jsonb_array_length(v_result)>v_limit then v_result->(v_limit-1)->>'id' else null end);
end $$;

create function public.ops_command(p_warehouse uuid,p_kind text,p_key uuid,p_entity uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.shipments; p public.products; v_result jsonb; v_old private.operation_commands; v_request jsonb;
 v_line record; v_legacy jsonb; v_expected integer; v_received integer; v_damage integer; v_receipt uuid;
 v_event text; v_evidence jsonb:=coalesce(p_body->'evidence_ids','[]'::jsonb); v_sme uuid;
 v_available integer; v_quarantine integer; v_entity uuid:=p_entity;
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_key is null or p_correlation is null or p_body is null or jsonb_typeof(p_body)<>'object' then raise exception 'invalid_command' using errcode='22023'; end if;
 perform set_config('parcelcare.correlation_id',p_correlation::text,true);
 -- Actor/scope/operation/key serialization also covers create and cross-entity key reuse.
 perform pg_advisory_xact_lock(hashtextextended(p_warehouse::text||auth.uid()::text||p_kind||p_key::text,0));
 v_request:=jsonb_build_object('entity',p_entity,'body',p_body);
 select * into v_old from private.operation_commands where warehouse_id=p_warehouse and actor_id=auth.uid() and kind=p_kind and key=p_key;
 if v_old.key is not null then
  if v_old.request<>v_request then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return v_old.result;
 end if;
 if p_kind='create' then
  v_sme:=(p_body->>'sme_id')::uuid;
  if not exists(select 1 from public.smes where id=v_sme and warehouse_id=p_warehouse)
    or p_body->>'direction' not in ('inbound','outbound') or nullif(btrim(p_body->>'reference'),'') is null
    or length(p_body->>'reference')>120 or jsonb_typeof(p_body->'lines')<>'array' or jsonb_array_length(p_body->'lines') not between 1 and 100
    or (select count(*)<>count(distinct value->>'product_id') from jsonb_array_elements(p_body->'lines'))
   then raise exception 'invalid_shipment' using errcode='22023'; end if;
  insert into public.shipments(warehouse_id,sme_id,reference,direction,delivery_mode,status)
   values(p_warehouse,v_sme,p_body->>'reference',p_body->>'direction',p_body->>'delivery_mode',
   case when p_body->>'direction'='inbound' then 'expected' else 'ready' end) returning * into s;
  for v_line in select * from jsonb_to_recordset(p_body->'lines') as x(product_id uuid,expected_qty integer) order by product_id loop
   if v_line.expected_qty is null or v_line.expected_qty<=0 or not exists(select 1 from public.products
    where id=v_line.product_id and warehouse_id=p_warehouse and sme_id=v_sme) then raise exception 'invalid_product' using errcode='22023'; end if;
   insert into public.shipment_items(shipment_id,warehouse_id,sme_id,product_id,expected_qty)
    values(s.id,p_warehouse,v_sme,v_line.product_id,v_line.expected_qty);
  end loop;
  v_entity:=s.id; v_result:=private.ops_shipment(s);
 elsif p_kind='correction' then
  select * into p from public.products where id=p_entity and warehouse_id=p_warehouse for update;
  if p.id is null then raise exception 'forbidden' using errcode='42501'; end if;
  if (p_body->>'expected_version')::integer is distinct from p.version then raise exception 'stale_version' using errcode='22023'; end if;
  v_available:=(p_body->>'available_delta')::integer; v_quarantine:=(p_body->>'quarantined_delta')::integer;
  if v_available is null or v_quarantine is null or (v_available=0 and v_quarantine=0)
    or nullif(btrim(p_body->>'notes'),'') is null then raise exception 'invalid_correction' using errcode='22023'; end if;
  if p.available_qty::bigint+v_available<0 or p.quarantined_qty::bigint+v_quarantine<0 then raise exception 'stock_unavailable' using errcode='22023'; end if;
  if jsonb_typeof(v_evidence)<>'array' or jsonb_array_length(v_evidence)=0 or exists(select 1 from jsonb_array_elements_text(v_evidence) x
   where not exists(select 1 from public.evidence e join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=e.object_path
    where e.id=x.value::uuid and e.warehouse_id=p_warehouse and e.sme_id=p.sme_id)) then raise exception 'invalid_evidence' using errcode='22023'; end if;
  update public.products set available_qty=available_qty+v_available,quarantined_qty=quarantined_qty+v_quarantine,version=version+1 where id=p.id;
  insert into public.stock_movements(warehouse_id,sme_id,product_id,available_delta,quarantined_delta,previous_available,updated_available,
   previous_quarantined,updated_quarantined,reason,actor_id) values(p_warehouse,p.sme_id,p.id,v_available,v_quarantine,p.available_qty,
   p.available_qty+v_available,p.quarantined_qty,p.quarantined_qty+v_quarantine,'staff_correction: '||(p_body->>'notes'),auth.uid());
  v_sme:=p.sme_id;
  select private.ops_inventory(pr)||'{}'::jsonb into v_result from public.products pr where id=p.id;
  v_result:=jsonb_build_object('product',v_result,'version',p.version+1);
 else
  select * into s from public.shipments where id=p_entity and warehouse_id=p_warehouse for update;
  if s.id is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_sme:=s.sme_id;
  if (p_body->>'expected_version')::integer is distinct from s.version then raise exception 'stale_version' using errcode='22023'; end if;
  if jsonb_typeof(v_evidence)<>'array' or exists(select 1 from jsonb_array_elements_text(v_evidence) x where not exists(
    select 1 from public.evidence e join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=e.object_path
    where e.id=x.value::uuid and e.shipment_id=s.id)) then raise exception 'invalid_evidence' using errcode='22023'; end if;
  -- Every stock-changing path locks products in the same order.
  perform 1 from public.products pr join public.shipment_items i on i.product_id=pr.id where i.shipment_id=s.id order by pr.id for update of pr;
  if p_kind='receipt' then
   if jsonb_typeof(p_body->'final') is distinct from 'boolean' or jsonb_typeof(p_body->'lines') is distinct from 'array'
    or jsonb_array_length(p_body->'lines') not between 1 and 100
    then raise exception 'invalid_receipt' using errcode='22023'; end if;
   -- The receipt's internal key cannot collide with another actor's command key.
   v_legacy:=public.receive_shipment(s.id,gen_random_uuid(),p_body->'lines',(p_body->>'final')::boolean,p_body->>'notes');
   v_receipt:=(v_legacy->>'receipt_id')::uuid;
   update public.products pr set version=version+1 where id in(select (value->>'product_id')::uuid from jsonb_array_elements(p_body->'lines'));
   update public.shipments set version=version+1 where id=s.id returning * into s;
   update public.shipment_events set details=details||jsonb_build_object('evidence_ids',v_evidence)
    where shipment_id=s.id and details->>'receipt_id'=v_receipt::text;
   select sum(expected_qty),sum(received_qty),sum(damaged_qty) into v_expected,v_received,v_damage from public.shipment_items where shipment_id=s.id;
   update public.case_events set payload=payload||jsonb_build_object('evidence_ids',v_evidence) where payload->>'receipt_id'=v_receipt::text;
   update public.outbox_events set event_type=case when payload->>'type'='quantity_mismatch' then 'receipt.quantity_mismatch' else 'receipt.damaged_goods' end,
    correlation_id=p_correlation,actor_id=auth.uid(),payload=payload||jsonb_build_object('shipment_id',s.id,'expected_qty',v_expected,
    'received_qty',v_received,'shortage_qty',v_expected-v_received,'damaged_qty',v_damage,'good_qty',v_received-v_damage,
    'final',(p_body->>'final')::boolean,'evidence_ids',v_evidence,'actor_id',auth.uid(),'occurred_at',now(),'schema_version',1,
    'warehouse_id',s.warehouse_id,'sme_id',s.sme_id,'command_id',p_key,'correlation_id',p_correlation)
    where payload->>'receipt_id'=v_receipt::text;
   v_result:=jsonb_build_object('shipment',private.ops_shipment(s),'expected_qty',v_expected,'received_qty',v_received,
    'good_qty',v_received-v_damage,'damaged_qty',v_damage,'shortage_qty',v_expected-v_received,
    'case_ids',coalesce((select jsonb_agg(id order by id) from public.exception_cases where shipment_id=s.id and stage='inbound'
       and status not in ('resolved','closed')),'[]'::jsonb),
    'stock',coalesce((select jsonb_agg(private.ops_inventory(pr) order by pr.id) from public.products pr join public.shipment_items i on i.product_id=pr.id
      where i.shipment_id=s.id),'[]'::jsonb));
  elsif p_kind='event' then
   v_event:=p_body->>'type';
   if v_event is null or not(private.ops_allowed(s) ? v_event) or nullif(btrim(p_body->>'notes'),'') is null
    or (p_body->>'verified_at')::timestamptz is null or (p_body->>'verified_at')::timestamptz>now()
    or (p_body->>'verified_at')::timestamptz<s.created_at
    or exists(select 1 from public.shipment_events where shipment_id=s.id and (details->>'verified_at')::timestamptz>(p_body->>'verified_at')::timestamptz)
    then raise exception 'event_not_allowed' using errcode='22023'; end if;
   if v_event='dispatched' then
    -- Lock assignment/rider records against cancellation or deactivation during dispatch.
    perform 1 from public.delivery_assignments a join public.riders r on r.id=a.rider_id where a.shipment_id=s.id
     and a.cancelled_at is null and a.completed_at is null for update of a,r;
    if not(private.ops_allowed(s) ? 'dispatched') then raise exception 'event_not_allowed' using errcode='22023'; end if;
    for v_line in select pr.*,i.expected_qty from public.products pr join public.shipment_items i on i.product_id=pr.id where i.shipment_id=s.id order by pr.id loop
     if v_line.available_qty<v_line.expected_qty then raise exception 'stock_unavailable' using errcode='22023'; end if;
     update public.products set available_qty=available_qty-v_line.expected_qty,version=version+1 where id=v_line.id;
     insert into public.stock_movements(warehouse_id,sme_id,product_id,available_delta,quarantined_delta,previous_available,updated_available,
      previous_quarantined,updated_quarantined,reason,actor_id) values(p_warehouse,s.sme_id,v_line.id,-v_line.expected_qty,0,
      v_line.available_qty,v_line.available_qty-v_line.expected_qty,v_line.quarantined_qty,v_line.quarantined_qty,'dispatch: '||s.id::text,auth.uid());
    end loop;
   end if;
   insert into public.shipment_events(shipment_id,warehouse_id,sme_id,type,details,source,actor_id)
    values(s.id,p_warehouse,s.sme_id,v_event,p_body,'staff',auth.uid());
   update public.shipments set version=version+1,status=case when v_event='dispatched' then 'in_transit' else status end,
    last_verified_at=(p_body->>'verified_at')::timestamptz where id=s.id returning * into s;
   v_result:=private.ops_detail(s);
  else raise exception 'invalid_command' using errcode='22023'; end if;
 end if;
 perform private.audit(p_warehouse,v_sme,'warehouse.'||p_kind,v_entity,p_body);
 insert into public.outbox_events(warehouse_id,sme_id,event_type,entity_id,idempotency_key,payload,correlation_id,actor_id)
  values(p_warehouse,v_sme,'warehouse.'||p_kind,v_entity,'ops:'||p_warehouse::text||':'||auth.uid()::text||':'||p_kind||':'||p_key::text,
   jsonb_build_object('actor_id',auth.uid(),'occurred_at',now(),'schema_version',1,'command_id',p_key,'details',p_body),p_correlation,auth.uid());
 insert into private.operation_commands(warehouse_id,actor_id,kind,key,request,result) values(p_warehouse,auth.uid(),p_kind,p_key,v_request,v_result);
 return v_result;
end $$;

-- Legacy receipt RPC remains internal to the versioned command, never user-callable.
revoke execute on function public.receive_shipment(uuid,uuid,jsonb,boolean,text) from authenticated;
revoke all on function private.ops_inventory(public.products),private.ops_shipment(public.shipments),
 private.ops_allowed(public.shipments),private.ops_detail(public.shipments) from public,anon,authenticated;
revoke all on function public.ops_read(uuid,text,jsonb),public.ops_command(uuid,text,uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.ops_read(uuid,text,jsonb),public.ops_command(uuid,text,uuid,uuid,jsonb,uuid) to authenticated;
commit;
