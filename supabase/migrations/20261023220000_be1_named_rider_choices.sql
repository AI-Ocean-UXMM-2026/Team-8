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
commit;
