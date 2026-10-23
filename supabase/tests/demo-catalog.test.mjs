import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID as id} from 'node:crypto';
const db=new PGlite(),q=(sql,args=[])=>db.query(sql,args);
const w='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc';
try{
 const dataset=JSON.parse(await readFile(new URL('../../data/demo/sme-products.json',import.meta.url),'utf8'));
 assert.equal(dataset.synthetic,true);assert.equal(dataset.products.length,120);assert.equal(new Set(dataset.products.map(p=>p.sku)).size,120);
 const counts={};for(const p of dataset.products){counts[p.sme]=(counts[p.sme]??0)+1;assert(p.quantity>=100&&p.quantity<=500);assert(!p.name.includes('TEST'));}
 assert.deepEqual(counts,{'Golden Bloom':30,'Lotus Living':15,'Urban Threads':30,'Mandalay Goods':15,'Shwe Market':30});
 await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));const dir=new URL('../migrations/',import.meta.url);
 for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 await q("insert into public.warehouses(id,name) values($1,'Synthetic catalog test')",[w]);
 const businesses=[...new Map(dataset.products.map(p=>[p.email,p.sme])).entries()],identities=[];
 for(const [email,name] of businesses){const actor=id(),sme=id();identities.push({actor,sme,email,name});await q('insert into auth.users(id,email) values($1,$2)',[actor,email]);await q("insert into public.profiles(id,display_name) values($1,'Old display')",[actor]);await q("insert into public.smes(id,warehouse_id,name) values($1,$2,'Old name')",[sme,w]);}
 for(const {actor,sme} of identities.slice(0,4))await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,'sme')",[actor,w,sme]);
 const seed=await readFile(new URL('../../scripts/seed-sme-demo-catalog.sql',import.meta.url),'utf8');
 await assert.rejects(()=>db.exec(seed),/Expected five distinct/);await db.exec('rollback');assert.equal((await q('select count(*)::int n from public.products')).rows[0].n,0);
 const last=identities[4];await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,'sme')",[last.actor,w,last.sme]);
 await db.exec(seed);assert.equal((await q('select count(*)::int n from public.products')).rows[0].n,120);
 assert.equal((await q("select count(*)::int n from public.product_categorizations where status='pending' and metadata->>'synthetic_source'='parcelcare-sme-demo-v1'")).rows[0].n,120);
 const product=(await q("select id from public.products where sku='GB-001'")).rows[0].id;await q('update public.products set available_qty=100,reserved_qty=5 where id=$1',[product]);
 await db.exec(seed);assert.deepEqual((await q('select available_qty,reserved_qty from public.products where id=$1',[product])).rows[0],{available_qty:100,reserved_qty:5});
 for(const {actor,sme,name} of identities){assert.equal((await q('select display_name from public.profiles where id=$1',[actor])).rows[0].display_name,name);await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);const page=(await q("select public.sme_stock_catalog($1,$2,'{\"limit\":48}') r",[w,sme])).rows[0].r;assert.equal(page.total,counts[name]);assert(page.items.every(p=>dataset.products.some(d=>d.sme===name&&d.sku===p.sku)));await q('reset role');}
 await db.exec(await readFile(new URL('../../scripts/demo-catalog-preflight.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../scripts/review-old-test-products.sql',import.meta.url),'utf8'));
 console.log('PASS synthetic catalog: 120 SKUs, per-SME counts and isolation, missing mapping rollback, repeat-safe stock, pending category provenance and display names.');
}catch(e){console.error(e);process.exitCode=1}finally{await db.close()}
