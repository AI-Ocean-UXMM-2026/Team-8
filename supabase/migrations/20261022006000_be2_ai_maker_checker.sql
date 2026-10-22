begin;

alter table public.analysis_jobs add column pipeline_stage text not null default 'queued'
 check(pipeline_stage in ('queued','maker','checker','completed','blocked'));
alter table public.analysis_jobs add column maker_result jsonb;
alter table public.analysis_jobs add column source_fingerprint text;
alter table public.analysis_jobs add column review_reason text;
alter table public.analysis_jobs add column completed_token uuid;
alter table public.analysis_jobs add column finish_request jsonb;
alter table public.analysis_jobs add column finish_result jsonb;
alter table public.ai_analyses add column job_id uuid unique references public.analysis_jobs(id);
alter table public.ai_analyses add column review_status text not null default 'legacy_unchecked'
 check(review_status in ('legacy_unchecked','approved','rejected','error'));
alter table public.ai_analyses add column execution_status text not null default 'blocked'
 check(execution_status in ('blocked','review_required','executed'));
alter table public.ai_analyses add column review_reason text;
alter table public.ai_analyses add column checker_model text;
alter table public.ai_analyses add column checker_response_id text;
alter table public.ai_analyses add column checker_output jsonb;
alter table public.ai_analyses add column checker_configuration jsonb;
alter table public.ai_analyses add column checker_input_tokens integer check(checker_input_tokens>=0);
alter table public.ai_analyses add column checker_output_tokens integer check(checker_output_tokens>=0);
alter table public.action_executions add column analysis_id uuid references public.ai_analyses(id);
alter table public.action_executions add column execution_origin text not null default 'human'
 check(execution_origin in ('human','ai_maker_checker'));

-- Only stable source facts enter the fingerprint: job stages and previous AI
-- output must never invalidate the snapshot or influence the next checker.
create function private.analysis_source(c public.exception_cases) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('source_version',private.case_source(c),
  'policy_id',pol.id,'policy_version',pol.version,'allowed_actions',pol.allowed_actions,'policy_rules',pol.rules,
  'case',jsonb_build_object('id',c.id,'type',c.type,'priority',c.priority,'summary',c.summary,
   'evidence',private.case_detail(c)->'evidence'),
  'shipment',private.ops_detail(s),
  'inventory',coalesce((select jsonb_agg(private.ops_inventory(p) order by p.id)
   from public.products p join public.shipment_items i on i.product_id=p.id where i.shipment_id=c.shipment_id),'[]'::jsonb),
  'facts',(select jsonb_build_object('expected_qty',sum(expected_qty),'received_qty',sum(received_qty),
   'shortage_qty',sum(expected_qty-received_qty),'damaged_qty',sum(damaged_qty),'good_qty',sum(received_qty-damaged_qty))
   from public.shipment_items where shipment_id=c.shipment_id))
 from public.shipments s join lateral (select * from public.resolution_policies where sme_id=c.sme_id order by version desc limit 1) pol on true
 where s.id=c.shipment_id;
$$;

create function private.analysis_review(p_case uuid,p_job uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.exception_cases;
begin
 update public.exception_cases set handling_mode='human',status='processing',version=version+1
  where id=p_case and status not in ('closed','resolved') returning * into c;
 if c.id is null then return; end if;
 insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload,sme_visible)
  values(c.id,c.warehouse_id,c.sme_id,auth.uid(),'system','ai_review_required',
   jsonb_build_object('job_id',p_job,'reason',p_reason),false);
 perform private.audit(c.warehouse_id,c.sme_id,'ai.review_required',c.id,jsonb_build_object('job_id',p_job,'reason',p_reason));
end $$;

