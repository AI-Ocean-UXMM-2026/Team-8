import Link from 'next/link';
import { Badge, Card } from '../../shared/ui';
import { PageTitle } from '../warehouse/shared';

// Fixed teaching examples: these are independent of operational demo cases.
const examples = [
  { id: 'SAMPLE-01', issue: 'Delivery delay', priority: 'Normal', owner: 'Dispatch team', flag: 'on_track', label: 'On track', response: 'Responded after 20 minutes · target 1 hour', resolution: '18 hours remaining · target 24 hours', note: 'The courier confirmed the revised delivery plan. Dispatch will check the next delivery update.', next: 'Follow up with the courier before the resolution deadline.' },
  { id: 'SAMPLE-02', issue: 'Damaged parcel', priority: 'High', owner: 'Warehouse investigation team', flag: 'at_risk', label: 'At risk', response: 'Responded after 10 minutes · target 30 minutes', resolution: '1 hour remaining · target 8 hours', note: 'Damage photos have been reviewed. The team is waiting for a replacement decision.', next: 'Review the evidence and agree on a resolution before time runs out.' },
  { id: 'SAMPLE-03', issue: 'Missing parcel', priority: 'Critical', owner: 'Warehouse manager', flag: 'overdue', label: 'Overdue', response: 'Responded after 8 minutes · target 15 minutes', resolution: '2 hours overdue · target 4 hours', note: 'The parcel has not been located after the stock and handover checks. The resolution deadline was missed.', next: 'Escalated for management review. The manager should coordinate the investigation and update the SME.' },
];

export function DemoDeadlines() {
  return <div className="slaWorkspace">
    <PageTitle title="Case deadlines" my="ပြဿနာဖြေရှင်းရန် သတ်မှတ်ချိန်" description="See which issues need attention and when a response or resolution is due." />
    <div className="slaHealth"><strong>Demo examples · fixed snapshot</strong><p>These three fictional cases explain service-level agreement (SLA) deadlines. Times and team assignments are illustrative; they do not count down or change your demo cases.</p><p lang="my">နမူနာအချက်အလက်များသာ ဖြစ်ပါသည်။ အချိန်မီ၊ အချိန်နီး၊ အချိန်ကျော် အခြေအနေများကို နှိုင်းယှဉ်ကြည့်နိုင်ပါသည်။</p></div>
    <Card><h2>How deadlines work</h2><p className="slaHint">First response means replying to the SME. Resolution means addressing the reported problem. Targets run continuously, including nights and weekends. Waiting for another person does not pause the clock.</p><p className="slaHint">Staff monitor deadlines and work on cases. Warehouse managers (owners) configure targets in the signed-in workspace. The targets below are examples, not recommended operating commitments.</p></Card>
    <section className="slaDemoGrid" aria-label="Three example case deadlines">{examples.map(item => <Card key={item.id}>
      <div className="slaHeading"><span>{item.id}</span><Badge className={`slaFlag sla-${item.flag}`}>{item.label}</Badge></div>
      <h2 className="slaDemoTitle">{item.issue}</h2>
      <p className="slaHint">{item.priority} priority · {item.owner}</p>
      <dl className="slaDemoTargets"><div><dt>First response</dt><dd>{item.response}</dd></div><div><dt>Resolution</dt><dd>{item.resolution}</dd></div></dl>
      <details className="slaDemoDetails"><summary>View {item.id} case details</summary><p>{item.note}</p><h3>Next action</h3><p>{item.next}</p>{item.flag === 'overdue' && <p className="slaAlert">Escalated to management · sample only</p>}</details>
    </Card>)}</section>
    <p className="slaHint"><Link className="underline" href="/demo/warehouse/exceptions">Open demo cases →</Link></p>
  </div>;
}
