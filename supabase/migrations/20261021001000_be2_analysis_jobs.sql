begin;
create function public.analysis_claim(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.analysis_jobs; c public.exception_cases; s public.shipments; pol public.resolution_policies; token uuid:=gen_random_uuid();
begin
 select * into j from public.analysis_jobs where id=p_job for update;
 if j.id is null or j.status='completed' or j.attempts>=3 or (j.status='running' and j.lease_until>now()) or j.available_at>now() then return null; end if;
 if not exists(select 1 from public.memberships where profile_id=j.requested_by and warehouse_id=j.warehouse_id and role in ('owner','staff') and active) then
  update public.analysis_jobs set status='failed',last_error='requester_revoked',attempts=3 where id=j.id; return null; end if;
 perform set_config('request.jwt.claim.sub',j.requested_by::text,true);
 select * into c from public.exception_cases where id=j.case_id for update;
 if c.status in ('closed','resolved') or private.case_source(c)<>j.source_version then
  update public.analysis_jobs set status='failed',last_error='stale_source',attempts=3 where id=j.id; return null; end if;
 select * into pol from public.resolution_policies where sme_id=c.sme_id order by version desc limit 1;
 select * into s from public.shipments where id=c.shipment_id;
 update public.analysis_jobs set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',last_error=token::text where id=j.id;
 return jsonb_build_object('job_id',j.id,'lease_token',token,'source_version',j.source_version,'policy_id',pol.id,'policy_version',pol.version,
  'allowed_actions',pol.allowed_actions,'case',private.case_detail(c),'shipment',private.ops_detail(s),
  'inventory',(select jsonb_agg(private.ops_inventory(p)) from public.products p join public.shipment_items i on i.product_id=p.id where i.shipment_id=c.shipment_id),
  'facts',(select jsonb_build_object('expected_qty',sum(expected_qty),'received_qty',sum(received_qty),
    'shortage_qty',sum(expected_qty-received_qty),'damaged_qty',sum(damaged_qty),'good_qty',sum(received_qty-damaged_qty))
    from public.shipment_items where shipment_id=c.shipment_id));
end $$;
create function public.analysis_finish(p_job uuid,p_token uuid,p_result jsonb,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.analysis_jobs; c public.exception_cases; pol public.resolution_policies; a_id uuid;
begin
 select * into j from public.analysis_jobs where id=p_job for update;
 if j.id is null or j.status<>'running' or j.last_error<>p_token::text or j.lease_until<=now() then raise exception 'stale_version' using errcode='22023'; end if;
 select * into c from public.exception_cases where id=j.case_id for update;
 if not exists(select 1 from public.memberships where profile_id=j.requested_by and warehouse_id=j.warehouse_id and role in ('owner','staff') and active)
  or c.status in ('closed','resolved') or private.case_source(c)<>j.source_version then
  update public.analysis_jobs set status='failed',attempts=3,last_error='stale_source',lease_until=null where id=j.id; return jsonb_build_object('status','failed'); end if;
 perform set_config('request.jwt.claim.sub',j.requested_by::text,true);
 if p_error is not null then
  if p_error not in ('timeout','refusal','invalid_output','provider_unavailable') then raise exception 'invalid_error' using errcode='22023'; end if;
  update public.analysis_jobs set status=case when attempts>=3 or p_error in ('refusal','invalid_output') then 'failed' else 'queued' end,
   available_at=now()+make_interval(secs=>30*attempts),last_error=p_error,lease_until=null where id=j.id;
  perform private.audit(j.warehouse_id,j.sme_id,'analysis.failed',j.id,jsonb_build_object('reason',p_error));
  return jsonb_build_object('status','failed','reason',p_error);
 end if;
 select * into pol from public.resolution_policies where sme_id=c.sme_id order by version desc limit 1;
 if (p_result->>'policy_id')::uuid is distinct from pol.id or not(pol.allowed_actions ? (p_result->'output'->>'recommended_action'))
  or exists(select 1 from jsonb_array_elements_text(p_result->'output'->'evidence_ids') e where not exists(select 1 from public.evidence ev join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=ev.object_path where ev.id=e.value::uuid and ev.shipment_id=c.shipment_id))
  then raise exception 'invalid_output' using errcode='22023'; end if;
 insert into public.ai_analyses(case_id,warehouse_id,sme_id,policy_id,model,source_version,output,input_tokens,output_tokens,configuration,provider_response_id)
  values(c.id,c.warehouse_id,c.sme_id,pol.id,p_result->>'model',j.source_version,p_result->'output',(p_result->>'input_tokens')::integer,
   (p_result->>'output_tokens')::integer,p_result->'configuration',p_result->>'provider_response_id') returning id into a_id;
 update public.analysis_jobs set status='completed',last_error=null,lease_until=null where id=j.id;
 insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload,sme_visible)
  values(c.id,c.warehouse_id,c.sme_id,j.requested_by,'ai','analysis_completed',jsonb_build_object('analysis_id',a_id,'summary',p_result->'output'->>'summary','source_version',j.source_version),false);
 perform private.audit(c.warehouse_id,c.sme_id,'analysis.completed',a_id,jsonb_build_object('job_id',j.id,'source_version',j.source_version));
 return jsonb_build_object('status','completed','analysis_id',a_id);
end $$;
create function public.analysis_pending() returns setof uuid language sql stable security definer set search_path='' as $$
 select id from public.analysis_jobs where attempts<3 and available_at<=now() and (status='queued' or (status='running' and lease_until<now())) order by available_at,id limit 20;
$$;
revoke all on function public.analysis_claim(uuid),public.analysis_finish(uuid,uuid,jsonb,text),public.analysis_pending() from public,anon,authenticated;
grant execute on function public.analysis_claim(uuid),public.analysis_finish(uuid,uuid,jsonb,text),public.analysis_pending() to service_role;
commit;
