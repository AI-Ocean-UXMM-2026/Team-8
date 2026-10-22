begin;
-- Physical returns are separate from cancellation. Counts are cumulative only
-- inside this private ledger; submitted counts are increments.
create table private.shipment_return_totals (
 shipment_id uuid not null references public.shipments(id),
 product_id uuid not null references public.products(id),
 received_qty integer not null check(received_qty>0),
 damaged_qty integer not null check(damaged_qty>=0 and damaged_qty<=received_qty),
 primary key(shipment_id,product_id)
);
alter table private.shipment_return_totals enable row level security;
revoke all on private.shipment_return_totals from public,anon,authenticated;

alter function public.delivery_read(uuid) rename to delivery_read_before_returns;
revoke all on function public.delivery_read_before_returns(uuid) from public,anon,authenticated;
create function public.delivery_read(p_shipment uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.delivery_read_before_returns(p_shipment);
 if p_shipment is null then return result; end if;
 return result||jsonb_build_object('returns',coalesce((select jsonb_agg(to_jsonb(t)-'shipment_id' order by t.product_id)
  from private.shipment_return_totals t where shipment_id=p_shipment),'[]'::jsonb));
end $$;

alter function public.delivery_command(text,uuid,uuid,jsonb,uuid) rename to delivery_command_before_returns;
revoke all on function public.delivery_command_before_returns(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.delivery_command(p_kind text,p_shipment uuid,p_key uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.shipments; old private.workflow_commands; req jsonb; result jsonb;
 l record; p public.products; shipped integer; returned integer; damaged integer; had_handover boolean;
begin
 if p_kind<>'return' then
  -- The existing order wrapper already debits order-backed handovers. Extend
  -- accounting to direct shipments without posting another debit on re-handover.
  if p_kind='handover' then
   select * into s from public.shipments where id=p_shipment;
   if auth.uid() is null or p_key is null or s.id is null or not private.is_staff(s.warehouse_id) then raise exception 'forbidden' using errcode='42501'; end if;
   perform 1 from public.sme_orders where shipment_id=p_shipment for update;
   select * into s from public.shipments where id=p_shipment for update;
   had_handover:=exists(select 1 from public.handover_records where shipment_id=p_shipment);
  end if;
  result:=public.delivery_command_before_returns(p_kind,p_shipment,p_key,p_body,p_correlation);
  if p_kind='handover' and not had_handover
   and not exists(select 1 from public.sme_orders where shipment_id=p_shipment) then
   for l in select * from public.shipment_items where shipment_id=p_shipment order by product_id loop
    select * into p from public.products where id=l.product_id for update;
    if p.available_qty-p.reserved_qty<l.expected_qty then raise exception 'stock_unavailable' using errcode='22023'; end if;
    update public.products set available_qty=available_qty-l.expected_qty,version=version+1 where id=p.id;
    insert into public.stock_movements(warehouse_id,sme_id,product_id,available_delta,quarantined_delta,previous_available,updated_available,previous_quarantined,updated_quarantined,reason,actor_id)
     values(s.warehouse_id,s.sme_id,p.id,-l.expected_qty,0,p.available_qty,p.available_qty-l.expected_qty,p.quarantined_qty,p.quarantined_qty,'courier handover: '||s.id,auth.uid());
   end loop;
  end if;
  return result;
 end if;
 if auth.uid() is null or p_key is null or p_correlation is null or jsonb_typeof(p_body) is distinct from 'object' then raise exception 'forbidden' using errcode='42501'; end if;
 perform set_config('parcelcare.correlation_id',p_correlation::text,true);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'delivery.'||p_kind||p_key::text,0));
 select * into s from public.shipments where id=p_shipment for update;
 if s.id is null or not private.is_staff(s.warehouse_id) then raise exception 'forbidden' using errcode='42501'; end if;
 req:=jsonb_build_object('shipment',s.id,'body',p_body);
 select * into old from private.workflow_commands where actor_id=auth.uid() and key=p_key and kind='delivery.return';
 if old.key is not null then
  if old.request<>req then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return old.result;
 end if;
 if (p_body->>'expected_version')::integer is distinct from s.version then raise exception 'stale_version' using errcode='22023'; end if;
 if s.direction<>'outbound' or s.status<>'cancelled'
  or not exists(select 1 from public.shipment_events where shipment_id=s.id and type='dispatched')
    and not exists(select 1 from public.handover_records where shipment_id=s.id)
  or coalesce(length(btrim(p_body->>'note')),0) not between 1 and 2000
  or not exists(select 1 from public.evidence e join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=e.object_path
    where e.id=(p_body->>'evidence_id')::uuid and e.shipment_id=s.id and private.can_read_evidence(e.id))
  or jsonb_typeof(p_body->'lines') is distinct from 'array' then raise exception 'invalid_return' using errcode='22023'; end if;
 if jsonb_array_length(p_body->'lines') not between 1 and 100
  or (select count(*)<>count(distinct (value->>'product_id')::uuid) from jsonb_array_elements(p_body->'lines')) then raise exception 'invalid_return' using errcode='22023'; end if;
 for l in select value from jsonb_array_elements(p_body->'lines') order by (value->>'product_id')::uuid loop
  if jsonb_typeof(l.value->'received_qty') is distinct from 'number' or (l.value->>'received_qty') !~ '^[0-9]+$'
   or jsonb_typeof(l.value->'damaged_qty') is distinct from 'number' or (l.value->>'damaged_qty') !~ '^[0-9]+$' then raise exception 'invalid_return' using errcode='22023'; end if;
  returned:=(l.value->>'received_qty')::integer; damaged:=(l.value->>'damaged_qty')::integer;
  select expected_qty into shipped from public.shipment_items where shipment_id=s.id and product_id=(l.value->>'product_id')::uuid;
  -- Do not restock historical external handovers whose debit was never posted.
  if shipped is not null and s.delivery_mode='third_party' and not exists(select 1 from public.stock_movements m
   where m.product_id=(l.value->>'product_id')::uuid and m.available_delta<0 and
    (m.reason='courier handover: '||s.id or m.reason in (select 'order handover: '||o.id from public.sme_orders o where o.shipment_id=s.id))) then raise exception 'unposted_handover_return' using errcode='22023'; end if;
  if shipped is null or returned<=0 or damaged>returned
   or returned+coalesce((select received_qty from private.shipment_return_totals where shipment_id=s.id and product_id=(l.value->>'product_id')::uuid),0)>shipped then raise exception 'invalid_return' using errcode='22023'; end if;
  select * into p from public.products where id=(l.value->>'product_id')::uuid for update;
  update public.products set available_qty=available_qty+returned-damaged,quarantined_qty=quarantined_qty+damaged,version=version+1 where id=p.id;
  insert into private.shipment_return_totals values(s.id,p.id,returned,damaged)
   on conflict(shipment_id,product_id) do update set received_qty=shipment_return_totals.received_qty+excluded.received_qty,damaged_qty=shipment_return_totals.damaged_qty+excluded.damaged_qty;
  insert into public.stock_movements(warehouse_id,sme_id,product_id,available_delta,quarantined_delta,previous_available,updated_available,previous_quarantined,updated_quarantined,reason,actor_id)
   values(s.warehouse_id,s.sme_id,p.id,returned-damaged,damaged,p.available_qty,p.available_qty+returned-damaged,p.quarantined_qty,p.quarantined_qty+damaged,'shipment return: '||s.id,auth.uid());
 end loop;
 update public.shipments set version=version+1,last_verified_at=now() where id=s.id;
 insert into public.shipment_events(shipment_id,warehouse_id,sme_id,type,details,source,actor_id)
  values(s.id,s.warehouse_id,s.sme_id,'delivery.return',p_body||jsonb_build_object('notes',p_body->>'note','verified_at',now(),'evidence_ids',jsonb_build_array(p_body->>'evidence_id')),'staff',auth.uid());
 perform private.audit(s.warehouse_id,s.sme_id,'delivery.return',s.id,p_body);
 insert into public.outbox_events(warehouse_id,sme_id,event_type,entity_id,idempotency_key,payload,actor_id,correlation_id)
  values(s.warehouse_id,s.sme_id,'delivery.return',s.id,'delivery:'||auth.uid()::text||':return:'||p_key::text,p_body||jsonb_build_object('shipment_id',s.id),auth.uid(),p_correlation);
 result:=public.delivery_read(s.id);
 insert into private.workflow_commands(actor_id,key,kind,request,result) values(auth.uid(),p_key,'delivery.return',req,result);
 return result;
end $$;
revoke all on function public.delivery_read(uuid),public.delivery_command(text,uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.delivery_read(uuid),public.delivery_command(text,uuid,uuid,jsonb,uuid) to authenticated;
commit;
