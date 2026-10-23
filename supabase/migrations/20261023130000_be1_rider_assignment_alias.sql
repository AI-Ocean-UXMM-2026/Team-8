begin;
-- The assignment-list query used `s` for both a PL/pgSQL row variable and a
-- shipment table alias. Preserve the existing function, permissions and wrappers;
-- repair either deployment shape (with or without the outbound-returns wrapper).
do $$
declare target regprocedure; definition text;
begin
 foreach target in array array[
  to_regprocedure('public.delivery_read(uuid)'),
  to_regprocedure('public.delivery_read_before_returns(uuid)')
 ] loop
  if target is null then continue; end if;
  definition:=pg_get_functiondef(target);
  if position('join public.shipments s on s.id=a.shipment_id' in definition)>0 then
   definition:=replace(definition,'s.reference,s.status,s.version','assignment_shipment.reference,assignment_shipment.status,assignment_shipment.version');
   definition:=replace(definition,'join public.shipments s on s.id=a.shipment_id','join public.shipments assignment_shipment on assignment_shipment.id=a.shipment_id');
   execute definition;
  end if;
 end loop;
end $$;
commit;
