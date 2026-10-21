'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { type Schemas } from '../../shared/api';
import { Badge, Button, Card, Input } from '../../shared/ui';
import { useSession } from '../auth/session';
import { useCommand } from './command';
import { savedReceipt } from './saved-results';
import { receiptRequest, type CountDraft } from './validation';

export function ReceiptForm({ detail, refresh }: { detail: Schemas['ShipmentDetail']; refresh: () => void }) {
  const { api, demo, identity } = useSession();
  const [counts, setCounts] = useState<CountDraft>({}); const [final, setFinal] = useState(false);
  const [evidence, setEvidence] = useState<string[]>([]); const [notes, setNotes] = useState('');
  const [validation, setValidation] = useState('');
  const [review, setReview] = useState<Schemas['ReceiptRequest'] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const alert = useRef<HTMLParagraphElement>(null);
  const command = useCommand<Schemas['ReceiptRequest'], Schemas['ReceiptResult']>(`parcelcare.command.${demo ? 'demo' : 'live'}.${identity!.actor_id}.${detail.id}.receipt`, async (body, key) => savedReceipt(await api!.postReceipt(detail.id, body, { idempotencyKey: key, warehouseId: detail.warehouse_id }), detail.id, body.expected_version), refresh);
  useEffect(() => { setCounts(Object.fromEntries(detail.items.map(i => [i.product_id, { received: i.received_qty === i.expected_qty ? '0' : '', damaged: '0' }]))); }, [detail.version]);
  useEffect(() => { if (validation || command.error) alert.current?.focus(); }, [validation, command.error]);
  const canReceive = ['expected', 'partially_received', 'delayed'].includes(detail.status);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setValidation('');
    try { const body = receiptRequest(detail, counts, final, evidence, notes); setReview(body); dialog.current?.showModal(); }
    catch (err) { setValidation(err instanceof Error ? err.message : 'Check your quantities.'); }
  }
  return <Card className="mt-6" aria-labelledby="receipt-title"><h2 id="receipt-title" className="text-lg font-semibold">Record receipt <span lang="my" className="text-sm font-normal text-muted">ပစ္စည်းလက်ခံရန်</span></h2>
    {command.result && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="font-semibold">Receipt saved</h3><p className="mt-2 text-sm">Received total: {command.result.received_qty} · Good: {command.result.good_qty} · Damaged: {command.result.damaged_qty}</p><p className="mt-2 text-sm">Remaining expected: {command.result.shortage_qty} · Linked cases: {command.result.case_ids.length}</p>{command.result.stock?.map(item => <p key={item.id} className="mt-2 text-sm">{item.sku}: available {item.available_qty}, quarantined {item.quarantined_qty}</p>)}<p className="mt-2 text-xs text-muted">Saved counts for this shipment. {demo ? 'Demo changes are saved in this tab.' : 'Refresh to reconcile the latest shipment record.'}</p></div>}
    {(validation || command.error) && <p ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{validation || command.error}</p>}
    {command.pending ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm">A submission has an unconfirmed outcome. Retry the same saved request to avoid duplicate stock.</p><Button className="mt-4" disabled={command.busy || !command.ready} onClick={() => void command.execute()}>{command.busy ? 'Submitting…' : 'Retry submitted receipt'}</Button><Button variant="outline" className="mt-4 ml-3" disabled={command.busy} onClick={refresh}>Refresh shipment</Button></div> : canReceive && <form onSubmit={submit} className="mt-5" aria-busy={command.busy}><fieldset disabled={command.busy || !command.ready}>
      <legend className="mb-4 text-sm text-muted">Enter quantities received in this receipt only. Damaged units are included in received units.</legend>
      <div className="space-y-4">{detail.items.map(item => <div key={item.product_id} className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold">{item.name} · {item.sku}</p><p className="mt-2 text-xs text-muted">Expected {item.expected_qty} · Previously received {item.received_qty} · Remaining {item.expected_qty - item.received_qty}</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm" htmlFor={`received-${item.product_id}`}>Received now · လက်ခံရရှိ</label><Input id={`received-${item.product_id}`} type="number" min="0" max={item.expected_qty - item.received_qty} step="1" required value={counts[item.product_id]?.received ?? ''} onChange={e => setCounts(c => ({ ...c, [item.product_id]: { ...c[item.product_id], received: e.target.value } }))} /></div><div><label className="mb-2 block text-sm" htmlFor={`damaged-${item.product_id}`}>Damaged now · ပျက်စီး</label><Input id={`damaged-${item.product_id}`} type="number" min="0" step="1" required value={counts[item.product_id]?.damaged ?? '0'} onChange={e => setCounts(c => ({ ...c, [item.product_id]: { ...c[item.product_id], damaged: e.target.value } }))} /></div></div></div>)}</div>
      <fieldset className="mt-5"><legend className="mb-2 text-sm font-semibold">Shipment evidence · အထောက်အထား</legend>{detail.evidence.filter(e => e.verified).map(item => <label className="mt-2 flex items-start gap-3 text-sm" key={item.id}><input type="checkbox" className="mt-1" checked={evidence.includes(item.id)} onChange={e => setEvidence(ids => e.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} /><span>{item.label}</span></label>)}{!detail.evidence.some(e => e.verified) && <p className="text-sm text-muted">No verified evidence attached. A discrepancy cannot be finalized until evidence is registered.</p>}</fieldset>
      <label className="mt-5 mb-2 block text-sm" htmlFor="receipt-notes">Receiving note · မှတ်ချက်</label><textarea id="receipt-notes" maxLength={2000} rows={3} value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 text-sm" />
      <label className="mt-5 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={final} onChange={e => setFinal(e.target.checked)} /><span>Finalize receiving. Any remainder becomes a recorded shortage.<span className="mt-1 block text-xs text-muted">Leave unchecked for a partial receipt. Final receiving cannot be reopened; a later remainder needs a follow-up shipment.</span></span></label>
      <Button className="mt-5" type="submit" disabled={command.busy || !command.ready}>{final ? 'Review final receipt' : 'Review partial receipt'}</Button>
    </fieldset></form>}
    {!canReceive && !command.pending && <p className="mt-4 text-sm text-muted">Receiving is finalized for this shipment.</p>}
    <dialog ref={dialog} aria-labelledby="receipt-confirm-title" onCancel={() => setReview(null)}><div className="p-6"><Badge>{review?.final ? 'Final receipt' : 'Partial receipt'}</Badge><h2 id="receipt-confirm-title" className="mt-4 text-xl font-semibold">Confirm the physical count</h2><p className="mt-3 text-sm">Received in this submission: {review?.lines.reduce((n, i) => n + i.received_qty, 0)}. Damaged: {review?.lines.reduce((n, i) => n + i.damaged_qty, 0)}.</p><p className="mt-3 text-sm text-muted">{review?.final ? 'This completes receiving and records any shortage.' : 'The remaining expected quantity stays pending.'}</p><div className="mt-6 flex flex-wrap gap-3"><Button variant="outline" onClick={() => { dialog.current?.close(); setReview(null); }}>Back to edit</Button><Button onClick={() => { if (review) { const body = review; dialog.current?.close(); setReview(null); void command.execute(body); } }}>Confirm receipt</Button></div></div></dialog>
  </Card>;
}
