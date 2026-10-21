begin;
-- Internal writer. No browser RPC privilege: domain commands call this with
-- their already-authorized actor. Audit/outbox commit with business changes.
create function private.audit(w uuid,s uuid,action text,entity uuid,data jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_records(warehouse_id,sme_id,actor_id,action,entity_id,details)
    values(w,s,(select auth.uid()),action,entity,data);
$$;

create function public.receive_shipment(p_shipment uuid,p_key uuid,p_items jsonb,p_final boolean default true,p_notes text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.shipments; old public.receipts; r_id uuid;
  item record; line public.shipment_items; stock public.products;
  c_id uuid; v_result jsonb; request jsonb; delta integer; damages integer;
begin
  select * into s from public.shipments where id=p_shipment for update;
  if s.id is null or not private.is_staff(s.warehouse_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_key is null or p_final is null or p_notes is null or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0
    then raise exception 'invalid_receipt' using errcode='22023'; end if;
  request:=jsonb_build_object('items',p_items,'final',p_final,'notes',p_notes);
  select * into old from public.receipts where shipment_id=s.id and idempotency_key=p_key;
  if old.id is not null then
    if old.payload<>request then raise exception 'idempotency_conflict' using errcode='22023'; end if;
    return old.result;
  end if;
  if s.direction<>'inbound' or s.status not in ('expected','delayed','partially_received')
    or exists(select 1 from public.receipts where shipment_id=s.id and is_final)
    then raise exception 'receipt_not_allowed' using errcode='22023'; end if;
  if (select count(*)<>count(distinct value->>'product_id') from jsonb_array_elements(p_items))
    then raise exception 'duplicate_product' using errcode='22023'; end if;
  insert into public.receipts(shipment_id,warehouse_id,sme_id,idempotency_key,payload,is_final,notes,recorded_by)
    values(s.id,s.warehouse_id,s.sme_id,p_key,request,p_final,p_notes,auth.uid()) returning id into r_id;
  -- Quantities are incremental for this receipt, not editable cumulative totals.
  -- Sorted product locking prevents deadlocks across concurrent shipments.
  for item in select * from jsonb_to_recordset(p_items) as x(product_id uuid,received_qty integer,damaged_qty integer) order by product_id loop
    if item.product_id is null or item.received_qty is null or item.received_qty<0 or item.damaged_qty is null
      or item.damaged_qty<0 or item.damaged_qty>item.received_qty
      then raise exception 'invalid_quantity' using errcode='22023'; end if;
    select * into line from public.shipment_items where shipment_id=s.id and product_id=item.product_id for update;
    if line.id is null then raise exception 'unknown_shipment_product' using errcode='22023'; end if;
    if line.received_qty+item.received_qty>line.expected_qty then raise exception 'overreceipt_requires_review' using errcode='22023'; end if;
    select * into stock from public.products where id=item.product_id for update;
    update public.shipment_items set received_qty=received_qty+item.received_qty,damaged_qty=damaged_qty+item.damaged_qty where id=line.id;
    update public.products set available_qty=available_qty+item.received_qty-item.damaged_qty,
      quarantined_qty=quarantined_qty+item.damaged_qty where id=stock.id;
    insert into public.stock_movements(warehouse_id,sme_id,product_id,receipt_id,available_delta,quarantined_delta,
      previous_available,updated_available,previous_quarantined,updated_quarantined,reason,actor_id)
      values(s.warehouse_id,s.sme_id,stock.id,r_id,item.received_qty-item.damaged_qty,item.damaged_qty,
        stock.available_qty,stock.available_qty+item.received_qty-item.damaged_qty,stock.quarantined_qty,
        stock.quarantined_qty+item.damaged_qty,'goods_received',auth.uid());
  end loop;
  select sum(expected_qty-received_qty),sum(damaged_qty) into delta,damages from public.shipment_items where shipment_id=s.id;
  -- Shortages become cases only on finalization; damages are observed immediately.
  for item in select * from (values ('quantity_mismatch',p_final and delta>0),('damaged_goods',damages>0)) as x(kind,needed) where needed loop
    insert into public.exception_cases(shipment_id,warehouse_id,sme_id,stage,type,summary)
      values(s.id,s.warehouse_id,s.sme_id,'inbound',item.kind,
        case when item.kind='quantity_mismatch' then format('Expected receipt is short by %s units',delta) else format('%s damaged units recorded',damages) end)
      on conflict(shipment_id,stage,type) where status not in ('resolved','closed') do nothing returning id into c_id;
    if c_id is null then select id into c_id from public.exception_cases where shipment_id=s.id and stage='inbound' and type=item.kind and status not in ('resolved','closed'); end if;
    insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload)
      values(c_id,s.warehouse_id,s.sme_id,auth.uid(),'staff','receipt_recorded',jsonb_build_object('receipt_id',r_id,'missing_qty',delta,'damaged_qty',damages));
    insert into public.outbox_events(warehouse_id,sme_id,event_type,entity_id,idempotency_key,payload)
      values(s.warehouse_id,s.sme_id,'receipt.discrepancy',c_id,r_id::text||':'||item.kind,
        jsonb_build_object('receipt_id',r_id,'case_id',c_id,'type',item.kind));
  end loop;
  update public.shipments set status=case when not p_final then 'partially_received'
    when delta>0 or damages>0 then 'received_with_discrepancies' else 'received' end,last_verified_at=now() where id=s.id;
  insert into public.shipment_events(shipment_id,warehouse_id,sme_id,type,details,source,actor_id)
    values(s.id,s.warehouse_id,s.sme_id,'receipt_recorded',request||jsonb_build_object('receipt_id',r_id),'staff',auth.uid());
  perform private.audit(s.warehouse_id,s.sme_id,'receipt_recorded',r_id,jsonb_build_object('shipment_id',s.id));
  v_result:=jsonb_build_object('receipt_id',r_id,'shipment_id',s.id,'missing_qty',delta,'damaged_qty',damages,'final',p_final);
  update public.receipts set result=v_result where id=r_id;
  return v_result;
end $$;

create function public.decide_approval(p_approval uuid,p_decision text,p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.approvals; c public.exception_cases;
begin
  -- Lock case before approval consistently with case closure.
  select c0.* into c from public.exception_cases c0 join public.approvals a0 on a0.case_id=c0.id where a0.id=p_approval for update of c0;
  select * into a from public.approvals where id=p_approval for update;
  if a.id is null or not private.is_sme(a.warehouse_id,a.sme_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if a.status='decided' and a.decided_by=auth.uid() and a.decision=p_decision and a.note is not distinct from p_note then
    return jsonb_build_object('id',a.id,'decision',a.decision,'status',a.status);
  end if;
  if a.status<>'pending' or c.status in ('resolved','closed') or p_decision is null or not (a.options ? p_decision) then
    raise exception 'decision_not_allowed' using errcode='22023'; end if;
  update public.approvals set status='decided',decision=p_decision,note=p_note,decided_by=auth.uid(),decided_at=now() where id=a.id;
  -- A choice records intent only; never claim remainder received or capacity confirmed.
  update public.exception_cases set status=case when p_decision='await_remainder' then 'awaiting_information' else 'awaiting_verification' end where id=a.case_id;
  insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload)
    values(a.case_id,a.warehouse_id,a.sme_id,auth.uid(),'sme','approval_decided',jsonb_build_object('approval_id',a.id,'decision',p_decision,'note',p_note));
  perform private.audit(a.warehouse_id,a.sme_id,'approval_decided',a.id,jsonb_build_object('decision',p_decision));
  insert into public.outbox_events(warehouse_id,sme_id,event_type,entity_id,idempotency_key,payload)
    values(a.warehouse_id,a.sme_id,'approval.decided',a.id,'approval:'||a.id::text,jsonb_build_object('case_id',a.case_id,'decision',p_decision));
  return jsonb_build_object('id',a.id,'decision',p_decision,'status','decided');
end $$;

create function public.register_evidence(p_shipment uuid,p_mime text,p_size bigint,p_sme_visible boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.shipments; e_id uuid:=gen_random_uuid(); object_name text;
begin
  select * into s from public.shipments where id=p_shipment;
  if s.id is null or not private.can_read_shipment(s.id) then raise exception 'forbidden' using errcode='42501'; end if;
  if not p_sme_visible and not private.is_staff(s.warehouse_id) then raise exception 'forbidden' using errcode='42501'; end if;
  object_name:=s.warehouse_id::text||'/'||s.id::text||'/'||e_id::text;
  insert into public.evidence(id,shipment_id,warehouse_id,sme_id,uploaded_by,object_path,mime_type,size_bytes,sme_visible)
    values(e_id,s.id,s.warehouse_id,s.sme_id,auth.uid(),object_name,p_mime,p_size,p_sme_visible);
  perform private.audit(s.warehouse_id,s.sme_id,'evidence_registered',e_id);
  return jsonb_build_object('id',e_id,'bucket','parcelcare-evidence','path',object_name);
end $$;

create function public.mark_notification_read(p_notification uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n public.notifications;
begin
  select * into n from public.notifications where id=p_notification;
  if n.id is null or not private.can_read_tenant(n.warehouse_id,n.sme_id) then raise exception 'forbidden' using errcode='42501'; end if;
  insert into public.notification_reads(notification_id,profile_id) values(n.id,auth.uid()) on conflict do nothing;
end $$;

-- Never inherit PostgreSQL's default PUBLIC execute on security-definer RPCs.
revoke all on function private.audit(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.receive_shipment(uuid,uuid,jsonb,boolean,text) from public,anon;
revoke all on function public.decide_approval(uuid,text,text) from public,anon;
revoke all on function public.register_evidence(uuid,text,bigint,boolean) from public,anon;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.receive_shipment(uuid,uuid,jsonb,boolean,text),public.decide_approval(uuid,text,text),
  public.register_evidence(uuid,text,bigint,boolean),public.mark_notification_read(uuid) to authenticated;
commit;
