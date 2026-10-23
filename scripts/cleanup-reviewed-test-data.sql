-- Reviewed IDs from the user's 2026-10-23 preflight. No broad prefix deletes, TRUNCATE or CASCADE.
-- Private JSON backups include all deleted/renamed rows. Historical audit records stay intact.
begin;
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
commit;
