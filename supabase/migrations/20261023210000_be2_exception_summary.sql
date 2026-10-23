begin;
create or replace function public.case_queue_read(p_warehouse uuid,p_filters jsonb) returns jsonb
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
  'summary',(select jsonb_build_object('matching',count(*),'high_critical',count(*) filter(where priority in ('high','critical')),'awaiting_sme',count(*) filter(where status='awaiting_sme_decision'),'sla_breaches',count(*) filter(where status not in ('resolved','closed') and risk->>'sla_risk'='overdue')) from ranked),
  'next_cursor',case when (select count(*) from page)>lim then (select id::text from page order by n offset lim-1 limit 1) end) into result;
 -- Old deployed APIs use a strict response DTO without summary.
 return case when p_filters->>'include_summary'='true' then result else result-'summary' end;
end $$;
commit;
