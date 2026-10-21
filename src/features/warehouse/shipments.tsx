'use client';
import Link from 'next/link';
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
  return <><PageTitle title="Shipments" my="ပို့ဆောင်မှုစာရင်း" description="Review expected receipts and verified outbound events." /><Card className="overflow-hidden p-0"><div className="flex flex-wrap gap-4 p-5">
    <div><label htmlFor="shipment-sme" className="mb-2 block text-xs text-muted">SME</label><select id="shipment-sme" className={selectClass} value={smeId} onChange={e => set('sme_id', e.target.value)}><option value="">All SMEs</option>{directory.smes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    <div><label htmlFor="shipment-direction" className="mb-2 block text-xs text-muted">Direction</label><select id="shipment-direction" className={selectClass} value={direction} onChange={e => set('direction', e.target.value)}><option value="">All directions</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></div>
    <div><label htmlFor="shipment-status" className="mb-2 block text-xs text-muted">Status</label><select id="shipment-status" className={selectClass} value={status} onChange={e => set('status', e.target.value)}><option value="">All statuses</option>{['expected', 'partially_received', 'received', 'received_with_discrepancies', 'ready', 'assigned', 'picked_up', 'in_transit', 'delayed', 'failed', 'delivered', 'cancelled', 'handed_over'].map(s => <option key={s} value={s}>{human(s)}</option>)}</select></div></div>
    {page.items.length ? <div className="overflow-x-auto" tabIndex={0} aria-label="Shipments table"><table className={tableClass}><caption className="sr-only">Warehouse shipments</caption><thead><tr><th scope="col">Reference</th><th scope="col">SME</th><th scope="col">Direction / mode</th><th scope="col">Status</th><th scope="col">Recorded · Yangon</th></tr></thead><tbody>{page.items.map(item => <tr key={item.id}><td><Link className="font-semibold text-brand underline" href={`${base}/shipments/${item.id}`}>{item.reference}</Link></td><td>{directory.smes.find(s => s.id === item.sme_id)?.name ?? 'SME'}</td><td>{human(item.direction)}<p className="mt-1 text-xs text-muted">{item.delivery_mode ? human(item.delivery_mode) : 'Expected receipt'}</p></td><td><Badge>{human(item.status)}</Badge></td><td><time dateTime={item.created_at}>{dateTime(item.created_at)}</time></td></tr>)}</tbody></table></div> : <Empty />}
    <Pagination cursor={cursor} nextCursor={page.next_cursor} set={set} /></Card></>;
}
