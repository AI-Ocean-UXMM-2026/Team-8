import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID as id} from 'node:crypto';
const db=new PGlite(),q=(s,p=[])=>db.query(s,p),one=async(s,p=[])=>(await q(s,p)).rows[0];
const w=id(),other=id(),sme=id(),otherSme=id(),actor=id(),rider=id(),staff=id(),products=[];
async function as(user,fn){await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return await fn()}finally{await q('reset role')}}
const page=async(f={},warehouse=w)=>(await one('select public.sme_stock_catalog($1,$2,$3::jsonb) r',[warehouse,sme,JSON.stringify(f)])).r;
try{
 await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));const dir=new URL('../migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 await q("insert into public.warehouses(id,name) values($1,'Checkout test'),($2,'Foreign')",[w,other]);await q("insert into public.smes(id,warehouse_id,name) values($1,$2,'Test SME')",[sme,w]);await q("insert into public.smes(id,warehouse_id,name) values($1,$2,'Other SME')",[otherSme,w]);
 for(const user of [actor,rider,staff]){await q('insert into auth.users(id,email) values($1,$2)',[user,user+'@test.invalid']);await q("insert into public.profiles(id,display_name) values($1,'Test')",[user]);}
 await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,'sme'),($4,$2,null,'rider'),($5,$2,null,'staff')",[actor,w,sme,rider,staff]);
 for(let n=0;n<25;n++){const p=id();products.push(p);await q('insert into public.products(id,warehouse_id,sme_id,sku,name,available_qty,reserved_qty) values($1,$2,$6,$3,$4,25,$5)',[p,w,'CAT-'+n,'Product '+String(n).padStart(2,'0'),n===0?25:0,sme]);if(n>=20)await q("insert into public.product_categorizations(product_id,category,status,reviewed_by,reviewed_at,review_note) values($1,'electronics','verified',$2,now(),'Verified test category')",[p,staff]);}
 const legacy=id();await q("insert into public.products(id,warehouse_id,sme_id,sku,name,available_qty) values($1,$2,$3,'LEGACY','Private SME stock',10)",[legacy,w,otherSme]);
 await as(rider,()=>assert.rejects(()=>page(),e=>e.code==='42501'));await as(actor,()=>assert.rejects(()=>page({},other),e=>e.code==='42501'));
 await as(actor,async()=>{
  const first=await page({limit:12});assert.equal(first.total,24);assert.equal(first.items.length,12);assert(first.next_cursor);assert(!first.items.some(p=>p.id===products[0]));assert(!first.items.some(p=>p.id===legacy));assert.deepEqual(first.categories,['electronics','uncategorized']);
  const second=await page({limit:12,cursor:first.next_cursor,selected_ids:[first.items[0].id,products[0]]});assert.equal(second.items.length,12);assert.equal(second.next_cursor,null);assert(!second.items.some(p=>first.items.some(x=>x.id===p.id)));assert.equal(second.selected_items.length,2);assert.equal(second.selected_items.find(p=>p.id===products[0]).available_qty,0);
  const filtered=await page({category:'electronics',search:'Product 2',selected_ids:[products[1]]});assert.equal(filtered.total,5);assert.equal(filtered.items.length,5);assert.equal(filtered.selected_items[0].id,products[1]);assert.equal((await page({search:'CAT-24'})).items[0].id,products[24]);
  assert.equal((await page({in_stock_only:false})).total,25);assert.equal((await page({category:'uncategorized'})).total,19);
  await assert.rejects(()=>page({limit:12,cursor:first.next_cursor,category:'electronics'}),e=>e.code==='22023');await assert.rejects(()=>page({limit:49}),e=>e.code==='22023');await assert.rejects(()=>page({selected_ids:Array(101).fill(products[1])}),e=>e.code==='22023');
  const selected=await page({selected_ids:[products[2],legacy]});assert.equal(selected.selected_items.length,1);assert.equal(selected.selected_items[0].id,products[2]);
 });
 await q('update public.products set reserved_qty=25 where id=$1',[products[1]]);await as(actor,async()=>assert.equal((await page({selected_ids:[products[1]]})).selected_items[0].available_qty,0));
 console.log('PASS catalogue: server search/category/stock before paging, 25 products, no duplicates, preserved basket availability, unknown categories and tenant/rider guards.');
}catch(e){console.error(e);process.exitCode=1}finally{await db.close()}
