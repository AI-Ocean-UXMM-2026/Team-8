import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID as id} from 'node:crypto';
const db=new PGlite(),q=(sql,args=[])=>db.query(sql,args);
const migration='20261023130000_be1_rider_assignment_alias.sql',dir=new URL('../migrations/',import.meta.url);
const list=async()=>(await q('select public.delivery_read(null::uuid) result')).rows[0].result;
try{
 await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&f!==migration).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 await assert.rejects(list,e=>e.code==='42702');
 const patch=await readFile(new URL(migration,dir),'utf8');await db.exec(patch);await db.exec(patch);assert.deepEqual(await list(),[]);
 const w=id(),sme=id(),actor=id(),other=id(),rider=id(),shipment=id(),assignment=id();
 await q("insert into public.warehouses(id,name) values($1,'Rider test')",[w]);await q("insert into public.smes(id,warehouse_id,name) values($1,$2,'SME')",[sme,w]);
 for(const user of [actor,other]){await q('insert into auth.users(id,email) values($1,$2)',[user,user+'@test.invalid']);await q("insert into public.profiles(id,display_name) values($1,'Test')",[user]);}
 await q("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'rider'),($3,$2,'rider')",[actor,w,other]);
 await q('insert into public.riders(id,warehouse_id,profile_id) values($1,$2,$3)',[rider,w,actor]);
 await q("insert into public.shipments(id,warehouse_id,sme_id,reference,direction,delivery_mode,status) values($1,$2,$3,'RIDER-TEST','outbound','in_house','ready')",[shipment,w,sme]);
 await q('insert into public.delivery_assignments(id,shipment_id,warehouse_id,sme_id,rider_id) values($1,$2,$3,$4,$5)',[assignment,shipment,w,sme,rider]);
 await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);assert.equal((await list())[0].shipment_id,shipment);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[other]);assert.deepEqual(await list(),[]);await q('reset role');
 await q('update public.delivery_assignments set accepted_at=now(),picked_up_at=now(),completed_at=now() where id=$1',[assignment]);await q("select set_config('request.jwt.claim.sub',$1,false)",[actor]);assert.deepEqual(await list(),[]);
 // Older deployments have no returns wrapper: repair the original function too.
 const original=await readFile(new URL('20261021001100_be1_delivery_workflows.sql',dir),'utf8');
 const source=original.slice(original.indexOf('create function public.delivery_read'),original.indexOf('create function public.delivery_command')).replace('create function','create or replace function');
 await db.exec(source);await assert.rejects(list,e=>e.code==='42702');await db.exec(patch);assert.deepEqual(await list(),[]);
 console.log('PASS rider assignments: reproduced alias error, wrapped/unwrapped repair, repeat migration, own/foreign rider and completed assignment isolation.');
}catch(e){console.error(e);process.exitCode=1}finally{await db.close()}
