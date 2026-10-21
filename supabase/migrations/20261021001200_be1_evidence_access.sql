begin;
create function public.evidence_access(p_evidence uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.evidence;
begin
 select * into e from public.evidence where id=p_evidence;
 if e.id is null or not private.can_read_evidence(e.id) or not exists(select 1 from storage.objects o where o.bucket_id='parcelcare-evidence' and o.name=e.object_path) then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('id',e.id,'path',e.object_path);
end $$;
revoke all on function public.evidence_access(uuid) from public,anon;
grant execute on function public.evidence_access(uuid) to authenticated;
commit;
