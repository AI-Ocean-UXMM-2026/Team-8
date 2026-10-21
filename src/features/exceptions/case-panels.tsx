import { Badge, Card } from '../../shared/ui';
import { type CaseView, text } from './case-view';

const human = (value: string) => value.replaceAll('_', ' ');
const time = (value: unknown) => {
  const raw = text(value); const date = new Date(raw);
  return raw && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Yangon' }).format(date) : 'Time unavailable';
};

// Public read-only panels for warehouse and SME consumers. Role-specific commands
// belong outside these panels; callers must supply an already authorized record.
export function CasePanels({ item }: { item: CaseView }) {
  return <div className="grid min-w-0 gap-4 break-words">
    <Card><h2 className="text-lg font-semibold">Case facts / ကိစ္စအချက်အလက်</h2>
      <div className="my-4 flex flex-wrap gap-2"><Badge>Priority: {human(item.priority)}</Badge><Badge>Handling: {human(item.handling_mode)}</Badge><Badge>State: {human(item.status)}</Badge></div>
      <p className="whitespace-pre-wrap">{item.summary}</p><dl className="mt-4 grid gap-2 text-sm"><dt className="font-semibold">Responsibility</dt><dd>{item.responsible_party === 'UNDETERMINED' ? 'Undetermined — requires evidence review / မသတ်မှတ်ရသေးပါ' : human(item.responsible_party)}</dd><dt className="font-semibold">Owner</dt><dd>{item.owner_id === null ? 'Unassigned' : item.owner_id ?? 'Owner information unavailable'}</dd></dl>
      <p className="mt-4 text-sm text-muted-foreground">Priority, human handling and approval are separate. An AI summary or an SME decision alone does not verify physical completion.</p>
    </Card>
    <Card><h2 className="text-lg font-semibold">Evidence references / အထောက်အထား</h2>{item.evidence_ids.length ? <ul className="mt-3 space-y-2 text-sm">{item.evidence_ids.map(id => <li key={id} className="break-all">{id}<span className="ml-2 text-muted-foreground">{item.evidence.find(e => e.id === id)?.uploaded === true ? 'Uploaded; verification is separate' : 'Reference only; availability unconfirmed'}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No evidence references supplied.</p>}</Card>
    <Card><h2 className="text-lg font-semibold">AI investigation / AI စစ်ဆေးချက်</h2>{item.analyses.length ? item.analyses.map((analysis, index) => {
      const raw = analysis.structured_output ?? analysis.output;
      const output = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      const missing = Array.isArray(output.missing_information) ? output.missing_information.filter((v): v is string => typeof v === 'string') : [];
      return <div key={text(analysis.id) || index} className="mt-4 border-t border-slate-100 pt-4"><p className="text-xs text-muted-foreground">Recorded model: {text(analysis.model) || 'Unavailable'} · {time(analysis.created_at)}</p><p className="mt-2 whitespace-pre-wrap">{text(output.summary) || text(analysis.summary) || 'No displayable summary supplied.'}</p><h3 className="mt-3 font-semibold">Missing information</h3>{missing.length ? <ul className="mt-2 list-inside list-disc">{missing.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No missing-information list supplied.</p>}</div>;
    }) : <p className="mt-3 text-sm text-muted-foreground">No AI analysis supplied. / AI စစ်ဆေးချက် မရှိသေးပါ။</p>}</Card>
    <Card><h2 className="text-lg font-semibold">Timeline / ဖြစ်စဉ်မှတ်တမ်း</h2>{item.events.length ? <ol className="mt-3 space-y-4">{item.events.map((event, i) => {
      const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
      return <li key={text(event.id) || i} className="border-l-2 border-emerald-100 pl-4"><p className="font-semibold">{human(text(event.event_type) || text(event.type) || 'Recorded event')}</p><p className="mt-1 whitespace-pre-wrap text-sm">{text(event.note) || text(payload.note)}</p><p className="mt-1 text-xs text-muted-foreground">{time(event.created_at)} · Actor: {text(event.actor_id) || 'Unavailable'}</p></li>;
    })}</ol> : <p className="mt-3 text-sm text-muted-foreground">No timeline supplied.</p>}</Card>
    <Card><h2 className="text-lg font-semibold">Verification requirements / အတည်ပြုရန်</h2>{item.required_facts.length ? <ul className="mt-3 list-inside list-disc">{item.required_facts.map(fact => <li key={fact}>{human(fact)}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Verification requirements have not been supplied.</p>}<p className="mt-3 text-sm text-muted-foreground">This view is read-only. It does not approve, attribute liability or close a case.</p></Card>
  </div>;
}
