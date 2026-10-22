'use client';
import {useEffect,useState} from 'react';
import {useSession} from './session';
import fixture from '../../../contracts/fixtures/warehouse/initial.json';
// Names are displayed only after membership verification. Demo names never
// substitute for a real user's organization; live SME identity has no name field.
export function useAccountContext() {
 const session=useSession();
 const [directory,setDirectory]=useState<{warehouse_id:string;name:string}|null>(null);
 const staff=session.identity?.memberships.some(m=>m.warehouse_id===session.warehouseId&&['staff','owner'].includes(m.role));
 useEffect(()=>{
  if(session.status!=='ready'||session.demo||!staff||!session.api)return;
  const controller=new AbortController();
  session.api.getWarehouseDirectory(session.warehouseId,controller.signal).then(value=>{if(!controller.signal.aborted&&value.warehouse_id===session.warehouseId)setDirectory(value)}).catch(()=>{});
  return()=>controller.abort();
 },[session.status,session.demo,session.api,session.warehouseId,staff]);
 const member=session.status==='ready'&&session.identity?.memberships.some(m=>m.warehouse_id===session.warehouseId&&(session.audience!=='sme'||m.sme_id===session.smeId&&m.role==='sme'));
 return {
  warehouseName:member?(session.demo&&session.warehouseId===fixture.body.directory.warehouse_id?fixture.body.directory.name:directory?.warehouse_id===session.warehouseId?directory.name:null):null,
  smeName:member&&session.demo?fixture.body.directory.smes.find(s=>s.id===session.smeId)?.name??null:null,
 };
}
