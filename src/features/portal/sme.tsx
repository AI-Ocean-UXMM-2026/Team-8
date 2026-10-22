'use client';
import { safeError } from '../../shared/i18n/errors';
import Link from 'next/link';
import { useState } from 'react';
import './sme.css';
import '../warehouse/shipments.css';
import '../warehouse/overview.css';
import { useSession } from '../auth/session';
import { ShipmentStatus } from '../warehouse/shipment-status';
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
  const { api, smeId, warehouseId, demo } = useSession();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState('');
  const [generateError, setGenerateError] = useState('');
  async function generateOrder() {
    if (!demo || generating) return;
    setGenerating(true); setGenerateError(''); setGenerated('');
    try {
      const catalog=await api!.getWarehouseCatalog(warehouseId);const item=catalog.find(p=>p.available_qty>=1);
      if(!item)throw new Error('No warehouse stock available.');
      const profile=await api!.getSMEDeliveryProfile(warehouseId,smeId);
      const order=await api!.submitOrder({warehouse_id:warehouseId,sme_id:smeId,order_kind:'sme_self_delivery',customer_name:profile?.recipient_name??'Demo SME shop',customer_phone:profile?.recipient_phone??'09123456789',address:profile?.address??'Demo SME shop, Yangon',latitude:profile?.latitude??16.8409,longitude:profile?.longitude??96.1735,maps_url:profile?.maps_url??'',notes:'Fictitious demo delivery to SME',lines:[{product_id:item.id,expected_qty:1}]},crypto.randomUUID());
      setGenerated(`ORD-${order.id.slice(0,8)} · Warehouse → SME · Awaiting warehouse approval`);
      resource.reload();
    } catch (error) { setGenerateError(error instanceof Error ? error.message : 'Demo order could not be saved.'); }
    finally { setGenerating(false); }
  }
  const resource = usePolling(smeId, async signal => {const [overview,catalog]=await Promise.all([api!.getSMEOverview(smeId,signal),api!.getWarehouseCatalog(warehouseId,signal)]);return {...overview,catalog};});
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const data = resource.data;
  return <><PageTitle title="SME dashboard" my="မိမိလုပ်ငန်း အခြေအနေ" description="Your stock, shipments and decisions. Updates refresh automatically while this page is visible." />
    {demo&&<Card className="mb-5"><h2 className="text-lg font-semibold">Warehouse → SME · Yangon</h2><p className="my-3">Demo warehouse stock is delivered to your SME shop in Yangon. Saved in this browser session.</p><Button type="button" disabled={generating} onClick={()=>void generateOrder()}>{generating?'Generating…':'Generate demo order'}</Button>{generated&&<p role="status" className="mt-3">{generated}</p>}{generateError&&<p role="alert" className="mt-3">{generateError}</p>}</Card>}
    <Card className="mb-5"><h2 className="text-lg font-semibold">Order warehouse stock for your SME</h2><Link className="mt-3 inline-flex min-h-11 items-center text-brand underline" href={demo?'/demo/sme/orders':'/sme/orders'}>Create delivery order →</Link><Link className="mt-3 flex min-h-11 items-center text-brand underline" href={demo?'/demo/sme/reports':'/sme/reports'}>Report Cases →</Link></Card>
    <div className="warehouseSummaryGrid smeSummaryGrid" aria-label="SME summary">{[
      {label:'Products',value:data.catalog.length,href:'#sme-stock',action:'View warehouse stock'},
      {label:'Shipments',value:data.shipments.length,href:'#sme-shipments',action:'View your shipments'},
      {label:'Decisions needed',value:data.approvals.filter(a=>a.status==='pending').length,href:'#sme-cases',action:'Review related cases'},
    ].map(({label,value,href,action})=><a key={label} href={href} className={`warehouseSummaryCard ${label==='Decisions needed'&&Number(value)>0?'warehouseSummaryAttention':''}`}><span className="warehouseSummaryLabel">{label}</span><strong className="warehouseSummaryNumber">{value}</strong><span className="warehouseSummaryAction">{action} →</span></a>)}</div>
    <Card className="mb-5"><h2 className="text-lg font-semibold">Track your deliveries</h2><p className="mt-3 text-sm">View GPS locations for your shipments only, with last-updated and stale-location indicators.</p><Link className="mt-4 inline-flex min-h-11 items-center text-brand underline" href={demo?'/demo/sme/tracking':'/sme/tracking'}>Open shipment tracking →</Link></Card>
    <div className="smeDashboardGrid">
    <Card id="sme-stock"><h2 className="text-lg font-semibold">Available warehouse stock</h2>{data.catalog.length ? <div className="smeTableScroll" tabIndex={0} role="region" aria-label="Available warehouse stock"><table className="smeTable"><thead><tr><th scope="col">Product</th><th scope="col">SKU</th><th scope="col">Available</th></tr></thead><tbody>{data.catalog.map(item=><tr key={item.id}><td data-user-content>{item.name}</td><td data-user-content>{item.sku}</td><td>{item.available_qty}</td></tr>)}</tbody></table></div> : <Empty text="No products recorded yet." />}</Card>
    <Card id="sme-shipments"><h2 className="text-lg font-semibold">Shipments</h2>{data.shipments.length ? <div className="smeTableScroll" tabIndex={0} role="region" aria-label="Shipments"><table className="smeTable"><thead><tr><th scope="col">Reference</th><th scope="col">Direction</th><th scope="col">Status</th></tr></thead><tbody>{data.shipments.map(item=><tr key={item.id}><td>{demo&&item.direction==='inbound'?<span>{item.reference}</span>:<Link className="text-brand underline" href={demo?'/demo/sme/tracking':`/sme/shipments/${item.id}`}>{item.reference}</Link>}</td><td>{human(item.direction)}</td><td><ShipmentStatus status={item.status}/></td></tr>)}</tbody></table></div> : <Empty text="No shipments yet." />}</Card>
    <Card className="smeCases" id="sme-cases"><h2 className="text-lg font-semibold">Report Cases · ပြဿနာများ</h2><Link className="inline-flex min-h-11 items-center text-brand underline" href={demo?'/demo/sme/reports':'/sme/reports'}>New report / View all cases →</Link>{data.cases.length ? <ul className="smeCaseGrid">{data.cases.map(item=><li key={item.id} className="mt-4 border-t pt-3"><Link className="text-brand underline" href={`${demo?'/demo/sme':'/sme'}/exceptions/${item.id}`}>{human(item.type)}</Link><p className="mt-2 text-sm">{item.summary} · {human(item.status)}</p></li>)}</ul> : <Empty text="No cases yet." />}</Card>
    </div></>;
}

