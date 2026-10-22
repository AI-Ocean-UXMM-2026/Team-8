'use client';
import Link from 'next/link';
import {CreateOutboundShipment} from './create-shipment';
import {OrderList} from '../portal/orders';
import './shipments.css';
import { ShipmentStatus } from './shipment-status';
import { useSession } from '../auth/session';
import { Badge, Card } from '../../shared/ui';
import { selectClass } from './shell';
import { dateTime, Empty, ErrorPanel, human, Loading, PageTitle, Pagination, tableClass, useFilters, useResource } from './shared';

export function Shipments() {
  const { api, warehouseId, demo } = useSession(); const { params, set } = useFilters();
  const direction = params.get('direction') || ''; const status = params.get('status') || ''; const smeId = params.get('sme_id') || ''; const cursor = params.get('cursor') || '';
  const resource = useResource(`${warehouseId}:${params}`, async signal => {
    const [page, directory] = await Promise.all([api!.listShipments({ warehouseId, smeId, direction: direction === 'inbound' || direction === 'outbound' ? direction : undefined, status, cursor, limit: 20, signal }), api!.getWarehouseDirectory(warehouseId, signal)]); return { page, directory };
  });
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const { page, directory } = resource.data; const base = demo ? '/demo/warehouse' : '/warehouse';
  return <div className="shipmentWorkspace"><PageTitle title="Shipments" my="ပို့ဆောင်မှုစာရင်း" description="Review expected receipts and verified outbound events." />{!demo&&<CreateOutboundShipment smes={directory.smes} refresh={resource.reload}/>}<OrderList onChanged={resource.reload}/><Card className="shipmentPanel"><div className="shipmentFilters">
    <div><label htmlFor="shipment-sme" className="mb-2 block text-xs text-muted">SME</label><select id="shipment-sme" className={selectClass} value={smeId} onChange={e => set('sme_id', e.target.value)}><option value="">All SMEs</option>{directory.smes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    <div><label htmlFor="shipment-direction" className="mb-2 block text-xs text-muted">Direction</label><select id="shipment-direction" className={selectClass} value={direction} onChange={e => set('direction', e.target.value)}><option value="">All directions</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></div>
    <div><label htmlFor="shipment-status" className="mb-2 block text-xs text-muted">Status</label><select id="shipment-status" className={selectClass} value={status} onChange={e => set('status', e.target.value)}><option value="">All statuses</option>{['expected', 'partially_received', 'received', 'received_with_discrepancies', 'ready', 'assigned', 'picked_up', 'in_transit', 'delayed', 'failed', 'delivered', 'cancelled', 'handed_over'].map(s => <option key={s} value={s}>{human(s)}</option>)}</select></div></div>
    {page.items.length ? <div className="overflow-x-auto" tabIndex={0} aria-label="Shipments table"><table className="shipmentTable"><caption className="sr-only">Warehouse shipments</caption><thead><tr><th scope="col">Reference</th><th scope="col">SME</th><th scope="col">Direction / mode</th><th scope="col">Status</th><th scope="col">Recorded · Yangon</th><th scope="col">Actions</th></tr></thead><tbody>{page.items.map(item => <tr key={item.id}><td data-label="Reference"><Link className="shipmentReference" href={`${base}/shipments/${item.id}`}><span data-user-content>{item.reference}</span></Link></td><td data-label="SME">{directory.smes.find(s => s.id === item.sme_id)?.name ?? 'SME'}</td><td data-label="Direction / mode"><strong>{human(item.direction)}</strong><p className="mt-1 text-xs text-muted">{item.delivery_mode ? human(item.delivery_mode) : item.direction==='inbound'?'Inbound receipt':'Mode not recorded'}</p></td><td data-label="Status"><ShipmentStatus status={item.status}/></td><td data-label="Recorded · Yangon"><time dateTime={item.created_at}>{dateTime(item.created_at)}</time></td><td data-label="Actions"><Link className="shipmentReference" href={`${base}/shipments/${item.id}#live-courier-tracking`} aria-label={`Track ${item.reference}`}>⌖ Track</Link></td></tr>)}</tbody></table></div> : <Empty />}
    <details className="shipmentStatusGuide"><summary>Status meanings</summary><dl><div><dt>Expected</dt><dd>Awaiting an inbound receipt.</dd></div><div><dt>Ready</dt><dd>Ready for outbound handling; physical steps still require verification.</dd></div><div><dt>Handed over</dt><dd>Handover to the third-party courier has been recorded.</dd></div></dl></details>
    <Pagination cursor={cursor} nextCursor={page.next_cursor} set={set} /></Card></div>;
}
