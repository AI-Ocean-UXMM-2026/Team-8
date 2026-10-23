begin;
-- Only the existing staff-scoped rider selector is enriched. Rider/SME responses remain empty.
do $$
declare target regprocedure; definition text;
begin
 foreach target in array array[to_regprocedure('public.delivery_read(uuid)'),to_regprocedure('public.delivery_read_before_returns(uuid)')] loop
  if target is null then continue; end if;
  definition:=pg_get_functiondef(target);
  if position('select jsonb_agg(to_jsonb(r)) from public.riders r where r.warehouse_id=s.warehouse_id and r.active' in definition)>0 then
   definition:=replace(definition,'select jsonb_agg(to_jsonb(r)) from public.riders r where r.warehouse_id=s.warehouse_id and r.active',
    'select jsonb_agg(to_jsonb(r)||jsonb_build_object(''display_name'',p.display_name,''email'',u.email) order by p.display_name,r.id) from public.riders r join public.profiles p on p.id=r.profile_id join auth.users u on u.id=r.profile_id where r.warehouse_id=s.warehouse_id and r.active and exists(select 1 from public.memberships m where m.profile_id=r.profile_id and m.warehouse_id=r.warehouse_id and m.role=''rider'' and m.active)');
   execute definition;
  end if;
 end loop;
end $$;

-- Repair a missing rider registration only for the existing, active courier membership.
-- No user/password creation, activation of disabled riders, or shipment assignment.
do $$
declare actor uuid; w uuid:='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc';
begin
 select u.id into actor from auth.users u where lower(u.email)='courier123@parcelcare.com';
 if actor is null or not exists(select 1 from public.memberships m where m.profile_id=actor and m.warehouse_id=w and m.role='rider' and m.active) then
  raise exception 'courier123 needs an existing active rider membership in this warehouse';
 end if;
 insert into public.riders(warehouse_id,profile_id) values(w,actor) on conflict(warehouse_id,profile_id) do nothing;
end $$;
select u.email,p.display_name,r.id rider_id,r.active,
 (select count(*) from public.delivery_assignments a join public.shipments s on s.id=a.shipment_id where a.rider_id=r.id and a.cancelled_at is null and a.completed_at is null and s.status not in ('delivered','cancelled')) active_assignments
from auth.users u join public.profiles p on p.id=u.id join public.riders r on r.profile_id=u.id
where lower(u.email)='courier123@parcelcare.com' and r.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc';
commit;
