begin;
alter table public.products add column reserved_qty integer not null default 0 check(reserved_qty >= 0 and reserved_qty <= available_qty);
create table public.sme_orders (
 id uuid primary key default gen_random_uuid(), warehouse_id uuid not null, sme_id uuid not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled')),
 payload jsonb not null, note text not null default '', shipment_id uuid references public.shipments(id),
 reserved boolean not null default true,
 foreign key(sme_id,warehouse_id) references public.smes(id,warehouse_id)
);
create index sme_orders_scope on public.sme_orders(warehouse_id,sme_id,created_at desc);
alter table public.sme_orders enable row level security;
revoke all on public.sme_orders from public,anon,authenticated;
grant select on public.sme_orders to authenticated;
grant all on public.sme_orders to service_role;
create policy sme_orders_read on public.sme_orders for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));
create table private.sme_order_commands (
 warehouse_id uuid not null, actor_id uuid not null, key uuid not null, request jsonb not null, result jsonb not null,
 primary key(warehouse_id,actor_id,key)
);
alter table private.sme_order_commands enable row level security;
revoke all on private.sme_order_commands from public,anon,authenticated;
create function public.sme_orders_read(p_warehouse uuid,p_sme uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not (private.is_staff(p_warehouse) or (p_sme is not null and private.is_sme(p_warehouse,p_sme))) then raise exception 'forbidden' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('shipment_status',s.status,'payload',o.payload||jsonb_build_object('lines',(select jsonb_agg(l.value||jsonb_build_object('name',p.name,'sku',p.sku)) from jsonb_array_elements(o.payload->'lines') l join public.products p on p.id=(l.value->>'product_id')::uuid))) order by o.created_at desc)
 from public.sme_orders o left join public.shipments s on s.id=o.shipment_id
 where o.warehouse_id=p_warehouse and (p_sme is null or o.sme_id=p_sme)),'[]'::jsonb);
