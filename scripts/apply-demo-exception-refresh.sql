-- Reviewed ParcelCare demo refresh: migration + backed-up cleanup + 15 synthetic scenarios.
-- ONE transaction: any failure rolls back all changes. Existing release requests and stock balances are preserved.
begin;

-- SOURCE: supabase/migrations/20261023210000_be2_exception_summary.sql

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


-- SOURCE: scripts/cleanup-reviewed-test-data.sql
-- Reviewed IDs from the user's 2026-10-23 preflight. No broad prefix deletes, TRUNCATE or CASCADE.
-- Private JSON backups include all deleted/renamed rows. Historical audit records stay intact.

lock table public.sme_orders,public.products,public.shipments,public.exception_cases in share row exclusive mode;
create table if not exists private.demo_cleanup_backup(
 batch text not null,table_name text not null,row_hash text not null,row_data jsonb not null,
 saved_at timestamptz not null default now(),primary key(batch,table_name,row_hash));
revoke all on private.demo_cleanup_backup from public,anon,authenticated;
create temporary table cleanup_products on commit drop as
select p.* from public.products p where p.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'
 and p.id in ('7c7c3e4f-b3d0-4643-9be3-f3bf06f762f8','03aa2df0-7c8c-458c-aae5-da69b787007d','35920c7c-cadb-4b47-88f4-8c65abb3c4a9','981b5018-557b-422a-8ce9-cf2bf36077e6','b4ab0de6-09d4-4eb3-ba5b-c907a5180abb','0f4c8687-b0fa-48ff-a063-f7a8118a58fd','718c4f1d-e6ca-41f3-89ee-a2bb6f379366','44dae1d6-3e72-4c9b-8edd-d7f2be6efaa2','1f9cabc1-727f-413b-9882-f6623ce35ca0','5afceeba-2bfc-402a-9965-27f3e44bbd55','292abfd4-1e51-411b-8abd-16756cc09fad','e3d76c69-30cf-44d9-86f6-4096206eec9b','816028e8-0f1c-41fd-ad27-0096b26979fa','d4c876e6-6368-464b-8f49-e908922bff4c','4d0c16cd-5226-4017-9666-4b02caf4e603','00c86f43-cc5b-4b0e-9669-90dfdd315911','9748755b-34ab-4a33-ba7a-c7770f53d58a','3fea000a-06a7-42ef-8bd4-b99da5ab7462','579cd1dc-ad8f-4a44-9d80-cb34adcede65','8016b8fd-4e5b-486e-9988-5792f274d3b4','3a102200-0000-4000-8000-000000000001','3a102200-0000-4000-8000-000000000002','c74e6f5a-e9b4-4cbb-b496-fff6e5cfaf79','cec0df27-f1d1-4a6e-bb0a-a798092a13a1','8eb5c98d-93f1-4dad-ba0c-0fa13ddb6cd3','dd0e8a77-78ba-41f7-9917-a32c17aeaa6a','3715d210-3776-4e83-8018-419f9ac0862b','f8557e43-8e85-4727-9895-d01729d71dd0','7cc2b6c1-540a-4181-90c0-997cc1cfb3d5','85b86d84-0781-4960-bdf7-b728ef2dc163','57330617-aeb3-46e4-83b5-d83bfb7a6a68','758db353-b70b-49ef-97f2-424f6fbb9de9','67001d66-f215-4a30-bc0d-1437545c8a09','d1026d61-1f7b-4de6-adba-5aeed65241af','1cc288a6-3bdd-41ca-892d-dda95205ddc0','4a779655-ae91-418e-8828-cb3de78b98d8','5f8865d0-d203-4fd9-8f5a-fb435496f710','a7fbd9f7-6a76-41a4-ab2c-96851974d8a8','8a06993e-1108-4db1-993a-e3a3be75789d','d98aadc9-63c4-4026-bba5-0ba6484ab473','74319045-bdf0-4451-a39a-f9bf31be3138','a16e5e37-fc7f-45eb-a3d7-134379e72dd2') and (p.sku like 'TEST-%' or p.name ilike 'TEST%');
