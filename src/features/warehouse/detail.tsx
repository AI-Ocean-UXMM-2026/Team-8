'use client';
import Link from 'next/link';
import {LiveCourierTracking} from '../tracking/live-tracking';
import './shipments.css';
import { ShipmentStatus, shipmentStatusHelp } from './shipment-status';
import { ShipmentCases } from './shipment-cases';
import { ApiError } from '../../shared/api';
import { useSession } from '../auth/session';
import { Badge, Card } from '../../shared/ui';
import { ReceiptForm } from './receipt';
import { EventForm } from './event-form';
import { dateTime, Empty, ErrorPanel, human, Loading, PageTitle, tableClass, useResource } from './shared';

export function ShipmentDetail({ id }: { id: string }) {
  const { api, warehouseId, demo } = useSession();
  const resource = useResource(`${warehouseId}:${id}`, async signal => {
    const [detail, directory] = await Promise.all([api!.getShipment(id, signal, warehouseId), api!.getWarehouseDirectory(warehouseId, signal)]);
    if (detail.warehouse_id !== warehouseId) throw new Error('Shipment does not belong to the selected warehouse');
    return { detail, directory };
  });
  if (resource.error && (!resource.data || (resource.error instanceof ApiError && [401, 403].includes(resource.error.status)))) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const { detail, directory } = resource.data;
  const base = demo ? '/demo/warehouse' : '/warehouse';
  const inbound=detail.direction==='inbound';
  return <div className="shipmentWorkspace"><Link className="mb-5 inline-block text-sm text-brand" href={`${base}/shipments`}>← All shipments</Link><PageTitle title={detail.reference} my="ပို့ဆောင်မှု အသေးစိတ်" description={`${directory.smes.find(s => s.id === detail.sme_id)?.name ?? 'SME'} · ${human(detail.direction)}${detail.delivery_mode ? ` · ${human(detail.delivery_mode)}` : ''}`} />
    <div className="shipmentStatusSummary"><div className="shipmentStatusMessage"><ShipmentStatus status={detail.status}/><p>{shipmentStatusHelp[detail.status]}</p></div><p className="shipmentStatusMetadata"><span>Recorded</span> <time dateTime={detail.created_at}>{dateTime(detail.created_at)}</time><span aria-hidden="true"> · </span><span>Yangon time</span></p>{resource.loading && <span role="status" className="shipmentStatusMetadata">Refreshing…</span>}</div>
    {Boolean(resource.error) && <div className="mb-5"><ErrorPanel error={resource.error} retry={resource.reload} /></div>}
    <Card className="shipmentDetailSummary"><h2 className="text-lg font-semibold">{inbound?'Inbound receiving':'Outbound dispatch'}</h2><dl className="shipmentFacts"><div><dt>Shipment reference</dt><dd data-user-content>{detail.reference}</dd></div><div><dt>Related SME</dt><dd data-user-content>{directory.smes.find(s=>s.id===detail.sme_id)?.name??'SME'}</dd></div><div><dt>{inbound?'Receipt status':'Recorded delivery status'}</dt><dd><ShipmentStatus status={detail.status}/></dd></div>{inbound?<><div><dt>Expected quantity</dt><dd>{detail.items.reduce((n,i)=>n+i.expected_qty,0)}</dd></div><div><dt>Received quantity</dt><dd>{detail.items.reduce((n,i)=>n+i.received_qty,0)}</dd></div><div><dt>Damaged quantity</dt><dd>{detail.items.reduce((n,i)=>n+i.damaged_qty,0)}</dd></div></>:<><div><dt>Delivery mode</dt><dd>{detail.delivery_mode?human(detail.delivery_mode):'Mode not recorded'}</dd></div><div><dt>Dispatch information</dt><dd>{detail.events.some(e=>e.type==='dispatched')?'Verified dispatch event recorded':'No verified dispatch event recorded'}</dd></div><div><dt>Handover status</dt><dd>{detail.status==='handed_over'?'Third-party handover recorded':'Review the recorded delivery status and verified timeline.'}</dd></div></>}</dl></Card>
    {!demo && detail.direction === 'outbound' && <Link className="my-5 inline-block text-brand underline" href={`/warehouse/deliveries/${detail.id}`}>Manage assignment, handover and proof</Link>}
    <LiveCourierTracking key={detail.id} shipment={detail}/>
    <Card className="shipmentPanel mt-5"><div className="overflow-x-auto" tabIndex={0} aria-label="Shipment product quantities"><table className="shipmentQuantityTable"><caption>{inbound?'Expected and recorded receiving quantities':'Products in this outbound shipment'}</caption><thead><tr><th scope="col">Product / SKU</th><th scope="col">{inbound?'Expected':'Shipment quantity'}</th>{inbound&&<><th scope="col">Received</th><th scope="col">Damaged</th></>}</tr></thead><tbody>{detail.items.map(item=><tr key={item.product_id}><td><strong data-user-content>{item.name}</strong><p className="mt-1 text-sm text-muted" data-user-content>{item.sku}</p></td><td>{item.expected_qty}</td>{inbound&&<><td>{item.received_qty}</td><td>{item.damaged_qty}</td></>}</tr>)}</tbody></table></div></Card>
    <Card className="mt-5"><h2 className="font-semibold">{inbound?'Receiving evidence':'Shipment evidence'}</h2>{detail.evidence.length?<ul className="shipmentEvidence">{detail.evidence.map(e=><li key={e.id}><span data-user-content>{e.label}</span><Badge>{e.verified?'Verified':'Verification required'}</Badge></li>)}</ul>:<p className="mt-3 text-sm text-muted">No evidence references recorded.</p>}</Card>
    {detail.direction === 'inbound' ? <ReceiptForm detail={detail} refresh={resource.reload} /> : detail.delivery_mode === 'in_house' ? <EventForm detail={detail} refresh={resource.reload} /> : <Card className="mt-6"><h2 className="font-semibold">Third-party courier</h2><p className="mt-3 text-sm text-muted">Use the verified courier handover record for this shipment. ParcelCare GPS is unavailable for third-party deliveries.</p></Card>}
    <Card className="mt-6"><h2 className="text-lg font-semibold">Verified timeline</h2>{detail.events.length ? <ol className="mt-4 list-none space-y-5 p-0">{detail.events.map(event => <li key={event.id} className="border-l-2 border-emerald-200 pl-4"><p className="text-sm font-semibold">{human(event.type)}</p><p className="mt-2 text-sm" data-user-content>{event.notes}</p><p className="mt-2 text-xs text-muted">Verified <time dateTime={event.verified_at}>{dateTime(event.verified_at)}</time> · Recorded <time dateTime={event.recorded_at}>{dateTime(event.recorded_at)}</time> · Yangon</p></li>)}</ol> : <Empty text="No verified operational events yet." />}</Card>
    <ShipmentCases shipmentId={detail.id} base={base} version={detail.version}/>
  </div>;
}
