'use client';
import Link from 'next/link';
import { ApiError } from '../../shared/api';
import { useSession } from '../auth/session';
import { Badge, Card } from '../../shared/ui';
import { ReceiptForm } from './receipt';
import { EventForm } from './event-form';
import { dateTime, Empty, ErrorPanel, human, Loading, PageTitle, tableClass, useResource } from './shared';

export function ShipmentDetail({ id }: { id: string }) {
  const { api, warehouseId, demo } = useSession();
  const resource = useResource(`${warehouseId}:${id}`, async signal => {
    const [detail, directory] = await Promise.all([api!.getShipment(id, signal), api!.getWarehouseDirectory(warehouseId, signal)]);
    if (detail.warehouse_id !== warehouseId) throw new Error('Shipment does not belong to the selected warehouse');
    return { detail, directory };
  });
  if (resource.error && (!resource.data || (resource.error instanceof ApiError && [401, 403].includes(resource.error.status)))) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const { detail, directory } = resource.data;
  const base = demo ? '/demo/warehouse' : '/warehouse';
  return <><Link className="mb-5 inline-block text-sm text-brand" href={`${base}/shipments`}>← All shipments</Link><PageTitle title={detail.reference} my="ပို့ဆောင်မှု အသေးစိတ်" description={`${directory.smes.find(s => s.id === detail.sme_id)?.name ?? 'SME'} · ${human(detail.direction)}${detail.delivery_mode ? ` · ${human(detail.delivery_mode)}` : ''}`} />
    <div className="mb-5 flex flex-wrap items-center gap-3"><Badge>{human(detail.status)}</Badge><p className="text-xs text-muted">Recorded <time dateTime={detail.created_at}>{dateTime(detail.created_at)}</time> · Yangon time</p>{resource.loading && <span role="status" className="text-xs text-muted">Refreshing…</span>}</div>
    {resource.error && <div className="mb-5"><ErrorPanel error={resource.error} retry={resource.reload} /></div>}
    <Card className="overflow-hidden p-0"><div className="overflow-x-auto" tabIndex={0} aria-label="Shipment product quantities"><table className={tableClass}><caption className="sr-only">Expected and recorded receiving quantities</caption><thead><tr><th scope="col">Product</th><th scope="col">Expected</th><th scope="col">Received</th><th scope="col">Damaged</th></tr></thead><tbody>{detail.items.map(item => <tr key={item.product_id}><td>{item.name}<p className="mt-1 text-xs text-muted">{item.sku}</p></td><td>{item.expected_qty}</td><td>{item.received_qty}</td><td>{item.damaged_qty}</td></tr>)}</tbody></table></div></Card>
    {detail.direction === 'inbound' ? <ReceiptForm detail={detail} refresh={resource.reload} /> : detail.delivery_mode === 'in_house' ? <EventForm detail={detail} refresh={resource.reload} /> : <Card className="mt-6"><h2 className="font-semibold">Third-party courier</h2><p className="mt-3 text-sm text-muted">Use the verified courier handover record for this shipment. ParcelCare GPS is unavailable for third-party deliveries.</p></Card>}
    <Card className="mt-6"><h2 className="text-lg font-semibold">Verified timeline</h2>{detail.events.length ? <ol className="mt-4 list-none space-y-5 p-0">{detail.events.map(event => <li key={event.id} className="border-l-2 border-emerald-200 pl-4"><p className="text-sm font-semibold">{human(event.type)}</p><p className="mt-2 text-sm">{event.notes}</p><p className="mt-2 text-xs text-muted">Verified <time dateTime={event.verified_at}>{dateTime(event.verified_at)}</time> · Recorded <time dateTime={event.recorded_at}>{dateTime(event.recorded_at)}</time> · Yangon</p></li>)}</ol> : <Empty text="No verified operational events yet." />}</Card>
  </>;
}
