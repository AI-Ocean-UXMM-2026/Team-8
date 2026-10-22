'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './sme.css';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '../auth/session';
import { Button, Card } from '../../shared/ui';
import { workspacePath } from '../auth/roles';
export function PortalShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  useEffect(() => { if (session.status === 'signed_out') window.location.replace('/login'); }, [session.status]);
  if (session.status !== 'ready') return <main className="grid min-h-screen place-items-center bg-canvas p-6"><Card><h1 className="text-2xl font-semibold">ParcelCare · {session.audience}</h1><p role="status" className="my-5">{session.status === 'loading' ? 'Checking session / စစ်ဆေးနေသည်' : session.status === 'forbidden' ? 'An active membership is required / အသုံးပြုခွင့် မရှိပါ' : session.status === 'signed_out' ? 'Please sign in / အကောင့်ဝင်ပါ' : 'Workspace unavailable / လက်ရှိ မရရှိနိုင်ပါ'}</p><Button asChild><Link href={workspacePath(session.identity?.memberships ?? []) ?? "/login"}>{session.status === "forbidden" ? "Go to my workspace" : "Sign in"}</Link></Button><Button className="ml-3" variant="outline" onClick={session.reload}>Try again</Button></Card></main>;
  if (session.audience === 'sme') {
    const base = session.demo ? '/demo/sme' : '/sme';
    const links = [{ href: base, label: 'Dashboard' }, { href: `${base}/tracking`, label: 'Shipment tracking' }, ...(!session.demo ? [{ href: '/sme/notifications', label: 'Notifications' }] : [])];
    return <div className="smeDesktopShell">
      <a className="sr-only focus:not-sr-only" href="#portal-main">Skip to content</a>
      <aside className="smeSidebar">
        <Link className="smeBrand" href={base}>ParcelCare</Link>
        <p className="smeWorkspaceLabel">SME workspace</p>
        <nav aria-label="Workspace">{links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</Link>)}</nav>
        <div className="smeSidebarFooter">{session.demo && <nav aria-label="Demo workspaces"><Link href="/demo/warehouse">Warehouse dashboard</Link><Link href="/demo/manager">Warehouse manager dashboard</Link><Link href="/demo/courier">Courier dashboard</Link></nav>}<Button variant="outline" onClick={() => void session.signOut()}>Sign out</Button></div>
      </aside>
      <div className="smeWorkspaceContent">
        <header className="smeTopbar"><label htmlFor="sme-choice">Business / လုပ်ငန်း</label><select id="sme-choice" value={session.smeId} onChange={e => session.setSmeId(e.target.value)}>{session.identity?.memberships.filter(m => m.role === 'sme').map(m => <option key={`${m.warehouse_id}:${m.sme_id}`} value={m.sme_id!}>{m.sme_id}</option>)}</select></header>
        <main id="portal-main" className="smeMain" key={`${session.warehouseId}:${session.smeId}`}>{children}</main>
      </div>
    </div>;
  }
  return <div className="min-h-screen bg-canvas text-ink"><a className="sr-only focus:not-sr-only" href="#portal-main">Skip to content</a><header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white px-5 pb-5 pt-14"><Link className="text-2xl font-bold text-brand" href={session.demo?'/demo/sme':`/${session.audience}`}>ParcelCare</Link><nav aria-label="Workspace"><Link className="mr-5 underline" href={session.demo?'/demo/sme':`/${session.audience}`}>Rider tasks</Link><Button variant="outline" onClick={() => void session.signOut()}>Sign out</Button></nav>{session.demo&&<nav aria-label="Demo workspaces" className="flex flex-wrap gap-4 text-sm"><Link href="/demo/warehouse">Warehouse dashboard</Link><Link href="/demo/manager">Warehouse manager dashboard</Link><Link href="/demo/courier">Courier dashboard</Link></nav>}</header><main id="portal-main" className="mx-auto max-w-6xl p-5 md:p-8" key={`${session.warehouseId}:${session.smeId}`}>{children}</main></div>;
}