create temporary table cleanup_shipments on commit drop as
select s.id from public.shipments s where s.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'
 and s.id in ('4a102200-0000-4000-8000-000000000001','4a102200-0000-4000-8000-000000000002','4a102200-0000-4000-8000-000000000003','4a102200-0000-4000-8000-000000000004')
 and s.reference like 'TEST-%' and s.status in ('expected','ready')
 and not exists(select 1 from public.sme_orders o where o.shipment_id=s.id)
 and not exists(select 1 from public.delivery_assignments a where a.shipment_id=s.id)
 and not exists(select 1 from public.receipts r where r.shipment_id=s.id)
 and not exists(select 1 from public.evidence e where e.shipment_id=s.id)
 and not exists(select 1 from public.exception_cases c where c.shipment_id=s.id and c.id not in ('5e102200-0000-4000-8000-000000000901','5e102200-0000-4000-8000-000000000902','5e102200-0000-4000-8000-000000000903'));
create temporary table cleanup_cases on commit drop as select c.id from public.exception_cases c where c.shipment_id in(select id from cleanup_shipments);
create or replace function pg_temp.archive_delete(p_table text,p_where text) returns void language plpgsql as $$
begin
 if to_regclass(p_table) is null then return; end if;
 execute format('with removed as (delete from %s where %s returning *) insert into private.demo_cleanup_backup(batch,table_name,row_hash,row_data) select %L,%L,md5(to_jsonb(r)::text),to_jsonb(r) from removed r on conflict do nothing',p_table,p_where,'legacy-fixtures-20261023',p_table);
end $$;
select pg_temp.archive_delete('public.notification_reads','notification_id in(select id from public.notifications where case_id in(select id from cleanup_cases))');
select pg_temp.archive_delete('public.delivery_capacity','approval_id in(select id from public.approvals where case_id in(select id from cleanup_cases))');
select pg_temp.archive_delete('public.case_verifications','case_id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.action_executions','case_id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.ai_analyses','case_id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.analysis_jobs','case_id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.approvals','case_id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.notifications','case_id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.sla_escalations','case_id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.case_slas','case_id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.case_events','case_id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.outbox_events','entity_id in(select id from cleanup_cases union select id from cleanup_shipments)');
select pg_temp.archive_delete('public.exception_cases','id in(select id from cleanup_cases)');
select pg_temp.archive_delete('public.shipment_arrivals','shipment_id in(select id from cleanup_shipments)');
select pg_temp.archive_delete('public.shipment_route_plans','shipment_id in(select id from cleanup_shipments)');
select pg_temp.archive_delete('private.shipment_return_totals','shipment_id in(select id from cleanup_shipments)');
select pg_temp.archive_delete('public.shipment_events','shipment_id in(select id from cleanup_shipments)');
select pg_temp.archive_delete('public.shipment_items','shipment_id in(select id from cleanup_shipments)');
select pg_temp.archive_delete('public.shipments','id in(select id from cleanup_shipments)');
-- A product used by any release, remaining shipment or stock ledger is retained.
create temporary table deletable_products on commit drop as
select p.id from cleanup_products p where p.reserved_qty=0
 and not exists(select 1 from public.sme_orders o where exists(select 1 from jsonb_array_elements(o.payload->'lines') l where l->>'product_id'=p.id::text))
 and not exists(select 1 from public.shipment_items i where i.product_id=p.id)
 and not exists(select 1 from public.stock_movements m where m.product_id=p.id);
select pg_temp.archive_delete('private.product_category_commands','product_id in(select id from deletable_products)');
select pg_temp.archive_delete('public.product_categorizations','product_id in(select id from deletable_products)');
select pg_temp.archive_delete('public.products','id in(select id from deletable_products)');
insert into private.demo_cleanup_backup(batch,table_name,row_hash,row_data)
select 'legacy-fixtures-20261023','public.products.rename',md5(to_jsonb(p)::text),to_jsonb(p) from public.products p join cleanup_products c on c.id=p.id on conflict do nothing;
update public.products p set sku='LEGACY-'||regexp_replace(p.sku,'^TEST-',''),name=regexp_replace(p.name,'^TEST[[:space:]]*-[[:space:]]*','','i')||' (legacy record)'
where p.id in(select id from cleanup_products);
-- Protected fixtures with new activity are renamed, never removed.
insert into private.demo_cleanup_backup(batch,table_name,row_hash,row_data)
select 'legacy-fixtures-20261023','public.shipments.rename',md5(to_jsonb(s)::text),to_jsonb(s) from public.shipments s where s.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'
 and s.id in ('4a102200-0000-4000-8000-000000000001','4a102200-0000-4000-8000-000000000002','4a102200-0000-4000-8000-000000000003','4a102200-0000-4000-8000-000000000004') and s.reference like 'TEST-%' on conflict do nothing;
