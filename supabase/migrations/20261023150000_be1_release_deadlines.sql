-- New deadline-bearing requests are automatically accepted atomically with stock reservation.
-- Historical requests and retries without deadlines retain their original behavior.
begin;
create or replace function public.sme_order_command(p_warehouse uuid,p_key uuid,p_order uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.sme_orders; old private.sme_order_commands; req jsonb; result jsonb; l record; p public.products; sid uuid; tenant uuid; action text; due timestamptz;
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
  if p_body ? 'delivery_due_at' then
   if jsonb_typeof(p_body->'delivery_due_at') is distinct from 'string' or (p_body->>'delivery_due_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid_delivery_deadline' using errcode='22023'; end if;
   due:=(p_body->>'delivery_due_at')::timestamptz;
   if due is null or not isfinite(due) or due<=now() or due>now()+interval '30 days' then raise exception 'invalid_delivery_deadline' using errcode='22023'; end if;
  end if;
  for l in select * from jsonb_to_recordset(p_body->'lines') as x(product_id uuid,expected_qty integer) order by product_id loop
   select * into p from public.products where id=l.product_id and warehouse_id=p_warehouse and sme_id=tenant for update;
   if p.id is null or l.expected_qty is null or l.expected_qty<=0 then raise exception 'invalid_product' using errcode='22023'; end if;
   if p.available_qty-p.reserved_qty<l.expected_qty then raise exception 'stock_unavailable' using errcode='22023'; end if;
   update public.products set reserved_qty=reserved_qty+l.expected_qty where id=p.id;
  end loop;
  insert into public.sme_orders(warehouse_id,sme_id,created_by,payload) values(p_warehouse,tenant,auth.uid(),p_body) returning * into o;
  if due is not null then
   insert into public.shipments(warehouse_id,sme_id,reference,direction,delivery_mode,status,delivery_destination)
    values(p_warehouse,tenant,'ORD-'||o.id::text,'outbound','in_house','ready',jsonb_build_object('latitude',o.payload->'latitude','longitude',o.payload->'longitude','label',o.payload->>'address')) returning id into sid;
   insert into public.shipment_items(shipment_id,warehouse_id,sme_id,product_id,expected_qty)
    select sid,p_warehouse,tenant,x.product_id,x.expected_qty from jsonb_to_recordset(o.payload->'lines') as x(product_id uuid,expected_qty integer);
   update public.sme_orders set status='accepted',shipment_id=sid where id=o.id returning * into o;
  end if;
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
   if exists(select 1 from jsonb_to_recordset(o.payload->'lines') x(product_id uuid,expected_qty integer) left join public.products pr on pr.id=x.product_id and pr.warehouse_id=p_warehouse and pr.sme_id=tenant where pr.id is null) then raise exception 'stock_owner_mismatch' using errcode='22023'; end if;
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


commit;
