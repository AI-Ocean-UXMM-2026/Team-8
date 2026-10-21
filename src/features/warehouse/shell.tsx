'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge, Button, Card } from '../../shared/ui';
import { useSession } from '../auth/session';

export const selectClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink max-w-full';
export function WarehouseShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const base = session.demo ? '/demo/warehouse' : '/warehouse';
  if (session.status !== 'ready') return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-ink"><Card className="w-full max-w-lg">
    <h1 className="text-2xl font-semibold">ParcelCare warehouse</h1>
    {session.status === 'loading' ? <p role="status" className="mt-4">Checking your session… <span lang="my">စစ်ဆေးနေသည်</span></p> : <>
      <h2 className="mt-4 text-lg font-semibold">{session.status === 'signed_out' ? 'Please sign in' : session.status === 'forbidden' ? 'Warehouse access required' : 'Workspace unavailable'}</h2>
      <p role="alert" className="mt-3 text-sm text-muted">{session.status === 'forbidden' ? 'Your account does not have an active warehouse staff membership.' : session.status === 'signed_out' ? 'Your session has ended. Sign in to continue.' : 'We could not verify your workspace. Please retry or contact your administrator.'}</p>
      <div className="mt-6 flex gap-3"><Button asChild><Link href="/login">Sign in</Link></Button><Button variant="outline" onClick={session.reload}>Try again</Button></div>
      {!session.demo && <Link href="/demo/warehouse" className="mt-4 inline-block text-sm text-brand underline">Open demo workspace</Link>}
    </>}
  </Card></main>;
  return <div className="min-h-screen bg-canvas text-ink"><a className="sr-only focus:not-sr-only focus:block focus:p-4" href="#warehouse-main">Skip to content</a>
    <div className="mx-auto grid min-h-screen max-w-screen-2xl md:grid-cols-[230px_1fr]">
      <aside className="border-b border-slate-200 bg-white p-6 md:border-r md:border-b-0"><Link href={base} className="text-2xl font-bold text-brand">ParcelCare</Link><p className="mt-2 text-xs text-muted">Warehouse operations</p>
        <nav aria-label="Warehouse" className="mt-8 flex flex-wrap gap-2 md:flex-col">{[['Overview', ''], ['Inventory', '/inventory'], ['Shipments', '/shipments'], ['Open cases', '/exceptions']].map(([name, path]) => <Link key={name} href={`${base}${path}`} aria-current={pathname === base + path ? 'page' : undefined} className={`rounded-lg px-3 py-3 text-sm ${pathname === base + path ? 'bg-emerald-50 font-semibold text-brand' : 'hover:bg-slate-50'}`}>{name}</Link>)}</nav>
        <div className="mt-8"><label htmlFor="warehouse-choice" className="mb-2 block text-xs text-muted">Warehouse</label><select id="warehouse-choice" className={`${selectClass} w-full`} value={session.warehouseId} onChange={e => session.setWarehouseId(e.target.value)}>{session.identity?.memberships.filter(m => ['owner', 'staff'].includes(m.role)).filter((m, i, all) => all.findIndex(other => other.warehouse_id === m.warehouse_id) === i).map(m => <option key={m.warehouse_id} value={m.warehouse_id}>Warehouse · {m.warehouse_id.slice(-4)}</option>)}</select></div>
        <Button variant="outline" className="mt-5" onClick={() => void session.signOut()}>Sign out</Button>
      </aside>
      <div className="min-w-0"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4"><p className="text-xs text-muted">Warehouse / <span lang="my">ဂိုဒေါင်</span></p>{session.demo && <Badge>Demo · fictitious data in this tab</Badge>}</header><main id="warehouse-main" tabIndex={-1} className="p-5 md:p-8" key={session.warehouseId}>{children}</main></div>
    </div>
  </div>;
}
