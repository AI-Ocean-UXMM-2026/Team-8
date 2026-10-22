'use client';
import {NavLabel} from '../../shared/layout/global-header';
import {WorkspaceControls} from '../../shared/layout/workspace-controls';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {usePathname} from 'next/navigation';
import '../warehouse/shell.css';
import { useSession } from '../auth/session';
import { Button, Card } from '../../shared/ui';
import { workspacePath } from '../auth/roles';
export function PortalShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname=usePathname(),[mobileOpen,setMobileOpen]=useState(false);
  const menu=useRef<HTMLButtonElement>(null);
  useEffect(()=>setMobileOpen(false),[pathname]);
  useEffect(() => { if (session.status === 'signed_out') window.location.replace('/login'); }, [session.status]);
  if (session.status !== 'ready') return <main className="grid min-h-screen place-items-center bg-canvas p-6"><Card><h1 className="text-2xl font-semibold">ParcelCare · {session.audience}</h1><p role="status" className="my-5">{session.status === 'loading' ? 'Checking session / စစ်ဆေးနေသည်' : session.status === 'forbidden' ? 'An active membership is required / အသုံးပြုခွင့် မရှိပါ' : session.status === 'signed_out' ? 'Please sign in / အကောင့်ဝင်ပါ' : 'Workspace unavailable / လက်ရှိ မရရှိနိုင်ပါ'}</p><Button asChild><Link href={workspacePath(session.identity?.memberships ?? []) ?? "/login"}>{session.status === "forbidden" ? "Go to my workspace" : "Sign in"}</Link></Button><Button className="ml-3" variant="outline" onClick={session.reload}>Try again</Button></Card></main>;
  const base=session.demo?'/demo/sme':'/sme';
  if(session.audience==='sme')return <div className="pc-workspace warehouseWorkspace bg-canvas text-ink"><a className="sr-only focus:not-sr-only focus:block focus:p-4" href="#portal-main">Skip to content</a><WorkspaceControls/><div className="warehouseLayout">
    <aside className={`warehouseSidebar ${mobileOpen?'warehouseSidebarOpen':''}`} aria-label="SME sidebar" onKeyDown={e=>{if(e.key==='Escape'){setMobileOpen(false);document.querySelector<HTMLButtonElement>('.sidebarToggle')?.focus()}}}>
      <div className="warehouseSidebarBrand"><Link href={base} aria-label="ParcelCare home" className="warehouseLogo"><img src="/brand/parcelcare-logo.png" alt="ParcelCare" width="2171" height="724"/></Link><button ref={menu} className="warehouseMenuToggle" aria-expanded={mobileOpen} aria-controls="sme-sidebar-controls" onClick={()=>setMobileOpen(v=>!v)}>Menu</button></div>
      <div id="sme-sidebar-controls" className="warehouseSidebarScroll"><p className="warehouseNavLabel">SME operations</p><nav className="warehouseNavigation" aria-label="SME">{[['Overview',''],['GPS tracking','/tracking'],...(!session.demo?[['Notifications','/notifications']]:[])].map(([name,path])=><Link key={name} href={base+path} aria-current={pathname===base+path?'page':undefined} title={name} aria-label={name}><NavLabel name={name}/></Link>)}</nav>
        <div className="warehouseSelector"><label htmlFor="sme-choice" className="mb-2 block text-xs text-muted">SME</label><select id="sme-choice" className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-ink" value={session.smeId} onChange={e=>session.setSmeId(e.target.value)}>{session.identity?.memberships.filter(m=>m.role==='sme').map(m=><option key={`${m.warehouse_id}:${m.sme_id}`} value={m.sme_id!}>SME · {m.sme_id!.slice(-4)}</option>)}</select></div>
        {session.demo&&<nav aria-label="Demo workspaces" className="workspaceRoleLinks"><Link href="/demo/warehouse">Warehouse dashboard →</Link><a href="/demo/manager">Warehouse manager dashboard →</a><Link href="/demo/courier">Courier dashboard →</Link></nav>}
      </div><div className="warehouseSidebarFooter"><section className="warehouseProfile" aria-label="User profile"><span className="warehouseAvatar" aria-hidden="true">PC</span><div><strong>SME owner</strong><p>Account · <span data-user-content>{session.identity?.actor_id.slice(-8)}</span></p></div></section></div>
    </aside><div className="warehousePage"><main id="portal-main" className="p-5 md:p-8" key={`${session.warehouseId}:${session.smeId}`}>{children}</main></div>
  </div></div>;
  return <div className="min-h-screen bg-canvas text-ink"><WorkspaceControls/><header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white px-5 pb-5 pt-14"><Link className="text-2xl font-bold text-brand" href="/rider">ParcelCare</Link><nav aria-label="Workspace"><Link className="mr-5 underline" href="/rider">Rider tasks</Link></nav></header><main id="portal-main" className="mx-auto max-w-6xl p-5 md:p-8" key={session.warehouseId}>{children}</main></div>;
}
