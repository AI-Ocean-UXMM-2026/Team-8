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
import { ArrowRightIcon, ArrowsLeftRightIcon, ChartBarIcon, LightningIcon, PackageIcon, ShieldWarningIcon, SparkleIcon, TruckIcon, WarningCircleIcon } from '@phosphor-icons/react';
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
      const catalog=await api!.getWarehouseCatalog(warehouseId,undefined,smeId);const item=catalog.find(p=>p.available_qty>=1);
      if(!item)throw new Error('No your SME-owned stock available.');
      const profile=await api!.getSMEDeliveryProfile(warehouseId,smeId);
      const order=await api!.submitOrder({warehouse_id:warehouseId,sme_id:smeId,order_kind:'sme_self_delivery',customer_name:profile?.recipient_name??'Demo SME shop',customer_phone:profile?.recipient_phone??'09123456789',address:profile?.address??'Demo SME shop, Yangon',latitude:profile?.latitude??16.8409,longitude:profile?.longitude??96.1735,maps_url:profile?.maps_url??'',notes:'Fictitious demo delivery to SME',lines:[{product_id:item.id,expected_qty:1}]},crypto.randomUUID());
      setGenerated(`ORD-${order.id.slice(0,8)} · Warehouse → SME · Awaiting warehouse approval`);
      resource.reload();
    } catch (error) { setGenerateError(error instanceof Error ? error.message : 'Demo release request could not be saved.'); }
    finally { setGenerating(false); }
  }
  const resource = usePolling(smeId, async signal => {const [overview,catalog]=await Promise.all([api!.getSMEOverview(smeId,signal),api!.getWarehouseCatalog(warehouseId,signal,smeId)]);return {...overview,catalog};});
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const data = resource.data;
  return <><PageTitle title="SME dashboard" my="မိမိလုပ်ငန်း အခြေအနေ" description="Your stock, shipments and decisions. Updates refresh automatically while this page is visible." />
    {demo && (
      <Card className="mb-6">
        <div className="smeCardHeader">
          <div className="smeSectionHeading">
            <span className="smeSectionIcon" aria-hidden="true"><SparkleIcon size={18} weight="duotone" /></span>
            <h2 className="smeSectionTitle">Demo Stock Release · Yangon Hub</h2>
          </div>
          <p className="smeSectionDescription">Generate a fictitious stock release request using available your SME-owned stock to test the live dispatch workflow. Saved in this browser session.</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" disabled={generating} onClick={() => void generateOrder()}>
            {generating ? 'Generating…' : 'Generate demo release request'}
          </Button>
        </div>
        {generated && <p role="status" className="mt-3 text-sm text-brand font-medium">{generated}</p>}
        {generateError && <p role="alert" className="mt-3 text-sm text-rose-600">{generateError}</p>}
      </Card>
    )}
    <div className="smeSectionTitleBlock">
      <div className="smeSectionHeading">
        <span className="smeSectionIcon" aria-hidden="true"><LightningIcon size={18} weight="duotone" /></span>
        <h2 className="smeSectionTitle">Quick Actions</h2>
      </div>
      <p className="smeSectionDescription">Fast shortcuts to submit new stock release requests to your SME location from your SME-owned inventory or file exception reports.</p>
    </div>
    <Card className="mb-6 smeQuickActions" aria-label="SME quick actions">
      <div className="smeQuickActionGrid">
        <Link className="smeQuickAction smeQuickActionOrder" href={demo ? '/demo/sme/orders' : '/sme/orders'}>
          <span className="smeQuickActionIcon" aria-hidden="true"><PackageIcon size={26} weight="duotone" /></span>
          <span className="smeQuickActionCopy">
            <strong>Create stock release request</strong>
            <small>Choose products from your SME-owned stock and submit a stock release request.</small>
          </span>
          <ArrowRightIcon className="smeQuickActionArrow" aria-hidden="true" size={18} weight="bold" />
        </Link>
        <Link className="smeQuickAction smeQuickActionReport" href={demo ? '/demo/sme/reports' : '/sme/reports'}>
          <span className="smeQuickActionIcon" aria-hidden="true"><WarningCircleIcon size={26} weight="duotone" /></span>
          <span className="smeQuickActionCopy">
            <strong>Report Cases</strong>
            <small>Report damaged goods or delivery problems for investigation.</small>
          </span>
          <ArrowRightIcon className="smeQuickActionArrow" aria-hidden="true" size={18} weight="bold" />
        </Link>
      </div>
    </Card>
    <div className="smeSectionTitleBlock">
      <div className="smeSectionHeading">
        <span className="smeSectionIcon" aria-hidden="true"><ChartBarIcon size={18} weight="duotone" /></span>
        <h2 className="smeSectionTitle">Operations Summary</h2>
      </div>
      <p className="smeSectionDescription">Key operational indicators tracking SME-owned products, active shipments, and cases needing your confirmation.</p>
    </div>
    <div className="warehouseSummaryGrid smeSummaryGrid mb-6" aria-label="SME summary">
      {[
        { label: 'Products', value: data.catalog.length, href: '#sme-stock', action: 'View your SME-owned stock' },
        { label: 'Shipments', value: data.shipments.length, href: '#sme-shipments', action: 'View your shipments' },
        { label: 'Decisions needed', value: data.approvals.filter(a => a.status === 'pending').length, href: '#sme-cases', action: 'Review related cases' },
      ].map(({ label, value, href, action }) => (
        <a
          key={label}
          href={href}
          className={`warehouseSummaryCard ${label === 'Decisions needed' && Number(value) > 0 ? 'warehouseSummaryAttention' : ''}`}
        >
          <span className="warehouseSummaryLabel">{label}</span>
          <strong className="warehouseSummaryNumber">{value}</strong>
          <span className="warehouseSummaryAction">{action} →</span>
        </a>
      ))}
    </div>
    <Card className="mb-6">
      <div className="smeCardHeaderWithAction">
        <div>
          <div className="smeSectionHeading">
            <span className="smeSectionIcon" aria-hidden="true"><TruckIcon size={18} weight="duotone" /></span>
            <h2 className="smeSectionTitle">Live Courier & Delivery Tracking</h2>
          </div>
          <p className="smeSectionDescription">Monitor real-time courier movements, vehicle route progress, and verified proof-of-delivery for your active shipments.</p>
        </div>
        <Link className="inline-flex min-h-11 items-center text-brand underline font-medium text-sm whitespace-nowrap" href={demo ? '/demo/sme/tracking' : '/sme/tracking'}>
          Open live shipment tracking →
        </Link>
      </div>
    </Card>
    <div className="smeDashboardGrid">
      <Card id="sme-stock">
        <div className="smeCardHeader">
          <div className="smeSectionHeading">
            <span className="smeSectionIcon" aria-hidden="true"><PackageIcon size={18} weight="duotone" /></span>
            <h2 className="smeSectionTitle">Your Stock at the Warehouse</h2>
          </div>
          <p className="smeSectionDescription">Your SME-owned inventory stored with ParcelCare. Available quantities can be requested for release.</p>
        </div>
        {data.catalog.length ? (
          <div className="smeTableScroll" tabIndex={0} role="region" aria-label="Your stock at the warehouse">
            <table className="smeTable">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Available to Release</th>
                </tr>
              </thead>
              <tbody>
                {data.catalog.slice(0, 10).map(item => (
                  <tr key={item.id}>
                    <td data-user-content>{item.name}</td>
                    <td data-user-content>{item.sku}</td>
                    <td>{item.available_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No products recorded yet." />
        )}
        <div className="smeCardFooter">
          <Button variant="outline" asChild>
            <Link href={demo ? '/demo/sme/stock' : '/sme/stock'}>
              View more →
            </Link>
          </Button>
        </div>
      </Card>
      <Card id="sme-shipments">
        <div className="smeCardHeader">
          <div className="smeSectionHeading">
            <span className="smeSectionIcon" aria-hidden="true"><ArrowsLeftRightIcon size={18} weight="duotone" /></span>
            <h2 className="smeSectionTitle">Inbound & Outbound Shipment Records</h2>
          </div>
          <p className="smeSectionDescription">Recorded inbound supplier receipts and outbound deliveries to your SME location with real-time delivery statuses.</p>
        </div>
        {data.shipments.length ? (
          <div className="smeTableScroll" tabIndex={0} role="region" aria-label="Shipments">
            <table className="smeTable">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Direction</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.shipments.map(item => (
                  <tr key={item.id}>
                    <td>
                      {demo && item.direction === 'inbound' ? (
                        <span>{item.reference}</span>
                      ) : (
                        <Link className="text-brand underline" href={demo ? '/demo/sme/tracking' : `/sme/shipments/${item.id}`}>
                          {item.reference}
                        </Link>
                      )}
                    </td>
                    <td>{human(item.direction)}</td>
                    <td><ShipmentStatus status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No shipments yet." />
        )}
      </Card>
      <Card className="smeCases" id="sme-cases">
        <div className="smeCardHeaderWithAction">
          <div>
            <div className="smeSectionHeading">
              <span className="smeSectionIcon" aria-hidden="true"><ShieldWarningIcon size={18} weight="duotone" /></span>
              <h2 className="smeSectionTitle">Warehouse Exceptions & Incident Reports</h2>
            </div>
            <p className="smeSectionDescription">Investigated warehouse discrepancies, damaged package claims, and manager proposals awaiting your confirmation.</p>
          </div>
          <Link className="inline-flex min-h-11 items-center text-brand underline font-medium text-sm whitespace-nowrap" href={demo ? '/demo/sme/reports' : '/sme/reports'}>
            New report / View all cases →
          </Link>
        </div>
        {data.cases.length ? (
          <ul className="smeCaseGrid">
            {data.cases.map(item => (
              <li key={item.id} className="mt-4 border-t pt-3">
                <Link className="text-brand underline" href={`${demo ? '/demo/sme' : '/sme'}/exceptions/${item.id}`}>
                  {human(item.type)}
                </Link>
                <p className="mt-2 text-sm">{item.summary} · {human(item.status)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No cases yet." />
        )}
      </Card>
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
