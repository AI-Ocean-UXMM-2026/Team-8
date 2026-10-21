begin;
alter function private.case_detail(public.exception_cases) rename to case_detail_v1;
create function private.case_detail(c public.exception_cases) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.case_detail_v1(c)||jsonb_build_object(
  'policy_version',coalesce((select version from public.resolution_policies where sme_id=c.sme_id order by version desc limit 1),1),
  'allowed_actions',case when private.is_staff(c.warehouse_id) and c.status not in ('closed','resolved') then coalesce(
   (select allowed_actions from public.resolution_policies where sme_id=c.sme_id order by version desc limit 1),'[]'::jsonb) else '[]'::jsonb end);
$$;
revoke all on function private.case_detail(public.exception_cases) from public,anon,authenticated;

alter function public.case_command(text,uuid,uuid,jsonb,uuid) rename to case_command_v1;
revoke all on function public.case_command_v1(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.case_command(p_kind text,p_entity uuid,p_key uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.exception_cases; a public.approvals; result jsonb;
begin
 if p_kind='decision' and not exists(select 1 from private.workflow_commands where actor_id=auth.uid() and key=p_key and kind=p_kind) then
  select c0.* into c from public.exception_cases c0 join public.approvals a0 on a0.case_id=c0.id where a0.id=p_entity for update of c0;
  select * into a from public.approvals where id=p_entity for update;
  if a.id is null or not private.is_sme(a.warehouse_id,a.sme_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if a.status='decided' then
   if a.decided_by=auth.uid() and a.decision=p_body->>'decision' and a.note is not distinct from p_body->>'note'
    and a.preferred_at is not distinct from (p_body->>'preferred_at')::timestamptz then
    result:=private.case_detail(c)||jsonb_build_object('job_id',null);
    insert into private.workflow_commands(actor_id,key,kind,request,result) values(auth.uid(),p_key,p_kind,
     jsonb_build_object('entity',p_entity,'body',p_body),result);
    return result;
   end if;
   raise exception 'decision_not_allowed' using errcode='22023';
  end if;
  if a.status='pending' and (c.version<>a.requested_case_version+1 or
   (p_body ? 'request_version' and p_body->>'request_version' is not null and (p_body->>'request_version')::integer<>a.requested_case_version))
  then raise exception 'stale_version' using errcode='22023'; end if;
 end if;
 if p_kind='action' and p_body->>'action' in ('request_sme_decision','propose_correction') then
  select * into c from public.exception_cases where id=p_entity for update;
  if private.is_staff(c.warehouse_id) and (p_body->>'expected_version')::integer=c.version and p_body->>'source_version'=private.case_source(c) then
   update public.approvals set status='cancelled' where case_id=c.id and status='pending' and requested_case_version+1<>c.version;
  end if;
 end if;
 return public.case_command_v1(p_kind,p_entity,p_key,p_body,p_correlation);
end $$;
revoke all on function public.case_command(text,uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.case_command(text,uuid,uuid,jsonb,uuid) to authenticated;
commit;
