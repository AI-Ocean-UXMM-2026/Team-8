begin;
alter function public.analysis_claim(uuid) rename to analysis_claim_v1;
revoke all on function public.analysis_claim_v1(uuid) from public,anon,authenticated;
create function public.analysis_claim(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; sid uuid;
begin
 result:=public.analysis_claim_v1(p_job);
 if result is null then return null; end if;
 sid:=(result->'shipment'->>'id')::uuid;
 update public.analysis_jobs set lease_until=now()+interval '5 minutes' where id=p_job;
 return result||jsonb_build_object('evidence_files',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'object_path',e.object_path,'mime_type',e.mime_type,'size_bytes',e.size_bytes) order by e.created_at,e.id)
 from public.evidence e join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=e.object_path where e.shipment_id=sid),'[]'::jsonb));
end $$;

-- Extend the independent maker/checker pipeline with evidence metadata only.
-- The checkpointed checker/source validation and guarded action execution remain
-- authoritative in analysis_finish_v1; never execute a second legacy action.
alter function public.analysis_finish(uuid,uuid,jsonb,text) rename to analysis_finish_v1;
revoke all on function public.analysis_finish_v1(uuid,uuid,jsonb,text) from public,anon,authenticated;
create function public.analysis_finish(p_job uuid,p_token uuid,p_result jsonb,p_error text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.analysis_finish_v1(p_job,p_token,p_result,p_error);
 if result->>'analysis_id' is not null then
  update public.ai_analyses set configuration=configuration||jsonb_build_object(
   'evidence_consumed',coalesce(p_result->'evidence_consumed','[]'::jsonb))
  where id=(result->>'analysis_id')::uuid;
 end if;
 return result;
end $$;
revoke all on function public.analysis_claim(uuid),public.analysis_finish(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.analysis_claim(uuid),public.analysis_finish(uuid,uuid,jsonb,text) to service_role;
commit;
