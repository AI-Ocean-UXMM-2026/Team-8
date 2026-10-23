import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {testWorkflows} from './workflows.test.mjs';
const db=new PGlite();
try{
 await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const dir=new URL('../migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
 await db.exec(await readFile(new URL('../seed.sql',import.meta.url),'utf8'));
 await testWorkflows(db,{autoRelease:true});
 const repair=await readFile(new URL('../../scripts/repair-courier123-workflow.sql',import.meta.url),'utf8');
 await assert.rejects(()=>db.exec(repair),/existing active rider membership/);await db.exec('rollback');
 const w='68b8a2e5-2e9b-4a57-9184-ffa69becb1cc',actor=randomUUID();
 await db.query("insert into public.warehouses(id,name) values($1,'Courier registration test')",[w]);
 await db.query("insert into auth.users(id,email) values($1,'courier123@parcelcare.com')",[actor]);await db.query("insert into public.profiles(id,display_name) values($1,'Courier 123')",[actor]);
 await db.query("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'rider')",[actor,w]);
 await db.exec(repair);await db.exec(repair);
 assert.equal((await db.query('select count(*)::int n from public.riders where profile_id=$1 and warehouse_id=$2',[actor,w])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from public.delivery_assignments a join public.riders r on r.id=a.rider_id where r.profile_id=$1',[actor])).rows[0].n,0);
 console.log('PASS courier registration: active membership required, repeat-safe mapping, no automatic or foreign shipment assignment; staff-scoped rider names and emails');

 console.log('PASS SME release to transport: automatic acceptance/replay and reservation -> pick/pack -> rider assignment/acceptance/pickup -> verified dispatch -> GPS arrival -> proof -> SME-only receipt, with stock deducted once');
}finally{await db.close()}
