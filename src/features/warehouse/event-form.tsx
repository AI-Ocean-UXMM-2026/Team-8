'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { type Schemas } from '../../shared/api';
import { Button, Card } from '../../shared/ui';
import { useSession } from '../auth/session';
import { useCommand } from './command';
import { savedEvent } from './saved-results';
import { human } from './shared';

export function EventForm({ detail, refresh }: { detail: Schemas['ShipmentDetail']; refresh: () => void }) {
  const { api, identity, demo } = useSession();
  const [notes, setNotes] = useState(''); const [confirmed, setConfirmed] = useState(false); const [validation, setValidation] = useState('');
  const dialog = useRef<HTMLDialogElement>(null); const alert = useRef<HTMLParagraphElement>(null);
  const command = useCommand<Schemas['ShipmentEventRequest'], Schemas['ShipmentDetail']>(`parcelcare.command.${demo ? 'demo' : 'live'}.${identity!.actor_id}.${detail.id}.event`, async (body, key) => savedEvent(await api!.recordShipmentEvent(detail.id, body, { idempotencyKey: key }), detail.id, body.expected_version, body.type), refresh);
  const nextEvent = detail.allowed_events[0];
  useEffect(() => { if (command.error || validation) alert.current?.focus(); }, [command.error, validation]);
  useEffect(() => { setConfirmed(false); setNotes(''); }, [detail.version]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setValidation(''); if (!notes.trim() || !confirmed) { setValidation('Add a note and confirm physical handling.'); return; } dialog.current?.showModal(); }
  return <Card className="mt-6"><h2 className="text-lg font-semibold">Operational event <span lang="my" className="text-sm font-normal text-muted">လုပ်ဆောင်မှု မှတ်တမ်း</span></h2>
    {command.result && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Event saved. Shipment status: {human(command.result.status)}.</p>}
    {(command.error || validation) && <p ref={alert} tabIndex={-1} role="alert" className="mt-4 text-sm text-red-700">{command.error || validation}</p>}
    {command.pending ? <div className="mt-4"><p className="text-sm">An event submission has an unconfirmed outcome.</p><Button className="mt-3" disabled={command.busy} onClick={() => void command.execute()}>Retry submitted event</Button></div> : nextEvent ? <form onSubmit={submit} className="mt-4"><fieldset disabled={command.busy || !command.ready}><legend className="text-sm">Next allowed event: <strong>{human(nextEvent)}</strong></legend><label htmlFor="event-notes" className="mt-4 mb-2 block text-sm">Verification note</label><textarea id="event-notes" required maxLength={2000} rows={3} value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 text-sm" /><label className="mt-4 flex gap-3 text-sm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>I have verified this physical step and its prerequisites.</span></label><Button type="submit" className="mt-5">Review {nextEvent}</Button></fieldset></form> : <p className="mt-4 text-sm text-muted">No additional handling step is available for this shipment.</p>}
    <dialog ref={dialog} aria-labelledby="event-confirm-title"><div className="p-6"><h2 id="event-confirm-title" className="text-xl font-semibold">Confirm {nextEvent}</h2><p className="mt-3 text-sm">Record the verified physical step now. This does not mark delivery complete.</p><div className="mt-5 flex gap-3"><Button variant="outline" onClick={() => dialog.current?.close()}>Back to edit</Button><Button onClick={() => { dialog.current?.close(); if (nextEvent) void command.execute({ expected_version: detail.version, type: nextEvent, notes: notes.trim(), verified_at: new Date().toISOString(), evidence_ids: detail.evidence.filter(e => e.verified).map(e => e.id) }); }}>Confirm event</Button></div></div></dialog>
  </Card>;
}