export function SMECase({ id }: { id: string }) {
  const { api, smeId, demo } = useSession();
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
    {!demo&&<CaseControls detail={detail} refresh={resource.reload} sme />}<EvidenceUpload shipmentId={detail.shipment_id} refresh={resource.reload} />
    <Card><h2 className="font-semibold">Evidence downloads</h2>{detail.evidence.filter((e): e is typeof e & {id:string} => e.uploaded === true && typeof e.id === 'string').map(e=><div className="mt-3" key={e.id}><EvidenceDownload id={e.id} /></div>)}</Card></>;
}

export function Notifications() {
  const { api, smeId } = useSession(); const [error,setError] = useState(''); const [busy,setBusy] = useState('');
  const resource = usePolling(smeId,signal=>api!.listNotifications(smeId,signal));
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  return <><PageTitle title="Notifications" my="အကြောင်းကြားချက်များ" />{error && <p role="alert">{error}</p>}{resource.data.length ? resource.data.map(item=><Card key={item.id} className="mb-4"><Badge>{item.read ? 'Read' : 'Unread'}</Badge><p className="my-3 whitespace-pre-wrap">{item.message}</p><p className="mb-3 text-xs text-muted-foreground">{dateTime(item.created_at)} · Yangon</p><Link className="mr-4 text-brand underline" href={`/sme/exceptions/${item.case_id}`}>Open case</Link><Button variant="outline" disabled={!!busy} onClick={async()=>{setBusy(item.id);setError('');try{await api!.setNotificationRead(item.id,!item.read);resource.reload();}catch(e){setError(safeError(e));}finally{setBusy('');}}}>{item.read ? 'Mark unread' : 'Mark read'}</Button></Card>) : <Card><Empty text="No notifications." /></Card>}</>;
}
