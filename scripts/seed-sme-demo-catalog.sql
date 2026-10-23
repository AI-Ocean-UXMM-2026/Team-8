-- SYNTHETIC HACKATHON OPENING BALANCES, NOT REAL SUPPLIER RECEIPTS.
-- 120 product SKUs; no external dataset or real operational history.
-- Run preflight first. Safe to rerun: existing stock and reservations are untouched.
begin;
create temporary table demo_catalog(sme text,email text,sku text,name text,category text,quantity integer,unit text) on commit drop;
insert into demo_catalog values
('Golden Bloom','goldenbloom@parcelcare.com','GB-001','Facial Cleanser - Gentle Gel 150ml','beauty_personal_care',120,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-002','Facial Cleanser - Hydrating Foam 150ml','beauty_personal_care',180,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-003','Facial Cleanser - Aloe Vera 120ml','beauty_personal_care',240,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-004','Facial Cleanser - Green Tea 120ml','beauty_personal_care',300,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-005','Facial Cleanser - Rice Water 150ml','beauty_personal_care',360,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-006','Facial Cleanser - Ceramide 150ml','beauty_personal_care',420,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-007','Facial Cleanser - Oil Control 100ml','beauty_personal_care',480,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-008','Facial Cleanser - Cream Wash 120ml','beauty_personal_care',500,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-009','Facial Cleanser - Sensitive Skin 150ml','beauty_personal_care',150,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-010','Facial Cleanser - Micellar Gel 150ml','beauty_personal_care',250,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-011','Serum - Vitamin C 30ml','beauty_personal_care',120,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-012','Serum - Niacinamide 30ml','beauty_personal_care',180,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-013','Serum - Hyaluronic Acid 30ml','beauty_personal_care',240,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-014','Serum - Centella 30ml','beauty_personal_care',300,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-015','Serum - Peptide 30ml','beauty_personal_care',360,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-016','Serum - Ceramide 30ml','beauty_personal_care',420,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-017','Serum - Green Tea 30ml','beauty_personal_care',480,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-018','Serum - Aloe Hydration 30ml','beauty_personal_care',500,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-019','Serum - Brightening Rice 30ml','beauty_personal_care',150,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-020','Serum - Calming Oat 30ml','beauty_personal_care',250,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-021','Sunscreen - Daily SPF30 50ml','beauty_personal_care',120,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-022','Sunscreen - Daily SPF50 50ml','beauty_personal_care',180,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-023','Sunscreen - Matte SPF50 50ml','beauty_personal_care',240,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-024','Sunscreen - Hydrating SPF50 50ml','beauty_personal_care',300,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-025','Sunscreen - Mineral SPF30 50ml','beauty_personal_care',360,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-026','Sunscreen - Mineral SPF50 50ml','beauty_personal_care',420,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-027','Sunscreen - Tinted SPF50 40ml','beauty_personal_care',480,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-028','Sunscreen - Sensitive SPF50 50ml','beauty_personal_care',500,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-029','Sunscreen - Water Resistant SPF50 80ml','beauty_personal_care',150,'piece'),
('Golden Bloom','goldenbloom@parcelcare.com','GB-030','Sunscreen - Sport SPF50 80ml','beauty_personal_care',250,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-001','Bedsheet - Cotton Single White','home_kitchen',120,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-002','Bedsheet - Cotton Double White','home_kitchen',180,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-003','Bedsheet - Cotton Queen Beige','home_kitchen',240,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-004','Bedsheet - Cotton King Grey','home_kitchen',300,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-005','Bedsheet - Linen Queen Natural','home_kitchen',360,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-006','Towel - Cotton Face White','home_kitchen',420,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-007','Towel - Cotton Hand Beige','home_kitchen',480,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-008','Towel - Cotton Bath White','home_kitchen',500,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-009','Towel - Cotton Bath Grey','home_kitchen',150,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-010','Towel - Microfiber Bath Blue','home_kitchen',250,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-011','Storage Container - Airtight 500ml','home_kitchen',120,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-012','Storage Container - Airtight 1L','home_kitchen',180,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-013','Storage Container - Airtight 2L','home_kitchen',240,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-014','Storage Container - Stackable 5L','home_kitchen',300,'piece'),
('Lotus Living','lotusliving@parcelcare.com','LL-015','Storage Container - Stackable 10L','home_kitchen',360,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-001','T-Shirt - Cotton White S','clothing_accessories',120,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-002','T-Shirt - Cotton White M','clothing_accessories',180,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-003','T-Shirt - Cotton White L','clothing_accessories',240,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-004','T-Shirt - Cotton Black S','clothing_accessories',300,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-005','T-Shirt - Cotton Black M','clothing_accessories',360,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-006','T-Shirt - Cotton Black L','clothing_accessories',420,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-007','T-Shirt - Cotton Navy M','clothing_accessories',480,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-008','T-Shirt - Cotton Navy L','clothing_accessories',500,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-009','T-Shirt - Oversized Beige M','clothing_accessories',150,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-010','T-Shirt - Oversized Beige L','clothing_accessories',250,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-011','Hoodie - Pullover Grey S','clothing_accessories',120,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-012','Hoodie - Pullover Grey M','clothing_accessories',180,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-013','Hoodie - Pullover Grey L','clothing_accessories',240,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-014','Hoodie - Pullover Black S','clothing_accessories',300,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-015','Hoodie - Pullover Black M','clothing_accessories',360,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-016','Hoodie - Pullover Black L','clothing_accessories',420,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-017','Hoodie - Zip Navy M','clothing_accessories',480,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-018','Hoodie - Zip Navy L','clothing_accessories',500,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-019','Hoodie - Zip Olive M','clothing_accessories',150,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-020','Hoodie - Zip Olive L','clothing_accessories',250,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-021','Trousers - Chino Beige 28','clothing_accessories',120,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-022','Trousers - Chino Beige 30','clothing_accessories',180,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-023','Trousers - Chino Beige 32','clothing_accessories',240,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-024','Trousers - Chino Navy 30','clothing_accessories',300,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-025','Trousers - Chino Navy 32','clothing_accessories',360,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-026','Trousers - Cargo Olive 30','clothing_accessories',420,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-027','Trousers - Cargo Olive 32','clothing_accessories',480,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-028','Trousers - Jogger Grey M','clothing_accessories',500,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-029','Trousers - Jogger Grey L','clothing_accessories',150,'piece'),
('Urban Threads','urbanthreads@parcelcare.com','UT-030','Trousers - Straight Black 32','clothing_accessories',250,'piece'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-001','Tea Leaves - Pickled Original 200g','food_beverages',120,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-002','Tea Leaves - Pickled Spicy 200g','food_beverages',180,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-003','Tea Leaves - Pickled Mild 200g','food_beverages',240,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-004','Tea Leaves - Green Tea 100g','food_beverages',300,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-005','Tea Leaves - Roasted Tea 100g','food_beverages',360,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-006','Fried Beans - Yellow Peas 200g','food_beverages',420,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-007','Fried Beans - Chickpeas 200g','food_beverages',480,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-008','Fried Beans - Broad Beans 200g','food_beverages',500,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-009','Fried Beans - Mixed Crunch 250g','food_beverages',150,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-010','Fried Beans - Garlic Peas 200g','food_beverages',250,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-011','Palm Jaggery - Original Cubes 250g','food_beverages',120,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-012','Palm Jaggery - Original Cubes 500g','food_beverages',180,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-013','Palm Jaggery - Ginger Bites 250g','food_beverages',240,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-014','Palm Jaggery - Sesame Bites 250g','food_beverages',300,'pack'),
('Mandalay Goods','mandalaygoods@parcelcare.com','MG-015','Palm Jaggery - Peanut Bites 250g','food_beverages',360,'pack'),
('Shwe Market','shwemarket@parcelcare.com','SM-001','Phone Case - iPhone 13 Clear','electronics',120,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-002','Phone Case - iPhone 14 Clear','electronics',180,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-003','Phone Case - iPhone 15 Clear','electronics',240,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-004','Phone Case - iPhone 15 Silicone Black','electronics',300,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-005','Phone Case - iPhone 16 Clear','electronics',360,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-006','Phone Case - Galaxy A15 Clear','electronics',420,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-007','Phone Case - Galaxy A25 Silicone Black','electronics',480,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-008','Phone Case - Galaxy S24 Clear','electronics',500,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-009','Phone Case - Redmi Note 13 Clear','electronics',150,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-010','Phone Case - Redmi Note 14 Silicone Blue','electronics',250,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-011','Charging Cable - USB-A to USB-C 1m','electronics',120,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-012','Charging Cable - USB-A to USB-C 2m','electronics',180,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-013','Charging Cable - USB-C to USB-C 60W 1m','electronics',240,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-014','Charging Cable - USB-C to USB-C 60W 2m','electronics',300,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-015','Charging Cable - USB-C to USB-C 100W 1m','electronics',360,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-016','Charging Cable - USB-C to Lightning 1m','electronics',420,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-017','Charging Cable - USB-A to Lightning 1m','electronics',480,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-018','Charging Cable - Micro USB 1m','electronics',500,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-019','Charging Cable - Braided USB-C 1m','electronics',150,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-020','Charging Cable - Braided USB-C 2m','electronics',250,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-021','Earphones - Wired 3.5mm White','electronics',120,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-022','Earphones - Wired 3.5mm Black','electronics',180,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-023','Earphones - Wired USB-C White','electronics',240,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-024','Earphones - Wired USB-C Black','electronics',300,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-025','Earphones - Wireless In-Ear White','electronics',360,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-026','Earphones - Wireless In-Ear Black','electronics',420,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-027','Earphones - Wireless Sport Blue','electronics',480,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-028','Earphones - Wireless Sport Black','electronics',500,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-029','Earphones - Wired In-Ear with Mic','electronics',150,'piece'),
('Shwe Market','shwemarket@parcelcare.com','SM-030','Earphones - Wireless Neckband Black','electronics',250,'piece');
create temporary table demo_sme_map on commit drop as
select distinct d.sme,d.email,m.sme_id,u.id profile_id
from demo_catalog d join auth.users u on lower(u.email)=d.email
join public.memberships m on m.profile_id=u.id
where m.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'::uuid and m.role='sme' and m.active and m.sme_id is not null;
do $$ begin
 if (select count(*) from demo_sme_map)<>5 or (select count(distinct sme_id) from demo_sme_map)<>5
  or exists(select email from demo_sme_map group by email having count(*)<>1) then
  raise exception 'Expected five distinct SME memberships for the canonical account emails; review preflight. No changes applied.';
 end if;
end $$;
update public.smes s set name=m.sme from demo_sme_map m where s.id=m.sme_id and s.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'::uuid;
update public.profiles p set display_name=m.sme from demo_sme_map m where p.id=m.profile_id;
with inserted as (
 insert into public.products(warehouse_id,sme_id,sku,name,available_qty)
 select '68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'::uuid,m.sme_id,d.sku,d.name,d.quantity
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
where p.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'::uuid group by s.name order by s.name;
commit;
