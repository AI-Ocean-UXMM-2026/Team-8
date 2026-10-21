'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import './overview.css';
import { useSession } from '../auth/session';
import { Badge, Card } from '../../shared/ui';
import { dateTime, ErrorPanel, Loading, PageTitle, useResource } from './shared';

export function Overview() {
  const { api, warehouseId, demo } = useSession(); const base = demo ? '/demo/warehouse' : '/warehouse';
  const resource = useResource(warehouseId, async signal => {
    const [overview, directory] = await Promise.all([api!.getWarehouseOverview(warehouseId, signal), api!.getWarehouseDirectory(warehouseId, signal)]); return { overview, directory };
  });
  useEffect(()=>{const refresh=()=>resource.reload();window.addEventListener('focus',refresh);window.addEventListener('parcelcare:warehouse-changed',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('parcelcare:warehouse-changed',refresh)}},[warehouseId]);
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const { overview: data, directory } = resource.data;
  return <><PageTitle title="Warehouse overview" my="ဂိုဒေါင် အခြေအနေအကျဉ်းချုပ်" description={`${directory.name} · Stock, shipments and exceptions in one workspace.`} />
    <div className="warehouseSummaryGrid" aria-label="Warehouse summary">{[
      {label:'Unique SKUs',value:data.unique_skus,link:'/inventory',action:'Browse product inventory'},
      {label:'Inbound shipments',value:data.inbound_shipments,link:'/shipments?direction=inbound',action:'Review inbound shipments'},
      {label:'Outbound shipments',value:data.outbound_shipments,link:'/shipments?direction=outbound',action:'Review outbound shipments'},
      {label:'Open cases',value:data.open_cases,link:'/exceptions?status=open',action:data.open_cases>0?'Review unresolved cases':'View case queue'},
    ].map(({label,value,link,action}) => <Link href={`${base}${link}`} key={label} className={`warehouseSummaryCard ${label==='Open cases'&&data.open_cases>0?'warehouseSummaryAttention':''}`}><span className="warehouseSummaryLabel">{label}</span><strong className="warehouseSummaryNumber">{value}</strong><span className="warehouseSummaryAction">{action} <span aria-hidden="true">→</span></span></Link>)}</div>
    <p className="mt-4 text-xs text-muted">Updated <time dateTime={data.as_of}>{dateTime(data.as_of)}</time> · Yangon time</p>
    <Card className="mt-6"><Badge>Receiving</Badge><h2 className="mt-4 text-lg font-semibold">Check expected and received quantities</h2><p className="mt-3 text-sm leading-6 text-muted">Record partial or final counts, separate damaged goods and keep evidence with each shipment.</p><Link href={`${base}/shipments?direction=inbound`} className="mt-5 inline-block text-sm font-semibold text-brand">Review inbound shipments →</Link></Card>
  </>;
}
