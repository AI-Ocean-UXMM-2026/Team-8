'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Button, Card, Input } from '../../shared/ui';
import { Empty, ErrorPanel, human, Loading, PageTitle, Pagination, useFilters, useResource } from './shared';
import './exceptions.css';
const priorityOrder = ['critical','high','normal','low'];
export function Cases() {
  const { api, warehouseId, demo, identity } = useSession(); const { params, set } = useFilters(); const cursor = params.get('cursor') || '';
  const priority=params.get('priority')||''; const scope=params.get('scope')==='all'?'all':'open';
  const [search,setSearch]=useState(''),[stage,setStage]=useState('all'),[sort,setSort]=useState('priority');
  const resource = useResource(`${warehouseId}:${params.toString()}`, async signal => {
    const page=await api!.listCases({ warehouseId, status: scope, cursor, limit: 20, signal, issueType:params.get('type')||undefined, priority:priority||undefined, mode:params.get('mode')||undefined, state:params.get('state')||undefined, owner:params.get('owner')||undefined });
    const shipments=await Promise.allSettled([...new Set(page.items.map(c=>c.shipment_id))].map(id=>api!.getShipment(id,signal,warehouseId)));
    const references:Record<string,string>={};shipments.forEach(result=>{if(result.status==='fulfilled')references[result.value.id]=result.value.reference;});
    return {...page,references};
  });
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const items=resource.data.items;
  const visible=items.filter(c=>(stage==='all'||c.stage===stage)&&[c.id,c.shipment_id,resource.data!.references[c.shipment_id],c.type,c.summary].join(' ').toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>sort==='priority'?priorityOrder.indexOf(a.priority)-priorityOrder.indexOf(b.priority):a.id.localeCompare(b.id));
  const fields = [
    ['scope','Case scope',['open','all']],
    ['type','Issue type',['quantity_mismatch','damaged_goods','missing_stock','wrong_pick','short_pick','courier_delay','delivery_failed','recipient_unavailable','transit_damage','transit_loss']],
    ['mode','Handling mode',['ai','human']],
    ['owner','Owner',['unassigned',identity!.actor_id]],
    ['state','Case state',['new','investigating','processing','awaiting_information','awaiting_sme_decision','awaiting_courier_confirmation','awaiting_verification','resolved','closed']],
  ] as const;
  return <div className="exceptionWorkspace"><PageTitle title="Open cases" my="မဖြေရှင်းရသေးသော ကိစ္စများ" description="Review the issue, inspect its evidence and take the next permitted action." />
    <div className="exceptionMetrics" aria-label="Current page summary">{[['Matching cases',visible.length],['High / critical',visible.filter(c=>['high','critical'].includes(c.priority)).length],['Awaiting SME decision',visible.filter(c=>c.status==='awaiting_sme_decision').length]].map(([label,value])=><Card key={label} className={label==='High / critical'?'criticalMetric':undefined}><p className="text-sm text-muted-foreground">{label}</p><strong className="mt-2 block text-2xl">{value}</strong></Card>)}</div>
    <Card className="mt-5"><div className="exceptionToolbar"><label>Search cases<Input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Case, shipment or issue" /></label><label><span>Priority</span><select aria-label="Priority" className="field" value={priority} onChange={e=>set('priority',e.target.value)}><option value="">All priorities</option>{priorityOrder.map(p=><option key={p} value={p}>{human(p)}</option>)}</select></label><label><span>Stage</span><select aria-label="Stage" className="field" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">All stages</option>{['inbound','warehouse','outbound'].map(p=><option key={p} value={p}>{human(p)}</option>)}</select></label><label><span>Sort by</span><select aria-label="Sort by" className="field" value={sort} onChange={e=>setSort(e.target.value)}><option value="priority">Highest priority first</option><option value="reference">Case reference</option></select></label><Button variant="outline" onClick={()=>{setSearch('');for(const key of ['scope','type','priority','mode','state','owner'])set(key,'');setStage('all');setSort('priority')}}>Clear filters</Button></div>
    <div className="mt-4 flex flex-wrap gap-4">{fields.map(([key,label,options])=><label key={key} className="grid gap-2 text-sm">{label}<select aria-label={label} className="field" value={key==='scope'?scope:params.get(key)||''} onChange={e=>set(key,e.target.value)}>{key!=='scope'&&<option value="">All</option>}{options.map(value=><option key={value} value={value}>{value===identity!.actor_id?'Assigned to me':human(value)}</option>)}</select></label>)}</div>
    <p className="mt-4 text-xs text-muted-foreground" role="status">{visible.length} of {items.length} cases on this page. Case filters apply before pagination. Search, stage and sorting apply to this page. Priority and handling do not grant approval.</p>
    <div className="exceptionTableWrap"><table className="exceptionTable"><caption className="sr-only">Open warehouse cases</caption><thead><tr>{['Case / Shipment','Issue','Stage','Priority','Case status','Actions'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(item=><tr key={item.id}><td data-label="Case / Shipment"><div className="caseIdTools"><span className="caseFullId" title={item.id} data-user-content>{item.id}</span><button type="button" className="caseCopy" aria-label={`Copy case ID ${item.id}`} onClick={()=>void navigator.clipboard.writeText(item.id).catch(()=>{})}>Copy</button></div><Link className="text-xs text-brand underline" href={`${demo?'/demo/warehouse':'/warehouse'}/shipments/${item.shipment_id}`} title={item.shipment_id}><span data-user-content>{resource.data!.references[item.shipment_id]||item.shipment_id}</span></Link></td><td data-label="Issue"><Link className="font-semibold text-brand underline" href={`${demo?'/demo/warehouse':'/warehouse'}/exceptions/${item.id}`}>{human(item.type)}</Link><p className="mt-2 text-sm text-muted-foreground" data-user-content>{item.summary}</p></td><td data-label="Stage">{human(item.stage)}</td><td data-label="Priority"><Badge className={`casePriority casePriority-${item.priority}`}>{human(item.priority)}</Badge></td><td data-label="Case status"><Badge className="caseStatusBadge">{human(item.status)}</Badge></td><td data-label="Actions"><Link className="exceptionOpen text-brand" href={`${demo?'/demo/warehouse':'/warehouse'}/exceptions/${item.id}`}>Investigate case →</Link></td></tr>)}</tbody></table></div>
    {!visible.length&&<Empty text={search||stage!=='all'||params.size?'No cases match these filters.':'No open cases.'} />}<Pagination cursor={cursor} nextCursor={resource.data.next_cursor} set={set} /></Card></div>;
}
