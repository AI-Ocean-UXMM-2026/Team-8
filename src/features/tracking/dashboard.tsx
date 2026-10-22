'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useSession} from '../auth/session';
import {ApiError,type Schemas} from '../../shared/api';
import {trackingAccess} from '../../shared/api/tracking';
import {Card,Button,Input} from '../../shared/ui';
import {PageTitle,Loading,ErrorPanel,Empty,useResource} from '../warehouse/shared';
import {usePolling} from '../portal/polling';
import {ShipmentStatus} from '../warehouse/shipment-status';
import {LiveCourierTracking} from './live-tracking';
import './tracking.css';
export function TrackingDashboard(){
 const {api,identity,warehouseId,smeId,audience,demo}=useSession();
 const [selected,setSelected]=useState(''),[search,setSearch]=useState('');
 const resource=usePolling(`${warehouseId}:${smeId}`,async signal=>{
  let shipments:Schemas['Shipment'][]=[];
  if(audience==='sme')shipments=(await api!.getSMEOverview(smeId,signal)).shipments;
  else{
   let cursor:string|undefined;const seen=new Set<string>();
   do{const page=await api!.listShipments({warehouseId,direction:'outbound',cursor,limit:100,signal});shipments.push(...page.items);cursor=page.next_cursor??undefined;
    if(cursor&&seen.has(cursor))throw new Error('Shipment paging could not be verified.');if(cursor)seen.add(cursor);
   }while(cursor);
  }
  if(shipments.some(s=>s.warehouse_id!==warehouseId||!trackingAccess(identity!.memberships,s)||(audience==='sme'&&s.sme_id!==smeId)))throw new ApiError(403,'FORBIDDEN','Tracking is unavailable outside your workspace.');
  return shipments.filter(s=>s.direction==='outbound'&&!['delivered','cancelled'].includes(s.status));
 });
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 const rows=resource.data,visible=rows.filter(s=>[s.reference,s.id].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const active=visible.find(s=>s.id===selected)??visible.find(s=>s.delivery_mode==='in_house')??visible[0];
 const base=audience==='sme'?(demo?'/demo/sme':'/sme'):(demo?'/demo/warehouse':'/warehouse');
 return <div className="trackingDashboard"><PageTitle title="Shipment GPS tracking" my="ပို့ဆောင်မှု GPS တည်နေရာ" description={audience==='sme'?'Track only shipments belonging to your SME.':'Track outbound deliveries belonging to this warehouse.'}/><p className="mb-5 text-sm text-muted">The courier must accept the delivery, verify pickup and start consented location sharing. No GPS marker appears before a position is received.</p>
 <Card><div className="trackingListControls"><label>Search shipments<Input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Shipment reference or ID"/></label><Button variant="outline" onClick={resource.reload}>Refresh shipments</Button></div><p role="status" className="my-3 text-sm">{visible.length} <span>matching active shipments</span></p><div className="trackingShipments">{visible.map(s=><div className={`trackingShipment ${active?.id===s.id?'trackingShipmentSelected':''}`} key={s.id}><div><strong data-user-content>{s.reference}</strong><ShipmentStatus status={s.status}/></div><p className="text-sm text-muted">{s.delivery_mode==='in_house'?'In-house GPS tracking':'External courier reference'}</p><Button variant={active?.id===s.id?'default':'outline'} aria-pressed={active?.id===s.id} onClick={()=>setSelected(s.id)}>Track shipment</Button>{!demo&&<Link className="trackingDetailsLink" href={`${base}/shipments/${s.id}#live-courier-tracking`}>Shipment details →</Link>}</div>)}</div>{!visible.length&&<Empty text={rows.length?'No shipments match this search.':'No active outbound shipments to track.'}/>}</Card>
 {active&&<TrackingSelection key={warehouseId+':'+smeId+':'+active.id} id={active.id}/>}</div>;
}
function TrackingSelection({id}:{id:string}){
 const {api,warehouseId,smeId,audience,identity}=useSession();
 const resource=usePolling(id,async signal=>{
  const detail=audience==='sme'?await api!.getTrackingShipment(id,signal):await api!.getShipment(id,signal,warehouseId);
  if(detail.warehouse_id!==warehouseId||!trackingAccess(identity!.memberships,detail)||(audience==='sme'&&detail.sme_id!==smeId))throw new ApiError(403,'FORBIDDEN','This shipment is not available to your workspace.');
  return detail;
 },30000);
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 return <section className="mt-6" aria-label="Selected shipment tracking"><h2 className="text-lg font-semibold" data-user-content>{resource.data.reference}</h2><LiveCourierTracking shipment={resource.data}/></section>;
}
