'use client';
import Link from 'next/link';
import { useSession } from '../auth/session';
import { Badge, Card } from '../../shared/ui';
import { filterCases } from '../exceptions/case-view';
import { selectClass } from './shell';
import { Empty, ErrorPanel, human, Loading, PageTitle, Pagination, useFilters, useResource } from './shared';
export function Cases() {
  const { api, warehouseId, demo, identity } = useSession(); const { params, set } = useFilters(); const cursor = params.get('cursor') || '';
  const scope = params.get('scope') === 'all' ? 'all' : 'open';
  const resource = useResource(`${warehouseId}:${params.toString()}`, signal => api!.listCases({ warehouseId, status: scope, cursor, limit: 20, signal, issueType: params.get('type') || undefined, priority: params.get('priority') || undefined, mode: params.get('mode') || undefined, state: params.get('state') || undefined, owner: params.get('owner') || undefined }));
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const items = resource.data.items;
  const fields = [
    ['scope', 'Case scope', ['open', 'all']],
    ['type', 'Issue type', ['quantity_mismatch', 'damaged_goods', 'missing_stock', 'wrong_pick', 'short_pick', 'courier_delay', 'delivery_failed', 'recipient_unavailable', 'transit_damage', 'transit_loss']],
    ['priority', 'Priority', ['low', 'normal', 'high', 'critical']],
    ['owner', 'Owner', ['unassigned', identity!.actor_id]],
    ['mode', 'Handling mode', ['ai', 'human']],
    ['state', 'Case state', ['new', 'investigating', 'processing', 'awaiting_information', 'awaiting_sme_decision', 'awaiting_courier_confirmation', 'awaiting_verification', 'resolved', 'closed']],
  ] as const;
  return <><PageTitle title="Open cases" my="မဖြေရှင်းရသေးသော ကိစ္စများ" description="Review recorded issues without confusing priority, human handling and approval." />
    <Card className="mb-4"><div className="flex flex-wrap gap-4">{fields.map(([key, label, options]) => <div key={key} className="grid gap-2 text-sm"><label htmlFor={`case-${key}`}>{label}</label><select id={`case-${key}`} className={selectClass} value={key === 'scope' ? scope : params.get(key) || ''} onChange={e => set(key, e.target.value)}>{key !== 'scope' && <option value="">All</option>}{options.map(option => <option key={option} value={option}>{human(option)}</option>)}</select></div>)}</div><p className="mt-4 text-sm text-muted">Filters apply across the case queue before pagination. Priority and human handling do not grant approval.</p><p role="status" className="mt-2 text-sm">{items.length} matching cases on this page.</p></Card>
    {items.length ? items.map(item => <Card key={item.id} className="mb-4"><div className="flex flex-wrap gap-3"><h2 className="font-semibold"><Link className="text-brand underline" href={`${demo ? '/demo' : ''}/warehouse/exceptions/${item.id}`}>{human(item.type)}</Link></h2><Badge>State: {human(item.status)}</Badge><Badge>Priority: {item.priority}</Badge><Badge>Handling: {item.handling_mode}</Badge></div><p className="mt-3 text-sm">{item.summary}</p></Card>) : <Card><Empty text="No cases match these filters on this page." /></Card>}<Pagination cursor={cursor} nextCursor={resource.data.next_cursor} set={set} /></>;
}
