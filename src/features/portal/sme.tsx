'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Button, Card } from '../../shared/ui';
import { ApiError, type Schemas } from '../../shared/api';
import type { Approval } from '../../shared/api/domain';
import { CasePanels, caseView } from '../exceptions';
import { CaseControls } from '../exceptions/controls';
import { dateTime, Empty, ErrorPanel, human, Loading, PageTitle } from '../warehouse/shared';
import { usePolling } from './polling';
import { DecisionForm } from './decision';
import { EvidenceUpload, EvidenceDownload } from './evidence';

export function SMEDashboard() {
  const { api, smeId, demo } = useSession();
  const resource = usePolling(smeId, signal => api!.getSMEOverview(smeId,signal));
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const data = resource.data;
  return <><PageTitle title="SME dashboard" my="မိမိလုပ်ငန်း အခြေအနေ" description="Your stock, shipments and decisions. Updates refresh automatically while this page is visible." />
    <div className="mb-5 grid gap-4 sm:grid-cols-3">{[['Product records',data.inventory.length],['Shipments',data.shipments.length],['Pending decisions',data.approvals.filter(a=>a.status==='pending').length]].map(([label,value])=><Card key={label}><h2>{label}</h2><p className="mt-3 text-3xl font-semibold">{value}</p></Card>)}</div>
    <Card className="mb-5"><h2 className="text-lg font-semibold">Track your deliveries</h2><p className="mt-3 text-sm">View GPS locations for your shipments only, with last-updated and stale-location indicators.</p><Link className="mt-4 inline-flex min-h-11 items-center text-brand underline" href={demo?'/demo/sme/tracking':'/sme/tracking'}>Open shipment tracking →</Link></Card>
    <Card className="mb-5"><h2 className="text-lg font-semibold">Own stock / မိမိပစ္စည်းစာရင်း</h2>{data.inventory.length ? <ul>{data.inventory.map(item=><li key={item.id} className="mt-4 border-t pt-3">{item.name} · {item.sku}<p className="mt-2 text-sm">Available: {item.available_qty} · Quarantined: {item.quarantined_qty}</p></li>)}</ul> : <Empty />}</Card>
    <Card className="mb-5"><h2 className="text-lg font-semibold">Shipments / ပို့ဆောင်မှု</h2>{data.shipments.length ? <ul>{data.shipments.map(item=><li key={item.id} className="mt-4 flex flex-wrap justify-between gap-3 border-t pt-3">{demo&&item.direction==='inbound'?<span>{item.reference}</span>:<Link className="text-brand underline" href={demo?'/demo/sme/tracking':`/sme/shipments/${item.id}`}>{item.reference}</Link>}<Badge>{human(item.status)}</Badge></li>)}</ul> : <Empty />}</Card>
    <Card><h2 className="text-lg font-semibold">Cases / ကိစ္စများ</h2>{data.cases.length ? <ul>{data.cases.map(item=><li key={item.id} className="mt-4 border-t pt-3"><Link className="text-brand underline" href={`/sme/exceptions/${item.id}`}>{human(item.type)}</Link><p className="mt-2 text-sm">{item.summary} · {human(item.status)}</p></li>)}</ul> : <Empty />}</Card></>;
}

export function SMECase({ id }: { id: string }) {
  const { api, smeId } = useSession();
  const resource = usePolling(`${smeId}:${id}`, async signal => {
    const raw = await api!.getCase(id,signal);
    if (!('version' in raw) || raw.id !== id || raw.sme_id !== smeId) throw new ApiError(403,'FORBIDDEN','Case unavailable for this SME.');
    return raw;
  });
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const detail = resource.data;
  return <><PageTitle title={human(detail.type)} my="မိမိလုပ်ငန်း ကိစ္စအသေးစိတ်" /><CasePanels item={caseView(detail)} />
    {detail.approvals.filter((a): a is typeof a & Approval => typeof a.id === 'string' && typeof a.case_id === 'string' && Array.isArray(a.options)).map((approval) => <DecisionForm key={approval.id} approval={approval} refresh={resource.reload} />)}
    <CaseControls detail={detail} refresh={resource.reload} sme /><EvidenceUpload shipmentId={detail.shipment_id} refresh={resource.reload} />
    <Card><h2 className="font-semibold">Evidence downloads</h2>{detail.evidence.filter((e): e is typeof e & {id:string} => e.uploaded === true && typeof e.id === 'string').map(e=><div className="mt-3" key={e.id}><EvidenceDownload id={e.id} /></div>)}</Card></>;
}

export function Notifications() {
  const { api, smeId } = useSession(); const [error,setError] = useState(''); const [busy,setBusy] = useState('');
  const resource = usePolling(smeId,signal=>api!.listNotifications(smeId,signal));
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  return <><PageTitle title="Notifications" my="အကြောင်းကြားချက်များ" />{error && <p role="alert">{error}</p>}{resource.data.length ? resource.data.map(item=><Card key={item.id} className="mb-4"><Badge>{item.read ? 'Read' : 'Unread'}</Badge><p className="my-3 whitespace-pre-wrap">{item.message}</p><p className="mb-3 text-xs text-muted-foreground">{dateTime(item.created_at)} · Yangon</p><Link className="mr-4 text-brand underline" href={`/sme/exceptions/${item.case_id}`}>Open case</Link><Button variant="outline" disabled={!!busy} onClick={async()=>{setBusy(item.id);setError('');try{await api!.setNotificationRead(item.id,!item.read);resource.reload();}catch(e){setError(e instanceof Error ? e.message : 'Unable to update notification.');}finally{setBusy('');}}}>{item.read ? 'Mark unread' : 'Mark read'}</Button></Card>) : <Card><Empty text="No notifications." /></Card>}</>;
}
