import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../seed.sql',import.meta.url),'utf8'));
 const warehouse='10000000-0000-4000-8000-000000000001',sme=randomUUID(),shipment=randomUUID(),id=randomUUID();
 await db.query("insert into public.smes(id,warehouse_id,name) values($1,$2,'Policy setup fixture')",[sme,warehouse]);
 await db.query("insert into public.shipments(id,warehouse_id,sme_id,reference,direction) values($1,$2,$3,'POLICY-SETUP','inbound')",[shipment,warehouse,sme]);
 await db.query("insert into public.exception_cases(id,shipment_id,warehouse_id,sme_id,stage,type,summary) values($1,$2,$3,$4,'inbound','quantity_mismatch','Policy setup fixture')",[id,shipment,warehouse,sme]);
 const script=(await readFile(new URL('../../scripts/setup-exception-demo-policy.sql',import.meta.url),'utf8')).replaceAll('e8d00000-0000-4000-8000-000000000001',id);
 await db.exec(script);const first=(await db.query('select * from public.resolution_policies where sme_id=$1',[sme])).rows;
 assert.equal(first.length,1);assert.deepEqual(first[0].rules.ai_auto_actions,[]);assert.ok(first[0].allowed_actions.includes('update_workflow'));assert.ok(first[0].allowed_actions.includes('request_sme_decision'));
 await db.exec(script);assert.deepEqual((await db.query('select * from public.resolution_policies where sme_id=$1',[sme])).rows,first);
 console.log('PASS exception policy setup: missing-SME-only manual policy, no AI opt-in, rerun preserves existing policy.');
}finally{await db.close()}
