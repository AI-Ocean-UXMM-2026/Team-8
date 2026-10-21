begin;
create table public.delivery_capacity (
 id uuid primary key default gen_random_uuid(), approval_id uuid not null unique references public.approvals(id),
 assignment_id uuid not null references public.delivery_assignments(id), warehouse_id uuid not null, sme_id uuid not null,
 scheduled_at timestamptz not null, confirmed_by uuid not null references public.profiles(id), confirmed_at timestamptz not null default now(),
 instructions text not null, foreign key(sme_id,warehouse_id) references public.smes(id,warehouse_id)
);
alter table public.delivery_capacity enable row level security;
revoke all on public.delivery_capacity from public,anon,authenticated;
grant select on public.delivery_capacity to authenticated;
grant all on public.delivery_capacity to service_role;
create policy capacity_read on public.delivery_capacity for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id) or exists(select 1 from public.delivery_assignments a where a.id=assignment_id and private.is_assigned_rider(a.shipment_id)));

create function public.delivery_read(p_shipment uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.shipments;
begin
 if p_shipment is null then return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select a.id,a.shipment_id,a.assigned_at,a.accepted_at,a.picked_up_at,s.reference,s.status,s.version,
   (select jsonb_agg(to_jsonb(c)) from public.delivery_capacity c where c.assignment_id=a.id) capacity
   from public.delivery_assignments a join public.riders r on r.id=a.rider_id join public.shipments s on s.id=a.shipment_id
   where r.profile_id=auth.uid() and r.active and a.cancelled_at is null and a.completed_at is null and private.is_assigned_rider(a.shipment_id)) x),'[]'::jsonb); end if;
 select * into s from public.shipments where id=p_shipment;
 if s.id is null or not private.can_read_shipment(s.id) then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('shipment',private.ops_detail(s),'courier_name',s.courier_name,'waybill',s.waybill,'tracking_url',s.tracking_url,
  'assignments',case when private.is_staff(s.warehouse_id) or private.is_assigned_rider(s.id) then coalesce((select jsonb_agg(to_jsonb(a)) from public.delivery_assignments a where a.shipment_id=s.id),'[]'::jsonb) else '[]'::jsonb end,
  'riders',case when private.is_staff(s.warehouse_id) then coalesce((select jsonb_agg(to_jsonb(r)) from public.riders r where r.warehouse_id=s.warehouse_id and r.active),'[]'::jsonb) else '[]'::jsonb end,
  'proofs',coalesce((select jsonb_agg(to_jsonb(p)) from public.delivery_proofs p where p.shipment_id=s.id),'[]'::jsonb),
  'handovers',coalesce((select jsonb_agg(to_jsonb(h)) from public.handover_records h where h.shipment_id=s.id),'[]'::jsonb),
  'capacity',coalesce((select jsonb_agg(to_jsonb(c)) from public.delivery_capacity c join public.delivery_assignments a on a.id=c.assignment_id where a.shipment_id=s.id),'[]'::jsonb),
  'session_id',(select t.id from public.tracking_sessions t where t.shipment_id=s.id and private.can_read_tracking(t.id) limit 1));
end $$;

create function public.delivery_command(p_kind text,p_shipment uuid,p_key uuid,p_body jsonb,p_correlation uuid) returns jsonb
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
 if p_kind='confirm' and not (staff or private.is_sme(s.warehouse_id,s.sme_id)) then raise exception 'forbidden' using errcode='42501'; end if;
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
revoke all on function public.delivery_read(uuid),public.delivery_command(text,uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.delivery_read(uuid),public.delivery_command(text,uuid,uuid,jsonb,uuid) to authenticated;
commit;
