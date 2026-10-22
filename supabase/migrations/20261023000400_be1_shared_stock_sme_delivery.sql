begin;
-- Nullable ownership marks warehouse common stock. Existing rows remain untouched.
alter table public.products alter column sme_id drop not null;
alter table public.products add constraint products_warehouse_fkey foreign key(warehouse_id) references public.warehouses(id);
alter table public.products add constraint products_id_warehouse_key unique(id,warehouse_id);
create unique index products_common_sku on public.products(warehouse_id,sku) where sme_id is null;
alter table public.shipment_items drop constraint shipment_items_product_id_warehouse_id_sme_id_fkey;
alter table public.shipment_items add constraint shipment_items_product_warehouse_fkey foreign key(product_id,warehouse_id) references public.products(id,warehouse_id);
alter table public.stock_movements drop constraint stock_movements_product_id_warehouse_id_sme_id_fkey;
alter table public.stock_movements alter column sme_id drop not null;
alter table public.stock_movements add constraint stock_movements_product_warehouse_fkey foreign key(product_id,warehouse_id) references public.products(id,warehouse_id);
alter table public.outbox_events alter column sme_id drop not null;
-- Keep the original cross-SME invariant for legacy products after widening FKs.
create function private.check_product_scope() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 select sme_id into owner from public.products where id=new.product_id and warehouse_id=new.warehouse_id;
 if not found or (owner is not null and owner is distinct from new.sme_id) then
  raise exception 'product_scope_mismatch' using errcode='23503';
 end if;
 return new;
end $$;
create trigger shipment_item_product_scope before insert or update on public.shipment_items for each row execute function private.check_product_scope();
create trigger stock_movement_product_scope before insert or update on public.stock_movements for each row execute function private.check_product_scope();
-- A product cannot switch pools or tenants after records have referenced it.
create function private.keep_product_scope() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.sme_id is distinct from old.sme_id or new.warehouse_id<>old.warehouse_id then raise exception 'product_scope_immutable' using errcode='23514'; end if;
 return new;
end $$;
create trigger product_scope_immutable before update on public.products for each row execute function private.keep_product_scope();

-- Catalog RPC intentionally excludes tenant IDs, reservations and shipment IDs.
-- Raw product RLS stays unchanged: SMEs cannot select shared product rows.
create function public.warehouse_catalog(p_warehouse uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not (private.is_staff(p_warehouse) or exists(select 1 from public.memberships where profile_id=auth.uid() and warehouse_id=p_warehouse and role='sme' and active)) then raise exception 'forbidden' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'warehouse_id',warehouse_id,'sku',sku,'name',name,'available_qty',available_qty-reserved_qty) order by name,id) from public.products where warehouse_id=p_warehouse and sme_id is null),'[]'::jsonb);
end $$;
create table public.sme_delivery_profiles (
 warehouse_id uuid not null, sme_id uuid primary key,
 payload jsonb not null, updated_at timestamptz not null default now(),
 foreign key(sme_id,warehouse_id) references public.smes(id,warehouse_id)
);
alter table public.sme_delivery_profiles enable row level security;
revoke all on public.sme_delivery_profiles from public,anon,authenticated;
grant select on public.sme_delivery_profiles to authenticated;
grant all on public.sme_delivery_profiles to service_role;
create policy delivery_profiles_read on public.sme_delivery_profiles for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));
create function public.sme_delivery_profile(p_warehouse uuid,p_sme uuid,p_value jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.can_read_tenant(p_warehouse,p_sme) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_value is not null then
  if not private.is_sme(p_warehouse,p_sme) then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_value) is distinct from 'object' or
   coalesce(length(btrim(p_value->>'recipient_name')),0) not between 1 and 120 or
   coalesce(length(btrim(p_value->>'recipient_phone')),0) not between 3 and 40 or
   coalesce(length(btrim(p_value->>'address')),0) not between 1 and 500 or
   coalesce(length(p_value->>'notes'),0)>2000 or coalesce(length(p_value->>'maps_url'),0)>2048 or
   jsonb_typeof(p_value->'latitude') is distinct from 'number' or jsonb_typeof(p_value->'longitude') is distinct from 'number' or
   (p_value->>'latitude')::numeric not between -90 and 90 or (p_value->>'longitude')::numeric not between -180 and 180 then raise exception 'invalid_profile' using errcode='22023'; end if;
  if coalesce(p_value->>'maps_url','')<>'' and (p_value->>'maps_url') !~ '^https://(maps[.]app[.]goo[.]gl/|goo[.]gl/maps/|(www[.])?google[.]com/maps([/?]|$)|maps[.]google[.]com/)[^[:space:]]+$' then raise exception 'invalid_maps_link' using errcode='22023'; end if;
  -- Store a fixed set of fields; unrelated caller data is not profile metadata.
  p_value:=jsonb_build_object('recipient_name',btrim(p_value->>'recipient_name'),'recipient_phone',btrim(p_value->>'recipient_phone'),'address',btrim(p_value->>'address'),'latitude',p_value->'latitude','longitude',p_value->'longitude','maps_url',coalesce(p_value->>'maps_url',''),'notes',coalesce(p_value->>'notes',''));
  insert into public.sme_delivery_profiles(warehouse_id,sme_id,payload) values(p_warehouse,p_sme,p_value)
   on conflict(sme_id) do update set payload=excluded.payload,updated_at=now();
  perform private.audit(p_warehouse,p_sme,'sme.delivery_profile',p_sme,p_value);
 end if;
 return (select payload from public.sme_delivery_profiles where warehouse_id=p_warehouse and sme_id=p_sme);
