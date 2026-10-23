-- Synthetic opening balances for hackathon workflow testing, not real receipts.
-- Target: ParcelCare Warehouse. Existing products and balances are untouched.
-- Safe to rerun: existing TEST-COMMON SKUs are skipped, never replenished.
begin;
do $$begin
 if not exists(select 1 from public.warehouses where id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc') then
  raise exception 'Expected ParcelCare test warehouse not found; check the project.';
 end if;
end $$;

with fixtures as (
 select name, ordinal from unnest(array[
  'Rice 1 kg','Green tea box','Coffee pack','Sugar 1 kg','Cooking oil 1 L',
  'Biscuits box','Instant noodles pack','Bottled water pack','Milk powder tin','Dried fruit pack',
  'Ceramic mug','Glass bottle','Lunch box','Cotton towel','Notebook pack',
  'Ballpoint pen pack','USB cable','LED desk lamp','Hand soap','Shampoo bottle'
 ]) with ordinality as f(name,ordinal)
)
insert into public.products(warehouse_id,sme_id,sku,name,available_qty,quarantined_qty,reserved_qty)
select '68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'::uuid,null,
 'TEST-COMMON-'||lpad(ordinal::text,3,'0'),'TEST - '||name,25,0,0
from fixtures
on conflict(warehouse_id,sku) where sme_id is null do nothing;

select sku,name,available_qty,reserved_qty,available_qty-reserved_qty as orderable_qty
from public.products
where warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'
 and sme_id is null and sku like 'TEST-COMMON-%'
order by sku;
commit;
