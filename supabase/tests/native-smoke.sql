-- Ephemeral PostgreSQL 17 only, after tests/bootstrap.sql + migrations + seed.
-- No Supabase-managed service is substituted in a real hosted environment.
begin;
do $$
begin
  if (select count(*) from pg_tables where schemaname='public' and rowsecurity) <> 28 then
    raise exception 'Every application table must enable RLS';
  end if;
  if has_table_privilege('anon','public.products','SELECT') or
     has_table_privilege('authenticated','public.products','INSERT') then
    raise exception 'Unexpected anonymous/write privileges';
  end if;
end $$;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000091','ci-sme@example.test');
insert into public.profiles(id,display_name) values ('00000000-0000-4000-8000-000000000091','CI fictitious SME');
insert into public.memberships(profile_id,warehouse_id,sme_id,role) values
('00000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sme');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
do $$
begin
  if (select count(*) from public.shipments) <> 3 then raise exception 'Own SME shipment visibility failed'; end if;
  if exists(select 1 from public.shipments where sme_id <> '20000000-0000-4000-8000-000000000001') then
    raise exception 'Cross SME/warehouse shipment visibility leaked';
  end if;
  if exists(select 1 from public.outbox_events) then raise exception 'Raw outbox data leaked'; end if;
  begin
    perform public.receive_shipment('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000092','[]'::jsonb);
    raise exception 'SME must not post staff receipts';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