end $$;
create or replace function public.sme_order_command(p_warehouse uuid,p_key uuid,p_order uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.sme_orders; old private.sme_order_commands; req jsonb; result jsonb; l record; p public.products; sid uuid; tenant uuid; action text;
begin
 if auth.uid() is null or p_key is null or jsonb_typeof(p_body) is distinct from 'object' then raise exception 'forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_warehouse::text||auth.uid()::text||p_key::text,0));
 req:=jsonb_build_object('order',p_order,'body',p_body);
 select * into old from private.sme_order_commands where warehouse_id=p_warehouse and actor_id=auth.uid() and key=p_key;
 -- Recheck membership even when replaying a saved response.
 if p_order is null then tenant:=(p_body->>'sme_id')::uuid;
 else select sme_id into tenant from public.sme_orders where id=p_order and warehouse_id=p_warehouse; end if;
 if tenant is null or not private.can_read_tenant(p_warehouse,tenant) then raise exception 'forbidden' using errcode='42501'; end if;
 if old.key is not null then
  if old.request<>req then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return old.result;
 end if;
 if p_order is null then
  if p_body->>'order_kind'='sme_self_delivery' then
   p_body:=p_body||jsonb_build_object('customer_name',coalesce(p_body->>'recipient_name',p_body->>'customer_name'),'customer_phone',coalesce(p_body->>'recipient_phone',p_body->>'customer_phone'));
  end if;
  if not private.is_sme(p_warehouse,tenant) or (p_body->>'warehouse_id')::uuid is distinct from p_warehouse then raise exception 'forbidden' using errcode='42501'; end if;
  if coalesce(length(btrim(p_body->>'customer_name')),0) not between 1 and 120
   or coalesce(length(btrim(p_body->>'customer_phone')),0) not between 3 and 40
   or coalesce(length(btrim(p_body->>'address')),0) not between 1 and 500
   or coalesce(length(p_body->>'notes'),0)>2000 or coalesce(length(p_body->>'maps_url'),0)>2048
   or jsonb_typeof(p_body->'latitude') is distinct from 'number' or jsonb_typeof(p_body->'longitude') is distinct from 'number'
   or not ((p_body->>'latitude')::numeric between -90 and 90) or not ((p_body->>'longitude')::numeric between -180 and 180)
   or jsonb_typeof(p_body->'lines') is distinct from 'array' then raise exception 'invalid_order' using errcode='22023'; end if;
  if jsonb_array_length(p_body->'lines') not between 1 and 100 or
   (select count(*)<>count(distinct (value->>'product_id')::uuid) from jsonb_array_elements(p_body->'lines')) then raise exception 'invalid_lines' using errcode='22023'; end if;
  if coalesce(p_body->>'maps_url','')<>'' and (p_body->>'maps_url') !~ '^https://(maps[.]app[.]goo[.]gl/|goo[.]gl/maps/|(www[.])?google[.]com/maps([/?]|$)|maps[.]google[.]com/)[^[:space:]]+$' then raise exception 'invalid_maps_link' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_body->'lines') x where jsonb_typeof(x->'expected_qty') is distinct from 'number' or (x->>'expected_qty')::numeric<>trunc((x->>'expected_qty')::numeric)) then raise exception 'invalid_lines' using errcode='22023'; end if;
  if p_body ? 'order_kind' and p_body->>'order_kind' is distinct from 'sme_self_delivery' then raise exception 'invalid_order_kind' using errcode='22023'; end if;
  for l in select * from jsonb_to_recordset(p_body->'lines') as x(product_id uuid,expected_qty integer) order by product_id loop
   select * into p from public.products where id=l.product_id and warehouse_id=p_warehouse and ((p_body->>'order_kind'='sme_self_delivery' and sme_id is null) or (not (p_body ? 'order_kind') and sme_id=tenant)) for update;
   if p.id is null or l.expected_qty is null or l.expected_qty<=0 then raise exception 'invalid_product' using errcode='22023'; end if;
   if p.available_qty-p.reserved_qty<l.expected_qty then raise exception 'stock_unavailable' using errcode='22023'; end if;
   update public.products set reserved_qty=reserved_qty+l.expected_qty where id=p.id;
  end loop;
  insert into public.sme_orders(warehouse_id,sme_id,created_by,payload) values(p_warehouse,tenant,auth.uid(),p_body) returning * into o;
  if p_body->>'order_kind'='sme_self_delivery' and p_body->'save_delivery_profile'='true'::jsonb then
   perform public.sme_delivery_profile(p_warehouse,tenant,p_body||jsonb_build_object('recipient_name',p_body->>'customer_name','recipient_phone',p_body->>'customer_phone'));
  end if;
 else
  select * into o from public.sme_orders where id=p_order and warehouse_id=p_warehouse for update;
  action:=p_body->>'action';
  if coalesce(length(p_body->>'note'),0)>2000 then raise exception 'invalid_note' using errcode='22023'; end if;
  if action in ('accept','reject') and not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
  if action='cancel' and not private.is_sme(p_warehouse,tenant) then raise exception 'forbidden' using errcode='42501'; end if;
  if o.status<>'pending' then raise exception 'stale_version' using errcode='22023'; end if;
  if action='accept' then
   if coalesce(p_body->>'delivery_mode','') not in ('in_house','third_party') then raise exception 'invalid_mode' using errcode='22023'; end if;
   insert into public.shipments(warehouse_id,sme_id,reference,direction,delivery_mode,status,delivery_destination)
    values(p_warehouse,tenant,'ORD-'||o.id::text,'outbound',p_body->>'delivery_mode','ready',jsonb_build_object('latitude',o.payload->'latitude','longitude',o.payload->'longitude','label',o.payload->>'address')) returning id into sid;
   insert into public.shipment_items(shipment_id,warehouse_id,sme_id,product_id,expected_qty)
    select sid,p_warehouse,tenant,x.product_id,x.expected_qty from jsonb_to_recordset(o.payload->'lines') as x(product_id uuid,expected_qty integer);
   update public.sme_orders set status='accepted',shipment_id=sid where id=o.id;
  elsif action in ('reject','cancel') then
   if action='reject' and coalesce(length(btrim(p_body->>'note')),0)=0 then raise exception 'reason_required' using errcode='22023'; end if;
   perform private.order_release(o.id);
   update public.sme_orders set status=case when action='reject' then 'rejected' else 'cancelled' end,note=coalesce(p_body->>'note','') where id=o.id;
  else raise exception 'invalid_action' using errcode='22023'; end if;
  select * into o from public.sme_orders where id=o.id;
 end if;
 result:=to_jsonb(o);
 perform private.audit(p_warehouse,tenant,'order.'||coalesce(action,'submit'),o.id,p_body);
 insert into private.sme_order_commands values(p_warehouse,auth.uid(),p_key,req,result);
 return result;