end $$;
create function private.order_release(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.sme_orders; l record;
begin
 select * into o from public.sme_orders where id=p_order for update;
 if not o.reserved then return; end if;
 for l in select * from jsonb_to_recordset(o.payload->'lines') as x(product_id uuid,expected_qty integer) order by product_id loop
  update public.products set reserved_qty=reserved_qty-l.expected_qty where id=l.product_id;
 end loop;
 update public.sme_orders set reserved=false where id=o.id;
end $$;
create function public.sme_order_command(p_warehouse uuid,p_key uuid,p_order uuid,p_body jsonb) returns jsonb
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
  if not private.is_sme(p_warehouse,tenant) or (p_body->>'warehouse_id')::uuid is distinct from p_warehouse then raise exception 'forbidden' using errcode='42501'; end if;
  if coalesce(length(btrim(p_body->>'customer_name')),0) not between 1 and 120
   or coalesce(length(btrim(p_body->>'customer_phone')),0) not between 3 and 40
   or coalesce(length(btrim(p_body->>'address')),0) not between 1 and 500
   or coalesce(length(p_body->>'notes'),0)>2000 or coalesce(length(p_body->>'maps_url'),0)>2048
   or jsonb_typeof(p_body->'latitude') is distinct from 'number' or jsonb_typeof(p_body->'longitude') is distinct from 'number'
   or not ((p_body->>'latitude')::numeric between -90 and 90) or not ((p_body->>'longitude')::numeric between -180 and 180)
   or jsonb_typeof(p_body->'lines') is distinct from 'array' then raise exception 'invalid_order' using errcode='22023'; end if;
  if jsonb_array_length(p_body->'lines') not between 1 and 100 or
   (select count(*)<>count(distinct value->>'product_id') from jsonb_array_elements(p_body->'lines')) then raise exception 'invalid_lines' using errcode='22023'; end if;
  if coalesce(p_body->>'maps_url','')<>'' and (p_body->>'maps_url') !~ '^https://(maps[.]app[.]goo[.]gl/|goo[.]gl/maps/|(www[.])?google[.]com/maps([/?]|$)|maps[.]google[.]com/)[^[:space:]]+$' then raise exception 'invalid_maps_link' using errcode='22023'; end if;
  for l in select * from jsonb_to_recordset(p_body->'lines') as x(product_id uuid,expected_qty integer) order by product_id loop
   select * into p from public.products where id=l.product_id and warehouse_id=p_warehouse and sme_id=tenant for update;
   if p.id is null or l.expected_qty is null or l.expected_qty<=0 then raise exception 'invalid_product' using errcode='22023'; end if;
   if p.available_qty-p.reserved_qty<l.expected_qty then raise exception 'stock_unavailable' using errcode='22023'; end if;
   update public.products set reserved_qty=reserved_qty+l.expected_qty where id=p.id;
  end loop;
  insert into public.sme_orders(warehouse_id,sme_id,created_by,payload) values(p_warehouse,tenant,auth.uid(),p_body) returning * into o;
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
-- Existing dispatch still posts physical stock once. Release its reservation in
-- the same transaction first; a failed dispatch rolls the release back as well.
alter function public.ops_command(uuid,text,uuid,uuid,jsonb,uuid) rename to ops_command_before_orders;
revoke all on function public.ops_command_before_orders(uuid,text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.ops_command(p_warehouse uuid,p_kind text,p_key uuid,p_entity uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_kind='event' and p_body->>'type'='dispatched' then
  select id into oid from public.sme_orders where shipment_id=p_entity and warehouse_id=p_warehouse;
  if oid is not null then perform private.order_release(oid); end if;
 end if;
 return public.ops_command_before_orders(p_warehouse,p_kind,p_key,p_entity,p_body,p_correlation);
end $$;
-- All inventory readers show the quantity still available to order.
alter function private.ops_inventory(public.products) rename to ops_inventory_before_orders;
create function private.ops_inventory(p public.products) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.ops_inventory_before_orders(p)||jsonb_build_object('available_qty',p.available_qty-p.reserved_qty);
$$;
revoke all on function private.order_release(uuid),private.ops_inventory(public.products),private.ops_inventory_before_orders(public.products) from public,anon,authenticated;
revoke all on function public.sme_orders_read(uuid,uuid),public.sme_order_command(uuid,uuid,uuid,jsonb),public.ops_command(uuid,text,uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.sme_orders_read(uuid,uuid),public.sme_order_command(uuid,uuid,uuid,jsonb),public.ops_command(uuid,text,uuid,uuid,jsonb,uuid) to authenticated;
-- External courier handover posts the order's physical stock once.
alter function public.delivery_command(text,uuid,uuid,jsonb,uuid) rename to delivery_command_before_orders;
revoke all on function public.delivery_command_before_orders(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.delivery_command(p_kind text,p_shipment uuid,p_key uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.sme_orders; l record; p public.products;
begin
 select * into o from public.sme_orders where shipment_id=p_shipment for update;
 result:=public.delivery_command_before_orders(p_kind,p_shipment,p_key,p_body,p_correlation);
 if p_kind='cancel' and o.id is not null then
  if o.reserved then perform private.order_release(o.id); end if;
  update public.sme_orders set status='cancelled',note=coalesce(p_body->>'note','') where id=o.id;
 end if;
 if p_kind='handover' and o.reserved then
  perform private.order_release(o.id);
  for l in select * from jsonb_to_recordset(o.payload->'lines') as x(product_id uuid,expected_qty integer) order by product_id loop
   select * into p from public.products where id=l.product_id for update;
   update public.products set available_qty=available_qty-l.expected_qty,version=version+1 where id=p.id;
   insert into public.stock_movements(warehouse_id,sme_id,product_id,available_delta,quarantined_delta,previous_available,updated_available,previous_quarantined,updated_quarantined,reason,actor_id)
    values(o.warehouse_id,o.sme_id,p.id,-l.expected_qty,0,p.available_qty,p.available_qty-l.expected_qty,p.quarantined_qty,p.quarantined_qty,'order handover: '||o.id,auth.uid());
  end loop;
 end if;
 return result;
end $$;
revoke all on function public.delivery_command(text,uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.delivery_command(text,uuid,uuid,jsonb,uuid) to authenticated;
create function public.order_customer(p_shipment uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_read_shipment(p_shipment) then raise exception 'forbidden' using errcode='42501'; end if;
 return (select payload-'lines'-'warehouse_id'-'sme_id' from public.sme_orders where shipment_id=p_shipment);
end $$;
revoke all on function public.order_customer(uuid) from public,anon;
grant execute on function public.order_customer(uuid) to authenticated;
commit;