update public.shipments s set reference='LEGACY-'||substring(s.reference from 6)
where s.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc' and s.id in ('4a102200-0000-4000-8000-000000000001','4a102200-0000-4000-8000-000000000002','4a102200-0000-4000-8000-000000000003','4a102200-0000-4000-8000-000000000004') and s.reference like 'TEST-%';
insert into private.demo_cleanup_backup(batch,table_name,row_hash,row_data)
select 'legacy-fixtures-20261023','public.exception_cases.rename',md5(to_jsonb(c)::text),to_jsonb(c) from public.exception_cases c
where c.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc' and c.id in ('5e102200-0000-4000-8000-000000000901','5e102200-0000-4000-8000-000000000902','5e102200-0000-4000-8000-000000000903') and c.summary ilike 'TEST%' on conflict do nothing;
update public.exception_cases c set summary=regexp_replace(c.summary,'^TEST[[:space:]]*','Legacy fixture: ','i'),priority_override=true
where c.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc' and c.id in ('5e102200-0000-4000-8000-000000000901','5e102200-0000-4000-8000-000000000902','5e102200-0000-4000-8000-000000000903') and c.summary ilike 'TEST%';
select table_name,count(*) backed_up_rows from private.demo_cleanup_backup where batch='legacy-fixtures-20261023' group by table_name order by table_name;



-- SOURCE: scripts/seed-demo-exceptions.sql
-- Synthetic demonstration scenarios. No stock balances, AI verdicts or uploaded evidence are created.
-- Run after seed-sme-demo-catalog.sql. Repeat runs preserve case progress and original deadlines.

create table if not exists private.demo_exception_scenarios(
 case_id uuid primary key references public.exception_cases(id), dataset text not null, fixture_key integer not null,
 created_at timestamptz not null default now(),unique(dataset,fixture_key));
revoke all on private.demo_exception_scenarios from public,anon,authenticated;
do $seed$
declare w uuid:='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'; r record; tenant uuid; product uuid; maintainer uuid;
 cid uuid; sid uuid; created timestamptz; finished timestamptz; policy jsonb; response_m int; resolution_m int; response timestamptz; v int;
