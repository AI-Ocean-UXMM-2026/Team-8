'use client';

import { useEffect, useMemo, useState } from 'react';
import { createApiClient, type Schemas } from '../../shared/api';
import { createMockTransport } from '../../shared/api/mock';
import { Badge, Button, Card } from '../../shared/ui';

export function ShipmentPreview() {
  const api = useMemo(() => createApiClient(createMockTransport()), []);
  const [items, setItems] = useState<Schemas['Shipment'][] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.listShipments({ signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { setItems(result.items); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [api, attempt]);
  return <Card className="mt-6" aria-labelledby="shipment-preview-title">
    <div className="mb-4 flex flex-wrap items-center gap-3"><h2 id="shipment-preview-title" className="text-lg font-semibold">Shipment preview</h2><Badge>Demo data</Badge></div>
    {error ? <div role="alert"><p>Shipments could not be loaded.</p><Button className="mt-3" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
      : items === null ? <p role="status">Loading shipments…</p>
      : items.length === 0 ? <p>No shipments yet.</p>
      : <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">{items.map(item => <li key={item.id} className="rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-semibold">{item.delivery_mode === 'in_house' ? 'In-house rider' : 'Third-party courier'}</p>
        <p className="mt-2 text-xs break-all text-muted">{item.reference}</p>
        <p className="mt-3 text-sm">{item.status.replaceAll('_', ' ')}</p>
      </li>)}</ul>}
  </Card>;
}
