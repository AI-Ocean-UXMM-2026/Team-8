begin;
-- Preserve breach detection while adding recovery for unassigned/inactive managers.
alter function public.run_sla_escalations() set schema private;
alter function private.run_sla_escalations() rename to sla_detect_escalations;
revoke all on function private.sla_detect_escalations() from public,anon,authenticated,service_role,parcelcare_worker;
create function public.run_sla_escalations() returns integer
language plpgsql security definer set search_path='' as $$
declare total integer; c public.exception_cases; s public.case_slas; manager uuid;
begin
 total=private.sla_detect_escalations();
 for c in select e.* from public.exception_cases e join public.case_slas l on l.case_id=e.id
 where e.status not in ('resolved','closed') and l.resolved_at is null
 and (l.response_escalated_at is not null or l.resolution_escalated_at is not null)
 and (l.manager_id is null or not exists(select 1 from public.memberships m where m.profile_id=l.manager_id and m.warehouse_id=e.warehouse_id and m.role='owner' and m.active))
 and (l.manager_id is not null or exists(select 1 from public.memberships m where m.warehouse_id=e.warehouse_id and m.role='owner' and m.active))
 order by e.id limit 500 for update of e skip locked loop
  select * into s from public.case_slas where case_id=c.id for update;
  select m.profile_id into manager from public.memberships m
   where m.warehouse_id=c.warehouse_id and m.role='owner' and m.active
   order by (m.profile_id=c.owner_id) desc,m.profile_id limit 1;
  if manager is distinct from s.manager_id then
   update public.case_slas set manager_id=manager where case_id=c.id;
   update public.sla_escalations set manager_id=manager where case_id=c.id;
   update public.exception_cases set owner_id=case when manager is not null then manager
    when owner_id=s.manager_id then null else owner_id end,version=version+1 where id=c.id;
   insert into public.case_events(case_id,warehouse_id,sme_id,actor_type,type,payload,sme_visible)
   values(c.id,c.warehouse_id,c.sme_id,'system','sla_manager_assigned',
    jsonb_build_object('previous_manager_id',s.manager_id,'manager_id',manager),false);
   perform private.audit(c.warehouse_id,c.sme_id,'sla.manager_assigned',c.id,
    jsonb_build_object('previous_manager_id',s.manager_id,'manager_id',manager));
  end if;
 end loop;
 return total;
end $$;
revoke all on function public.run_sla_escalations() from public,anon,authenticated;
grant execute on function public.run_sla_escalations() to service_role,parcelcare_worker;
commit;
