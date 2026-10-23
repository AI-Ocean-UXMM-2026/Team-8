'use client';
import {OrderCustomer} from './order-customer';
import Link from 'next/link';
import { localizedText } from '../../shared/i18n/text';
import { useState, type FormEvent } from 'react';
import { ApiError, type Schemas } from '../../shared/api';
import type { Delivery } from '../../shared/api/domain';
import { Badge, Button, Card, Input } from '../../shared/ui';
import { useSession } from '../auth/session';
import { useCommand } from '../warehouse/command';
import { dateTime, Empty, ErrorPanel, human, Loading, PageTitle } from '../warehouse/shared';
import { LiveTracking } from '../tracking/live';
import {CourierRoute} from '../tracking/courier-route';
import {DestinationPicker} from '../tracking/destination-picker';
import {LiveCourierTracking} from '../tracking/live-tracking';
import {RiderIssueReport} from '../courier/issue-report';
import { LocationSharing } from '../tracking/share';
import { usePolling } from './polling';
import { EvidenceUpload } from './evidence';
type Kind = 'assign' | 'cancel' | 'accept' | 'pickup' | 'proof' | 'confirm' | 'handover' | 'courier' | 'capacity' | 'return';
type Saved = { kind: Kind; body: Schemas['DeliveryCommand'] };
export function DeliveryWorkspace({ id }: { id: string }) {
  const { api, audience, identity, smeId, warehouseId, demo } = useSession();
  const resource=usePolling(`${warehouseId}:${smeId}:${id}`,async signal=>{
    const result=await api!.getDelivery(id,signal);
    if(result.shipment.id!==id || (audience==='sme' && result.shipment.sme_id!==smeId) || result.shipment.warehouse_id!==warehouseId)throw new ApiError(403,'FORBIDDEN','Delivery unavailable in this workspace.');
    return result;
  });
  const [kind,setKind]=useState<Kind>(audience==='sme'?'confirm':audience==='rider'?'accept':'assign');const [error,setError]=useState('');
  const command=useCommand<Saved,Delivery>(`parcelcare.delivery.${identity!.actor_id}.${id}`,async(saved,key)=>{
    const result=await api!.deliveryCommand(id,saved.kind,saved.body,key);
    if(result.shipment.id!==id || !Number.isInteger(result.shipment.version) || result.shipment.version<=saved.body.expected_version)throw new ApiError(502,'INVALID_RESPONSE','Delivery update could not be confirmed. Retry the original request.');
    return result;
  },resource.reload);
  if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
  if(!resource.data)return <Loading/>;
  const data=resource.data;const shipment=data.shipment;const external=shipment.delivery_mode==='third_party';
  const assignment=data.assignments.find(a=>!a.cancelled_at&&!a.completed_at);
  const terminal=['delivered','cancelled'].includes(shipment.status);
  const shipped=shipment.events.some(e=>e.type==='dispatched')||data.handovers.length>0;
  const canReturn=audience==='warehouse'&&shipment.status==='cancelled'&&shipped;
  const options:Kind[]=canReturn?['return']:audience==='warehouse'?(external?['handover','courier','cancel']:['assign','cancel','capacity']):audience==='sme'?['confirm']:['accept','pickup','proof'];
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setError('');const form=new FormData(event.currentTarget);
    const value=(name:string)=>String(form.get(name)||'').trim();const current=options.includes(kind)?kind:options[0];
    const body:Schemas['DeliveryCommand']={expected_version:shipment.version,note:value('note')};
    for(const key of ['rider_id','evidence_id','proof_id','approval_id','received_by','courier_name','waybill','tracking_url','package_condition'] as const)if(value(key))body[key]=value(key);
    if(value('package_count'))body.package_count=Number(value('package_count'));
    for(const key of ['accepted_at','scheduled_at'] as const)if(value(key)){const date=new Date(value(key));if(!Number.isFinite(date.getTime())){setError('Choose a valid date and time.');return;}body[key]=date.toISOString();}
    if(value('status'))body.status=value('status') as Schemas['DeliveryCommand']['status'];
    if(current==='return'){
      body.lines=shipment.items.map(item=>({product_id:item.product_id,received_qty:Number(value(`received-${item.product_id}`)),damaged_qty:Number(value(`damaged-${item.product_id}`))})).filter(line=>line.received_qty!==0||line.damaged_qty!==0);
      if(!body.lines.length||body.lines.some(line=>!Number.isInteger(line.received_qty)||!Number.isInteger(line.damaged_qty)||line.received_qty<=0||line.damaged_qty<0||line.damaged_qty>line.received_qty)){setError('Enter whole returned quantities; damage is included in returned quantity.');return;}
    }
    if(!window.confirm(localizedText('Confirm the recorded physical step, evidence and selected delivery before submitting.')))return;
    void command.execute({kind:current,body});
  }
  const field=(name:string,label:string,type='text',required=true)=><label key={name} className="block text-sm">{label}<Input className="mt-2" name={name} aria-label={label} type={type} required={required} {...(type==='number'?{min:1,step:1}:{})}/></label>;
  const current=options.includes(kind)?kind:options[0];
  return <><PageTitle title={shipment.reference} my="ပို့ဆောင်မှု စီမံရန်"/><Badge>{human(shipment.status)}</Badge>
    <OrderCustomer shipmentId={id}/>
    {audience==='warehouse'&&shipment.direction==='outbound'&&<Card className="my-5"><h2 className="font-semibold">Outbound workflow</h2><p className="my-3">{external?'Verify destination → carrier handover with evidence → carrier status update. Stock is deducted at the first handover.':'Set destination → assign rider → rider accepts → warehouse picks and packs → rider records pickup → warehouse dispatches → arrival and proof → SME confirms receipt.'}</p><Link className="text-brand underline" href={`/warehouse/shipments/${id}`}>Shipment details{!external?' / Record pick, pack and dispatch':''} →</Link></Card>}
    {external?<Card className="my-5"><h2 className="font-semibold">External courier</h2><p className="mt-3">Carrier: {data.courier_name??'Awaiting confirmation'} · Waybill: {data.waybill??'Not supplied'}</p>{data.tracking_url&&safeLink(data.tracking_url)&&<a className="mt-3 inline-block text-brand underline" href={data.tracking_url} target="_blank" rel="noopener noreferrer">Courier tracking</a>}<p className="mt-3 text-sm text-muted">No internal GPS or promised ETA. Responsibility remains undetermined until evidence review.</p>{data.handovers.map(h=><p key={h.id} className="mt-3 text-sm">Accepted {dateTime(h.accepted_at)} · {h.package_count} packages · {h.package_condition}</p>)}</Card>:audience==='rider'?data.session_id&&!terminal&&<LiveTracking sessionId={data.session_id}/>:<LiveCourierTracking key={id} shipment={shipment}/>}
    {data.capacity.map(c=><Card key={c.id} className="my-4"><h2 className="font-semibold">Capacity confirmed</h2><p className="mt-2">{dateTime(c.scheduled_at)} · Yangon</p><p className="mt-2">{c.instructions}</p></Card>)}
    {audience==='rider'&&!external&&!terminal&&<CourierRoute key={id} shipmentId={id} accepted={!!assignment?.accepted_at}/>}
    {audience==='rider'&&assignment?.picked_up_at&&!external&&!terminal&&<LocationSharing assignmentId={assignment.id}/>}
    {audience==='rider'&&assignment&&!external&&!terminal&&!assignment.accepted_at&&<Card id="report-issue" className="my-5"><h2 className="font-semibold">Report issue</h2><p className="mt-3">Accept this assignment before reporting.</p></Card>}
    {audience==='rider'&&assignment?.accepted_at&&!external&&!terminal&&<RiderIssueReport key={assignment.id} shipmentId={id} evidence={shipment.evidence} refresh={resource.reload}/>}
    {audience==='warehouse'&&shipment.direction==='outbound'&&!terminal&&<DestinationPicker key={id} shipmentId={id}/>}
    <EvidenceUpload shipmentId={id} refresh={resource.reload}/>
    {audience==='warehouse'&&shipped&&!terminal&&<p className="my-4">For a failed delivery being returned, cancel the shipment first. Record stock only after the goods physically arrive back at the warehouse.</p>}
    {(!terminal||canReturn||command.pending)&&!demo&&<Card className="my-5"><h2 className="text-lg font-semibold">{canReturn?'Receive returned goods':'Delivery action'}</h2>{command.result&&<p role="status" className="my-3">Saved: {human(command.result.shipment.status)}</p>}{(error||command.error)&&<p role="alert" className="my-3">{error||command.error}</p>}{command.pending&&<Button disabled={command.busy} onClick={()=>void command.execute()}>Retry original delivery request</Button>}
      <form key={current==='return'?shipment.version:'delivery'} onSubmit={submit}><fieldset disabled={!command.ready||command.busy||!!command.pending} className="mt-4 min-w-0 max-w-full space-y-4"><label className="block">Operation<select aria-label="Delivery operation" className="mt-2 block w-full min-w-0 max-w-full rounded border p-2" value={current} onChange={e=>setKind(e.target.value as Kind)}>{options.map(option=><option key={option} value={option}>{human(option)}</option>)}</select></label>
      {current==='assign'&&<label className="block">Rider<select name="rider_id" aria-label="Rider" className="mt-2 block w-full min-w-0 max-w-full rounded border p-2" required><option value="">Select active rider</option>{data.riders.map(r=><option key={r.id} value={r.id}>{r.profile_id}</option>)}</select></label>}
      {['proof','handover','courier','return'].includes(current)&&<label className="block">Uploaded evidence<select aria-label="Delivery evidence" name="evidence_id" className="mt-2 block w-full min-w-0 max-w-full rounded border p-2" required><option value="">Select uploaded evidence</option>{shipment.evidence.filter(e=>e.verified).map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>}
      {current==='return'&&<><p>Enter quantities received this time. Damaged units are included in the returned total and go to quarantine.</p>{shipment.items.map(item=>{const total=data.returns?.find(t=>t.product_id===item.product_id);const remaining=item.expected_qty-(total?.received_qty??0);return <fieldset key={item.product_id} className="min-w-0 max-w-full space-y-3 rounded border p-3"><legend>{item.name} · Remaining {remaining}</legend><label className="block">Returned quantity<Input name={`received-${item.product_id}`} aria-label={`Returned quantity for ${item.name}`} type="number" min={0} max={remaining} step={1} defaultValue={0}/></label><label className="block">Damaged quantity<Input name={`damaged-${item.product_id}`} aria-label={`Returned damaged quantity for ${item.name}`} type="number" min={0} max={remaining} step={1} defaultValue={0}/></label></fieldset>;})}</>}
      {current==='proof'&&field('received_by','Receiver name')}
      {current==='confirm'&&<label className="block">Proof to confirm<select aria-label="Proof to confirm" name="proof_id" className="mt-2 block w-full min-w-0 max-w-full rounded border p-2" required><option value="">Select unconfirmed proof</option>{data.proofs.filter(p=>!p.confirmed_at).map(p=><option key={p.id} value={p.id}>{p.received_by}</option>)}</select></label>}
      {current==='handover'&&<>{field('courier_name','Carrier')}{field('waybill','Waybill')}{field('tracking_url','HTTPS tracking URL (optional)','url',false)}{field('accepted_at','Carrier accepted time (your local time)','datetime-local')}{field('package_condition','Package condition')}{field('package_count','Package count','number')}</>}
      {current==='courier'&&<label className="block">Verified courier status<select aria-label="Verified courier status" name="status" className="mt-2 block w-full min-w-0 max-w-full rounded border p-2">{['handed_over','delayed','failed','delivered'].map(status=><option key={status} value={status}>{human(status)}</option>)}</select></label>}
      {current==='capacity'&&<>{field('approval_id','Retry approval ID')}{field('scheduled_at','Confirmed retry time (your local time)','datetime-local')}</>}
      <label className="block">Physical verification note<textarea aria-label="Delivery note" name="note" className="mt-2 block min-h-24 w-full rounded border p-3" required maxLength={2000}/></label><Button type="submit" className="max-w-full whitespace-normal">Review and submit delivery action</Button></fieldset></form></Card>}
    <Card className="my-5"><h2 className="font-semibold">Shipment contents</h2>{shipment.items.length?shipment.items.map(item=><p key={item.product_id} className="mt-3">{item.name} · {item.expected_qty}</p>):<Empty/>}</Card></>;
}
export function safeLink(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!/\s/.test(value);}catch{return false;}}
