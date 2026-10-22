begin;
-- Urgency, escalation and workflow state are independent dimensions.
alter table public.exception_cases
 add column risk_context jsonb not null default '{}',
 add column priority_classification jsonb not null default '{}',
 add column priority_override boolean not null default false,
 add column escalated boolean not null default false,
 add column escalation_reason text,
 add column escalated_at timestamptz,
 add column escalated_by uuid references public.profiles(id);

create function private.case_risk(c public.exception_cases,p_at timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare category_score integer; description_score integer:=0; perishability_score integer:=0;
 value_score integer:=0; impact_score integer:=0; sla_score integer:=0; score integer;
 sla public.case_slas; flag text:='unknown'; missing jsonb:='[]'; reasons jsonb:='[]';
begin
 category_score:=case c.type when 'transit_loss' then 45 when 'transit_damage' then 40
 when 'damaged_goods' then 40 when 'missing_stock' then 35 when 'delivery_failed' then 30
 when 'wrong_pick' then 25 when 'short_pick' then 25 when 'quantity_mismatch' then 20 else 10 end;
 if c.summary ~* '(unsafe|contaminat|spoiled|injur|temperature|ပျက်စီး|အန္တရာယ်)' then description_score:=30;
 elsif c.summary ~* '(urgent|blocked|delay|အရေးပေါ်|နောက်ကျ)' then description_score:=10; end if;
 if c.risk_context->>'perishability'='perishable' then perishability_score:=25;
 elsif coalesce(c.risk_context->>'perishability','unknown')='unknown' then missing:=missing||'"perishability"'::jsonb; end if;
 if c.risk_context ? 'order_value_mmk' and c.risk_context->'order_value_mmk'<>'null'::jsonb then
  value_score:=case when (c.risk_context->>'order_value_mmk')::numeric>=1000000 then 25
   when (c.risk_context->>'order_value_mmk')::numeric>=200000 then 15
   when (c.risk_context->>'order_value_mmk')::numeric>=50000 then 5 else 0 end;
 else missing:=missing||'"order_value_mmk"'::jsonb; end if;
 impact_score:=case c.risk_context->>'operational_impact' when 'severe' then 30 when 'moderate' then 15 else 0 end;
 if coalesce(c.risk_context->>'operational_impact','unknown')='unknown' then missing:=missing||'"operational_impact"'::jsonb; end if;
 select * into sla from public.case_slas where case_id=c.id;
 if sla.case_id is not null then
  if (sla.first_response_at is null and sla.first_response_due_at<=p_at) or (sla.resolved_at is null and sla.resolution_due_at<=p_at) then flag:='overdue';sla_score:=40;
  elsif (sla.first_response_at is null and p_at>=sla.first_response_due_at-make_interval(mins=>sla.first_response_minutes*(100-sla.at_risk_percent)/100))
   or (sla.resolved_at is null and p_at>=sla.resolution_due_at-make_interval(mins=>sla.resolution_minutes*(100-sla.at_risk_percent)/100)) then flag:='at_risk';sla_score:=25;
  else flag:='on_track'; end if;
 end if;
 score:=category_score+description_score+perishability_score+value_score+impact_score+sla_score;
 reasons:=jsonb_build_object('category',category_score,'description',description_score,'perishability',perishability_score,
  'order_value',value_score,'operational_impact',impact_score,'sla',sla_score);
 return jsonb_build_object('score',score,'priority',case when score>=100 then 'critical' when score>=40 then 'high' when score>=10 then 'normal' else 'low' end,
  'policy_version',1,'reasons',reasons,'missing_attributes',missing,'sla_risk',flag);
end $$;
revoke all on function private.case_risk(public.exception_cases,timestamptz) from public,anon,authenticated;

create function private.classify_live_case() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.priority_classification:=private.case_risk(new,now());
 if tg_op='INSERT' and new.priority<>'normal' then new.priority_override:=true; end if;
 if not new.priority_override and (tg_op='UPDATE' or new.priority='normal') then
  new.priority:=new.priority_classification->>'priority';
 end if;
 return new;
end $$;
revoke all on function private.classify_live_case() from public,anon,authenticated;
create trigger classify_live_case before insert or update of type,summary,risk_context on public.exception_cases
 for each row execute function private.classify_live_case();

-- Historical classifications are recorded without silently rewriting staff priorities.
update public.exception_cases c set priority_classification=private.case_risk(c,now());
update public.exception_cases set priority_override=true where priority is distinct from priority_classification->>'priority';
update public.exception_cases c set escalated=true,escalation_reason='Existing SLA escalation',
 escalated_at=s.escalated_at,version=c.version+1
from (select case_id,min(created_at) escalated_at from public.sla_escalations group by case_id) s
where c.id=s.case_id and c.status not in ('resolved','closed');

create function public.case_risk_command(p_case uuid,p_key uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.exception_cases; old private.workflow_commands; req jsonb; result jsonb; v_kind text:=p_body->>'kind'; ctx jsonb;
begin
 if auth.uid() is null or p_key is null or p_correlation is null then raise exception 'forbidden' using errcode='42501'; end if;
 perform set_config('parcelcare.correlation_id',p_correlation::text,true);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'case_risk'||p_key::text,0));
 select * into c from public.exception_cases where id=p_case for update;
 if c.id is null or not private.is_staff(c.warehouse_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if v_kind in ('priority','escalation') and not exists(select 1 from public.memberships m where m.profile_id=auth.uid() and m.warehouse_id=c.warehouse_id and m.role='owner' and m.active) then raise exception 'forbidden' using errcode='42501'; end if;
 req:=jsonb_build_object('case',p_case,'body',p_body);
 select * into old from private.workflow_commands where actor_id=auth.uid() and key=p_key and kind='case_risk';
 if old.key is not null then
  if old.request<>req then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return old.result;
 end if;
 if p_body->>'expected_version' is null or p_body->>'source_version' is null or c.version<>(p_body->>'expected_version')::int or private.case_source(c) is distinct from p_body->>'source_version' then raise exception 'stale_version' using errcode='40001'; end if;
 if c.status in ('resolved','closed') or coalesce(length(btrim(p_body->>'note')),0) not between 1 and 2000 then raise exception 'invalid_command' using errcode='22023'; end if;
 if v_kind='context' then
  ctx:=p_body->'context';
  if jsonb_typeof(ctx) is distinct from 'object' or coalesce(ctx->>'perishability','') not in ('unknown','perishable','non_perishable')
   or coalesce(ctx->>'operational_impact','') not in ('unknown','minor','moderate','severe')
   or exists(select 1 from jsonb_object_keys(ctx) k where k not in ('perishability','order_value_mmk','operational_impact')) then raise exception 'invalid_context' using errcode='22023'; end if;
  if ctx ? 'order_value_mmk' and ctx->'order_value_mmk'<>'null'::jsonb and (jsonb_typeof(ctx->'order_value_mmk')<>'number' or (ctx->>'order_value_mmk')::numeric not between 0 and 1000000000000 or mod((ctx->>'order_value_mmk')::numeric,1)<>0) then raise exception 'invalid_context' using errcode='22023'; end if;
  update public.exception_cases set risk_context=ctx,version=version+1 where id=c.id;
 elsif v_kind='priority' then
  if coalesce(p_body->>'priority','') not in ('low','normal','high','critical','automatic') then raise exception 'invalid_priority' using errcode='22023'; end if;
  update public.exception_cases set priority_override=p_body->>'priority'<>'automatic',
   priority=case when p_body->>'priority'='automatic' then private.case_risk(c,now())->>'priority' else p_body->>'priority' end,version=version+1 where id=c.id;
 elsif v_kind='escalation' then
  if jsonb_typeof(p_body->'escalated') is distinct from 'boolean' then raise exception 'invalid_escalation' using errcode='22023'; end if;
  update public.exception_cases set escalated=(p_body->>'escalated')::boolean,
   escalation_reason=p_body->>'note',escalated_at=case when (p_body->>'escalated')::boolean then now() else null end,
   escalated_by=auth.uid(),version=version+1 where id=c.id;
 else raise exception 'invalid_command' using errcode='22023'; end if;
 insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload,sme_visible)
 values(c.id,c.warehouse_id,c.sme_id,auth.uid(),'staff','risk_'||v_kind,p_body||jsonb_build_object('previous_priority',c.priority,'previous_escalated',c.escalated),true);
 perform private.audit(c.warehouse_id,c.sme_id,'case.risk_'||v_kind,c.id,p_body);
 select private.case_detail(e) into result from public.exception_cases e where id=c.id;
 insert into private.workflow_commands(actor_id,key,kind,request,result) values(auth.uid(),p_key,'case_risk',req,result);
 return result;
