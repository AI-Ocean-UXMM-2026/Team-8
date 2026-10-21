import Link from 'next/link';
import type { ReactNode } from 'react';

export function WorkspaceLayout({ title, children }: { title: string; children: ReactNode }) {
  return <div className="min-h-screen bg-canvas text-ink">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:block focus:p-4">Skip to content</a>
    <div className="mx-auto grid min-h-screen max-w-screen-2xl md:grid-cols-[240px_1fr]">
      <aside className="border-b border-slate-200 bg-white p-6 md:border-r md:border-b-0">
        <Link href="/foundation" className="text-2xl font-bold text-brand">ParcelCare</Link>
        <p className="mt-2 text-xs text-muted">Warehouse operations</p>
        <nav aria-label="Workspace" className="mt-8 flex flex-wrap gap-2 md:flex-col">
          <Link href="/foundation" aria-current="page" className="rounded-lg bg-emerald-50 px-3 py-3 text-sm font-semibold text-brand">Shared foundation</Link>
          <Link href="/" className="rounded-lg px-3 py-3 text-sm hover:bg-slate-50">Prototype reference</Link>
        </nav>
      </aside>
      <main id="main-content" className="min-w-0 p-6 md:p-10">
        <p className="text-xs font-semibold tracking-widest text-muted uppercase">ParcelCare V4 · M0</p>
        <h1 className="mt-2 mb-8 text-3xl font-semibold">{title}</h1>
        {children}
      </main>
    </div>
  </div>;
}
