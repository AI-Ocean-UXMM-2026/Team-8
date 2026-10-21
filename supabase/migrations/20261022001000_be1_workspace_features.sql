begin;
-- Preserve the historical implementation and add filters BEFORE pagination.
alter function public.ops_read(uuid,text,jsonb) rename to ops_read_v1;
revoke all on function public.ops_read_v1(uuid,text,jsonb) from public,anon,authenticated;
create function public.ops_read(p_warehouse uuid,p_kind text,p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; n integer:=coalesce((p_filters->>'limit')::integer,25); cur uuid:=(p_filters->>'cursor')::uuid;
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_kind<>'cases' then return public.ops_read_v1(p_warehouse,p_kind,p_filters); end if;
 if n<1 or n>100 then raise exception 'invalid_limit' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.item order by x.id),'[]'::jsonb) into result from (
  select c.id,to_jsonb(c)||jsonb_build_object('evidence_ids',coalesce((select jsonb_agg(distinct e.value)
   from public.case_events ce,lateral jsonb_array_elements(coalesce(ce.payload->'evidence_ids','[]'::jsonb)) e where ce.case_id=c.id),'[]'::jsonb)) item
  from public.exception_cases c where c.warehouse_id=p_warehouse and (cur is null or c.id>cur)
   and (not(p_filters ? 'sme_id') or c.sme_id=(p_filters->>'sme_id')::uuid)
   and (p_filters->>'status'='all' or c.status not in ('resolved','closed'))
   and (not(p_filters ? 'issue_type') or c.type=p_filters->>'issue_type')
   and (not(p_filters ? 'priority') or c.priority=p_filters->>'priority')
   and (not(p_filters ? 'handling_mode') or c.handling_mode=p_filters->>'handling_mode')
   and (not(p_filters ? 'state') or c.status=p_filters->>'state')
   and (not(p_filters ? 'owner_id') or (p_filters->>'owner_id'='unassigned' and c.owner_id is null)
    or c.owner_id::text=p_filters->>'owner_id') order by c.id limit n+1) x;
 return jsonb_build_object('items',case when jsonb_array_length(result)>n then result-n else result end,
  'next_cursor',case when jsonb_array_length(result)>n then result->(n-1)->>'id' else null end);
end $$;
revoke all on function public.ops_read(uuid,text,jsonb) from public,anon;
grant execute on function public.ops_read(uuid,text,jsonb) to authenticated;

create function public.evidence_upload_access(p_evidence uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.evidence;
begin
 select * into e from public.evidence where id=p_evidence;
 if e.id is null or e.uploaded_by is distinct from auth.uid() or not private.can_read_evidence(e.id)
  or exists(select 1 from storage.objects where bucket_id='parcelcare-evidence' and name=e.object_path)
 then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('id',e.id,'path',e.object_path,'mime_type',e.mime_type,'size_bytes',e.size_bytes);
end $$;
revoke all on function public.evidence_upload_access(uuid) from public,anon;
grant execute on function public.evidence_upload_access(uuid) to authenticated;

create function public.mark_notification_unread(p_notification uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notifications n where n.id=p_notification and private.can_read_tenant(n.warehouse_id,n.sme_id))
 then raise exception 'forbidden' using errcode='42501'; end if;
 delete from public.notification_reads where notification_id=p_notification and profile_id=auth.uid();
end $$;
revoke all on function public.mark_notification_unread(uuid) from public,anon;
grant execute on function public.mark_notification_unread(uuid) to authenticated;

create function public.run_retention(p_hours integer default 24) returns bigint
language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 if p_hours<1 or p_hours>720 then raise exception 'invalid_retention' using errcode='22023'; end if;
 delete from public.rider_locations where received_at<now()-make_interval(hours=>p_hours);
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.run_retention(integer) from public,anon,authenticated;
grant execute on function public.run_retention(integer) to service_role;
commit;