begin
 select m.profile_id into maintainer from public.memberships m where m.warehouse_id=w and m.active and m.role in ('owner','staff') order by (m.role='owner') desc,m.profile_id limit 1;
 if maintainer is null then raise exception 'An active warehouse staff/owner is required for fixture ownership'; end if;
 for r in select * from jsonb_to_recordset($json$[{"n": 1, "email": "goldenbloom@parcelcare.com", "sku": "GB-011", "type": "damaged_goods", "stage": "inbound", "status": "new", "priority": "high", "sla": "breach", "summary": "Six serum bottles leaked inside a supplier carton; separate affected units for inspection."}, {"n": 2, "email": "goldenbloom@parcelcare.com", "sku": "GB-021", "type": "transit_damage", "stage": "outbound", "status": "investigating", "priority": "high", "sla": "breach", "summary": "Sunscreen cartons arrived crushed at the SME shop; confirm affected quantities before proposing a remedy."}, {"n": 3, "email": "goldenbloom@parcelcare.com", "sku": "GB-001", "type": "recipient_unavailable", "stage": "outbound", "status": "awaiting_sme_decision", "priority": "normal", "sla": "on_track", "summary": "The SME shop was closed at the delivery attempt; request a suitable redelivery time."}, {"n": 4, "email": "lotusliving@parcelcare.com", "sku": "LL-006", "type": "quantity_mismatch", "stage": "inbound", "status": "new", "priority": "normal", "sla": "at_risk", "summary": "Supplier paperwork lists 40 towels; receiving count shows 36. Recount the unopened carton."}, {"n": 5, "email": "lotusliving@parcelcare.com", "sku": "LL-011", "type": "missing_stock", "stage": "warehouse", "status": "investigating", "priority": "high", "sla": "on_track", "summary": "Two storage containers could not be located in their assigned bin during a cycle count."}, {"n": 6, "email": "lotusliving@parcelcare.com", "sku": "LL-012", "type": "damaged_goods", "stage": "warehouse", "status": "resolved", "priority": "low", "sla": "on_track", "summary": "A cracked storage-container lid was identified and the affected unit isolated in this illustrative scenario."}, {"n": 7, "email": "urbanthreads@parcelcare.com", "sku": "UT-001", "type": "wrong_pick", "stage": "warehouse", "status": "new", "priority": "high", "sla": "breach", "summary": "The release request needs medium T-shirts, but the picked bundle contains large sizes."}, {"n": 8, "email": "urbanthreads@parcelcare.com", "sku": "UT-011", "type": "short_pick", "stage": "warehouse", "status": "processing", "priority": "normal", "sla": "on_track", "summary": "The hoodie pick is short by three pieces; verify the adjacent rack before dispatch."}, {"n": 9, "email": "urbanthreads@parcelcare.com", "sku": "UT-021", "type": "quantity_mismatch", "stage": "inbound", "status": "resolved", "priority": "low", "sla": "on_track", "summary": "A second count reconciled the trouser carton quantity with the supplier packing list in this scenario."}, {"n": 10, "email": "mandalaygoods@parcelcare.com", "sku": "MG-001", "type": "damaged_goods", "stage": "inbound", "status": "new", "priority": "critical", "sla": "breach", "summary": "Tea-leaf pouches have torn seals and a contamination risk; isolate the affected carton pending assessment."}, {"n": 11, "email": "mandalaygoods@parcelcare.com", "sku": "MG-006", "type": "courier_delay", "stage": "outbound", "status": "investigating", "priority": "high", "sla": "at_risk", "summary": "The fried-bean delivery is delayed by a road closure; obtain a revised arrival estimate."}, {"n": 12, "email": "mandalaygoods@parcelcare.com", "sku": "MG-011", "type": "quantity_mismatch", "stage": "inbound", "status": "awaiting_sme_decision", "priority": "normal", "sla": "on_track", "summary": "The palm-jaggery receipt is short by two packs; ask the SME whether to accept the partial receipt."}, {"n": 13, "email": "shwemarket@parcelcare.com", "sku": "SM-011", "type": "transit_loss", "stage": "outbound", "status": "new", "priority": "critical", "sla": "on_track", "summary": "The charging-cable carton is missing at courier handover; trace the shipment before any replacement proposal."}, {"n": 14, "email": "shwemarket@parcelcare.com", "sku": "SM-021", "type": "delivery_failed", "stage": "outbound", "status": "awaiting_courier_confirmation", "priority": "normal", "sla": "on_track", "summary": "The courier reported a vehicle breakdown while carrying earphones; await a confirmed recovery plan."}, {"n": 15, "email": "shwemarket@parcelcare.com", "sku": "SM-001", "type": "wrong_pick", "stage": "warehouse", "status": "resolved", "priority": "low", "sla": "on_track", "summary": "The incorrect phone-case model was found during packing and corrected in this illustrative scenario."}]$json$::jsonb) as x(n int,email text,sku text,type text,stage text,status text,priority text,sla text,summary text) loop
  cid:=('e8d00000-0000-4000-8000-'||lpad(r.n::text,12,'0'))::uuid;
  sid:=('e8d10000-0000-4000-8000-'||lpad(r.n::text,12,'0'))::uuid;
  if exists(select 1 from private.demo_exception_scenarios where case_id=cid and dataset='parcelcare-exceptions-v1') then continue; end if;
  if exists(select 1 from public.exception_cases where id=cid) or exists(select 1 from public.shipments where id=sid) then raise exception 'Fixture ID collision'; end if;
  if (select count(distinct m.sme_id) from auth.users u join public.memberships m on m.profile_id=u.id where lower(u.email)=r.email and m.warehouse_id=w and m.role='sme' and m.active)<>1 then raise exception 'Missing or ambiguous SME mapping: %',r.email; end if;
  select distinct m.sme_id into tenant from auth.users u join public.memberships m on m.profile_id=u.id where lower(u.email)=r.email and m.warehouse_id=w and m.role='sme' and m.active;
  select p.id into product from public.products p where p.warehouse_id=w and p.sme_id=tenant and p.sku=r.sku;
  if product is null then raise exception 'Missing SME-owned catalogue product: %',r.sku; end if;
  policy:=private.sla_policy(w,r.type,r.priority);response_m:=(policy->>'first_response_minutes')::int;resolution_m:=(policy->>'resolution_minutes')::int;
  created:=now()-make_interval(secs=>case when r.sla='breach' then (resolution_m+60)*60 when r.sla='at_risk' then (case when r.status='new' then response_m else resolution_m end)*60*0.85 when r.status='resolved' then greatest(3,resolution_m/2)*60 else 60 end);
  response:=case when r.status<>'new' then created+interval '30 seconds' end;
  finished:=case when r.status='resolved' then now()-interval '30 seconds' end;
  insert into public.shipments(id,warehouse_id,sme_id,reference,direction,delivery_mode,status,created_at)
   values(sid,w,tenant,'PC-'||split_part(r.sku,'-',1)||'-'||case when r.stage='inbound' then 'IN' else 'OUT' end||'-'||lpad(r.n::text,3,'0'),case when r.stage='inbound' then 'inbound' else 'outbound' end,case when r.stage<>'inbound' then 'in_house' end,case when r.stage='inbound' then 'expected' else 'ready' end,created);
  insert into public.shipment_items(shipment_id,warehouse_id,sme_id,product_id,expected_qty) values(sid,w,tenant,product,10);
  insert into public.exception_cases(id,shipment_id,warehouse_id,sme_id,stage,type,priority,priority_override,status,handling_mode,owner_id,summary,risk_context,created_at,verified_by,verified_at,resolution_note)
   values(cid,sid,w,tenant,r.stage,r.type,r.priority,true,r.status,'human',case when r.status<>'new' then maintainer end,r.summary,
   jsonb_build_object('synthetic_source','parcelcare-exceptions-v1','perishability',case when r.sku like 'MG-%' then 'perishable' else 'non_perishable' end,'order_value_mmk',case when r.priority='critical' then 1200000 else 180000 end,'operational_impact',case when r.priority in ('critical','high') then 'severe' else 'moderate' end),created,
   case when r.status='resolved' then maintainer end,finished,case when r.status='resolved' then 'Synthetic demonstration outcome only. No physical verification was performed; maintainer ID is fixture ownership, not a live verification.' end);
  update public.case_slas set first_response_at=response where case_id=cid;
  insert into private.demo_exception_scenarios(case_id,dataset,fixture_key) values(cid,'parcelcare-exceptions-v1',r.n);
  insert into public.case_events(case_id,warehouse_id,sme_id,actor_type,type,payload,created_at)
   values(cid,w,tenant,'system','demo_scenario',jsonb_build_object('synthetic',true,'dataset','parcelcare-exceptions-v1','note','Illustrative scenario; no AI verdict, uploaded evidence or physical stock movement has been fabricated.'),created);
  if r.status='awaiting_sme_decision' then
   select coalesce(max(version),1) into v from public.resolution_policies where warehouse_id=w and sme_id=tenant;
   insert into public.approvals(case_id,warehouse_id,sme_id,kind,options,policy_version,requested_case_version)
   values(cid,w,tenant,case when r.type='recipient_unavailable' then 'retry_time' else 'partial_receipt' end,
    case when r.type='recipient_unavailable' then '["propose_retry","reject"]'::jsonb else '["accept_partial","await_remainder","reject"]'::jsonb end,v,1);
   insert into public.notifications(case_id,warehouse_id,sme_id,message,dedupe_key) values(cid,w,tenant,'Demo scenario: please review the proposed delivery or receipt decision.','demo-decision');
  end if;
 end loop;
end $seed$;
select c.status,count(*) cases,count(*) filter(where c.status not in ('resolved','closed') and private.case_risk(c,now())->>'sla_risk'='overdue') sla_breaches
from public.exception_cases c join private.demo_exception_scenarios d on d.case_id=c.id where d.dataset='parcelcare-exceptions-v1' group by c.status order by c.status;



select jsonb_build_object('synthetic_cases',count(*),'open_cases',count(*) filter(where c.status not in ('resolved','closed')),
 'sla_breaches',count(*) filter(where c.status not in ('resolved','closed') and private.case_risk(c,now())->>'sla_risk'='overdue'),
 'at_risk',count(*) filter(where c.status not in ('resolved','closed') and private.case_risk(c,now())->>'sla_risk'='at_risk')) demo_refresh_result
from public.exception_cases c join private.demo_exception_scenarios d on d.case_id=c.id where d.dataset='parcelcare-exceptions-v1';
commit;
