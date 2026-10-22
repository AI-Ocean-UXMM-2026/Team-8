begin;
create table public.sla_policies(
 warehouse_id uuid not null references public.warehouses(id),
 case_type text not null check(case_type in ('quantity_mismatch','damaged_goods','missing_stock','wrong_pick','short_pick','courier_delay','delivery_failed','recipient_unavailable','transit_damage','transit_loss')),
 priority text not null check(priority in ('low','normal','high','critical')),
 first_response_minutes integer not null check(first_response_minutes between 1 and 43200),
 resolution_minutes integer not null check(resolution_minutes between first_response_minutes and 43200),
 at_risk_percent integer not null default 80 check(at_risk_percent between 50 and 99),
 revision integer not null default 1, updated_by uuid references public.profiles(id),updated_at timestamptz not null default now(),
 primary key(warehouse_id,case_type,priority));
create table public.case_slas(
 case_id uuid primary key references public.exception_cases(id),warehouse_id uuid not null references public.warehouses(id),
 case_type text not null,priority text not null,policy_revision integer not null,
 first_response_minutes integer not null,resolution_minutes integer not null,at_risk_percent integer not null,
 started_at timestamptz not null,first_response_due_at timestamptz not null,resolution_due_at timestamptz not null,
 first_response_at timestamptz,resolved_at timestamptz,response_escalated_at timestamptz,resolution_escalated_at timestamptz,
 manager_id uuid references public.profiles(id));
create index sla_response_due_idx on public.case_slas(first_response_due_at) where first_response_at is null and resolved_at is null;
create index sla_resolution_due_idx on public.case_slas(resolution_due_at) where resolved_at is null;
create table public.sla_escalations(
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.exception_cases(id),
 warehouse_id uuid not null references public.warehouses(id),milestone text not null check(milestone in ('first_response','resolution')),
 manager_id uuid references public.profiles(id),created_at timestamptz not null default now(),unique(case_id,milestone));
create table private.sla_commands(warehouse_id uuid not null,actor_id uuid not null,key uuid not null,
 request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(warehouse_id,actor_id,key));
create table private.sla_scheduler(singleton boolean primary key default true check(singleton),last_run timestamptz);
revoke all on private.sla_commands,private.sla_scheduler from public,anon,authenticated;
alter table public.sla_policies enable row level security;
alter table public.case_slas enable row level security;
alter table public.sla_escalations enable row level security;
revoke all on public.sla_policies,public.case_slas,public.sla_escalations from anon,authenticated;
grant select on public.sla_policies,public.case_slas,public.sla_escalations to authenticated;
create policy sla_policy_read on public.sla_policies for select to authenticated using(private.is_staff(warehouse_id));
create policy sla_case_read on public.case_slas for select to authenticated using(private.is_staff(warehouse_id));
create policy sla_escalation_read on public.sla_escalations for select to authenticated using(private.is_staff(warehouse_id));

