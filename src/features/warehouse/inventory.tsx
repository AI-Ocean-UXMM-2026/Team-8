'use client';
import Link from 'next/link';
import { useSession } from '../auth/session';
import { Badge, Card } from '../../shared/ui';
import { selectClass } from './shell';
import { Empty, ErrorPanel, Loading, PageTitle, Pagination, tableClass, useFilters, useResource } from './shared';

export function Inventory() {
  const { api, warehouseId, demo } = useSession(); const { params, set } = useFilters();
  const smeId = params.get('sme_id') || ''; const stock = params.get('stock_status') || ''; const cursor = params.get('cursor') || '';
  const resource = useResource(`${warehouseId}:${params}`, async signal => {
    const [page, directory] = await Promise.all([api!.listInventory({ warehouseId, smeId, stockStatus: stock === 'available' || stock === 'quarantined' ? stock : undefined, cursor, limit: 20, signal }), api!.getWarehouseDirectory(warehouseId, signal)]); return { page, directory };
  });
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const { page, directory } = resource.data; const base = demo ? '/demo/warehouse' : '/warehouse';
  return <><PageTitle title="Inventory" my="ပစ္စည်းစာရင်း" description="Available and quarantined stock, scoped to each SME." />
    <Card className="overflow-hidden p-0"><div className="flex flex-wrap gap-4 p-5"><div><label htmlFor="inventory-sme" className="mb-2 block text-xs text-muted">SME</label><select id="inventory-sme" className={selectClass} value={smeId} onChange={e => set('sme_id', e.target.value)}><option value="">All SMEs</option>{directory.smes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div><label htmlFor="stock-status" className="mb-2 block text-xs text-muted">Stock status</label><select id="stock-status" className={selectClass} value={stock} onChange={e => set('stock_status', e.target.value)}><option value="">All stock</option><option value="available">Available</option><option value="quarantined">Quarantined</option></select></div></div>
      {page.items.length ? <div className="overflow-x-auto" tabIndex={0} aria-label="Inventory table"><table className={tableClass}><caption className="sr-only">SME product inventory</caption><thead><tr><th scope="col">Product / SKU</th><th scope="col">SME</th><th scope="col">Available</th><th scope="col">Quarantined</th><th scope="col">Shipments</th></tr></thead><tbody>{page.items.map(item => <tr key={item.id}><td><p className="font-semibold">{item.name}</p><p className="mt-1 text-muted">{item.sku}</p></td><td>{directory.smes.find(s => s.id === item.sme_id)?.name ?? 'SME'}</td><td>{item.available_qty}</td><td><Badge className={item.quarantined_qty ? 'bg-amber-50 text-amber-800' : ''}>{item.quarantined_qty}</Badge></td><td className="space-y-2">{item.shipment_ids.map((id, i) => <Link className="block text-brand underline" key={id} href={`${base}/shipments/${id}`}>Shipment {i + 1} ↗</Link>)}</td></tr>)}</tbody></table></div> : <Empty />}
      <Pagination cursor={cursor} nextCursor={page.next_cursor} set={set} />
    </Card></>;
}
