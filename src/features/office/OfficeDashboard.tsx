'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRightIcon, ArrowUpRightIcon, BellIcon, CaretRightIcon, CheckCircleIcon, ClockIcon, ClipboardTextIcon, DotsThreeIcon, FlagIcon, HouseIcon, ListIcon, MagnifyingGlassIcon, PackageIcon, PlusIcon, SparkleIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { seedCases, initialActivity, type Activity, type OfficeCase, type Priority } from './model';
import './office.css';

type View = 'Overview' | 'Exceptions' | 'Shipments' | 'Activity';
type Queue = 'All open' | 'Needs review' | 'Escalated' | 'Resolved';
const STORE = 'parcelcare-office-demo-v1';
const priorities: Priority[] = ['Critical', 'High', 'Normal', 'Low'];
const selectClass = 'h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
function PriorityBadge({ value }: { value: Priority }) {
  return <span className={`office-priority office-priority-${value.toLowerCase()}`}><span aria-hidden="true" />{value}</span>;
}
function AIIndicator({ value }: { value: OfficeCase['ai'] }) {
  return <span className={`office-ai ${value === 'Ready for review' ? 'office-ai-ready' : ''}`}><SparkleIcon aria-hidden="true" weight="duotone" />{value}</span>;
}

export default function OfficeDashboard() {
  const [cases, setCases] = useState(seedCases);
  const [activity, setActivity] = useState(initialActivity);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('Overview');
  const [queue, setQueue] = useState<Queue>('All open');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('All priorities');
  const [sme, setSme] = useState('All SMEs');
  const [mine, setMine] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [escalateId, setEscalateId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!mobileNav) return;
    const previous = document.activeElement as HTMLElement | null;
    const drawer = navRef.current;
    drawer?.querySelector<HTMLElement>('a,button')?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { setMobileNav(false); return; }
      if (event.key !== 'Tab' || !drawer) return;
      const nodes = [...drawer.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [mobileNav]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved?.version === 1 && Array.isArray(saved.cases) && Array.isArray(saved.activity) && saved.cases.every((c: OfficeCase) => typeof c.id === 'string' && Array.isArray(c.facts) && Array.isArray(c.evidence) && priorities.includes(c.priority))) {
        setCases(saved.cases); setActivity(saved.activity);
      }
    } catch { /* Corrupt/unavailable demo storage falls back to fixtures. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(STORE, JSON.stringify({ version: 1, cases, activity })); } catch { setMessage('Browser storage is unavailable. Changes will last for this visit only.'); }
  }, [cases, activity, ready]);
  const selected = cases.find(c => c.id === selectedId);
  const escalating = cases.find(c => c.id === escalateId);
  const open = cases.filter(c => c.status !== 'Resolved');
  const review = open.filter(c => c.ai === 'Ready for review' && c.status !== 'Escalated');
  const escalated = open.filter(c => c.status === 'Escalated');
  const resolved = cases.filter(c => c.status === 'Resolved');
  const filtered = cases.filter(c => {
    const inQueue = queue === 'Resolved' ? c.status === 'Resolved' : queue === 'Escalated' ? c.status === 'Escalated' : queue === 'Needs review' ? c.ai === 'Ready for review' && !['Resolved', 'Escalated'].includes(c.status) : c.status !== 'Resolved';
    return inQueue && (priority === 'All priorities' || c.priority === priority) && (sme === 'All SMEs' || c.sme === sme) && (!mine || c.owner === 'Thiri Hnin') && `${c.id} ${c.title} ${c.shipment} ${c.sme}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => priorities.indexOf(a.priority) - priorities.indexOf(b.priority));
  function log(caseId: string, text: string) {
    setActivity(a => [{ id: crypto.randomUUID(), caseId, text, time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yangon' }).format(new Date()) }, ...a]);
  }
  function update(id: string, change: Partial<OfficeCase>, note: string) {
    setCases(current => current.map(c => c.id === id ? { ...c, ...change } : c));
    log(id, note); setMessage(`Demo saved · ${note}`);
  }
  function navigate(next: View) { setView(next); setMobileNav(false); }
  function escalate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!escalating || escalating.status === 'Resolved' || escalating.status === 'Escalated') return;
    const reason = String(new FormData(event.currentTarget).get('reason') || '').trim();
    if (!reason) return;
    update(escalating.id, { status: 'Escalated', owner: 'Warehouse manager' }, `Escalated to warehouse manager by Thiri Hnin: ${reason}`);
    setEscalateId(null);
  }
  function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const source = seedCases.find(c => c.shipment === data.get('shipment'))!;
    const title = String(data.get('description') || '').trim();
    if (!title) return;
    const id = `EX-${Math.max(...cases.map(c => Number(c.id.slice(3)))) + 1}`;
    const item: OfficeCase = { id, title, shipment: source.shipment, sme: source.sme, type: String(data.get('type')), priority: data.get('priority') as Priority, status: 'Open', ai: 'Queued', owner: 'Thiri Hnin', age: 'Just now', facts: [title, 'Staff observation requires physical verification.'], proposal: 'Analysis is not available yet. Collect verified source records and evidence before taking action.', evidence: [] };
    const existing = open.find(c => c.shipment === item.shipment && c.type === item.type);
    if (existing) {
      update(existing.id, { facts: [...existing.facts, `Additional staff observation: ${title}`] }, 'Added an observation to the matching active demo case');
      setSelectedId(existing.id);
    } else {
      setCases(current => [item, ...current]); log(id, 'Thiri Hnin reported an exception'); setMessage(`Demo exception ${id} created`); setSelectedId(id);
    }
    setReportOpen(false); setQueue('All open'); setView('Exceptions'); setSearch(''); setPriority('All priorities'); setSme('All SMEs'); setMine(false);
  }
  const nav = [{ label: 'Overview' as View, icon: HouseIcon }, { label: 'Exceptions' as View, icon: WarningCircleIcon }, { label: 'Shipments' as View, icon: PackageIcon }, { label: 'Activity' as View, icon: ClockIcon }];
  return (
    <div className="office-app">
      <a href="#office-main" className="office-skip">Skip to main content</a>
      <aside ref={navRef} id="office-navigation" className={`office-sidebar ${mobileNav ? 'office-sidebar-open' : ''}`} aria-label="Office navigation">
        <Link href="/office" aria-label="ParcelCare home" className="office-logo"><Image src="/brand/parcelcare-logo.png" alt="ParcelCare" width={2171} height={724} priority /></Link>
        <div className="office-workspace"><span className="office-workspace-icon"><PackageIcon weight="duotone" /></span><span><strong>Yangon fulfilment hub</strong><small>Warehouse workspace</small></span><Button variant="ghost" size="icon-sm" aria-label="Close navigation" className="office-mobile-only" onClick={() => setMobileNav(false)}><XIcon /></Button></div>
        <p className="office-nav-caption">WORKSPACE</p>
        <nav>{nav.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => navigate(label)} aria-current={view === label ? 'page' : undefined} className="office-nav-item"><Icon aria-hidden="true" weight={view === label ? 'fill' : 'regular'} /><span>{label}</span>{label === 'Exceptions' && <span className="office-nav-count">{open.length}</span>}</button>)}</nav>
        <div className="office-sidebar-bottom"><div className="office-assistant-note"><SparkleIcon weight="duotone" /><strong>A little clarity, a lot less chasing.</strong><p>Review the evidence. Choose the next step. Keep everyone informed.</p></div><Link href="/design-system" className="office-guide-link">Design system <ArrowUpRightIcon /></Link><div className="office-person"><span className="office-avatar">TH</span><span><strong>Thiri Hnin</strong><small>Office staff · Demo role</small></span><span className="office-presence" aria-label="Demo user" /></div></div>
      </aside>
      {mobileNav && <button className="office-nav-backdrop" aria-label="Dismiss navigation" onClick={() => setMobileNav(false)} />}
      <div className="office-body">
        <header className="office-topbar"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" aria-label="Open navigation" aria-expanded={mobileNav} aria-controls="office-navigation" className="office-mobile-only" onClick={() => setMobileNav(true)}><ListIcon /></Button><span className="text-muted-foreground">Workspace</span><CaretRightIcon className="size-3 text-muted-foreground" /><span className="truncate font-medium">{view}</span></div><div className="flex items-center gap-4"><span className="office-demo-badge"><span />Demo workspace</span><Button variant="ghost" size="icon" aria-label="View recent activity" onClick={() => navigate('Activity')}><BellIcon /></Button><span className="office-avatar office-top-avatar">TH</span></div></header>
        <main id="office-main" className="office-main" tabIndex={-1}>
          <div className="office-page-heading"><div><p className="office-eyebrow">OFFICE STAFF · 21 OCTOBER 2026</p><h1>{view === 'Overview' ? 'A clearer view of your day.' : view === 'Exceptions' ? 'Every exception, a next step.' : view === 'Shipments' ? 'Shipments in focus.' : 'The story behind each action.'}</h1><p className="office-subtitle">{view === 'Overview' ? 'Keep goods moving. Resolve the exceptions that need you.' : view === 'Exceptions' ? 'Review evidence, coordinate decisions and escalate with context.' : view === 'Shipments' ? 'Shipment context for the cases in this demo workspace.' : 'A record of staff actions in this browser’s demo workspace.'}</p></div><Button onClick={() => setReportOpen(true)} className="office-report-button"><PlusIcon />Report exception</Button></div>
          <p className="office-demo-notice"><span>Fictitious demo records</span> · Changes stay in this browser. AI suggestions are illustrative; no live model or backend is connected.</p>
          {message && <div role="status" className="office-feedback"><CheckCircleIcon /><span>{message}</span><Button variant="ghost" size="icon-sm" aria-label="Dismiss notification" onClick={() => setMessage('')}><XIcon /></Button></div>}
          {view === 'Overview' && <>
            <section className="office-metrics" aria-label="Exception summary">
              {[{ label: 'Open exceptions', count: open.length, note: 'Across 5 SME organizations', icon: ClipboardTextIcon, filter: 'All open' as Queue }, { label: 'Needs your review', count: review.length, note: 'AI suggestions ready to review', icon: SparkleIcon, filter: 'Needs review' as Queue }, { label: 'Escalated', count: escalated.length, note: 'With the warehouse manager', icon: FlagIcon, filter: 'Escalated' as Queue }, { label: 'Resolved', count: resolved.length, note: 'Verified in the demo fixtures', icon: CheckCircleIcon, filter: 'Resolved' as Queue }].map(({ label, count, note, icon: Icon, filter }) => <button key={label} className={`office-metric ${queue === filter ? 'office-metric-selected' : ''}`} onClick={() => setQueue(filter)}><div><span>{label}</span><Icon aria-hidden="true" /></div><strong>{String(count).padStart(2, '0')}</strong><p>{note}</p></button>)}
            </section>
            <div className="office-focus-strip"><span className="office-focus-icon"><SparkleIcon weight="duotone" /></span><div><strong>Your next best step</strong><p>{review.length ? `${review.length} open cases have a sample recommendation ready. Start with ${review[0].id} for ${review[0].sme}.` : 'Review incoming evidence and keep open cases moving toward verification.'}</p></div><Button variant="outline" onClick={() => { setQueue('Needs review'); document.getElementById('exception-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Review cases <ArrowRightIcon /></Button></div>
          </>}
          {(view === 'Overview' || view === 'Exceptions') && <div className={`office-content-grid ${view === 'Exceptions' ? 'office-content-wide' : ''}`}>
            <section id="exception-queue" className="office-queue" aria-labelledby="queue-title"><div className="office-section-heading"><div><h2 id="queue-title">Exception queue <span>{filtered.length}</span></h2><p>Prioritized work, with the context to act.</p></div><Button variant="ghost" size="icon-sm" aria-label="Clear queue filters" onClick={() => { setSearch(''); setPriority('All priorities'); setSme('All SMEs'); setMine(false); setQueue('All open'); }}><DotsThreeIcon /></Button></div>
              <div className="office-queue-tabs" role="group" aria-label="Queue status">{(['All open', 'Needs review', 'Escalated', 'Resolved'] as Queue[]).map(tab => <button key={tab} aria-pressed={queue === tab} onClick={() => setQueue(tab)}>{tab}<span>{tab === 'All open' ? open.length : tab === 'Needs review' ? review.length : tab === 'Escalated' ? escalated.length : resolved.length}</span></button>)}</div>
              <div className="office-filters"><div className="office-search"><MagnifyingGlassIcon aria-hidden="true" /><Input aria-label="Search exceptions" placeholder="Search cases, shipments or SMEs…" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Filter by priority" className={selectClass} value={priority} onChange={e => setPriority(e.target.value)}><option>All priorities</option>{priorities.map(p => <option key={p}>{p}</option>)}</select><select aria-label="Filter by SME" className={selectClass} value={sme} onChange={e => setSme(e.target.value)}><option>All SMEs</option>{[...new Set(cases.map(c => c.sme))].map(name => <option key={name}>{name}</option>)}</select><Button variant={mine ? 'secondary' : 'outline'} aria-pressed={mine} onClick={() => setMine(!mine)}>Assigned to me</Button></div>
              <div className="office-table-wrap"><Table><TableHeader><TableRow><TableHead className="pl-5">Exception</TableHead><TableHead>Priority</TableHead><TableHead>AI status</TableHead><TableHead>Owner / workflow</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{filtered.map(c => <TableRow key={c.id}><TableCell className="office-case-cell"><button onClick={() => setSelectedId(c.id)} className="office-case-link"><span>{c.id}<small>{c.age === 'Just now' ? c.age : `${c.age} ago`}</small></span><strong>{c.title}</strong></button><p>{c.sme}<span>·</span>{c.shipment}</p></TableCell><TableCell><PriorityBadge value={c.priority} /></TableCell><TableCell><AIIndicator value={c.ai} /></TableCell><TableCell><span className="office-owner">{c.owner === 'Unassigned' ? <span className="office-unassigned">—</span> : <span className="office-mini-avatar">{c.owner === 'Thiri Hnin' ? 'TH' : 'WM'}</span>}{c.owner}</span><small className="office-workflow">{c.status}</small></TableCell><TableCell className="pr-5 text-right"><Button variant="ghost" size="icon-sm" aria-label={`Open ${c.id}`} onClick={() => setSelectedId(c.id)}><ArrowUpRightIcon /></Button></TableCell></TableRow>)}</TableBody></Table></div>
              {!filtered.length && <div className="office-empty"><MagnifyingGlassIcon /><h3>No cases match these filters</h3><p>Try another SME, priority or search term.</p><Button variant="outline" onClick={() => { setSearch(''); setPriority('All priorities'); setSme('All SMEs'); setMine(false); }}>Clear filters</Button></div>}
              <div className="office-queue-footer"><span>Showing {filtered.length} of {cases.length} demo exceptions</span><span><span className="office-small-dot" />Browser-local workspace</span></div>
            </section>
            {view === 'Overview' && <aside className="office-right-rail" aria-label="Work insights"><Card className="office-ai-card"><CardContent><div className="office-rail-label"><span className="office-focus-icon"><SparkleIcon weight="duotone" /></span><Badge variant="outline">AI ASSIST</Badge></div><h2>Less investigating.<br />More resolving.</h2><p>Evidence-led suggestions help you find the next step. You stay in control.</p><div className="office-ai-breakdown"><span><i className="office-dot-teal" />Ready for review<strong>{open.filter(c => c.ai === 'Ready for review').length}</strong></span><span><i className="office-dot-yellow" />Needs information<strong>{open.filter(c => c.ai === 'Needs information').length}</strong></span><span><i className="office-dot-gray" />Queued<strong>{open.filter(c => c.ai === 'Queued').length}</strong></span></div><p className="office-ai-footnote">Illustrative statuses · not live AI analysis</p></CardContent></Card><section className="office-activity-card"><div className="flex items-center justify-between"><h2>Recent activity</h2><ClockIcon className="text-muted-foreground" /></div><ol>{activity.slice(0, 3).map(a => <li key={a.id}><span className="office-timeline-dot" /><small>{a.time} · Demo timeline</small><button onClick={() => setSelectedId(a.caseId)}>{a.caseId}</button><p>{a.text}</p></li>)}</ol><Button variant="ghost" className="w-full justify-between" onClick={() => navigate('Activity')}>View all activity<ArrowRightIcon /></Button></section></aside>}
          </div>}
          {view === 'Shipments' && <section className="office-queue"><div className="office-section-heading"><div><h2>Shipment references</h2><p>Fictitious source records linked to the exception queue.</p></div></div><Table><TableHeader><TableRow><TableHead>Shipment</TableHead><TableHead>SME</TableHead><TableHead>Issue</TableHead><TableHead>Case</TableHead></TableRow></TableHeader><TableBody>{cases.map(c => <TableRow key={c.id}><TableCell className="font-medium">{c.shipment}</TableCell><TableCell>{c.sme}</TableCell><TableCell>{c.type}</TableCell><TableCell><Button variant="link" onClick={() => setSelectedId(c.id)}>{c.id}<ArrowUpRightIcon /></Button></TableCell></TableRow>)}</TableBody></Table></section>}
          {view === 'Activity' && <section className="office-queue"><div className="office-section-heading"><div><h2>Workspace activity</h2><p>Demo actions are saved locally, not to the server audit log.</p></div></div><ol className="office-full-activity">{activity.map(a => <li key={a.id}><span className="office-mini-avatar"><ClockIcon /></span><div><button onClick={() => setSelectedId(a.caseId)}>{a.caseId}</button><p>{a.text}</p></div><time>{a.time}</time></li>)}</ol></section>}
          <footer className="office-footer"><span>ParcelCare · Every parcel, accounted for.</span><span>Evidence first. People in control.</span></footer>
        </main>
      </div>
      <Dialog open={!!selected} onOpenChange={isOpen => { if (!isOpen) setSelectedId(null); }}><DialogContent className="office-case-dialog"><DialogHeader><div className="mb-2 flex items-center gap-3"><span className="text-xs text-muted-foreground">{selected?.id}</span>{selected && <PriorityBadge value={selected.priority} />}</div><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>{selected?.sme} · {selected?.shipment} · {selected?.status}</DialogDescription></DialogHeader>{selected && <><div className="office-detail-grid"><section><h3>Recorded facts</h3><ul className="office-facts">{selected.facts.map((fact, i) => <li key={i}><CheckCircleIcon />{fact}</li>)}</ul><h3>Evidence references</h3><div className="office-evidence">{selected.evidence.length ? selected.evidence.map(e => <span key={e}><ClipboardTextIcon />{e}</span>) : <p>No evidence attached yet.</p>}</div><p className="text-xs text-muted-foreground">Sample references only; no real files are attached.</p></section><section className="office-proposal"><SparkleIcon weight="duotone" /><h3>Suggested next step</h3><AIIndicator value={selected.ai} /><p>{selected.proposal}</p><small>Illustrative recommendation, not a live model response. Stock edits, dispatch and verified closure remain human-controlled.</small></section></div><section className="office-case-timeline"><h3>Case activity</h3>{activity.filter(a => a.caseId === selected.id).length ? activity.filter(a => a.caseId === selected.id).map(a => <p key={a.id}><time>{a.time}</time>{a.text}</p>) : <p>Imported as a fictitious demo case.</p>}</section><div className="office-detail-actions"><span>Owner: {selected.owner}</span><div>{selected.owner === 'Unassigned' && selected.status !== 'Resolved' && <Button variant="outline" onClick={() => update(selected.id, { owner: 'Thiri Hnin', status: 'In review' }, 'Thiri Hnin assigned this case to herself')}>Assign to me</Button>}<Button variant="outline" disabled={['Resolved', 'Escalated'].includes(selected.status)} onClick={() => { setEscalateId(selected.id); setSelectedId(null); }}><FlagIcon />Escalate</Button><Button disabled={['Resolved', 'Escalated', 'Awaiting verification'].includes(selected.status)} onClick={() => update(selected.id, { status: 'Awaiting verification' }, 'Thiri Hnin requested physical verification; case remains open')}>Request verification<ArrowRightIcon /></Button></div></div></>}</DialogContent></Dialog>
      <Dialog open={!!escalating} onOpenChange={isOpen => { if (!isOpen) setEscalateId(null); }}><DialogContent><DialogHeader><DialogTitle>Escalate {escalating?.id}</DialogTitle><DialogDescription>Send this demo case to the warehouse manager with a clear reason. Priority stays unchanged.</DialogDescription></DialogHeader><form onSubmit={escalate} className="space-y-5"><div className="space-y-2"><Label htmlFor="escalation-reason">Reason for escalation</Label><Textarea id="escalation-reason" name="reason" required minLength={5} maxLength={1000} placeholder="What needs a manager’s attention?" /></div><p className="text-xs text-muted-foreground">This records a browser-local demo action. It does not send an external message.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setSelectedId(escalateId); setEscalateId(null); }}>Cancel</Button><Button type="submit"><FlagIcon />Confirm escalation</Button></div></form></DialogContent></Dialog>
      <Dialog open={reportOpen} onOpenChange={setReportOpen}><DialogContent><DialogHeader><DialogTitle>Report an exception</DialogTitle><DialogDescription>Record a fictitious observation for the office queue. Matching active shipment/issue types receive an additional observation.</DialogDescription></DialogHeader><form onSubmit={report} className="space-y-4"><div className="space-y-2"><Label htmlFor="report-shipment">Shipment</Label><select id="report-shipment" name="shipment" className={`${selectClass} w-full`}>{seedCases.map(c => <option key={c.shipment}>{c.shipment}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="report-type">Issue type</Label><select id="report-type" name="type" className={`${selectClass} w-full`}>{[...new Set(seedCases.map(c => c.type))].map(type => <option key={type}>{type}</option>)}</select></div><div className="space-y-2"><Label htmlFor="report-priority">Priority</Label><select id="report-priority" name="priority" defaultValue="Normal" className={`${selectClass} w-full`}>{priorities.map(p => <option key={p}>{p}</option>)}</select></div></div><div className="space-y-2"><Label htmlFor="report-description">What happened?</Label><Textarea id="report-description" name="description" required minLength={5} maxLength={1000} placeholder="Describe the observation and what needs checking." /></div><Button type="submit" className="w-full">Save demo exception</Button></form></DialogContent></Dialog>
    </div>
  );
}
