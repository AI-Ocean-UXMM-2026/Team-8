import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const q=(sql,params=[])=>db.query(sql,params),one=async(sql,params=[])=>(await q(sql,params)).rows[0];
const w='10000000-0000-4000-8000-000000000001',product='30000000-0000-4000-8000-000000000001';
const staff='00000000-0000-4000-8000-000000009991',sme='00000000-0000-4000-8000-000000009992';
const as=async(user,fn)=>{await q('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return await fn()}finally{await q('reset role')}};
const read=async(id=product)=>(await one('select public.product_category_read($1,$2) result',[w,id])).result;
const write=async(kind,body,key=randomUUID(),id=product)=>(await one('select public.product_category_write($1,$2,$3,$4,$5::jsonb) result',[w,id,kind,key,JSON.stringify(body)])).result;
const reject=(fn,code)=>assert.rejects(fn,e=>e.code===code);
try{
 await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const dir=new URL('../migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
 await db.exec(await readFile(new URL('../seed.sql',import.meta.url),'utf8'));
 for(const id of [staff,sme]){await q('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.test']);await q('insert into public.profiles(id,display_name) values($1,$2)',[id,'Category tester']);}
 await q("insert into public.memberships(profile_id,warehouse_id,sme_id,role) values($1,$3,null,'staff'),($2,$3,$4,'sme')",[staff,sme,w,'20000000-0000-4000-8000-000000000001']);
 const stockBefore=await one('select available_qty,quarantined_qty,version from public.products where id=$1',[product]);
 await as(sme,()=>reject(()=>read(),'42501'));
 await as(sme,()=>reject(()=>write('metadata',{expected_revision:0}),'42501'));
 await as(staff,async()=>{
  assert.equal((await read()).revision,0);
  await reject(()=>write('metadata',{expected_revision:0},randomUUID(),'30000000-0000-4000-8000-000000000006'),'42501');
  const key=randomUUID(),body={expected_revision:0,description:'Black tea bags for brewing tea',material:'Tea leaves',intended_use:'Beverage',storage_notes:''};
  let state=await write('metadata',body,key);assert.equal(state.revision,1);
  assert.deepEqual(await write('metadata',body,key),state);
  await reject(()=>write('metadata',{...body,description:'changed'},key),'22023');
  await reject(()=>write('metadata',body),'40001');
  const aiKey=randomUUID(),suggestion={category:'food_beverages',confidence:0.92,rationale:'Tea is a beverage',uncertain_attributes:[],missing_attributes:['storage_notes'],model:'test-double',requires_review:true};
  state=await write('analyze',{expected_revision:1,suggestion},aiKey);assert.equal(state.status,'pending');assert.equal(state.category,null);
  const cached=(await one('select public.product_category_retry($1,$2,$3,$4) result',[w,product,aiKey,1])).result;assert.deepEqual(cached,state);
  await reject(()=>q('select public.product_category_retry($1,$2,$3,$4)',[w,product,aiKey,0]),'22023');
  await reject(()=>write('review',{expected_revision:2,category:'food_beverages',note:'Checked package',acknowledge_flags:false}),'22023');
  state=await write('review',{expected_revision:2,category:'food_beverages',note:'Package checked; storage still unknown',acknowledge_flags:true});assert.equal(state.status,'verified');assert.equal(state.reviewed_by,staff);
  state=await write('metadata',{...body,expected_revision:3,storage_notes:'Keep dry'});assert.equal(state.revision,4);assert.equal(state.status,'pending');assert.equal(state.category,null);assert.equal(state.suggestion,null);assert.equal(state.reviewed_by,null);
  await reject(()=>write('analyze',{expected_revision:4,suggestion:{...suggestion,category:'invented'}}),'22023');
  state=await write('analyze',{expected_revision:4,suggestion:{...suggestion,confidence:0.55,missing_attributes:[],uncertain_attributes:['material']}});
  await reject(()=>write('review',{expected_revision:5,category:'food_beverages',note:'Confirmed category',acknowledge_flags:false}),'22023');
  await write('review',{expected_revision:5,category:'home_kitchen',note:'Human correction overrides suggestion',acknowledge_flags:true});
  await reject(()=>q("update public.product_categorizations set status='verified'"),'42501');
  await reject(()=>q('select * from private.product_category_commands'),'42501');
 });
 assert.deepEqual(await one('select available_qty,quarantined_qty,version from public.products where id=$1',[product]),stockBefore);
 assert.equal((await one('select count(*)::int n from private.product_category_commands')).n,6);
 console.log('PASS: all migrations, tenant permissions, missing and uncertain review guards, manual correction, metadata invalidation, replay, stale edits, private history, unchanged stock.');
}catch(e){console.error(e.message,e.code,e.position,e.where);process.exitCode=1;}finally{await db.close()}
