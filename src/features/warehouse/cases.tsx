'use client';
import Link from 'next/link';
import { useSession } from '../auth/session';
import { Badge, Card } from '../../shared/ui';
import { Empty, ErrorPanel, human, Loading, PageTitle, Pagination, useFilters, useResource } from './shared';
export function Cases() {
  const { api, warehouseId, demo } = useSession(); const { params, set } = useFilters(); const cursor = params.get('cursor') || '';
  const resource = useResource(`${warehouseId}:${cursor}`, signal => api!.listCases({ warehouseId, status: 'open', cursor, limit: 20, signal }));
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  return <><PageTitle title="Open cases" my="မဖြေရှင်းရသေးသော ကိစ္စများ" description="Open cases requiring review." />{resource.data.items.length ? resource.data.items.map(item => <Card key={item.id} className="mb-4"><div className="flex flex-wrap gap-3"><h2 className="font-semibold">{human(item.type)}</h2><Badge>{human(item.status)}</Badge><Badge>{item.priority}</Badge></div><p className="mt-3 text-sm" data-user-content>{item.summary}</p><Link className="mt-4 inline-block text-sm font-semibold text-brand underline" href={`${demo ? '/demo/warehouse' : '/warehouse'}/exceptions/${item.id}`}>Investigate case →</Link></Card>) : <Card><Empty text="No open cases." /></Card>}<Pagination cursor={cursor} nextCursor={resource.data.next_cursor} set={set} /></>;
}
