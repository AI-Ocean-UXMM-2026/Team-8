import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID as id} from 'node:crypto';
const db=new PGlite(),q=(s,p=[])=>db.query(s,p);
const w=id(),foreign=id(),sme=id(),staff=id(),rider=id(),ships=Array.from({length:24},()=>id()).sort();
const page=async(f={},warehouse=w)=>(await q('select public.shipments_queue_read($1,$2::jsonb) r',[warehouse,JSON.stringify(f)])).rows[0].r;
try{
 await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const dir=new URL('../migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 await q("insert into public.warehouses(id,name) values($1,'Test'),($2,'Foreign')",[w,foreign]);await q("insert into public.smes(id,warehouse_id,name) values($1,$2,'SME')",[sme,w]);
 for(const user of [staff,rider]){await q('insert into auth.users(id,email) values($1,$2)',[user,user+'@test.invalid']);await q("insert into public.profiles(id,display_name) values($1,'Test')",[user]);}
 await q("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'staff'),($3,$2,'rider')",[staff,w,rider]);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[staff]);
 for(const ship of ships)await q("insert into public.shipments(id,warehouse_id,sme_id,reference,direction,status,delivery_mode) values($1::uuid,$2,$3,$1::text,'outbound','ready','in_house')",[ship,w,sme]);
 const active=id(),resolved=id();
 await q("insert into public.exception_cases(id,shipment_id,warehouse_id,sme_id,stage,type) values($1,$2,$3,$4,'outbound','transit_damage')",[active,ships[23],w,sme]);
 await q("insert into public.exception_cases(id,shipment_id,warehouse_id,sme_id,stage,type,status,verified_by,verified_at,resolution_note) values($1,$2,$3,$4,'outbound','courier_delay','resolved',$5,now(),'Verified')",[resolved,ships[0],w,sme,staff]);
 await q('set role authenticated');
 const first=await page({limit:20});assert.equal(first.items.length,20);assert(first.next_cursor);assert.equal(first.items[0].open_cases.length,0);
 const next=await page({limit:20,cursor:first.next_cursor});assert.equal(next.items.length,4);assert.equal(next.next_cursor,null);
 const open=await page({exceptions:'open',limit:20});assert.equal(open.items.length,1);assert.equal(open.items[0].id,ships[23]);assert.deepEqual(open.items[0].open_cases,[{id:active,type:'transit_damage'}]);
 assert.equal((await page({exceptions:'none',limit:100})).items.length,23);assert.equal((await page({direction:'inbound'})).items.length,0);
 await assert.rejects(()=>page({},foreign),e=>e.code==='42501');await assert.rejects(()=>page({exceptions:'invalid'}),e=>e.code==='22023');
 await q("select set_config('request.jwt.claim.sub',$1,false)",[rider]);await assert.rejects(()=>page(),e=>e.code==='42501');
 console.log('PASS shipment exceptions: filters before pagination, active vs resolved links, directions, warehouse and rider guards');
}catch(e){console.error(e);process.exitCode=1}finally{await db.close()}
