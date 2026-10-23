"""Generate explicitly synthetic SME opening stock. No external dataset is used."""
import csv
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WAREHOUSE = '68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'
BUSINESSES = [
    ('Golden Bloom', 'goldenbloom', 'GB', 'beauty_personal_care', [
        ('Facial Cleanser', ['Gentle Gel 150ml','Hydrating Foam 150ml','Aloe Vera 120ml','Green Tea 120ml','Rice Water 150ml','Ceramide 150ml','Oil Control 100ml','Cream Wash 120ml','Sensitive Skin 150ml','Micellar Gel 150ml']),
        ('Serum', ['Vitamin C 30ml','Niacinamide 30ml','Hyaluronic Acid 30ml','Centella 30ml','Peptide 30ml','Ceramide 30ml','Green Tea 30ml','Aloe Hydration 30ml','Brightening Rice 30ml','Calming Oat 30ml']),
        ('Sunscreen', ['Daily SPF30 50ml','Daily SPF50 50ml','Matte SPF50 50ml','Hydrating SPF50 50ml','Mineral SPF30 50ml','Mineral SPF50 50ml','Tinted SPF50 40ml','Sensitive SPF50 50ml','Water Resistant SPF50 80ml','Sport SPF50 80ml']),
    ]),
    ('Lotus Living', 'lotusliving', 'LL', 'home_kitchen', [
        ('Bedsheet', ['Cotton Single White','Cotton Double White','Cotton Queen Beige','Cotton King Grey','Linen Queen Natural']),
        ('Towel', ['Cotton Face White','Cotton Hand Beige','Cotton Bath White','Cotton Bath Grey','Microfiber Bath Blue']),
        ('Storage Container', ['Airtight 500ml','Airtight 1L','Airtight 2L','Stackable 5L','Stackable 10L']),
    ]),
    ('Urban Threads', 'urbanthreads', 'UT', 'clothing_accessories', [
        ('T-Shirt', ['Cotton White S','Cotton White M','Cotton White L','Cotton Black S','Cotton Black M','Cotton Black L','Cotton Navy M','Cotton Navy L','Oversized Beige M','Oversized Beige L']),
        ('Hoodie', ['Pullover Grey S','Pullover Grey M','Pullover Grey L','Pullover Black S','Pullover Black M','Pullover Black L','Zip Navy M','Zip Navy L','Zip Olive M','Zip Olive L']),
        ('Trousers', ['Chino Beige 28','Chino Beige 30','Chino Beige 32','Chino Navy 30','Chino Navy 32','Cargo Olive 30','Cargo Olive 32','Jogger Grey M','Jogger Grey L','Straight Black 32']),
    ]),
    ('Mandalay Goods', 'mandalaygoods', 'MG', 'food_beverages', [
        ('Tea Leaves', ['Pickled Original 200g','Pickled Spicy 200g','Pickled Mild 200g','Green Tea 100g','Roasted Tea 100g']),
        ('Fried Beans', ['Yellow Peas 200g','Chickpeas 200g','Broad Beans 200g','Mixed Crunch 250g','Garlic Peas 200g']),
        ('Palm Jaggery', ['Original Cubes 250g','Original Cubes 500g','Ginger Bites 250g','Sesame Bites 250g','Peanut Bites 250g']),
    ]),
    ('Shwe Market', 'shwemarket', 'SM', 'electronics', [
        ('Phone Case', ['iPhone 13 Clear','iPhone 14 Clear','iPhone 15 Clear','iPhone 15 Silicone Black','iPhone 16 Clear','Galaxy A15 Clear','Galaxy A25 Silicone Black','Galaxy S24 Clear','Redmi Note 13 Clear','Redmi Note 14 Silicone Blue']),
        ('Charging Cable', ['USB-A to USB-C 1m','USB-A to USB-C 2m','USB-C to USB-C 60W 1m','USB-C to USB-C 60W 2m','USB-C to USB-C 100W 1m','USB-C to Lightning 1m','USB-A to Lightning 1m','Micro USB 1m','Braided USB-C 1m','Braided USB-C 2m']),
        ('Earphones', ['Wired 3.5mm White','Wired 3.5mm Black','Wired USB-C White','Wired USB-C Black','Wireless In-Ear White','Wireless In-Ear Black','Wireless Sport Blue','Wireless Sport Black','Wired In-Ear with Mic','Wireless Neckband Black']),
    ]),
]


