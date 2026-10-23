begin;
-- Keep the original source projection and fingerprint checks. Include bounded
-- human source notes so a fresh analysis can actually see an SME's reply.
alter function private.analysis_source(public.exception_cases) rename to analysis_source_v1;
revoke all on function private.analysis_source_v1(public.exception_cases) from public,anon,authenticated;
create function private.analysis_source(c public.exception_cases) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_set(private.analysis_source_v1(c),'{case,human_updates}',coalesce((
  select jsonb_agg(jsonb_build_object('id',u.id,'type',u.type,'actor_type',u.actor_type,
   'created_at',u.created_at,'note',left(u.payload->>'note',2000)) order by u.created_at,u.id)
  from (select e.id,e.type,e.actor_type,e.created_at,e.payload from public.case_events e
   where e.case_id=c.id and e.actor_type in ('staff','sme')
    and e.type in ('report','information','decision','verify','review')
    and length(btrim(e.payload->>'note'))>0
   order by e.created_at desc,e.id desc limit 50) u
 ),'[]'::jsonb));
$$;
revoke all on function private.analysis_source(public.exception_cases) from public,anon,authenticated;
commit;
