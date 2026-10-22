import { Badge } from '../../shared/ui';
import { text } from './case-view';

const human = (value: string) => value.replaceAll('_', ' ');
export function MakerCheckerReview({ analysis }: { analysis: Record<string, unknown> }) {
  const value = analysis.checker_output;
  const review = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const status = text(analysis.review_status) || 'legacy_unchecked';
  const execution = text(analysis.execution_status) || 'blocked';
  const findings = Array.isArray(review.findings) ? review.findings.filter((f): f is string => typeof f === 'string') : [];
  return <section aria-label="Independent AI checker" className="mt-4 rounded-lg border p-4">
    <h3 className="font-semibold">Independent AI checker</h3>
    <div className="my-3 flex flex-wrap gap-2"><Badge>Checker: {human(status)}</Badge><Badge>Execution: {human(execution)}</Badge></div>
    <p className="text-sm">Checker model: <span data-user-content>{text(analysis.checker_model) || 'Not recorded'}</span></p>
    {status === 'legacy_unchecked' ? <p className="mt-2 text-sm">This older analysis has no independent checker approval. Automatic execution is blocked.</p> :
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">{[
        ['evidence_supported', 'Evidence support'], ['classification_correct', 'Classification'],
        ['priority_correct', 'Priority'], ['action_authorized', 'Action authorization'],
      ].map(([key, label]) => <div key={key}><dt className="font-medium">{label}</dt><dd>{review[key] === true ? 'Passed' : review[key] === false ? 'Failed' : 'Not completed'}</dd></div>)}</dl>}
    {findings.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm" data-user-content>{findings.map((finding, i) => <li key={i}>{finding}</li>)}</ul>}
    {text(analysis.review_reason) && <p className="mt-3 text-sm">Review reason: {human(text(analysis.review_reason))}</p>}
    <p className="mt-3 text-sm text-muted-foreground">Checker approval alone does not execute an action. Current source data, policy authorization and human-review requirements are checked again.</p>
  </section>;
}