end $$;
revoke all on function public.case_risk_command(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.case_risk_command(uuid,uuid,jsonb,uuid) to authenticated;

create function public.case_queue_read(p_warehouse uuid,p_filters jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; lim integer:=coalesce((p_filters->>'limit')::int,25); sorting text:=coalesce(p_filters->>'sort','risk');
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 if lim not between 1 and 100 or sorting not in ('risk','priority','reference') or coalesce(p_filters->>'sla_risk','all') not in ('all','at_risk','overdue','on_track','unknown') then raise exception 'invalid_filter' using errcode='22023'; end if;
 with filtered as (
  select c.*,private.case_risk(c,now()) risk from public.exception_cases c
  where c.warehouse_id=p_warehouse
  and (coalesce(p_filters->>'status','open')='all' or c.status not in ('closed','resolved'))
  and (p_filters->>'sme_id' is null or c.sme_id=(p_filters->>'sme_id')::uuid)
  and (p_filters->>'issue_type' is null or c.type=p_filters->>'issue_type')
  and (p_filters->>'priority' is null or c.priority=p_filters->>'priority')
  and (p_filters->>'handling_mode' is null or c.handling_mode=p_filters->>'handling_mode')
  and (p_filters->>'state' is null or c.status=p_filters->>'state')
  and (p_filters->>'stage' is null or c.stage=p_filters->>'stage')
  and (p_filters->>'escalated' is null or c.escalated=(p_filters->>'escalated')::boolean)
  and (p_filters->>'owner_id' is null or (p_filters->>'owner_id'='unassigned' and c.owner_id is null) or c.owner_id::text=p_filters->>'owner_id')
 ), ranked as (
  select f.*,row_number() over(order by
   case when sorting='risk' then (risk->>'score')::int end desc,
   case when sorting='priority' then array_position(array['low','normal','high','critical'],priority) end desc,id) n
  from filtered f where coalesce(p_filters->>'sla_risk','all')='all' or risk->>'sla_risk'=p_filters->>'sla_risk'
 ), page as (
  select * from ranked where n>coalesce((select n from ranked where id::text=p_filters->>'cursor'),0) order by n limit lim+1
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'shipment_id',shipment_id,'stage',stage,'type',type,'priority',priority,'status',status,'handling_mode',handling_mode,
  'responsible_party',responsible_party,'owner_id',owner_id,'summary',summary,'evidence_ids','[]'::jsonb,
  'risk_score',(risk->>'score')::int,'sla_risk',risk->>'sla_risk','escalated',escalated,
  'priority_classification',priority_classification,'priority_override',priority_override,
  'risk_context',risk_context,'escalation_reason',escalation_reason,'escalated_at',escalated_at,'escalated_by',escalated_by
  ) order by n) from (select * from page order by n limit lim) x),'[]'::jsonb),
  'next_cursor',case when (select count(*) from page)>lim then (select id::text from page order by n offset lim-1 limit 1) end) into result;
 return result;
end $$;
revoke all on function public.case_queue_read(uuid,jsonb) from public,anon;
grant execute on function public.case_queue_read(uuid,jsonb) to authenticated;

-- SLA scheduling also records the independent flag, without altering urgency.
create function private.flag_sla_escalation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.exception_cases set escalated=true,escalation_reason='SLA '||new.milestone||' overdue',
  escalated_at=now(),escalated_by=null,version=version+1 where id=new.case_id;
 return new;
end $$;
revoke all on function private.flag_sla_escalation() from public,anon,authenticated;
create trigger flag_sla_escalation after insert on public.sla_escalations for each row execute function private.flag_sla_escalation();
commit;
