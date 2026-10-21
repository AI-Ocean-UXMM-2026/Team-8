'use client';
import { useState, type FormEvent } from 'react';
import { ApiError, type Schemas } from '../../shared/api';
import { Button, Card } from '../../shared/ui';
import { useSession } from '../auth/session';
import { useCommand } from '../warehouse/command';
import { human } from '../warehouse/shared';

type Command = { kind: 'actions' | 'verifications' | 'close' | 'information' | 'analyze'; body: Schemas['CaseCommand'] | Schemas['CaseAction'] | Schemas['Verification'] };
export function CaseControls({ detail, refresh, sme = false }: { detail: Schemas['CaseDetail']; refresh: () => void; sme?: boolean }) {
  const { api, demo, identity } = useSession(); const [note, setNote] = useState(''); const [kind, setKind] = useState<Command['kind']>(sme ? 'information' : 'actions');
  const [action, setAction] = useState(''); const [fact, setFact] = useState(''); const [evidence, setEvidence] = useState<string[]>([]); const [error, setError] = useState('');
  const command = useCommand<Command, Schemas['CaseDetail']>(`parcelcare.case.${demo ? 'demo' : 'live'}.${identity!.actor_id}.${detail.id}`, async (saved, key) => {
    const result = await api!.caseCommand(detail.id, saved.kind, saved.body, key);
    if (result.id !== detail.id || !Number.isInteger(result.version) || result.version < saved.body.expected_version || typeof result.source_version !== 'string') throw new ApiError(502, 'INVALID_RESPONSE', 'Case update could not be confirmed. Retry the original command.');
    return result;
  }, refresh);
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!note.trim()) { setError('A written note is required.'); return; }
    const body: Schemas['CaseCommand'] = { expected_version: detail.version, source_version: detail.source_version, note: note.trim(), evidence_ids: evidence };
    if (kind === 'actions' && !detail.allowed_actions?.includes(action)) { setError('Choose an allowed action.'); return; }
    if (kind === 'verifications' && (!fact || !evidence.length)) { setError('Select a physical fact and uploaded evidence.'); return; }
    if ((kind === 'close' || kind === 'verifications') && !window.confirm('Confirm you have physically verified these facts. AI output or an approval alone is insufficient.')) return;
    void command.execute({ kind, body: kind === 'actions' ? { ...body, action: action as Schemas['CaseAction']['action'], policy_version: detail.policy_version } : kind === 'verifications' ? { ...body, fact } : body });
  }
  if (['closed','resolved'].includes(detail.status)) return null;
  return <Card className="my-5"><h2 className="text-lg font-semibold">{sme ? 'Provide information / အချက်အလက်ပေးရန်' : 'Case actions / ဆောင်ရွက်ရန်'}</h2>
    {command.result && <p role="status" className="my-3">Saved case state: {human(command.result.status)}{command.result.job_id ? ' · Analysis queued; awaiting worker result.' : ''}</p>}
    {(error || command.error) && <p role="alert" className="my-3 text-red-700">{error || command.error}</p>}
    {command.pending && <div role="status" className="my-3"><p>The original request needs reconciliation. / မူလတောင်းဆိုချက် ပြန်စစ်ရန်</p><Button disabled={command.busy} onClick={() => void command.execute()}>Retry original case request</Button></div>}
    <form onSubmit={submit}><fieldset disabled={!command.ready || command.busy || !!command.pending} className="mt-4 space-y-4">
      {!sme && <><label className="block">Operation<select aria-label="Case operation" className="ml-3 max-w-full rounded border p-2" value={kind} onChange={e => setKind(e.target.value as Command['kind'])}><option value="actions">Allowed action</option><option value="analyze">Analyze</option><option value="verifications">Verify physical fact</option><option value="close">Verify and close</option></select></label>
      {kind === 'actions' && <label className="block">Allowed action<select aria-label="Allowed action" className="ml-3 max-w-full rounded border p-2" value={action} onChange={e => setAction(e.target.value)}><option value="">Select</option>{detail.allowed_actions?.filter(a => a !== 'update_workflow').map(a => <option key={a} value={a}>{human(a)}</option>)}</select></label>}
      {kind === 'verifications' && <label className="block">Physical fact<select aria-label="Physical fact" className="ml-3 max-w-full rounded border p-2" value={fact} onChange={e => setFact(e.target.value)}><option value="">Select</option>{[...new Set([...detail.required_facts.filter(f => f !== 'sme_decision_recorded'), 'remainder_completed'])].map(f => <option key={f} value={f}>{human(f)}</option>)}</select></label>}</>}
      <label className="block">Written note / မှတ်ချက်<textarea aria-label="Case note" value={note} onChange={e => setNote(e.target.value)} required maxLength={2000} className="mt-2 block min-h-24 w-full rounded border p-3" /></label>
      <div>Uploaded evidence{detail.evidence.filter((e): e is Record<string, unknown> & { id: string } => e.uploaded === true && typeof e.id === 'string').map(e => <label key={e.id} className="mt-2 block break-all text-sm"><input type="checkbox" checked={evidence.includes(e.id)} onChange={event => setEvidence(current => event.target.checked ? [...current,e.id] : current.filter(id => id !== e.id))} /> {e.id}</label>)}</div>
      <Button type="submit">{command.busy ? 'Saving…' : 'Submit case request'}</Button>
    </fieldset></form></Card>;
}
