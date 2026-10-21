-- Optional isolated development/test fixture only, after seed.sql. No passwords,
-- real identities or active GPS. Never run automatically on shared staging.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000009001','fixture-staff@example.test'),
 ('00000000-0000-4000-8000-000000009002','fixture-sme@example.test'),
 ('00000000-0000-4000-8000-000000009003','fixture-rider@example.test') on conflict do nothing;
insert into public.profiles(id,display_name) values
 ('00000000-0000-4000-8000-000000009001','Fictitious warehouse operator'),
 ('00000000-0000-4000-8000-000000009002','Fictitious SME operator'),
 ('00000000-0000-4000-8000-000000009003','Fictitious rider') on conflict do nothing;
insert into public.memberships(profile_id,warehouse_id,sme_id,role) values
 ('00000000-0000-4000-8000-000000009001','10000000-0000-4000-8000-000000000001',null,'staff'),
 ('00000000-0000-4000-8000-000000009002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sme'),
 ('00000000-0000-4000-8000-000000009003','10000000-0000-4000-8000-000000000001',null,'rider') on conflict do nothing;
insert into public.riders(id,warehouse_id,profile_id) values
 ('60000000-0000-4000-8000-000000009003','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000009003') on conflict do nothing;
insert into public.delivery_assignments(id,shipment_id,warehouse_id,sme_id,rider_id) values
 ('70000000-0000-4000-8000-000000009003','40000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000009003') on conflict do nothing;
commit;