create function private.sla_policy(p_warehouse uuid,p_type text,p_priority text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('case_type',p_type,'priority',p_priority,
 'first_response_minutes',coalesce(p.first_response_minutes,case p_priority when 'critical' then 15 when 'high' then 30 when 'normal' then 120 else 240 end),
 'resolution_minutes',coalesce(p.resolution_minutes,case p_priority when 'critical' then 240 when 'high' then 480 when 'normal' then 1440 else 2880 end),
 'at_risk_percent',coalesce(p.at_risk_percent,80),'revision',coalesce(p.revision,0))
 from (select 1) seed left join public.sla_policies p on p.warehouse_id=p_warehouse and p.case_type=p_type and p.priority=p_priority;
$$;
create function private.sla_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare policy jsonb; finished timestamptz;
begin
 if tg_op='UPDATE' and new.type=old.type and new.priority=old.priority then
  if new.status in ('resolved','closed') then
   update public.case_slas set resolved_at=coalesce(resolved_at,new.verified_at,new.closed_at,now()) where case_id=new.id;
  elsif old.status in ('resolved','closed') then update public.case_slas set resolved_at=null where case_id=new.id;
  end if;
  return new;
 end if;
 policy=private.sla_policy(new.warehouse_id,new.type,new.priority);
 if new.status in ('resolved','closed') then finished=coalesce(new.verified_at,new.closed_at,now()); end if;
 insert into public.case_slas(case_id,warehouse_id,case_type,priority,policy_revision,first_response_minutes,resolution_minutes,at_risk_percent,
 started_at,first_response_due_at,resolution_due_at,resolved_at)
 values(new.id,new.warehouse_id,new.type,new.priority,(policy->>'revision')::integer,(policy->>'first_response_minutes')::integer,
 (policy->>'resolution_minutes')::integer,(policy->>'at_risk_percent')::integer,new.created_at,
 new.created_at+make_interval(mins=>(policy->>'first_response_minutes')::integer),
 new.created_at+make_interval(mins=>(policy->>'resolution_minutes')::integer),finished)
 on conflict(case_id) do update set case_type=excluded.case_type,priority=excluded.priority,policy_revision=excluded.policy_revision,
 first_response_minutes=excluded.first_response_minutes,resolution_minutes=excluded.resolution_minutes,at_risk_percent=excluded.at_risk_percent,
 first_response_due_at=excluded.first_response_due_at,resolution_due_at=excluded.resolution_due_at,resolved_at=excluded.resolved_at;
 return new;
end $$;
create trigger sla_case_sync after insert or update on public.exception_cases for each row execute function private.sla_sync();
-- Existing cases get deadlines measured from their original creation, not deployment.
insert into public.case_slas(case_id,warehouse_id,case_type,priority,policy_revision,first_response_minutes,resolution_minutes,at_risk_percent,
 started_at,first_response_due_at,resolution_due_at,first_response_at,resolved_at)
select c.id,c.warehouse_id,c.type,c.priority,(p->>'revision')::integer,(p->>'first_response_minutes')::integer,(p->>'resolution_minutes')::integer,
 (p->>'at_risk_percent')::integer,c.created_at,c.created_at+make_interval(mins=>(p->>'first_response_minutes')::integer),
 c.created_at+make_interval(mins=>(p->>'resolution_minutes')::integer),
 (select min(e.created_at) from public.case_events e where e.case_id=c.id and e.actor_type='staff' and e.type in ('action','verify','review','close','sla_first_response')),
 case when c.status in ('resolved','closed') then coalesce(c.verified_at,c.closed_at,now()) end
from public.exception_cases c cross join lateral private.sla_policy(c.warehouse_id,c.type,c.priority) p;

create function private.sla_response_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.actor_type='staff' and new.type in ('action','verify','review','close','sla_first_response') then
  update public.case_slas set first_response_at=case when first_response_at is null then new.created_at else least(first_response_at,new.created_at) end
  where case_id=new.case_id;
 end if; return new;
end $$;
create trigger sla_first_response after insert on public.case_events for each row execute function private.sla_response_event();

create function private.sla_flag(p_start timestamptz,p_due timestamptz,p_done timestamptz,p_percent integer) returns text
language sql stable set search_path='' as $$
 select case when p_done is not null then case when p_done<=p_due then 'met' else 'breached' end
 when now()>=p_due then 'overdue' when now()>=p_start+(p_due-p_start)*p_percent/100.0 then 'at_risk' else 'on_track' end;
$$;
create function private.sla_case(p_case uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(s)-'case_type'||jsonb_build_object('type',s.case_type,'summary',c.summary,'case_status',c.status,
 'first_response_flag',case when s.resolved_at is not null and s.first_response_at is null then 'not_required' else private.sla_flag(s.started_at,s.first_response_due_at,s.first_response_at,s.at_risk_percent) end,
 'resolution_flag',private.sla_flag(s.started_at,s.resolution_due_at,s.resolved_at,s.at_risk_percent),'server_now',now())
 from public.case_slas s join public.exception_cases c on c.id=s.case_id where s.case_id=p_case;
$$;
create function public.sla_policies_read(p_warehouse uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('policies',(select jsonb_agg(private.sla_policy(p_warehouse,t,p))
 from unnest(array['quantity_mismatch','damaged_goods','missing_stock','wrong_pick','short_pick','courier_delay','delivery_failed','recipient_unavailable','transit_damage','transit_loss']) t
 cross join unnest(array['low','normal','high','critical']) p),
 'can_edit',exists(select 1 from public.memberships where profile_id=auth.uid() and warehouse_id=p_warehouse and role='owner' and active),
 'manager_count',(select count(*) from public.memberships where warehouse_id=p_warehouse and role='owner' and active),
 'scheduler_last_run',(select last_run from private.sla_scheduler where singleton),'server_now',now());
end $$;
create function public.sla_policy_write(p_warehouse uuid,p_type text,p_priority text,p_key uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old private.sla_commands; req jsonb; result jsonb; rev integer;
begin
 if not exists(select 1 from public.memberships where profile_id=auth.uid() and warehouse_id=p_warehouse and role='owner' and active)
 then raise exception 'forbidden' using errcode='42501'; end if;
 if p_key is null then raise exception 'invalid_key' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('sla-key:'||p_warehouse::text||auth.uid()::text||p_key::text,0));
 perform pg_advisory_xact_lock(hashtextextended('sla-policy:'||p_warehouse::text||':'||p_type||':'||p_priority,0));
 req=jsonb_build_object('kind','policy','type',p_type,'priority',p_priority,'body',p_body);
 select * into old from private.sla_commands where warehouse_id=p_warehouse and actor_id=auth.uid() and key=p_key;
 if old.key is not null then
  if old.request<>req then raise exception 'idempotency_conflict' using errcode='22023'; end if;return old.result;
 end if;
 rev=(private.sla_policy(p_warehouse,p_type,p_priority)->>'revision')::integer;
 if (p_body->>'expected_revision') is null or (p_body->>'expected_revision')::integer<>rev then raise exception 'stale_version' using errcode='40001'; end if;
 insert into public.sla_policies(warehouse_id,case_type,priority,first_response_minutes,resolution_minutes,at_risk_percent,revision,updated_by)
 values(p_warehouse,p_type,p_priority,(p_body->>'first_response_minutes')::integer,(p_body->>'resolution_minutes')::integer,(p_body->>'at_risk_percent')::integer,rev+1,auth.uid())
 on conflict(warehouse_id,case_type,priority) do update set first_response_minutes=excluded.first_response_minutes,
 resolution_minutes=excluded.resolution_minutes,at_risk_percent=excluded.at_risk_percent,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 result=private.sla_policy(p_warehouse,p_type,p_priority);
 perform private.audit(p_warehouse,null,'sla.policy_updated',p_warehouse,req||jsonb_build_object('revision',rev+1));
 insert into private.sla_commands values(p_warehouse,auth.uid(),p_key,req,result,now());return result;
end $$;
create function public.sla_cases_read(p_warehouse uuid,p_case uuid default null,p_cursor uuid default null,p_limit integer default 25,p_flag text default 'all',p_include_closed boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_limit not between 1 and 100 or p_flag not in ('all','at_risk','overdue','escalated') then raise exception 'invalid_filter' using errcode='22023'; end if;
 select coalesce(jsonb_agg(item order by id),'[]') into rows from (
 select s.case_id id,private.sla_case(s.case_id) item from public.case_slas s where s.warehouse_id=p_warehouse
 and (p_case is null or s.case_id=p_case) and (p_cursor is null or s.case_id>p_cursor) and (p_include_closed or s.resolved_at is null)
 and (p_flag='all' or (p_flag='escalated' and (s.response_escalated_at is not null or s.resolution_escalated_at is not null))
 or (p_flag in ('at_risk','overdue') and ((s.resolved_at is null and private.sla_flag(s.started_at,s.first_response_due_at,s.first_response_at,s.at_risk_percent)=p_flag)
 or private.sla_flag(s.started_at,s.resolution_due_at,s.resolved_at,s.at_risk_percent)=p_flag)))
 order by s.case_id limit p_limit+1) page;
 return jsonb_build_object('items',case when jsonb_array_length(rows)>p_limit then rows-p_limit else rows end,
 'next_cursor',case when jsonb_array_length(rows)>p_limit then rows->(p_limit-1)->>'case_id' else null end,'server_now',now());
end $$;
create function public.sla_response(p_warehouse uuid,p_case uuid,p_key uuid,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.exception_cases; old private.sla_commands; req jsonb; result jsonb;
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_key is null or coalesce(length(btrim(p_note)),0) not between 5 and 1000 then raise exception 'invalid_note' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('sla-key:'||p_warehouse::text||auth.uid()::text||p_key::text,0));
 select * into c from public.exception_cases where id=p_case and warehouse_id=p_warehouse for update;
 if c.id is null then raise exception 'forbidden' using errcode='42501'; end if;
 req=jsonb_build_object('kind','response','case_id',p_case,'note',btrim(p_note));
 select * into old from private.sla_commands where warehouse_id=p_warehouse and actor_id=auth.uid() and key=p_key;
 if old.key is not null then
  if old.request<>req then raise exception 'idempotency_conflict' using errcode='22023'; end if;return old.result;
 end if;
 if c.status in ('resolved','closed') then raise exception 'invalid_transition' using errcode='22023'; end if;
 if not exists(select 1 from public.case_slas where case_id=p_case and first_response_at is not null) then
 insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload,sme_visible)
 values(c.id,c.warehouse_id,c.sme_id,auth.uid(),'staff','sla_first_response',jsonb_build_object('note',btrim(p_note)),true);
 end if;
 result=private.sla_case(p_case);
 insert into private.sla_commands values(p_warehouse,auth.uid(),p_key,req,result,now());return result;
end $$;

create function public.run_sla_escalations() returns integer language plpgsql security definer set search_path='' as $$
declare c public.exception_cases; s public.case_slas; manager uuid; milestone text; inserted integer; total integer=0;
begin
 for c in select e.* from public.exception_cases e join public.case_slas l on l.case_id=e.id
 where e.status not in ('resolved','closed') and l.resolved_at is null and
 ((l.first_response_at is null and l.response_escalated_at is null and l.first_response_due_at<=now())
 or (l.resolution_escalated_at is null and l.resolution_due_at<=now())) order by e.id limit 500 for update of e skip locked loop
 select * into s from public.case_slas where case_id=c.id for update;
 select profile_id into manager from public.memberships where warehouse_id=c.warehouse_id and role='owner' and active order by profile_id limit 1;
 foreach milestone in array array['first_response','resolution'] loop
  if (milestone='first_response' and s.first_response_at is null and s.response_escalated_at is null and s.first_response_due_at<=now())
   or (milestone='resolution' and s.resolution_escalated_at is null and s.resolution_due_at<=now()) then
   insert into public.sla_escalations(case_id,warehouse_id,milestone,manager_id) values(c.id,c.warehouse_id,milestone,manager) on conflict do nothing;
   get diagnostics inserted=row_count;
   if inserted>0 then
    update public.case_slas set manager_id=manager,response_escalated_at=case when milestone='first_response' then now() else response_escalated_at end,
    resolution_escalated_at=case when milestone='resolution' then now() else resolution_escalated_at end where case_id=c.id;
    update public.exception_cases set owner_id=coalesce(manager,owner_id),handling_mode='human',version=version+1 where id=c.id;
    insert into public.case_events(case_id,warehouse_id,sme_id,actor_type,type,payload,sme_visible)
    values(c.id,c.warehouse_id,c.sme_id,'system','sla_escalated',jsonb_build_object('milestone',milestone,'manager_id',manager,'previous_owner_id',c.owner_id),false);
    perform private.audit(c.warehouse_id,c.sme_id,'sla.escalated',c.id,jsonb_build_object('milestone',milestone,'manager_id',manager));
    total=total+1;
   end if;
  end if;
 end loop;
 end loop;
 insert into private.sla_scheduler(singleton,last_run) values(true,now()) on conflict(singleton) do update set last_run=excluded.last_run;
 return total;
end $$;
revoke all on function private.sla_policy(uuid,text,text),private.sla_sync(),private.sla_response_event(),private.sla_flag(timestamptz,timestamptz,timestamptz,integer),private.sla_case(uuid) from public,anon,authenticated;
revoke all on function public.sla_policies_read(uuid),public.sla_policy_write(uuid,text,text,uuid,jsonb),public.sla_cases_read(uuid,uuid,uuid,integer,text,boolean),public.sla_response(uuid,uuid,uuid,text),public.run_sla_escalations() from public,anon,authenticated;
grant execute on function public.sla_policies_read(uuid),public.sla_policy_write(uuid,text,text,uuid,jsonb),public.sla_cases_read(uuid,uuid,uuid,integer,text,boolean),public.sla_response(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.run_sla_escalations() to service_role,parcelcare_worker;
-- When Cron is already enabled, install the durable scheduler automatically.
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  execute $cron$select cron.schedule('parcelcare-sla-escalations','* * * * *','select public.run_sla_escalations();')$cron$;
 end if;
end $$;
commit;
