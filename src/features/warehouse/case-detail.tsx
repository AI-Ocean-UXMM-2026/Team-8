'use client';
import Link from 'next/link';
import { useSession } from '../auth/session';
import { CasePanels, caseView } from '../exceptions';
import { CaseControls } from '../exceptions/controls';
import { CaseReviewForm } from '../exceptions/review';
import { CaseRiskControls } from '../exceptions/risk-controls';
import { EvidenceUpload } from '../portal/evidence';
import { usePolling } from '../portal/polling';
import { ApiError } from '../../shared/api';
import { ErrorPanel, human, Loading, PageTitle, useResource } from './shared';

export function CaseDetail({ id, embedded = false, onChanged }: { id: string; embedded?: boolean; onChanged?: () => void }) {
  const { api, demo, warehouseId } = useSession();
  const resource = usePolling(`${warehouseId}:${id}`, async signal => {
    const raw = await api!.getCase(id, signal); const item = caseView(raw);
    if (item.id !== id || (item.warehouse_id && item.warehouse_id !== warehouseId)) throw new ApiError(403, 'FORBIDDEN', 'Case is unavailable in this warehouse.');
    return { item, raw };
  });
  if (resource.error) return <ErrorPanel error={resource.error} retry={resource.reload} />;
  if (!resource.data) return <Loading />;
  const { item, raw } = resource.data;
  const refresh = () => { resource.reload(); onChanged?.(); };
  return <>{!embedded && <><Link className="mb-4 inline-block text-sm text-brand underline" href={`${demo ? '/demo' : ''}/warehouse/exceptions`}>Back to cases</Link><PageTitle title={human(item.type)} my="ကိစ္စအသေးစိတ်" description="Recorded facts and evidence." /></>}<CasePanels item={item} />{!demo && 'version' in raw && Array.isArray(raw.allowed_actions) && <><CaseRiskControls key={raw.version} detail={raw} refresh={refresh} /><CaseControls detail={raw} refresh={refresh} /><CaseReviewForm detail={raw} refresh={refresh} /></>}<EvidenceUpload shipmentId={item.shipment_id} refresh={refresh} /></>;
}
