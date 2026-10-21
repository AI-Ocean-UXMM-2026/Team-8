begin;
alter table public.exception_cases add column version integer not null default 1 check(version>0);
alter table public.approvals add column policy_version integer not null default 1;
alter table public.approvals add column requested_case_version integer not null default 1;
alter table public.approvals add column preferred_at timestamptz;
alter table public.analysis_jobs add column source_version text;
alter table public.analysis_jobs add column lease_until timestamptz;
alter table public.ai_analyses add column configuration jsonb not null default '{}';
alter table public.ai_analyses add column provider_response_id text;
create table private.workflow_commands (
 actor_id uuid not null references public.profiles(id), key uuid not null, kind text not null,
 request jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(actor_id,key,kind)
);
alter table private.workflow_commands enable row level security;
revoke all on private.workflow_commands from public,anon,authenticated;
create table public.case_verifications (
 id uuid primary key default gen_random_uuid(), case_id uuid not null, warehouse_id uuid not null, sme_id uuid not null,
 fact text not null, evidence_id uuid not null, note text not null check(length(trim(note))>0),
 verified_by uuid not null references public.profiles(id), verified_at timestamptz not null default now(),
 foreign key(case_id,warehouse_id,sme_id) references public.exception_cases(id,warehouse_id,sme_id),
 foreign key(evidence_id) references public.evidence(id), unique(case_id,fact)
);
alter table public.case_verifications enable row level security;
revoke all on public.case_verifications from public,anon,authenticated;
grant select on public.case_verifications to authenticated;
grant all on public.case_verifications to service_role;
create policy case_verifications_read on public.case_verifications for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));

create function private.case_source(c public.exception_cases) returns text language sql stable security definer set search_path='' as $$
 select c.version::text||':'||s.version::text||':'||coalesce((select max(version) from public.resolution_policies where sme_id=c.sme_id),0)::text
 from public.shipments s where s.id=c.shipment_id;
$$;
create function private.case_required(p_type text) returns jsonb language sql immutable set search_path='' as $$
 select ('{"quantity_mismatch":["count_verified","sme_decision_recorded","physical_handling_verified"],"damaged_goods":["damage_assessed","quarantine_verified","disposition_verified","sme_decision_recorded"],"missing_stock":["investigation_completed","stock_reconciliation_verified"],"wrong_pick":["correction_verified","sme_receipt_confirmed"],"short_pick":["remainder_delivered_verified","sme_receipt_confirmed"],"courier_delay":["courier_update_verified","outcome_verified"],"delivery_failed":["dispatch_or_return_verified","receiver_or_return_confirmation"],"recipient_unavailable":["capacity_confirmed","verified_pod","receiver_confirmation"],"transit_damage":["condition_evidence_verified","handling_verified","responsibility_reviewed"],"transit_loss":["carrier_response_verified","loss_resolution_verified","responsibility_reviewed"]}'::jsonb)->p_type;
$$;
create function private.case_detail(c public.exception_cases) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(c)||jsonb_build_object('source_version',private.case_source(c),'required_facts',private.case_required(c.type),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.case_events e where e.case_id=c.id and (private.is_staff(c.warehouse_id) or e.sme_visible)),'[]'::jsonb),
 'verifications',coalesce((select jsonb_agg(to_jsonb(v) order by v.verified_at) from public.case_verifications v where v.case_id=c.id),'[]'::jsonb),
 'approvals',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.approvals a where a.case_id=c.id),'[]'::jsonb),
 'analyses',case when private.is_staff(c.warehouse_id) then coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.ai_analyses a where a.case_id=c.id),'[]'::jsonb) else '[]'::jsonb end,
 'jobs',case when private.is_staff(c.warehouse_id) then coalesce((select jsonb_agg(to_jsonb(j)-'last_error' order by j.created_at) from public.analysis_jobs j where j.case_id=c.id),'[]'::jsonb) else '[]'::jsonb end,
 'actions',case when private.is_staff(c.warehouse_id) then coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.action_executions a where a.case_id=c.id),'[]'::jsonb) else '[]'::jsonb end,
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'mime_type',e.mime_type,'size_bytes',e.size_bytes,'uploaded',exists(select 1 from storage.objects o where o.bucket_id='parcelcare-evidence' and o.name=e.object_path)))
 from public.evidence e where e.shipment_id=c.shipment_id and private.can_read_evidence(e.id)),'[]'::jsonb));
