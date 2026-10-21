import { WorkspaceLayout } from '../../shared/layout/workspace-layout';
import { Badge, Button, Card, Input } from '../../shared/ui';
import { ShipmentPreview } from './shipment-preview';

export default function FoundationPage() {
  return <WorkspaceLayout title="Shared workspace foundation">
    <div className="mb-6 flex flex-wrap items-center gap-3"><Badge>Foundation preview</Badge><p className="text-sm text-muted">Shared components for warehouse, SME and rider screens.</p></div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card aria-labelledby="scope-title"><h2 id="scope-title" className="text-lg font-semibold">Warehouse to SME</h2><p className="mt-3 text-sm leading-6 text-muted">Inventory, shipments and verified exception handling in one workspace.</p><p lang="my" className="mt-4 text-sm">ပစ္စည်းစာရင်းနှင့် ပို့ဆောင်မှုများ</p><Button asChild className="mt-6"><a href="/">Open prototype reference</a></Button></Card>
      <Card aria-labelledby="components-title"><h2 id="components-title" className="mb-4 text-lg font-semibold">Shipment reference</h2><label htmlFor="reference" className="mb-2 block text-sm">Reference example</label><Input id="reference" value="PC-IN-0100" readOnly aria-describedby="reference-help" /><p id="reference-help" className="mt-2 text-xs text-muted">Fictitious preview. Operational forms follow in M1.</p><div className="mt-6 flex gap-3"><Button disabled>Submit receipt</Button><Button variant="outline" disabled>Request review</Button></div></Card>
    </div>
    <ShipmentPreview />
  </WorkspaceLayout>;
}
