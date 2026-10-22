'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import {ApiError,type Schemas} from '../../shared/api';
import {Button,Card} from '../../shared/ui';
import {useSession} from '../auth/session';
import {useCommand} from '../warehouse/command';
import {Empty,ErrorPanel,Loading,PageTitle,human} from '../warehouse/shared';
import {usePolling} from './polling';
import {EvidenceUpload} from './evidence';

const issues: Array<[Schemas['CaseReport']['type'],string]> = [
  ['delivery_failed','Delivery failed'],
  ['recipient_unavailable','Recipient unavailable'],
  ['courier_delay','Delivery delayed'],
  ['transit_damage','Damage in transit'],
  ['quantity_mismatch','Quantity mismatch'],
  ['damaged_goods','Damaged goods'],
];
export function SMEReports(){
  const {api,smeId,warehouseId,demo}=useSession();
  const [shipmentId,setShipmentId]=useState('');
  const resource=usePolling(`${warehouseId}:${smeId}`,signal=>api!.getSMEOverview(smeId,signal));
  const base=demo?'/demo/sme':'/sme';
  if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
  if(!resource.data)return <Loading/>;
  return <><PageTitle title="Report Cases" my="ပြဿနာတင်ရန်နှင့် ကြည့်ရန်" description="Report an issue with your shipment and follow its investigation."/>
    <Card className="mb-5"><h2 className="text-lg font-semibold">New report</h2>
      {demo&&<p className="my-3 text-sm">Demo reports and orders stay in this browser session.</p>}
      {resource.data.shipments.length?<label className="mt-4 block">Select your shipment<select className="mt-2 block min-h-11 w-full rounded-lg border bg-white px-3" value={shipmentId} onChange={e=>setShipmentId(e.target.value)}><option value="">Select your shipment</option>{resource.data.shipments.map(s=><option key={s.id} value={s.id}>{s.reference} · {human(s.status)}</option>)}</select></label>:<Empty text="No shipments available to report."/>}
    </Card>
    {shipmentId&&<SMEReportForm key={`${warehouseId}:${smeId}:${shipmentId}`} shipmentId={shipmentId}/>}
    <Card><h2 className="text-lg font-semibold">Reported cases</h2>{resource.data.cases.length?<ul>{resource.data.cases.map(c=><li key={c.id} className="mt-4 border-t py-3"><Link className="text-brand underline" href={`${base}/exceptions/${c.id}`}>{human(c.type)} · {c.id}</Link><p data-user-content className="mt-2 whitespace-pre-wrap break-words">{c.summary}</p><p className="mt-2 text-sm">{human(c.status)} · {resource.data!.shipments.find(s=>s.id===c.shipment_id)?.reference??c.shipment_id}</p></li>)}</ul>:<Empty text="No cases yet."/>}</Card>
  </>;
}
function SMEReportForm({shipmentId}:{shipmentId:string}){
  const {api,identity,warehouseId,smeId,demo}=useSession();
  const router=useRouter();
  const [type,setType]=useState<Schemas['CaseReport']['type']>('delivery_failed');
  const [stage,setStage]=useState<Schemas['CaseReport']['stage']>('outbound');
  const [note,setNote]=useState(''),[evidence,setEvidence]=useState(''),[review,setReview]=useState(false);
  const resource=usePolling(`${warehouseId}:${smeId}:${shipmentId}`,async signal=>{
    const s=await api!.getTrackingShipment(shipmentId,signal);
    if(s.sme_id!==smeId||s.warehouse_id!==warehouseId)throw new ApiError(403,'FORBIDDEN','Shipment unavailable for this SME.');
    return s;
  });
  const command=useCommand<Schemas['CaseReport'],Schemas['CaseDetail']>(`parcelcare.sme-report.${demo?'demo':'live'}.${identity!.actor_id}.${warehouseId}.${smeId}.${shipmentId}`,async(body,key)=>{
    const c=await api!.reportCase(body,key);
    if(c.sme_id!==smeId||c.warehouse_id!==warehouseId)throw new ApiError(502,'INVALID_RESPONSE','Case ownership could not be verified. Retry the same request.');
    return c;
  },()=>resource.reload());
  useEffect(()=>{if(command.result)router.push(`${demo?'/demo/sme':'/sme'}/exceptions/${command.result.id}`);},[command.result,demo,router]);
  if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
  if(!resource.data)return <Loading/>;
  const shipment=resource.data;
  if(command.result)return <Card className="mb-5"><p role="status">Report submitted. Case reference: <span data-user-content>{command.result.id}</span></p><Link className="mt-3 inline-flex min-h-11 text-brand underline" href={`${demo?'/demo/sme':'/sme'}/exceptions/${command.result.id}`}>Open case →</Link></Card>;
  return <><Card className="mb-5"><h2 className="font-semibold">{shipment.reference} · Report details</h2>
    {command.error&&<p role="alert" className="my-3">{command.error}</p>}
    {command.pending&&<section className="my-4 space-y-3"><p>Submission awaiting confirmation. Retry the saved report before creating another.</p><p data-user-content className="whitespace-pre-wrap break-words">{command.pending.body.note}</p><Button disabled={command.busy||!command.ready} onClick={()=>void command.execute()}>Retry same report</Button></section>}
    <form onSubmit={e=>{e.preventDefault();if(!note.trim())return;if(!review){setReview(true);return;}void command.execute({shipment_id:shipmentId,stage,type,note:note.trim(),evidence_ids:evidence?[evidence]:[]});}}>
      <fieldset disabled={!command.ready||command.busy||!!command.pending} className="mt-4 space-y-4">
        <label className="block">Issue<select className="mt-2 block min-h-11 w-full rounded border bg-white px-3" value={type} onChange={e=>{setType(e.target.value as typeof type);setReview(false);}}>{issues.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block">Stage<select className="mt-2 block min-h-11 w-full rounded border bg-white px-3" value={stage} onChange={e=>{setStage(e.target.value as typeof stage);setReview(false);}}><option value="inbound">Inbound delivery</option><option value="warehouse">Warehouse storage</option><option value="outbound">Outbound delivery</option></select></label>
        <label className="block">Description<textarea required maxLength={2000} className="mt-2 block min-h-24 w-full rounded border p-3" value={note} onChange={e=>{setNote(e.target.value);setReview(false);}}/></label>
        <label className="block">Evidence (optional)<select className="mt-2 block min-h-11 w-full rounded border bg-white px-3" value={evidence} onChange={e=>{setEvidence(e.target.value);setReview(false);}}><option value="">No evidence attached</option>{shipment.evidence.filter(e=>e.verified).map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
        {review&&<section aria-label="Report review" className="space-y-2 rounded border p-4"><h3 className="font-semibold">Review report</h3><p>{shipment.reference} · {human(stage)}</p><p>{issues.find(([value])=>value===type)?.[1]}</p><p data-user-content className="whitespace-pre-wrap break-words">{note.trim()}</p><p>{shipment.evidence.find(e=>e.id===evidence)?.label??'No evidence attached'}</p><Button type="button" variant="outline" onClick={()=>setReview(false)}>Back to edit</Button></section>}
        <Button type="submit" disabled={!note.trim()}>{command.busy?'Submitting…':review?'Submit report':'Review report'}</Button>
      </fieldset>
    </form>
  </Card>{!command.pending&&<EvidenceUpload shipmentId={shipmentId} refresh={resource.reload}/>}</>;
}