$$;
create function public.case_read(p_case uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.exception_cases;
begin
 select * into c from public.exception_cases where id=p_case;
 if c.id is null or not private.can_read_tenant(c.warehouse_id,c.sme_id) then raise exception 'forbidden' using errcode='42501'; end if;
 return private.case_detail(c);
end $$;

create function public.case_command(p_kind text,p_entity uuid,p_key uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.exception_cases; s public.shipments; a public.approvals; pol public.resolution_policies;
 old private.workflow_commands; result jsonb; req jsonb; v_id uuid; v_note text:=btrim(p_body->>'note');
 v_action text; v_fact text; v_decision text; v_status text; staff boolean; required jsonb;
begin
 if auth.uid() is null or p_key is null or p_correlation is null or p_body is null then raise exception 'forbidden' using errcode='42501'; end if;
 perform set_config('parcelcare.correlation_id',p_correlation::text,true);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_kind||p_key::text,0));
 req:=jsonb_build_object('entity',p_entity,'body',p_body);
 -- Authorize current membership before returning even a previously saved result.
 if p_kind='report' then
  select * into s from public.shipments where id=p_entity for update;
  if s.id is null or not private.can_read_tenant(s.warehouse_id,s.sme_id) then raise exception 'forbidden' using errcode='42501'; end if;
 else
  if p_kind='decision' then select c0.* into c from public.exception_cases c0 join public.approvals a0 on a0.case_id=c0.id where a0.id=p_entity for update of c0;
  else select * into c from public.exception_cases where id=p_entity for update; end if;
  if c.id is null or not private.can_read_tenant(c.warehouse_id,c.sme_id) then raise exception 'forbidden' using errcode='42501'; end if;
  select * into s from public.shipments where id=c.shipment_id;
 end if;
 staff:=private.is_staff(s.warehouse_id);
 if p_kind not in ('report','decision','information') and not staff then raise exception 'forbidden' using errcode='42501'; end if;
 if p_kind='decision' and not private.is_sme(c.warehouse_id,c.sme_id) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into old from private.workflow_commands where actor_id=auth.uid() and key=p_key and kind=p_kind;
 if old.key is not null then
  if old.request<>req then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return old.result;
 end if;
 if coalesce(length(v_note),0) not between 1 and 2000 then raise exception 'invalid_note' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(p_body->'evidence_ids','[]'::jsonb)) x where not exists(
  select 1 from public.evidence e join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=e.object_path
  where e.id=x.value::uuid and e.shipment_id=s.id and private.can_read_evidence(e.id))) then raise exception 'invalid_evidence' using errcode='22023'; end if;
 select * into pol from public.resolution_policies where sme_id=s.sme_id order by version desc limit 1;
 if p_kind='report' then
  if p_body->>'stage' not in ('inbound','warehouse','outbound') or private.case_required(p_body->>'type') is null then raise exception 'invalid_case' using errcode='22023'; end if;
  insert into public.exception_cases(shipment_id,warehouse_id,sme_id,stage,type,summary)
   values(s.id,s.warehouse_id,s.sme_id,p_body->>'stage',p_body->>'type',v_note)
   on conflict(shipment_id,stage,type) where status not in ('resolved','closed') do nothing returning * into c;
  if c.id is null then select * into c from public.exception_cases where shipment_id=s.id and stage=p_body->>'stage' and type=p_body->>'type' and status not in ('resolved','closed') for update; end if;
 elsif p_kind='decision' then
  select * into a from public.approvals where id=p_entity for update;
  if a.policy_version<>coalesce(pol.version,1) then raise exception 'stale_version' using errcode='22023'; end if;
  v_decision:=p_body->>'decision';
  if v_decision='propose_retry' and ((p_body->>'preferred_at')::timestamptz is null or (p_body->>'preferred_at')::timestamptz<=now()) then raise exception 'invalid_retry_time' using errcode='22023'; end if;
  result:=public.decide_approval(a.id,v_decision,v_note);
  update public.approvals set preferred_at=(p_body->>'preferred_at')::timestamptz where id=a.id;
  update public.exception_cases set status=case when v_decision in ('await_remainder','reject','propose_retry') then 'awaiting_information' else 'awaiting_verification' end where id=c.id;
 else
  if (p_body->>'expected_version')::integer is distinct from c.version or (p_body->>'source_version') is distinct from private.case_source(c)
   then raise exception 'stale_version' using errcode='22023'; end if;
  if c.status in ('closed','resolved') then raise exception 'case_terminal' using errcode='22023'; end if;
  if p_kind='action' then
   v_action:=p_body->>'action';
   if pol.id is null or (p_body->>'policy_version')::integer is distinct from pol.version or not(pol.allowed_actions ? v_action)
    or v_action not in ('save_summary','notify_sme','request_information','request_sme_decision','propose_correction','escalate','update_workflow') then raise exception 'action_not_allowed' using errcode='22023'; end if;
   if v_action in ('request_sme_decision','propose_correction') then
    if exists(select 1 from public.approvals where case_id=c.id and status='pending') then raise exception 'approval_pending' using errcode='22023'; end if;
    insert into public.approvals(case_id,warehouse_id,sme_id,kind,options,requested_by,policy_version,requested_case_version)
     values(c.id,c.warehouse_id,c.sme_id,case when v_action='propose_correction' then 'proposed_correction' when c.type in ('quantity_mismatch','damaged_goods') then 'partial_receipt' else 'retry_time' end,
      case when v_action='propose_correction' then '["accept","reject"]'::jsonb when c.type in ('quantity_mismatch','damaged_goods') then '["accept_partial","await_remainder","reject"]'::jsonb else '["propose_retry","reject"]'::jsonb end,
      auth.uid(),pol.version,c.version) returning id into v_id;
    update public.exception_cases set status='awaiting_sme_decision' where id=c.id;
   elsif v_action='escalate' then update public.exception_cases set handling_mode='human',status='processing' where id=c.id;
   elsif v_action='request_information' then update public.exception_cases set status='awaiting_information' where id=c.id;
   elsif v_action='save_summary' then update public.exception_cases set summary=v_note where id=c.id;
   elsif v_action='update_workflow' then
    v_status:=p_body->>'status';
    if v_status not in ('investigating','processing','awaiting_information','awaiting_courier_confirmation','awaiting_verification') then raise exception 'invalid_transition' using errcode='22023'; end if;
    update public.exception_cases set status=v_status where id=c.id;
   end if;
   insert into public.action_executions(case_id,warehouse_id,sme_id,action,idempotency_key,status,actor_id,result)
    values(c.id,c.warehouse_id,c.sme_id,v_action,p_key,case when v_action='propose_correction' then 'pending' else 'completed' end,auth.uid(),jsonb_build_object('note',v_note,'approval_id',v_id,'policy_version',pol.version));
   if v_action in ('notify_sme','request_information','request_sme_decision','propose_correction') then
    insert into public.notifications(case_id,warehouse_id,sme_id,message,dedupe_key) values(c.id,c.warehouse_id,c.sme_id,v_note,p_key::text);
   end if;
  elsif p_kind='verify' then
   v_fact:=p_body->>'fact'; required:=private.case_required(c.type)||'["remainder_completed"]'::jsonb;
   if v_fact='sme_decision_recorded' or not(required ? v_fact) or jsonb_array_length(coalesce(p_body->'evidence_ids','[]'))=0 then raise exception 'invalid_verification' using errcode='22023'; end if;
   insert into public.case_verifications(case_id,warehouse_id,sme_id,fact,evidence_id,note,verified_by)
    values(c.id,c.warehouse_id,c.sme_id,v_fact,(p_body->'evidence_ids'->>0)::uuid,v_note,auth.uid())
    on conflict(case_id,fact) do update set evidence_id=excluded.evidence_id,note=excluded.note,verified_by=excluded.verified_by,verified_at=now();
  elsif p_kind='close' then
   required:=private.case_required(c.type);
   if exists(select 1 from public.approvals where case_id=c.id and status='pending')
    or exists(select 1 from public.action_executions where case_id=c.id and status in ('requested','accepted','pending'))
    or exists(select 1 from jsonb_array_elements_text(required) f where f.value<>'sme_decision_recorded' and not exists(select 1 from public.case_verifications v where v.case_id=c.id and v.fact=f.value))
    then raise exception 'closure_pending' using errcode='22023'; end if;
   select * into a from public.approvals where case_id=c.id and kind='partial_receipt' and status='decided' order by created_at desc limit 1;
   if required ? 'sme_decision_recorded' and (a.id is null or a.decision not in ('accept_partial','await_remainder')) then raise exception 'closure_pending' using errcode='22023'; end if;
   if a.decision='await_remainder' and not exists(select 1 from public.case_verifications where case_id=c.id and fact='remainder_completed') then raise exception 'closure_pending' using errcode='22023'; end if;
   update public.exception_cases set status='closed',closed_at=now(),verified_at=now(),verified_by=auth.uid(),resolution_note=v_note where id=c.id;
   insert into public.notifications(case_id,warehouse_id,sme_id,message,dedupe_key) values(c.id,c.warehouse_id,c.sme_id,'Verified case closure: '||v_note,p_key::text);
  elsif p_kind='information' then null;
  elsif p_kind='analyze' then
   if pol.id is null then raise exception 'policy_missing' using errcode='22023'; end if;
   if exists(select 1 from public.analysis_jobs where case_id=c.id and status in ('queued','running')) then raise exception 'analysis_pending' using errcode='22023'; end if;
   insert into public.analysis_jobs(case_id,warehouse_id,sme_id,idempotency_key,requested_by,source_version)
    values(c.id,c.warehouse_id,c.sme_id,p_key,auth.uid(),private.case_source(c)) returning id into v_id;
  else raise exception 'invalid_command' using errcode='22023'; end if;
 end if;
 -- Analysis queueing does not change source facts and invalidate its own snapshot.
 if p_kind<>'analyze' then update public.exception_cases set version=version+1 where id=c.id; end if;
 insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload,sme_visible)
  values(c.id,c.warehouse_id,c.sme_id,auth.uid(),case when staff then 'staff' else 'sme' end,p_kind,
   p_body||jsonb_build_object('policy_version',pol.version,'related_id',v_id),p_kind<>'analyze');
 perform private.audit(c.warehouse_id,c.sme_id,'case.'||p_kind,c.id,p_body);
 insert into public.outbox_events(warehouse_id,sme_id,event_type,entity_id,idempotency_key,payload,actor_id,correlation_id)
  values(c.warehouse_id,c.sme_id,'case.'||p_kind,c.id,'case:'||auth.uid()::text||':'||p_kind||':'||p_key::text,
   jsonb_build_object('case_id',c.id,'actor_id',auth.uid(),'schema_version',1,'occurred_at',now()),auth.uid(),p_correlation);
 select * into c from public.exception_cases where id=c.id;
 result:=private.case_detail(c)||jsonb_build_object('job_id',case when p_kind='analyze' then v_id else null end);
 insert into private.workflow_commands(actor_id,key,kind,request,result) values(auth.uid(),p_key,p_kind,req,result);
 return result;