end $$;
create or replace function public.ops_command_before_orders(p_warehouse uuid,p_kind text,p_key uuid,p_entity uuid,p_body jsonb,p_correlation uuid) returns jsonb
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
    or (select count(*)<>count(distinct (value->>'product_id')::uuid) from jsonb_array_elements(p_body->'lines'))
   then raise exception 'invalid_shipment' using errcode='22023'; end if;
  insert into public.shipments(warehouse_id,sme_id,reference,direction,delivery_mode,status)
   values(p_warehouse,v_sme,p_body->>'reference',p_body->>'direction',p_body->>'delivery_mode',
   case when p_body->>'direction'='inbound' then 'expected' else 'ready' end) returning * into s;
  for v_line in select * from jsonb_to_recordset(p_body->'lines') as x(product_id uuid,expected_qty integer) order by product_id loop
   if v_line.expected_qty is null or v_line.expected_qty<=0 or not exists(select 1 from public.products
    where id=v_line.product_id and warehouse_id=p_warehouse and (sme_id=v_sme or (sme_id is null and p_body->>'direction'='outbound'))) then raise exception 'invalid_product' using errcode='22023'; end if;
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
    where e.id=x.value::uuid and e.warehouse_id=p_warehouse and (p.sme_id is null or e.sme_id=p.sme_id))) then raise exception 'invalid_evidence' using errcode='22023'; end if;
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


-- Warehouse stock correction remains staff-only; common stock evidence may
-- belong to a shipment in this warehouse instead of a product-owning SME.

revoke all on function private.check_product_scope(),private.keep_product_scope() from public,anon,authenticated;
revoke all on function public.warehouse_catalog(uuid),public.sme_delivery_profile(uuid,uuid,jsonb) from public,anon;
grant execute on function public.warehouse_catalog(uuid),public.sme_delivery_profile(uuid,uuid,jsonb) to authenticated;
commit;