def generate():
    rows = []
    quantities = [120, 180, 240, 300, 360, 420, 480, 500, 150, 250]
    for name, email, prefix, category, groups in BUSINESSES:
        index = 0
        for kind, variants in groups:
            for variant in variants:
                index += 1
                rows.append(dict(sme=name, email=email+'@parcelcare.com', sku=f'{prefix}-{index:03}',
                                 name=f'{kind} - {variant}', category=category,
                                 quantity=quantities[(index-1) % len(quantities)], unit='pack' if prefix=='MG' else 'piece'))
    assert len(rows)==120 and len({r['sku'] for r in rows})==120
    target = ROOT/'data/demo'; target.mkdir(parents=True, exist_ok=True)
    (target/'sme-products.json').write_text(json.dumps({'synthetic':True,'version':'parcelcare-sme-demo-v1','products':rows},indent=2)+'\n',encoding='utf-8')
    buf=io.StringIO(); writer=csv.DictWriter(buf,fieldnames=list(rows[0]),lineterminator="\n");writer.writeheader();writer.writerows(rows)
    (target/'sme-products.csv').write_text(buf.getvalue(),encoding='utf-8')
    quote=lambda value:"'"+str(value).replace("'","''")+"'"
    values=',\n'.join('('+','.join([quote(r[k]) for k in ['sme','email','sku','name','category']]+[str(r['quantity']),quote(r['unit'])])+')' for r in rows)
    sql=f'''-- SYNTHETIC HACKATHON OPENING BALANCES, NOT REAL SUPPLIER RECEIPTS.
-- 120 product SKUs; no external dataset or real operational history.
-- Run preflight first. Safe to rerun: existing stock and reservations are untouched.
begin;
create temporary table demo_catalog(sme text,email text,sku text,name text,category text,quantity integer,unit text) on commit drop;
insert into demo_catalog values
{values};
create temporary table demo_sme_map on commit drop as
select distinct d.sme,d.email,m.sme_id,u.id profile_id
from demo_catalog d join auth.users u on lower(u.email)=d.email
join public.memberships m on m.profile_id=u.id
where m.warehouse_id='{WAREHOUSE}'::uuid and m.role='sme' and m.active and m.sme_id is not null;
do $$ begin
 if (select count(*) from demo_sme_map)<>5 or (select count(distinct sme_id) from demo_sme_map)<>5
  or exists(select email from demo_sme_map group by email having count(*)<>1) then
  raise exception 'Expected five distinct SME memberships for the canonical account emails; review preflight. No changes applied.';
 end if;
end $$;
update public.smes s set name=m.sme from demo_sme_map m where s.id=m.sme_id and s.warehouse_id='{WAREHOUSE}'::uuid;
update public.profiles p set display_name=m.sme from demo_sme_map m where p.id=m.profile_id;
with inserted as (
 insert into public.products(warehouse_id,sme_id,sku,name,available_qty)
 select '{WAREHOUSE}'::uuid,m.sme_id,d.sku,d.name,d.quantity
 from demo_catalog d join demo_sme_map m on m.email=d.email
 on conflict(sme_id,sku) do nothing returning *
)
insert into public.product_categorizations(product_id,metadata,status)
select p.id,jsonb_build_object('description',d.name||'. Owned by '||d.sme||'; stored for release to the SME location.',
 'unit',d.unit,'category_hint',d.category,'synthetic_source','parcelcare-sme-demo-v1','opening_quantity',d.quantity),'pending'
from inserted p join demo_catalog d on d.sku=p.sku;
-- Category hints are not fabricated AI/checker verdicts or human verification.
select s.name,count(*) products,sum(p.available_qty) opening_units
from public.products p join public.smes s on s.id=p.sme_id
join demo_sme_map m on m.sme_id=s.id join demo_catalog d on d.sku=p.sku and d.email=m.email
where p.warehouse_id='{WAREHOUSE}'::uuid group by s.name order by s.name;
commit;
'''
    (ROOT/'scripts/seed-sme-demo-catalog.sql').write_text(sql,encoding='utf-8')
    print('Generated 120 synthetic products (30/15/30/15/30), CSV, JSON and idempotent SQL.')


if __name__=='__main__':
    generate()
