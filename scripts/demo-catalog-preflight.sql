-- READ ONLY: confirm all five account-to-SME mappings before importing stock.
with expected(name,email,products) as (values
 ('Golden Bloom','goldenbloom@parcelcare.com',30),
 ('Lotus Living','lotusliving@parcelcare.com',15),
 ('Urban Threads','urbanthreads@parcelcare.com',30),
 ('Mandalay Goods','mandalaygoods@parcelcare.com',15),
 ('Shwe Market','shwemarket@parcelcare.com',30)
)
select e.name expected_sme,e.email,e.products planned_products,u.id account_id,
 m.sme_id,s.name current_sme_name,
 case when m.sme_id is null then 'MISSING ACTIVE SME MEMBERSHIP' else 'REVIEW MAPPING' end mapping_status
from expected e left join auth.users u on lower(u.email)=e.email
left join public.memberships m on m.profile_id=u.id
 and m.warehouse_id='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc'::uuid and m.role='sme' and m.active
left join public.smes s on s.id=m.sme_id order by e.name;
