-- BE2 owns this optional fictitious fixture. Run after seed.sql and operations.sql.
-- No stock changes, no actual evidence verification, no automatic closure.
begin;
insert into public.exception_cases(id,shipment_id,warehouse_id,sme_id,stage,type,summary,status,version) values
 ('80000000-0000-4000-8000-000000009004','40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','inbound','quantity_mismatch','Fictitious count discrepancy awaiting physical verification','awaiting_sme_decision',2),
 ('80000000-0000-4000-8000-000000009005','40000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005','outbound','recipient_unavailable','Fictitious retry request awaiting capacity confirmation','awaiting_sme_decision',2) on conflict do nothing;
insert into public.case_events(id,case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload) values
 ('b0000000-0000-4000-8000-000000009004','80000000-0000-4000-8000-000000009004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000009001','staff','fixture_request','{"note":"Fictitious partial-receipt request; no physical verification recorded."}'),
 ('b0000000-0000-4000-8000-000000009005','80000000-0000-4000-8000-000000009005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000009001','staff','fixture_request','{"note":"Fictitious preferred retry-time request; capacity is unconfirmed."}') on conflict do nothing;
insert into public.approvals(id,case_id,warehouse_id,sme_id,kind,options,requested_by,policy_version,requested_case_version) values
 ('a0000000-0000-4000-8000-000000009004','80000000-0000-4000-8000-000000009004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','partial_receipt','["accept_partial","await_remainder","reject"]','00000000-0000-4000-8000-000000009001',1,1),
 ('a0000000-0000-4000-8000-000000009005','80000000-0000-4000-8000-000000009005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005','retry_time','["propose_retry","reject"]','00000000-0000-4000-8000-000000009001',1,1) on conflict do nothing;
insert into public.notifications(case_id,warehouse_id,sme_id,message,dedupe_key) values
 ('80000000-0000-4000-8000-000000009004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','Fictitious partial-receipt decision request','fixture-case-9004'),
 ('80000000-0000-4000-8000-000000009005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005','Fictitious preferred retry-time request','fixture-case-9005') on conflict do nothing;
commit;
