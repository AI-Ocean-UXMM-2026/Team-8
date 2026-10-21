'use client';
import Link from 'next/link';
import { useSession } from '../auth/session';
import { Badge, Card } from '../../shared/ui';
import { dateTime, ErrorPanel, Loading, PageTitle, useResource } from './shared';

export function Overview() {
  const { api, warehouseId, demo } = useSession(); const base = demo ? '/demo/warehouse' : '/warehouse';
  const resource = useResource(warehouseId, async signal => {
    const [overview, directory] = await Promise.all([api!.getWarehouseOverview(warehouseId, signal), api!.getWarehouseDirectory(warehouseId, signal)]); return { overview, directory };
  });
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const { overview: data, directory } = resource.data;
  return <><PageTitle title="Warehouse overview" my="ဂိုဒေါင် အခြေအနေအကျဉ်းချုပ်" description={`${directory.name} · Stock, shipments and exceptions in one workspace.`} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Unique SKUs', data.unique_skus, '/inventory', 'Distinct product records'],
      ['Inbound shipments', data.inbound_shipments, '/shipments?direction=inbound', 'All inbound shipment records'],
      ['Outbound shipments', data.outbound_shipments, '/shipments?direction=outbound', 'All outbound shipment records'],
      ['Open cases', data.open_cases, '/exceptions?status=open', 'Excludes resolved and closed'],
    ].map(([label, value, link, definition]) => <Link href={`${base}${link}`} key={label} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-emerald-400"><p className="text-xs font-semibold text-muted uppercase">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p><p className="mt-3 text-xs text-muted">{definition} →</p></Link>)}</div>
    <p className="mt-4 text-xs text-muted">Updated <time dateTime={data.as_of}>{dateTime(data.as_of)}</time> · Yangon time</p>
    <Card className="mt-6"><Badge>Receiving</Badge><h2 className="mt-4 text-lg font-semibold">Check expected and received quantities</h2><p className="mt-3 text-sm leading-6 text-muted">Record partial or final counts, separate damaged goods and keep evidence with each shipment.</p><Link href={`${base}/shipments?direction=inbound`} className="mt-5 inline-block text-sm font-semibold text-brand">Review inbound shipments →</Link></Card>
  </>;
}