end $$;

create function public.tenant_feed(p_kind text,p_sme uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
 if p_sme is not null and not exists(select 1 from public.smes where id=p_sme and private.can_read_tenant(warehouse_id,id)) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_kind='notifications' then return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
  select n.*,exists(select 1 from public.notification_reads r where r.notification_id=n.id and r.profile_id=auth.uid()) as read
  from public.notifications n where private.can_read_tenant(n.warehouse_id,n.sme_id) and (p_sme is null or n.sme_id=p_sme) order by n.created_at desc,n.id limit 100) x),'[]'::jsonb); end if;
 if p_kind<>'overview' or p_sme is null then raise exception 'invalid_feed' using errcode='22023'; end if;
 return jsonb_build_object('inventory',coalesce((select jsonb_agg(private.ops_inventory(p)) from public.products p where p.sme_id=p_sme),'[]'::jsonb),
 'shipments',coalesce((select jsonb_agg(private.ops_shipment(s)) from public.shipments s where s.sme_id=p_sme),'[]'::jsonb),
 'cases',coalesce((select jsonb_agg(to_jsonb(c)) from public.exception_cases c where c.sme_id=p_sme),'[]'::jsonb),
 'approvals',coalesce((select jsonb_agg(to_jsonb(a)) from public.approvals a where a.sme_id=p_sme),'[]'::jsonb));
end $$;
revoke all on function private.case_source(public.exception_cases),private.case_required(text),private.case_detail(public.exception_cases) from public,anon,authenticated;
revoke all on function public.case_read(uuid),public.case_command(text,uuid,uuid,jsonb,uuid),public.tenant_feed(text,uuid) from public,anon;
grant execute on function public.case_read(uuid),public.case_command(text,uuid,uuid,jsonb,uuid),public.tenant_feed(text,uuid) to authenticated;
-- The versioned wrapper supersedes the unversioned browser decision function.
revoke execute on function public.decide_approval(uuid,text,text) from authenticated;
commit;
