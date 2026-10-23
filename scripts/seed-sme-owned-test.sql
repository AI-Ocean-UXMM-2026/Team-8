-- OPTIONAL HACKATHON TEST DATA ONLY. Run manually after the ownership migration.
-- Creates 10 new test products per SME in the named test warehouse.
-- Does not transfer shared products, modify existing quantities, or alter requests.
begin;
insert into public.products(warehouse_id,sme_id,sku,name,available_qty)
select s.warehouse_id,s.id,'TEST-OWN-'||lpad(n::text,3,'0'),
 'TEST - SME-owned product '||n,25
from public.smes s cross join generate_series(1,10) n
where s.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'::uuid
 and s.name in ('Golden Bloom','Lotus Living')
on conflict(sme_id,sku) do nothing;
select s.name,p.sku,p.available_qty,p.reserved_qty
from public.products p join public.smes s on s.id=p.sme_id
where p.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'::uuid
 and p.sku like 'TEST-OWN-%' order by s.name,p.sku;
commit;
