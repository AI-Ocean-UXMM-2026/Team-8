'use client';
import Link from 'next/link';
import './exceptions.css';
import { useEffect, useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Button, Card } from '../../shared/ui';
import { type WarehouseCase, type WarehouseCaseAction } from '../../shared/api/case-workflow';
import { useCommand } from './command';
import { dateTime, ErrorPanel, human, Loading, PageTitle, useResource } from './shared';
import { CaseSLAPanel } from '../sla/sla';
import { CaseDetail } from './case-detail';

export function CaseInvestigation({ id }: { id: string }) {
  const { api, warehouseId, demo } = useSession();
  const resource = useResource(`${warehouseId}:${id}`, signal => api!.getWarehouseCase(id, warehouseId, signal));
  const base = demo ? '/demo/warehouse' : '/warehouse';
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  return <><Link href={`${base}/exceptions`} className="text-sm text-brand underline">← Open cases</Link>
    <PageTitle title="Case investigation" my="အမှုစုံစမ်းစစ်ဆေးမှု" description={id} />
    <CaseSLAPanel id={id}/>
    <CaseActions key={`${warehouseId}:${id}`} detail={resource.data} refresh={resource.reload} />
    <details className="mt-6 rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">Evidence, analysis and verification</summary><div className="mt-5"><CaseDetail id={id} embedded onChanged={resource.reload} /></div></details>
  </>;
}
function CaseActions({ detail, refresh }: { detail: WarehouseCase; refresh: () => void }) {
  const { api, demo, identity, warehouseId } = useSession();
  const base = demo ? '/demo/warehouse' : '/warehouse';
  const [action, setAction] = useState<WarehouseCaseAction['action']>('update_workflow');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const command = useCommand<WarehouseCaseAction, WarehouseCase>(`parcelcare.command.${demo?'demo':'live'}.${identity!.actor_id}.${detail.id}.case`,
    (body,key) => api!.recordCaseAction(detail.id,body,{idempotencyKey:key,warehouseId}),refresh);
  useEffect(()=>{if(command.result){setNote('');setConfirmed(false)}},[command.result]);
  const current = command.result && command.result.version > detail.version ? command.result : detail;
  const policyVersion = Number(current.source_version.split(':')[2]);
  const terminal = ['closed','resolved'].includes(current.status);
  return <div className="exceptionWorkspace caseDetailGrid"><div className="caseInvestigationBody"><Card><p className="caseEyebrow">Investigation</p>
    <h2 className="mt-5 font-semibold">What happened</h2><p className="mt-2 text-sm" data-user-content>{current.summary}</p>
    <p className="mt-3 text-sm">Review: {current.handling_mode} · Responsible party: {current.responsible_party}</p>
    <Link className="mt-4 inline-block text-sm text-brand underline" href={`${base}/shipments/${current.shipment_id}`}>Review shipment and evidence →</Link>
    <h3 className="mt-5 font-semibold">Required checks</h3><ul className="mt-2 list-disc pl-5 text-sm">{current.required_facts.map(f=><li key={f}>{human(f)}</li>)}</ul>
    <p className="mt-4 text-sm text-muted">A note does not verify a physical fact or close the case. Stock and delivery status are unchanged by these actions.</p>
    {demo && <p className="mt-3 text-sm text-muted">Demo actions are saved in this tab. Information requests do not send external messages.</p>}
  </Card><Card className="mt-5"><h2 className="font-semibold">Evidence references</h2><p className="mt-2 text-sm text-muted">Recorded references only. Upload status does not confirm the contents.</p>{current.evidence.length?<ul className="caseEvidence">{current.evidence.map(e=><li key={e.id}><span className="exceptionReference" data-user-content>{e.id}</span><Badge>{e.uploaded?'Uploaded':'Upload pending'}</Badge></li>)}</ul>:<p className="mt-4 text-sm text-muted">No evidence references recorded.</p>}</Card><Card className="mt-5"><h2 className="font-semibold">Case history</h2>{current.events.length ? <ol className="caseTimeline">{current.events.map(e=><li key={e.id}><p className="text-sm font-semibold">{human(e.type)} · {e.actor_type}</p><p className="mt-2 text-sm" data-user-content>{typeof e.payload.note==='string'?e.payload.note:''}</p><time className="text-xs text-muted" dateTime={e.created_at}>{dateTime(e.created_at)}</time></li>)}</ol> : <p className="mt-3 text-sm text-muted">No investigation actions recorded yet.</p>}</Card></div><aside className="caseDecisionRail"><Card><h2 className="font-semibold">Case context</h2><dl className="caseContext">{[['Issue',human(current.type)],['Priority',human(current.priority)],['Case status',human(current.status)],['Review',human(current.handling_mode)],['Responsible party',human(current.responsible_party)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Card><Card className="mt-5"><h2 className="font-semibold">Investigation action</h2>
    {command.error && <p role="alert" className="mt-3 text-sm text-red-700">{command.error}</p>}
    {command.result && <p role="status" className="mt-3 text-sm">Case action recorded.</p>}
    {command.pending ? <div className="mt-4"><p className="text-sm">The submission outcome is unconfirmed. Retry the saved request before taking another action.</p><Button className="mt-3" disabled={command.busy||!command.ready} onClick={()=>void command.execute()}>Retry case action</Button></div> : terminal ? <p className="mt-3 text-sm">This case is finalized. Further investigation actions are unavailable.</p> : policyVersion<1 ? <p role="alert" className="mt-3 text-sm">No active policy. Ask a manager to configure the SME policy before recording actions.</p> :
      <form className="mt-4 space-y-4" onSubmit={e=>{e.preventDefault();if(!confirmed||!note.trim())return;void command.execute({action,note:note.trim(),expected_version:current.version,source_version:current.source_version,policy_version:policyVersion,evidence_ids:[],...(action==='update_workflow'?{status:'investigating' as const}:{})});}}>
        <fieldset disabled={command.busy||!command.ready} className="space-y-4"><div><label htmlFor="case-action" className="block text-sm">Next action</label><select id="case-action" className="field mt-2" value={action} onChange={e=>{setAction(e.target.value as WarehouseCaseAction['action']);setConfirmed(false);}}>
          <option value="update_workflow">Start investigation</option><option value="save_summary">Update case summary</option><option value="request_information">Request SME information</option><option value="escalate">Escalate for human review</option>
        </select></div><label className="block text-sm">Investigation note<textarea className="field mt-2" required maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} /></label>
        <label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required />I reviewed the shipment and confirm this action.</label><Button type="submit">Record case action</Button></fieldset>
      </form>}
  </Card><p className="casePolicyNote">SME approval is needed for a proposed return, disposal, partial shipment or additional charge. Routine investigation does not need SME approval.</p></aside></div>;
}
