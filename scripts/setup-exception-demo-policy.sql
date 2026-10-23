-- Operator-only setup for the SME owning the inspected Golden Bloom demo case.
-- Review the target case UUID before running in the intended Supabase project.
-- Existing policies are preserved. No automatic AI actions are enabled.
begin;
do $$
declare target_case uuid := 'e8d00000-0000-4000-8000-000000000001';
 tenant uuid; warehouse uuid;
begin
 select sme_id,warehouse_id into tenant,warehouse from public.exception_cases where id=target_case;
 if tenant is null then raise exception 'Target case not found; review the selected project and case UUID'; end if;
 perform 1 from public.smes where id=tenant and warehouse_id=warehouse for update;
 if exists(select 1 from public.resolution_policies where sme_id=tenant) then
  raise notice 'Existing resolution policy preserved; review its allowed_actions instead';
 else
  insert into public.resolution_policies(warehouse_id,sme_id,version,allowed_actions,rules)
  values(warehouse,tenant,1,
   '["update_workflow","save_summary","notify_sme","request_information","request_sme_decision","escalate"]'::jsonb,
   '{"ai_auto_actions":[]}'::jsonb);
  raise notice 'Manual-review resolution policy created for the target case SME';
 end if;
end $$;
commit;
-- Read back the latest policy for the selected case; a source version ending
-- in :0 on the case screen means no active resolution policy was found.
select p.sme_id,p.warehouse_id,p.version,p.allowed_actions,p.rules
from public.resolution_policies p
join public.exception_cases c on c.sme_id=p.sme_id and c.warehouse_id=p.warehouse_id
where c.id='e8d00000-0000-4000-8000-000000000001'
order by p.version desc limit 1;