create or replace function public.analysis_claim(p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.analysis_jobs; c public.exception_cases; source jsonb; token uuid:=gen_random_uuid();
begin
 select * into j from public.analysis_jobs where id=p_job for update;
 if j.id is null or j.status in ('completed','failed') or
  (j.status='running' and j.lease_until>now()) or j.available_at>now() then return null; end if;
 select * into c from public.exception_cases where id=j.case_id for update;
 if not exists(select 1 from public.memberships where profile_id=j.requested_by and warehouse_id=j.warehouse_id and role in ('owner','staff') and active) then
  update public.analysis_jobs set status='failed',pipeline_stage='blocked',review_reason='requester_revoked',last_error='requester_revoked',attempts=3 where id=j.id;
  return null;
 end if;
 perform set_config('request.jwt.claim.sub',j.requested_by::text,true);
 if j.attempts>=3 then
  update public.analysis_jobs set status='failed',pipeline_stage='blocked',review_reason='lease_exhausted',last_error='lease_exhausted',lease_until=null where id=j.id;
  perform private.analysis_review(c.id,j.id,'lease_exhausted'); return null;
 end if;
 source:=private.analysis_source(c);
 if c.status in ('closed','resolved') or private.case_source(c)<>j.source_version or source is null then
  update public.analysis_jobs set status='failed',pipeline_stage='blocked',review_reason='stale_source',last_error='stale_source',attempts=3 where id=j.id;
  perform private.analysis_review(c.id,j.id,'stale_source'); return null;
 end if;
 update public.analysis_jobs set status='running',pipeline_stage='maker',attempts=attempts+1,
  lease_until=now()+interval '3 minutes',last_error=token::text,maker_result=null,
  source_fingerprint=md5(source::text),review_reason=null where id=j.id;
 return source||jsonb_build_object('job_id',j.id,'lease_token',token);
end $$;

create or replace function public.analysis_pending() returns setof uuid language sql stable security definer set search_path='' as $$
 select id from public.analysis_jobs where available_at<=now() and
  ((status='queued' and attempts<3) or (status='running' and lease_until<now())) order by available_at,id limit 20;
$$;

create function public.analysis_stage(p_job uuid,p_token uuid,p_stage text,p_maker jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare j public.analysis_jobs; c public.exception_cases;
begin
 select * into j from public.analysis_jobs where id=p_job for update;
 if j.id is null or j.status<>'running' or j.last_error is distinct from p_token::text or j.lease_until<=now()
  then raise exception 'stale_version' using errcode='22023'; end if;
 select * into c from public.exception_cases where id=j.case_id for update;
 if not exists(select 1 from public.memberships where profile_id=j.requested_by and warehouse_id=j.warehouse_id and role in ('owner','staff') and active)
  then raise exception 'forbidden' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',j.requested_by::text,true);
 if c.status in ('closed','resolved') or private.case_source(c)<>j.source_version
  or md5(private.analysis_source(c)::text) is distinct from j.source_fingerprint then raise exception 'stale_source' using errcode='22023'; end if;
 if p_stage='maker' and j.pipeline_stage='maker' and p_maker is null then return; end if;
 if p_stage<>'checker' or j.pipeline_stage<>'maker' or jsonb_typeof(p_maker->'output') is distinct from 'object'
  or coalesce(p_maker->>'proposal_hash','')!~'^[0-9a-f]{64}$' or coalesce(p_maker->>'provider_response_id','')=''
  then raise exception 'invalid_output' using errcode='22023'; end if;
 update public.analysis_jobs set pipeline_stage='checker',maker_result=p_maker,lease_until=now()+interval '3 minutes' where id=j.id;
end $$;

create or replace function public.analysis_finish(p_job uuid,p_token uuid,p_result jsonb,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.analysis_jobs; c public.exception_cases; pol public.resolution_policies;
 maker jsonb; checker jsonb; proposal jsonb; review jsonb; a_id uuid; reason text; verdict text;
 execution text:='blocked'; action text; result jsonb; saved jsonb;
 request jsonb:=jsonb_build_object('result',p_result,'error',p_error);
begin
 select * into j from public.analysis_jobs where id=p_job for update;
 if j.id is null then raise exception 'stale_version' using errcode='22023'; end if;
 if j.completed_token=p_token and j.finish_result is not null then
  if j.finish_request is distinct from request then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return j.finish_result;
 end if;
 if j.status<>'running' or j.last_error is distinct from p_token::text or j.lease_until<=now()
  then raise exception 'stale_version' using errcode='22023'; end if;
 select * into c from public.exception_cases where id=j.case_id for update;
 perform set_config('request.jwt.claim.sub',j.requested_by::text,true);
 -- Lock operational source rows through eligible action execution as well.
 perform 1 from public.shipments where id=c.shipment_id for update;
 perform 1 from public.products where id in (select product_id from public.shipment_items where shipment_id=c.shipment_id) order by id for update;
 select * into pol from public.resolution_policies where sme_id=c.sme_id order by version desc limit 1 for update;
 if not exists(select 1 from public.memberships where profile_id=j.requested_by and warehouse_id=j.warehouse_id and role in ('owner','staff') and active) then reason:='requester_revoked';
 elsif c.status in ('closed','resolved') or private.case_source(c)<>j.source_version
  or md5(private.analysis_source(c)::text) is distinct from j.source_fingerprint then reason:='stale_source';
 elsif p_error is not null then
  if p_error not in ('configuration_missing','timeout','refusal','invalid_output','provider_unavailable') then raise exception 'invalid_error' using errcode='22023'; end if;
  reason:=case when p_error='configuration_missing' then p_error else 'maker_'||p_error end;
 else
  maker:=p_result->'maker'; checker:=p_result->'checker'; proposal:=maker->'output'; review:=checker->'output';
  -- The durable checkpoint is authoritative; a finish call cannot substitute a
  -- proposal after the checker saw it. Legacy single-model finishes fail closed.
  if j.pipeline_stage<>'checker' or j.maker_result is null or maker is distinct from j.maker_result then reason:='maker_invalid_output';
  elsif jsonb_typeof(proposal) is distinct from 'object' or jsonb_typeof(proposal->'evidence_ids') is distinct from 'array'
   or jsonb_typeof(proposal->'missing_information') is distinct from 'array'
   or jsonb_typeof(proposal->'requires_human') is distinct from 'boolean'
   or coalesce(length(btrim(proposal->>'summary')),0) not between 1 and 4000
   or proposal->>'exception_type' is distinct from c.type
   or coalesce(array_position(array['low','normal','high','critical'],proposal->>'priority'),0)<array_position(array['low','normal','high','critical'],c.priority)
   or maker->>'policy_id' is distinct from pol.id::text or not(pol.allowed_actions ? (proposal->>'recommended_action'))
   then reason:='maker_invalid_output';
  elsif exists(select 1 from jsonb_array_elements_text(proposal->'evidence_ids') e where not exists(
   select 1 from public.evidence ev join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=ev.object_path
   where ev.id::text=e.value and ev.shipment_id=c.shipment_id)) then reason:='maker_invalid_evidence';
  elsif p_result->>'checker_error' is not null then
   if p_result->>'checker_error' not in ('timeout','refusal','invalid_output','provider_unavailable') then raise exception 'invalid_error' using errcode='22023'; end if;
   reason:='checker_'||(p_result->>'checker_error');
  elsif jsonb_typeof(review) is distinct from 'object' or review->>'source_version' is distinct from j.source_version
   or review->>'proposal_hash' is distinct from maker->>'proposal_hash'
   or coalesce(checker->>'model','')='' or coalesce(checker->>'provider_response_id','')=''
   or checker->>'provider_response_id'=maker->>'provider_response_id'
   or jsonb_typeof(review->'findings') is distinct from 'array'
   or coalesce(review->>'verdict','') not in ('approved','rejected') then reason:='checker_invalid_output';
  elsif review->>'verdict'='rejected' then reason:='checker_rejected';
  elsif review->'evidence_supported' is distinct from 'true'::jsonb or review->'classification_correct' is distinct from 'true'::jsonb
   or review->'priority_correct' is distinct from 'true'::jsonb or review->'action_authorized' is distinct from 'true'::jsonb
   then reason:='checker_invalid_output';
  end if;
 end if;

 verdict:=case when reason='checker_rejected' then 'rejected' when reason is not null then 'error' else 'approved' end;
 -- Preserve the valid checkpoint even if the checker fails, for staff review.
 maker:=j.maker_result; proposal:=maker->'output';
 if maker is not null then
  insert into public.ai_analyses(case_id,warehouse_id,sme_id,policy_id,model,source_version,output,input_tokens,output_tokens,
   configuration,provider_response_id,job_id,review_status,execution_status,review_reason,checker_model,checker_response_id,
   checker_output,checker_configuration,checker_input_tokens,checker_output_tokens)
  values(c.id,c.warehouse_id,c.sme_id,(maker->>'policy_id')::uuid,maker->>'model',j.source_version,proposal,
   (maker->>'input_tokens')::integer,(maker->>'output_tokens')::integer,maker->'configuration',maker->>'provider_response_id',
   j.id,verdict,'blocked',reason,checker->>'model',checker->>'provider_response_id',review,checker->'configuration',
   (checker->>'input_tokens')::integer,(checker->>'output_tokens')::integer) returning id into a_id;
 end if;

 if reason is null then
  action:=proposal->>'recommended_action'; execution:='review_required';
  if proposal->'requires_human' is distinct from 'false'::jsonb then reason:='maker_requires_human';
  elsif jsonb_array_length(proposal->'missing_information')>0 then reason:='missing_information';
  elsif proposal->>'priority'<>c.priority then reason:='priority_change_requires_review';
  elsif action not in ('save_summary','notify_sme','request_information','escalate')
   or not(coalesce(pol.rules->'ai_auto_actions','[]'::jsonb) ? action) then reason:='automation_not_authorized';
  else
   -- Call the existing audited/versioned command inside this transaction. No AI
   -- path can write stock, verify evidence, confirm POD, grant consent or close.
   begin
    saved:=public.case_command('action',c.id,j.id,jsonb_build_object('expected_version',c.version,'source_version',j.source_version,
     'policy_version',pol.version,'action',action,'note',proposal->>'summary','evidence_ids',proposal->'evidence_ids'),j.id);
    update public.action_executions set analysis_id=a_id,execution_origin='ai_maker_checker' where case_id=c.id and idempotency_key=j.id;
    execution:='executed';
   exception when others then
    execution:='blocked';reason:='execution_revalidation_failed';
   end;
  end if;
 end if;
 if execution<>'executed' then perform private.analysis_review(c.id,j.id,coalesce(reason,'review_required')); end if;
 update public.ai_analyses set execution_status=execution,review_reason=reason where id=a_id;
 insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload,sme_visible)
  values(c.id,c.warehouse_id,c.sme_id,j.requested_by,'ai','maker_checker_completed',
   jsonb_build_object('job_id',j.id,'analysis_id',a_id,'verdict',verdict,'execution_status',execution,'reason',reason),false);
 perform private.audit(c.warehouse_id,c.sme_id,'ai.maker_checker',c.id,
  jsonb_build_object('job_id',j.id,'analysis_id',a_id,'verdict',verdict,'execution_status',execution,'reason',reason));
 result:=jsonb_build_object('status',case when verdict='error' then 'failed' else 'completed' end,
  'analysis_id',a_id,'review_status',verdict,'execution_status',execution,'reason',reason);
 update public.analysis_jobs set status=case when verdict='error' then 'failed' else 'completed' end,
  pipeline_stage=case when execution='executed' then 'completed' else 'blocked' end,
  last_error=reason,review_reason=reason,lease_until=null,completed_token=p_token,finish_request=request,finish_result=result where id=j.id;
 return result;
end $$;

revoke all on function private.analysis_source(public.exception_cases),private.analysis_review(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.analysis_stage(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.analysis_stage(uuid,uuid,text,jsonb) to service_role;
-- Existing worker RPCs retain their service-role-only grants.
commit;
