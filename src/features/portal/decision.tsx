'use client';
import { useState, type FormEvent } from 'react';
import type { Approval } from '../../shared/api/domain';
import { ApiError, type Schemas } from '../../shared/api';
import { Button, Card } from '../../shared/ui';
import { useSession } from '../auth/session';
import { useCommand } from '../warehouse/command';
import { decisionLabel } from '../../shared/i18n/labels';
import { dateTime, human } from '../warehouse/shared';
export function DecisionForm({ approval, refresh }: { approval: Approval; refresh: () => void }) {
  const { api, identity } = useSession(); const [choice, setChoice] = useState(''); const [note, setNote] = useState(''); const [preferred, setPreferred] = useState(''); const [error, setError] = useState('');
  const command = useCommand<Schemas['Decision'], Schemas['CaseDetail']>(`parcelcare.decision.${identity!.actor_id}.${approval.id}`, async (body,key) => {
    const result = await api!.decideApproval(approval.id,body,key);
    if (result.id !== approval.case_id || !result.approvals.some(a => a.id === approval.id && a.status === 'decided' && a.decision === body.decision)) throw new ApiError(502,'INVALID_RESPONSE','Decision could not be confirmed. Retry the original request.');
    return result;
  },refresh);
  function submit(event: FormEvent) { event.preventDefault(); setError('');
    if (!approval.options.includes(choice) || !note.trim()) { setError('Select an offered choice and write a note.'); return; }
    if (choice === 'propose_retry' && (!preferred || !Number.isFinite(new Date(preferred).getTime()) || new Date(preferred).getTime() <= Date.now())) { setError('Choose a future preferred time.'); return; }
    void command.execute({ decision: choice as Schemas['Decision']['decision'], note: note.trim(), request_version: approval.requested_case_version, ...(choice === 'propose_retry' ? { preferred_at: new Date(preferred).toISOString() } : {}) });
  }
  return <Card className="my-5"><h2 className="font-semibold">SME decision</h2><p className="mt-2 text-sm">Request: {human(approval.status)}. A choice records intent; retry time remains proposed until warehouse capacity is confirmed.</p>
    {approval.status === 'pending' && <p className="mt-3" role="status">Awaiting your decision</p>}
    {approval.status === 'cancelled' && <p className="mt-3" role="status">This request was superseded or cancelled. Use the latest pending request.</p>}
    {approval.status === 'decided' && <div className="mt-3 rounded border p-3" aria-label="Recorded decision"><p>Recorded decision: {decisionLabel(approval.decision ?? 'unavailable')}</p><p className="mt-2 whitespace-pre-wrap" data-user-content>{approval.note}</p>{approval.decided_at && <p className="mt-2 text-sm">{dateTime(approval.decided_at)} · Yangon</p>}{approval.preferred_at && <p className="mt-2 text-sm">Preferred time: {dateTime(approval.preferred_at)} · Yangon · awaiting capacity confirmation</p>}</div>}
    {(error || command.error) && <p role="alert" className="my-3">{error || command.error}</p>}{command.result && <p role="status">Decision saved</p>}{command.pending && approval.status !== 'cancelled' && <Button onClick={() => void command.execute()} disabled={command.busy}>Retry original decision</Button>}
    <form onSubmit={submit}><fieldset disabled={approval.status !== 'pending' || !command.ready || command.busy || !!command.pending} className="mt-4 space-y-4"><label className="block">Decision<select aria-label="SME decision" className="ml-3 rounded border p-2" value={choice} onChange={e => setChoice(e.target.value)}><option value="">Choose a decision</option>{approval.options.map(option => <option key={option} value={option}>{decisionLabel(option)}</option>)}</select></label>{choice === 'propose_retry' && <label className="block">Preferred retry time (your local time)<input aria-label="Preferred retry time" className="mt-2 block max-w-full rounded border p-2" type="datetime-local" value={preferred} onChange={e => setPreferred(e.target.value)} required /></label>}<label className="block">Decision note<textarea aria-label="Decision note" className="mt-2 block w-full rounded border p-3" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} required /></label><Button type="submit">Save decision</Button></fieldset></form></Card>;
}
