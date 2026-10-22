import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { testOperations } from './operations.test.mjs';
import { testCases } from './cases.test.mjs';
import { testMakerChecker } from './maker-checker.test.mjs';
import { testWorkflows } from './workflows.test.mjs';
import { testRisk } from './risk.test.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
const uid = (n, i) => `${n}0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const staff=uid(0,1), smeA=uid(0,2), smeB=uid(0,3), rider=uid(0,4), outsider=uid(0,5), otherStaff=uid(0,6);
let passed=0;
async function test(name, fn) { await fn(); passed++; console.log('PASS: ' + name); }
const query = (sql,params=[]) => db.query(sql,params);
const one = async (sql,params=[]) => (await query(sql,params)).rows[0];
async function asUser(user,fn,role='authenticated') {
  await query(`set role ${role}`);
  await query("select set_config('request.jwt.claim.sub',$1,false)",[user || '']);
  try { return await fn(); } finally { await query('reset role'); await query("select set_config('request.jwt.claim.sub','',false)"); }
}
const rejected = async (fn, code) => { await assert.rejects(fn, e => !code || e.code===code); };
try {
  await db.exec(await readFile(path.join(root,'tests/bootstrap.sql'),'utf8'));
  for (const file of (await readdir(path.join(root,'migrations'))).filter(f=>f.endsWith('.sql')).sort()) {
    if (file >= '20261021000800') continue; // Exercise legacy invariants before its RPC is retired.
    try { await db.exec(await readFile(path.join(root,'migrations',file),'utf8')); }
    catch (e) { console.error('MIGRATION FAILED:',file,e.message); throw e; }
  }
  await db.exec(await readFile(path.join(root,'seed.sql'),'utf8'));
  // Running seed twice must not reset stock or create duplicate fixtures.
  await db.exec(await readFile(path.join(root,'seed.sql'),'utf8'));
  await db.exec(await readFile(path.join(root,'tests/native-smoke.sql'),'utf8'));
  console.log('PASS: native PostgreSQL CI smoke script on fresh isolated schema');
  for (const [id,name] of [[staff,'Staff'],[smeA,'SME A'],[smeB,'SME B'],[rider,'Rider'],[outsider,'No membership'],[otherStaff,'Other staff']]) {
    await query('insert into auth.users(id,email) values($1,$2)',[id,name.replaceAll(' ','')+'@example.test']);
    await query('insert into public.profiles(id,display_name) values($1,$2)',[id,name]);
  }
  for (const [user,w,sme,role] of [[staff,1,null,'staff'],[smeA,1,1,'sme'],[smeB,1,2,'sme'],[rider,1,null,'rider'],[otherStaff,2,null,'staff']]) {
    await query('insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,$4)',[user,uid(1,w),sme?uid(2,sme):null,role]);
  }
  await query('insert into public.riders(id,warehouse_id,profile_id) values($1,$2,$3)',[uid(6,1),uid(1,1),rider]);
  await query("update public.shipments set status='picked_up' where id=$1",[uid(4,6)]);
  await query('insert into public.delivery_assignments(id,shipment_id,warehouse_id,sme_id,rider_id,accepted_at,picked_up_at) values($1,$2,$3,$4,$5,now(),now())',[uid(7,1),uid(4,6),uid(1,1),uid(2,1),uid(6,1)]);

  await test('all 28 application tables have RLS enabled',async()=>{
    const r=await one("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity");
    assert.equal(r.n,28);
  });
  await test('seed has five main SMEs, 15 main shipments and two cases',async()=>{
    assert.equal((await one('select count(*)::int n from public.smes where warehouse_id=$1',[uid(1,1)])).n,5);
    assert.equal((await one('select count(*)::int n from public.shipments where warehouse_id=$1',[uid(1,1)])).n,15);
    assert.equal((await one('select count(*)::int n from public.exception_cases')).n,2);
  });
  await test('anonymous reads and receipt command are denied',()=>asUser(null,async()=>{
    await rejected(()=>query('select * from public.products'),'42501');
    await rejected(()=>query('select public.receive_shipment($1,$2,$3)',[uid(4,1),uid(0,100),'[]']),'42501');
  },'anon'));
  await test('SME A reads only its own products and shipments',()=>asUser(smeA,async()=>{
    const rows=(await query('select * from public.products')).rows; assert.equal(rows.length,1); assert.equal(rows[0].sme_id,uid(2,1));
    assert.equal((await one('select count(*)::int n from public.shipments')).n,3);
    assert.equal((await one('select count(*)::int n from public.shipments where id=$1',[uid(4,2)])).n,0);
  }));
  await test('staff is limited to its own warehouse; outsider has no data',async()=>{
    await asUser(staff,async()=>assert.equal((await one('select count(*)::int n from public.shipments')).n,15));
    await asUser(otherStaff,async()=>assert.equal((await one('select count(*)::int n from public.shipments')).n,1));
    await asUser(outsider,async()=>assert.equal((await one('select count(*)::int n from public.shipments')).n,0));
  });
  await test('warehouse metadata follows membership scope',async()=>{
    for(const user of [staff,smeA,rider]) await asUser(user,async()=>{
      const rows=(await query('select id from public.warehouses')).rows;
      assert.equal(rows.length,1); assert.equal(rows[0].id,uid(1,1));
    });
    await asUser(outsider,async()=>assert.equal((await one('select count(*)::int n from public.warehouses')).n,0));
  });
  await test('rider reads assigned shipment, not inventory or other shipments',()=>asUser(rider,async()=>{
    assert.equal((await one('select count(*)::int n from public.shipments')).n,1);
    assert.equal((await one('select count(*)::int n from public.products')).n,0);
  }));
  await test('direct stock, membership and audit writes are forbidden',()=>asUser(staff,async()=>{
    await rejected(()=>query('update public.products set available_qty=999'),'42501');
    await rejected(()=>query("update public.memberships set role='owner'"),'42501');
    await rejected(()=>query('delete from public.audit_records'),'42501');
  }));
  await test('cross-SME shipment item FK is rejected even for privileged writer',()=>rejected(()=>query(
    'insert into public.shipment_items(shipment_id,warehouse_id,sme_id,product_id,expected_qty) values($1,$2,$3,$4,1)',
    [uid(4,1),uid(1,1),uid(2,1),uid(3,2)]),'23503'));
  await test('membership SME must belong to its specified warehouse',()=>rejected(()=>query(
    "insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$2,$3,'sme')",
    [outsider,uid(1,1),uid(2,6)]),'23503'));
  const payload=JSON.stringify([{product_id:uid(3,1),received_qty:90,damaged_qty:0}]);
  let receipt;
  await test('receipt 90/100 atomically creates gap 10, stock, case, audit/outbox',()=>asUser(staff,async()=>{
    receipt=(await one('select public.receive_shipment($1,$2,$3::jsonb) result',[uid(4,1),uid(0,100),payload])).result;
    assert.equal(receipt.missing_qty,10);
    assert.equal((await one('select available_qty from public.products where id=$1',[uid(3,1)])).available_qty,90);
    assert.equal((await one('select count(*)::int n from public.exception_cases where shipment_id=$1',[uid(4,1)])).n,1);
    assert.equal((await one('select count(*)::int n from public.stock_movements where receipt_id=$1',[receipt.receipt_id])).n,1);
    assert.equal((await one('select count(*)::int n from public.audit_records where entity_id=$1',[receipt.receipt_id])).n,1);
  }));
  await test('identical receipt retry is idempotent; changed payload is rejected',()=>asUser(staff,async()=>{
    assert.deepEqual((await one('select public.receive_shipment($1,$2,$3::jsonb) result',[uid(4,1),uid(0,100),payload])).result,receipt);
    await rejected(()=>query('select public.receive_shipment($1,$2,$3::jsonb)',[uid(4,1),uid(0,100),payload.replace('90','91')]),'22023');
    assert.equal((await one('select available_qty from public.products where id=$1',[uid(3,1)])).available_qty,90);
  }));
  await test('SME and other-warehouse staff cannot receive a shipment',async()=>{
    for(const user of [smeA,otherStaff]) await asUser(user,()=>rejected(()=>query('select public.receive_shipment($1,$2,$3::jsonb)',[uid(4,1),uid(0,101),payload]),'42501'));
  });
  await test('invalid receipt rolls back all writes',()=>asUser(staff,async()=>{
    await rejected(()=>query('select public.receive_shipment($1,$2,$3::jsonb)',[uid(4,3),uid(0,103),JSON.stringify([{product_id:uid(3,3),received_qty:5,damaged_qty:6}])]),'22023');
    assert.equal((await one('select count(*)::int n from public.receipts where shipment_id=$1',[uid(4,3)])).n,0);
    assert.equal((await one('select available_qty from public.products where id=$1',[uid(3,3)])).available_qty,0);
  }));
  await test('partial receipt defers shortage case and final receipt separates damage/missing',()=>asUser(staff,async()=>{
    await query('select public.receive_shipment($1,$2,$3::jsonb,false)',[uid(4,3),uid(0,104),JSON.stringify([{product_id:uid(3,3),received_qty:50,damaged_qty:0}])]);
    assert.equal((await one('select count(*)::int n from public.exception_cases where shipment_id=$1',[uid(4,3)])).n,0);
    await query('select public.receive_shipment($1,$2,$3::jsonb,true)',[uid(4,3),uid(0,105),JSON.stringify([{product_id:uid(3,3),received_qty:45,damaged_qty:5}])]);
    const p=await one('select available_qty,quarantined_qty from public.products where id=$1',[uid(3,3)]);
    assert.deepEqual(p,{available_qty:90,quarantined_qty:5});
    assert.equal((await one('select count(*)::int n from public.exception_cases where shipment_id=$1',[uid(4,3)])).n,2);
  }));
  let caseId=(await one('select id from public.exception_cases where shipment_id=$1',[uid(4,1)])).id;
  const approval=uid(8,100);
  await query("insert into public.approvals(id,case_id,warehouse_id,sme_id,kind,options) values($1,$2,$3,$4,'partial_receipt','[\"accept_partial\",\"await_remainder\"]')",[approval,caseId,uid(1,1),uid(2,1)]);
  await test('other SME and warehouse staff cannot decide SME approval',async()=>{
    for(const user of [smeB,staff]) await asUser(user,()=>rejected(()=>query("select public.decide_approval($1,'accept_partial')",[approval]),'42501'));
  });
  await test('SME decision is durable/idempotent and does not close case',()=>asUser(smeA,async()=>{
    await query("select public.decide_approval($1,'await_remainder')",[approval]);
    await query("select public.decide_approval($1,'await_remainder')",[approval]);
    assert.equal((await one('select status from public.exception_cases where id=$1',[caseId])).status,'awaiting_information');
    assert.equal((await one('select count(*)::int n from public.case_events where case_id=$1 and type=$2',[caseId,'approval_decided'])).n,1);
    await rejected(()=>query("select public.decide_approval($1,'accept_partial')",[approval]),'22023');
  }));
  await test('case active deduplication permits separate issue types',async()=>{
    await rejected(()=>query("insert into public.exception_cases(shipment_id,warehouse_id,sme_id,stage,type) values($1,$2,$3,'inbound','quantity_mismatch')",[uid(4,1),uid(1,1),uid(2,1)]),'23505');
  });
  await test('analysis cannot attach another SME policy even with privileged writes',()=>rejected(()=>query(
    "insert into public.ai_analyses(case_id,warehouse_id,sme_id,policy_id,model,source_version,output) values($1,$2,$3,$4,'test','v1','{}')",
    [caseId,uid(1,1),uid(2,1),uid(9,2)]),'23503'));
  await test('resolved/closed case requires nonblank verification fields',()=>rejected(()=>query("update public.exception_cases set status='closed',closed_at=now(),verified_by=$1,verified_at=now() where id=$2",[staff,caseId]),'23514'));
  let evidence;
  await test('private storage permits only registered own-shipment paths',()=>asUser(smeA,async()=>{
    evidence=(await one("select public.register_evidence($1,'image/png',200) e",[uid(4,1)])).e;
    await query('insert into storage.objects(bucket_id,name) values($1,$2)',[evidence.bucket,evidence.path]);
    await rejected(()=>query("insert into storage.objects(bucket_id,name) values('parcelcare-evidence','guessed-path')"),'42501');
    assert.equal((await one('select count(*)::int n from storage.objects')).n,1);
  }));
  await test('SME B cannot list evidence or storage object for SME A',()=>asUser(smeB,async()=>{
    assert.equal((await one('select count(*)::int n from public.evidence where id=$1',[evidence.id])).n,0);
    assert.equal((await one('select count(*)::int n from storage.objects')).n,0);
  }));
  await test('evidence objects cannot be overwritten or deleted by the uploader',()=>asUser(smeA,async()=>{
    assert.equal((await query('update storage.objects set name=$1 returning id',['changed'])).rows.length,0);
    assert.equal((await query('delete from storage.objects returning id')).rows.length,0);
    assert.equal((await one('select count(*)::int n from storage.objects')).n,1);
  }));
  await test('internal staff evidence is invisible to SME and cannot be self-created by SME',async()=>{
    let internal;
    await asUser(staff,async()=>{
      internal=(await one("select public.register_evidence($1,'image/png',200,false) e",[uid(4,1)])).e;
      await query('insert into storage.objects(bucket_id,name) values($1,$2)',[internal.bucket,internal.path]);
    });
    await asUser(smeA,async()=>{
      assert.equal((await one('select count(*)::int n from public.evidence where id=$1',[internal.id])).n,0);
      assert.equal((await one('select count(*)::int n from storage.objects')).n,1);
      await rejected(()=>query("select public.register_evidence($1,'image/png',200,false)",[uid(4,1)]),'42501');
    });
  });
  await test('external courier cannot receive an in-house rider assignment',()=>rejected(()=>query(
    'insert into public.delivery_assignments(shipment_id,warehouse_id,sme_id,rider_id) values($1,$2,$3,$4)',
    [uid(4,11),uid(1,1),uid(2,1),uid(6,1)]),'23514'));
  await test('delivery mode cannot change under an existing assignment',()=>rejected(()=>query(
    "update public.shipments set delivery_mode='third_party' where id=$1",[uid(4,6)]),'23514'));
  let session;
  await test('only assigned rider may start tracking, with explicit consent',async()=>{
    await asUser(staff,()=>rejected(()=>query('select public.start_tracking($1,true)',[uid(7,1)]),'42501'));
    await asUser(rider,async()=>{
      await rejected(()=>query('select public.start_tracking($1,false)',[uid(7,1)]),'22023');
      session=(await one('select public.start_tracking($1,true) id',[uid(7,1)])).id;
      assert.equal((await one('select public.start_tracking($1,true) id',[uid(7,1)])).id,session);
    });
  });
  const time=new Date().toISOString();
  await test('coordinates are validated and repeated packet is idempotent',()=>asUser(rider,async()=>{
    await rejected(()=>query('select public.record_location($1,200,96.1,5,$2)',[session,time]),'23514');
    const loc=(await one('select public.record_location($1,16.8,96.1,5,$2) id',[session,time])).id;
    assert.equal((await one('select public.record_location($1,16.8,96.1,5,$2) id',[session,time])).id,loc);
    await rejected(()=>query('select public.record_location($1,16.9,96.1,5,$2)',[session,time]),'22023');
  }));
  await test('warehouse and correct SME get latest position with access audit',async()=>{
    for(const user of [staff,smeA]) await asUser(user,async()=>{
      const live=(await one('select public.get_live_location($1) live',[session])).live;
      assert.equal(live.latitude,16.8); assert.equal(live.status,'live');
    });
    assert.equal((await one("select count(*)::int n from public.audit_records where action='live_location_viewed' and entity_id=$1",[session])).n,2);
  });
  await test('wrong SME denied GPS; raw history is not browser-accessible',async()=>{
    await asUser(smeB,()=>rejected(()=>query('select public.get_live_location($1)',[session]),'42501'));
    await asUser(smeA,()=>rejected(()=>query('select * from public.rider_locations'),'42501'));
    await asUser(staff,()=>rejected(()=>query('select public.record_location($1,16.8,96.1,5,now())',[session]),'42501'));
  });
  await test('stale coordinates are explicitly marked',async()=>{
    await query("update public.rider_locations set recorded_at=now()-interval '2 minutes' where session_id=$1",[session]);
    await asUser(smeA,async()=>assert.equal((await one('select public.get_live_location($1) live',[session])).live.status,'stale'));
  });
  await test('stop revokes live reads and rejects late location packets',async()=>{
    await asUser(rider,()=>query('select public.stop_tracking($1)',[session]));
    await asUser(smeA,()=>rejected(()=>query('select public.get_live_location($1)',[session]),'42501'));
    await asUser(rider,()=>rejected(()=>query('select public.record_location($1,16.8,96.1,5,now())',[session]),'42501'));
  });
  await test('deactivated rider membership cannot restart sharing',async()=>{
    await query("update public.memberships set active=false where profile_id=$1 and role='rider'",[rider]);
    await asUser(rider,()=>rejected(()=>query('select public.start_tracking($1,true)',[uid(7,1)]),'42501'));
    await query("update public.memberships set active=true where profile_id=$1 and role='rider'",[rider]);
  });
  await test('delivery terminal status ends a restarted tracking session',async()=>{
    let active;
    await asUser(rider,async()=>{active=(await one('select public.start_tracking($1,true) id',[uid(7,1)])).id;});
    await query("update public.shipments set status='delivered' where id=$1",[uid(4,6)]);
    assert.equal((await one('select status from public.tracking_sessions where id=$1',[active])).status,'completed');
    await asUser(smeA,()=>rejected(()=>query('select public.get_live_location($1)',[active]),'42501'));
  });
  await test('location retention function is worker-only and deletes expired history',async()=>{
    await asUser(staff,()=>rejected(()=>query('select private.purge_expired_locations()'),'42501'));
    await query("update public.rider_locations set received_at=now()-interval '25 hours'");
    await query('select private.purge_expired_locations()');
    assert.equal((await one('select count(*)::int n from public.rider_locations')).n,0);
  });
  for (const file of (await readdir(path.join(root,'migrations'))).filter(f=>f.endsWith('.sql') && f >= '20261021000800').sort()) {
    await db.exec(await readFile(path.join(root,'migrations',file),'utf8'));
  }
  await testOperations(db);
  await testCases(db);
  await test('audit and outbox share actor, correlation and transaction time',async()=>{
    await query("select set_config('request.jwt.claim.sub',$1,false)",[staff]);
    let event;
    try { event=await one("select private.emit_domain_event($1,$2,'context_test',$3,'context-test') id",[uid(1,1),uid(2,1),uid(4,1)]); }
    finally { await query("select set_config('request.jwt.claim.sub','',false)"); }
    const a=await one("select * from public.audit_records where action='context_test'");
    const e=await one('select * from public.outbox_events where id=$1',[event.id]);
    assert.equal(a.actor_id,staff); assert.equal(e.actor_id,staff);
    assert.ok(a.correlation_id); assert.equal(a.correlation_id,e.correlation_id);
    assert.equal(String(a.created_at),String(e.created_at));
  });
  await test('inactive rider record blocks shipment/evidence despite active membership',async()=>{
    await query('update public.riders set active=false where id=$1',[uid(6,1)]);
    await asUser(rider,async()=>{
      assert.equal((await one('select count(*)::int n from public.shipments')).n,0);
      await rejected(()=>query("select public.register_evidence($1,'image/png',12)",[uid(4,6)]),'42501');
    });
    await query('update public.riders set active=true where id=$1',[uid(6,1)]);
  });
  await test('request correlation is propagated and invalid values safely replaced',async()=>{
    for (const value of [uid(0,800),'invalid']) {
      await query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-correlation-id':value})]);
      const result=await asUser(smeA,()=>one("select public.register_evidence($1,'image/png',12) e",[uid(4,1)]));
      const audit=await one('select correlation_id,actor_id from public.audit_records where entity_id=$1',[result.e.id]);
      assert.equal(audit.actor_id,smeA); assert.ok(audit.correlation_id);
      if(value!=='invalid') assert.equal(audit.correlation_id,value);
    }
    await query("select set_config('request.headers','',false)");
  });
  await test('domain event helper commits audit/outbox together and deduplicates',async()=>{
    const before=(await one('select count(*)::int n from public.audit_records')).n;
    const args=[uid(1,1),uid(2,1),'test_event',uid(4,1),'test-event-once'];
    const first=await one("select private.emit_domain_event($1,$2,$3,$4,$5) id",args);
    assert.ok(first.id);
    assert.equal((await one("select private.emit_domain_event($1,$2,$3,$4,$5) id",args)).id,null);
    await rejected(()=>query("select private.emit_domain_event($1,$2,$3,$4,$5,'{\"changed\":true}')",args),'22023');
    assert.equal((await one('select count(*)::int n from public.audit_records')).n,before+1);
    await query('begin');
    await query("select private.emit_domain_event($1,$2,'rollback_event',$3,'rollback-key')",[uid(1,1),uid(2,1),uid(4,1)]);
    await query('rollback');
    assert.equal((await one("select count(*)::int n from public.outbox_events where idempotency_key='rollback-key'")).n,0);
    assert.equal((await one("select count(*)::int n from public.audit_records where action='rollback_event'")).n,0);
  });
  await test('users cannot emit, claim or acknowledge privileged events',async()=>{
    for(const user of [staff,smeA,rider]) await asUser(user,async()=>{
      await rejected(()=>query('select private.claim_outbox($1)',[uid(1,1)]),'42501');
      await rejected(()=>query('select private.ack_outbox($1,$2,$3)',[uid(1,1),uid(0,1),uid(0,2)]),'42501');
      await rejected(()=>query("select private.emit_domain_event($1,$2,'forged',$3,'forged')",[uid(1,1),uid(2,1),uid(4,1)]),'42501');
      assert.equal((await one('select count(*)::int n from public.outbox_events')).n,0);
    });
  });
  await testWorkflows(db);
  let claimed;
  await test('SQL worker has scoped lease/ack capability without arbitrary table access',()=>asUser(null,async()=>{
    await rejected(()=>query('select * from public.outbox_events'),'42501');
    assert.equal((await query('select * from private.claim_outbox($1)',[uid(1,999)])).rows.length,0);
    claimed=(await query('select * from private.claim_outbox($1,100)',[uid(1,1)])).rows;
    assert.ok(claimed.length>0);
    assert.ok(claimed.every(e=>e.warehouse_id===uid(1,1) && e.attempts===1 && e.lease_token));
    assert.equal((await query('select * from private.claim_outbox($1)',[uid(1,1)])).rows.length,0);
    const event=claimed[0];
    assert.equal((await one('select private.ack_outbox($1,$2,$3) ok',[uid(1,2),event.id,event.lease_token])).ok,false);
    assert.equal((await one('select private.ack_outbox($1,$2,$3) ok',[uid(1,1),event.id,uid(0,1)])).ok,false);
    assert.equal((await one('select private.ack_outbox($1,$2,$3) ok',[uid(1,1),event.id,event.lease_token])).ok,true);
    assert.equal((await one('select private.ack_outbox($1,$2,$3) ok',[uid(1,1),event.id,event.lease_token])).ok,false);
  },'parcelcare_worker'));
  await test('expired worker leases retry and stale lease tokens cannot acknowledge',async()=>{
    const old=claimed[1]; assert.ok(old);
    await query("update public.outbox_events set leased_until=now()-interval '1 second' where id=$1",[old.id]);
    await asUser(null,async()=>{
      const retry=(await one('select * from private.claim_outbox($1,1)',[uid(1,1)]));
      assert.equal(retry.id,old.id); assert.equal(retry.attempts,2); assert.notEqual(retry.lease_token,old.lease_token);
      assert.equal((await one('select private.ack_outbox($1,$2,$3) ok',[uid(1,1),old.id,old.lease_token])).ok,false);
    },'parcelcare_worker');
  });
  await testMakerChecker(db);
  await testRisk(db);
  console.log(`\n${passed} historical foundation tests plus warehouse operation tests passed. Engine: ${JSON.stringify((await one('select version()')).version)}.`);
} finally { await db.close(); }
