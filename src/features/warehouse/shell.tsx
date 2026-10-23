'use client';
import {SidebarProfile} from '../../shared/layout/account-menu';
import {NavLabel} from '../../shared/layout/global-header';
import {WorkspaceControls} from '../../shared/layout/workspace-controls';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import './shell.css';
import { Badge, Button, Card } from '../../shared/ui';
import { useSession } from '../auth/session';

export const selectClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink max-w-full';
export function WarehouseShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const [mobileOpen,setMobileOpen]=useState(false);
  const menuButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>setMobileOpen(false),[pathname]);
  const base = session.demo ? '/demo/warehouse' : '/warehouse';
  const [caseCount,setCaseCount]=useState<{warehouse:string;value:number}|null>(null);
  useEffect(()=>{
    if(session.status!=='ready'||!session.api)return;
    const controller=new AbortController();let active=true,busy=false;
    const update=async()=>{if(busy)return;busy=true;try{const result=await session.api!.getWarehouseOverview(session.warehouseId,controller.signal);if(active)setCaseCount({warehouse:session.warehouseId,value:result.open_cases});}catch{if(active)setCaseCount(null)}finally{busy=false}};
    void update();const timer=setInterval(()=>void update(),15000);
    const refresh=()=>void update();window.addEventListener('focus',refresh);window.addEventListener('parcelcare:warehouse-changed',refresh);
    return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('parcelcare:warehouse-changed',refresh)};
  },[session.api,session.status,session.warehouseId,pathname]);
  if (session.status !== 'ready') return <main data-session-state={session.status} className="grid min-h-screen place-items-center bg-canvas p-6 text-ink"><Card className="w-full max-w-lg">
    <h1 className="text-2xl font-semibold">ParcelCare warehouse</h1>
    {session.status === 'loading' ? <p role="status" className="mt-4">Checking your session… <span lang="my">စစ်ဆေးနေသည်</span></p> : <>
      <h2 className="mt-4 text-lg font-semibold">{session.status === 'signed_out' ? 'Please sign in' : session.status === 'forbidden' ? 'Warehouse access required' : 'Workspace unavailable'}</h2>
      <p role="alert" className="mt-3 text-sm text-muted">{session.status === 'forbidden' ? 'Your account does not have an active warehouse staff membership.' : session.status === 'signed_out' ? 'Your session has ended. Sign in to continue.' : 'We could not verify your workspace. Please retry or contact your administrator.'}</p>
      <div className="mt-6 flex gap-3"><Button asChild><Link href="/login">Sign in</Link></Button><Button variant="outline" onClick={session.reload}>Try again</Button></div>
      {!session.demo && <Link href="/demo" className="mt-4 inline-block text-sm text-brand underline">Open demo workspace</Link>}
    </>}
  </Card></main>;
  return <div className="pc-workspace warehouseWorkspace bg-canvas text-ink"><a className="sr-only focus:not-sr-only focus:block focus:p-4" href="#warehouse-main">Skip to content</a>
    <WorkspaceControls/><div className="warehouseLayout">
      <aside className={`warehouseSidebar ${mobileOpen?'warehouseSidebarOpen':''}`} aria-label="Warehouse sidebar" onKeyDown={e=>{if(e.key==='Escape'&&mobileOpen){setMobileOpen(false);document.querySelector<HTMLButtonElement>('.sidebarToggle')?.focus()}}}><div className="warehouseSidebarBrand"><Link href={base} aria-label="ParcelCare home" className="warehouseLogo"><img src="/brand/parcelcare-logo.png" alt="ParcelCare" width="2171" height="724" className="sidebarLogoExpanded" /><img src="/brand/parcelcare-icon.png" alt="ParcelCare" width="128" height="128" className="sidebarLogoCollapsed" /></Link><button ref={menuButton} type="button" className="warehouseMenuToggle" aria-expanded={mobileOpen} aria-controls="warehouse-sidebar-controls" onClick={()=>setMobileOpen(v=>!v)}>Menu</button></div><div id="warehouse-sidebar-controls" className="warehouseSidebarScroll"><p className="warehouseNavLabel">Warehouse operations</p>
        <nav aria-label="Warehouse" className="warehouseNavigation">{[['Overview', ''], ['SME-Owned Inventory', '/inventory'], ['Shipments', '/shipments'], ['GPS tracking', '/tracking'], ['Exceptions', '/exceptions'], ['Admin settings', '/settings'], ['Case deadlines', '/sla']].map(([name, path]) => <Link key={name} href={`${base}${path}`} aria-current={(pathname === base + path || (path && pathname.startsWith(base+path+'/'))) ? 'page' : undefined} className={`rounded-lg px-3 py-3 text-sm ${pathname === base + path ? 'bg-emerald-50 font-semibold text-brand' : 'hover:bg-slate-50'}`} title={name} aria-label={path==='/exceptions'&&caseCount?.warehouse===session.warehouseId&&caseCount.value>0?`${name}, ${caseCount.value} open cases`:name}><NavLabel name={name} count={path==='/exceptions'&&caseCount?.warehouse===session.warehouseId?caseCount.value:undefined}/></Link>)}</nav>
        <div className="warehouseSelector"><label htmlFor="warehouse-choice" className="mb-2 block text-xs text-muted">Warehouse</label><select id="warehouse-choice" className={`${selectClass} w-full`} value={session.warehouseId} onChange={e => session.setWarehouseId(e.target.value)}>{session.identity?.memberships.filter(m => ['owner', 'staff'].includes(m.role)).filter((m, i, all) => all.findIndex(other => other.warehouse_id === m.warehouse_id) === i).map(m => <option key={m.warehouse_id} value={m.warehouse_id}>Warehouse · {m.warehouse_id.slice(-4)}</option>)}</select></div>
        {session.demo&&<nav aria-label="Demo workspaces" className="warehouseNavigation mt-4"><Link href="/demo" title="Change demo role" aria-label="Change demo role"><NavLabel name="Change demo role"/></Link></nav>}</div><div className="warehouseSidebarFooter"><SidebarProfile /></div></aside>
      <div className="warehousePage"><main id="warehouse-main" tabIndex={-1} className="p-5 md:p-8" key={session.warehouseId}>{children}</main></div>
    </div>

  </div>;
}
