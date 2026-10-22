'use client';
import {useState} from 'react';
import {useSession} from '../auth/session';
import {ApiError,type Schemas} from '../../shared/api';
import {Badge,Button,Card} from '../../shared/ui';
import {useCommand} from '../warehouse/command';

export function CaseRiskControls({detail,refresh}:{detail:Schemas['CaseDetail'];refresh:()=>void}){
 const {api,identity}=useSession();
 const context=detail.risk_context??{};
 const [perishability,setPerishability]=useState(String(context.perishability??'unknown'));
 const [value,setValue]=useState(context.order_value_mmk==null?'':String(context.order_value_mmk));
 const [impact,setImpact]=useState(String(context.operational_impact??'unknown'));
 const [note,setNote]=useState('');const [priority,setPriority]=useState('automatic');
 const owner=identity?.memberships.some(m=>m.warehouse_id===detail.warehouse_id&&m.role==='owner');
 const command=useCommand<Schemas['CaseRiskCommand'],Schemas['CaseDetail']>(`parcelcare.risk.${identity!.actor_id}.${detail.id}`,async(body,key)=>{
  const result=await api!.updateCaseRisk(detail.id,body,key);
  if(result.id!==detail.id||result.version<=body.expected_version)throw new ApiError(502,'INVALID_RESPONSE','Risk update unconfirmed. Retry the saved request.');
  return result;
 },refresh);
 const send=(body:Pick<Schemas['CaseRiskCommand'],'kind'>&Partial<Schemas['CaseRiskCommand']>)=>{
  if(!note.trim())return;
  void command.execute({expected_version:detail.version,source_version:detail.source_version,note:note.trim(),evidence_ids:[],...body});
 };
 const classification=detail.priority_classification??{};
 return <Card className="my-5"><h2 className="font-semibold">Risk, priority and escalation</h2>
 <p className="mt-2">Priority: {detail.priority}{detail.priority_override?' (manager override)':' (automatic)'}</p>
 {detail.escalated&&<p className="mt-2"><Badge>Escalated</Badge> {detail.escalation_reason}</p>}
 <p className="mt-2 text-sm">Classification score: {String(classification.score??'Not recorded')}. Policy: {String(classification.policy_version??'Not recorded')}.</p>
 {classification.reasons&&typeof classification.reasons==='object'?<details className="mt-2 text-sm"><summary>Priority score contributions</summary>{Object.entries(classification.reasons).map(([factor,score])=><p key={factor}>{factor.replaceAll('_',' ')}: {String(score)}</p>)}</details>:null}
 <p className="mt-2 text-sm">Verify missing attributes: {Array.isArray(classification.missing_attributes)&&classification.missing_attributes.length?classification.missing_attributes.join(', '):'None recorded'}.</p>
 {command.error&&<p role="alert">{command.error}</p>}{command.result&&<p role="status">Risk update saved.</p>}
 {command.pending&&<Button disabled={command.busy} onClick={()=>void command.execute()}>Retry saved risk update</Button>}
 {!['closed','resolved'].includes(detail.status)&&<form onSubmit={e=>{e.preventDefault();send({kind:'context',context:{perishability:perishability as Schemas['RiskContext']['perishability'],order_value_mmk:value===''?null:Number(value),operational_impact:impact as Schemas['RiskContext']['operational_impact']}});}}>
 <fieldset disabled={!command.ready||command.busy||!!command.pending} className="mt-4 space-y-4">
 <p className="text-sm">Record verified shipment facts. Leave uncertain values unknown. Saving these facts recalculates automatic priority; manager overrides remain in place.</p>
 <label className="block">Perishability<select className="field mt-2" value={perishability} onChange={e=>setPerishability(e.target.value)}><option value="unknown">Unknown — verify</option><option value="perishable">Perishable</option><option value="non_perishable">Non-perishable</option></select></label>
 <label className="block">Order value (MMK)<input className="field mt-2" type="number" min="0" max="1000000000000" step="1" value={value} onChange={e=>setValue(e.target.value)}/></label>
 <label className="block">Operational impact<select className="field mt-2" value={impact} onChange={e=>setImpact(e.target.value)}>{['unknown','minor','moderate','severe'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
 <label className="block">Verification or change reason<textarea className="field mt-2" required maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <Button type="submit">Save verified risk facts</Button>
 {owner&&<><label className="block">Manager priority<select className="field mt-2" value={priority} onChange={e=>setPriority(e.target.value)}>{['automatic','low','normal','high','critical'].map(p=><option key={p} value={p}>{p}</option>)}</select></label>
 <Button type="button" disabled={!note.trim()} onClick={()=>send({kind:'priority',priority:priority as Schemas['CaseRiskCommand']['priority']})}>Apply priority choice</Button>
 <Button type="button" disabled={!note.trim()} onClick={()=>send({kind:'escalation',escalated:!detail.escalated})}>{detail.escalated?'Clear escalation':'Escalate case'}</Button></>}
 </fieldset></form>}</Card>;
}
