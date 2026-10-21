-- Local/development only, run with psql after Auth users exist:
-- psql "$DATABASE_URL" -v staff_id=<uuid> -v sme_a_id=<uuid> -v sme_b_id=<uuid> -v rider_id=<uuid> -v other_staff_id=<uuid> -v inactive_rider_id=<uuid> -f supabase/fixtures/development-identities.sql
-- UUIDs are existing Auth users, not credentials. No auth.users inserts/passwords.
\set ON_ERROR_STOP on
begin;
insert into public.profiles(id,display_name) values
  (:'staff_id','Fictitious warehouse staff'),(:'sme_a_id','Fictitious SME A'),
  (:'sme_b_id','Fictitious SME B'),(:'rider_id','Fictitious rider'),
  (:'other_staff_id','Fictitious isolation staff'),(:'inactive_rider_id','Fictitious inactive rider') on conflict do nothing;
insert into public.memberships(profile_id,warehouse_id,sme_id,role) values
  (:'staff_id','10000000-0000-4000-8000-000000000001',null,'staff'),
  (:'sme_a_id','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sme'),
  (:'sme_b_id','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','sme'),
  (:'rider_id','10000000-0000-4000-8000-000000000001',null,'rider') on conflict do nothing;
insert into public.memberships(profile_id,warehouse_id,role,active) values
  (:'other_staff_id','10000000-0000-4000-8000-000000000002','staff',true),
  (:'inactive_rider_id','10000000-0000-4000-8000-000000000001','rider',false) on conflict do nothing;
insert into public.riders(id,warehouse_id,profile_id) values
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',:'rider_id') on conflict do nothing;
insert into public.delivery_assignments(id,shipment_id,warehouse_id,sme_id,rider_id) values
  ('70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000006',
   '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   '60000000-0000-4000-8000-000000000001') on conflict do nothing;
-- Assigned only: no fabricated acceptance, pickup, consent, POD or coordinates.
commit;
