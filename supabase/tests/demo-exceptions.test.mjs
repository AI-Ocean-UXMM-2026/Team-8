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

 const staff=id();await q('insert into auth.users(id,email) values($1,$2)',[staff,'fixture-maintainer@example.invalid']);await q("insert into public.profiles(id,display_name) values($1,'Synthetic fixture maintainer')",[staff]);await q("insert into public.memberships(profile_id,warehouse_id,role) values($1,$2,'staff')",[staff,w]);
 const balances=JSON.stringify((await q('select id,available_qty,reserved_qty,quarantined_qty from public.products order by id')).rows);
 const scenarios=await readFile(new URL('../../scripts/seed-demo-exceptions.sql',import.meta.url),'utf8');await db.exec(scenarios);
 assert.equal((await q('select count(*)::int n from private.demo_exception_scenarios')).rows[0].n,15);
 assert.equal(JSON.stringify((await q('select id,available_qty,reserved_qty,quarantined_qty from public.products order by id')).rows),balances);
 const snapshots=JSON.stringify((await q('select * from public.case_slas order by case_id')).rows);await db.exec(scenarios);assert.equal(JSON.stringify((await q('select * from public.case_slas order by case_id')).rows),snapshots);
 await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[staff]);
 const legacyPage=(await q("select public.case_queue_read($1,'{}') r",[w])).rows[0].r;assert.equal(legacyPage.summary,undefined);
 const page=(await q("select public.case_queue_read($1,'{\"include_summary\":true,\"limit\":2}') r",[w])).rows[0].r;
 assert.equal(page.items.length,2);assert.equal(page.summary.matching,12);assert.equal(page.summary.sla_breaches,4);assert.equal(page.summary.awaiting_sme,2);assert(page.next_cursor);
 const next=(await q('select public.case_queue_read($1,$2::jsonb) r',[w,JSON.stringify({include_summary:true,limit:2,cursor:page.next_cursor})])).rows[0].r;assert.equal(next.summary.sla_breaches,4);
 const overdue=(await q("select public.case_queue_read($1,'{\"include_summary\":true,\"sla_risk\":\"overdue\"}') r",[w])).rows[0].r;assert.equal(overdue.items.length,4);assert.equal(overdue.summary.sla_breaches,4);
 const risk=(await q("select public.case_queue_read($1,'{\"include_summary\":true,\"sla_risk\":\"at_risk\"}') r",[w])).rows[0].r;assert.equal(risk.items.length,2);
 const all=(await q("select public.case_queue_read($1,'{\"include_summary\":true,\"status\":\"all\"}') r",[w])).rows[0].r;assert.equal(all.summary.matching,15);assert.equal(all.summary.sla_breaches,4);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[identities[0].actor]);await assert.rejects(()=>q("select public.case_queue_read($1,'{}')",[w]),/forbidden/);await q('reset role');
 assert.equal((await q('select count(*)::int n from public.ai_analyses')).rows[0].n,0);

 // Reviewed legacy fixtures plus a release-protected product and unrelated TEST record.
 const tenant=identities[0].sme,legacy='3a102200-0000-4000-8000-000000000001',protectedId='44dae1d6-3e72-4c9b-8edd-d7f2be6efaa2',unrelated=id();
 for(const [p,sku] of [[legacy,'TEST-GB-TEA'],[protectedId,'TEST-COMMON-008'],[unrelated,'TEST-UNREVIEWED']])await q("insert into public.products(id,warehouse_id,sme_id,sku,name,available_qty,reserved_qty) values($1,$2,$3,$4,'TEST - historical item',20,$5)",[p,w,tenant,sku,p===protectedId?7:0]);
 const release=id();await q("insert into public.sme_orders(id,warehouse_id,sme_id,created_by,payload) values($1,$2,$3,$4,$5::jsonb)",[release,w,tenant,identities[0].actor,JSON.stringify({lines:[{product_id:protectedId,expected_qty:7}]})]);
 for(let n=1;n<=4;n++){
  const shipment='4a102200-0000-4000-8000-'+String(n).padStart(12,'0');
  await q("insert into public.shipments(id,warehouse_id,sme_id,reference,direction,delivery_mode,status) values($1,$2,$3,$4,'outbound','in_house','ready')",[shipment,w,tenant,'TEST-LEGACY-'+n]);
  await q('insert into public.shipment_items(shipment_id,warehouse_id,sme_id,product_id,expected_qty) values($1,$2,$3,$4,2)',[shipment,w,tenant,legacy]);
  if(n===3)for(let k=901;k<=903;k++)await q("insert into public.exception_cases(id,shipment_id,warehouse_id,sme_id,stage,type,summary) values($1,$2,$3,$4,'outbound',$5,'TEST SLA fixture')",['5e102200-0000-4000-8000-'+String(k).padStart(12,'0'),shipment,w,tenant,['courier_delay','recipient_unavailable','delivery_failed'][k-901]]);
 }
 const cleanup=await readFile(new URL('../../scripts/cleanup-reviewed-test-data.sql',import.meta.url),'utf8');await db.exec(cleanup);
 assert.equal((await q('select count(*)::int n from public.products where id=$1',[legacy])).rows[0].n,0);
 const protectedProduct=(await q('select sku,reserved_qty from public.products where id=$1',[protectedId])).rows[0];assert.equal(protectedProduct.reserved_qty,7);assert.match(protectedProduct.sku,/LEGACY/);
 assert.equal((await q('select count(*)::int n from public.sme_orders where id=$1',[release])).rows[0].n,1);
 assert.equal((await q('select count(*)::int n from public.products where id=$1',[unrelated])).rows[0].n,1);
 assert.equal((await q("select count(*)::int n from public.exception_cases where id::text like '5e102200-%'")).rows[0].n,0);
 assert.equal((await q("select count(*)::int n from public.shipments where id::text like '4a102200-%'")).rows[0].n,0);
 const backup=(await q('select count(*)::int n from private.demo_cleanup_backup')).rows[0].n;assert(backup>10);await db.exec(cleanup);assert.equal((await q('select count(*)::int n from private.demo_cleanup_backup')).rows[0].n,backup);
 assert.equal((await q('select count(*)::int n from private.demo_exception_scenarios')).rows[0].n,15);
 await db.exec(await readFile(new URL('../../scripts/apply-demo-exception-refresh.sql',import.meta.url),'utf8'));
 console.log('PASS cleanup: exact IDs only; linked releases/reservations, unrelated TEST rows and 15 new scenarios preserved; private backup and repeat safety');
 console.log('PASS exception scenarios: 15 cases, 4 distinct breaches, 2 at risk, all board states, queue-wide pagination counts, tenant denial, stock unchanged and repeat-safe deadlines');

}catch(e){console.error(e);process.exitCode=1}finally{await db.close()}
