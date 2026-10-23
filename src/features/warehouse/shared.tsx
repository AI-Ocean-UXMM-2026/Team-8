'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { safeError } from '../../shared/i18n/errors';
import { ApiError } from '../../shared/api';
import { Button, Card } from '../../shared/ui';
import { Illustration, type IllustrationKind } from '../../shared/ui/illustration';

export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const loader = useRef(load); loader.current = load;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; error: unknown; loading: boolean }>({ key, data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ key, data: previous.key === key ? previous.data : null, error: null, loading: true }));
    Promise.resolve().then(() => loader.current(controller.signal)).then(data => { if (!controller.signal.aborted) setState({ key, data, error: null, loading: false }); })
      .catch(error => { if (!controller.signal.aborted) setState(previous => ({ ...previous, error, loading: false })); });
    return () => controller.abort();
  }, [key, revision]);
  return { ...(state.key === key ? state : { data: null, error: null, loading: true }), reload: () => setRevision(n => n + 1) };
}
export function useFilters() {
  const params = useSearchParams(); const path = usePathname();
  return { params, set: (key: string, value: string) => {
    // History updates immediately, so back-to-back filters include earlier changes
    // instead of reading a stale React render's search params.
    const next = new URLSearchParams(window.location.search);
    next.delete('cursor'); next.delete('page'); if (value) next.set(key, value); else next.delete(key);
    window.history.replaceState(null, '', `${path}${next.size ? `?${next}` : ''}`);
  } };
}
export function PageTitle({ title, my, description }: { title: string; my: string; description?: string }) {
  const pathname = usePathname();
  const overview = /^\/(?:demo\/)?(?:warehouse|sme|courier|rider)\/?$/.test(pathname);
  const compactOverview = /^\/(?:demo\/)?sme\/?$/.test(pathname);
  const kind: IllustrationKind = /inventory/.test(pathname) ? 'forklift' : /tracking|shipments|deliveries|courier|rider/.test(pathname) ? 'truck' : overview ? 'warehouse' : 'parcel';
  return <div className="pc-illustrated-heading mb-6"><div><h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>{description && <p className="mt-3 text-sm text-muted-foreground">{description}</p>}</div><Illustration kind={kind} size={overview && !compactOverview ? 'large' : 'small'} /></div>;
}
export function Loading() { return <Card><p role="status">Loading workspace…</p></Card>; }
export function ErrorPanel({ error, retry }: { error: unknown; retry: () => void }) {
  const code = error instanceof ApiError ? error.status : 0;
  return <Card><div role="alert"><h2 className="font-semibold">{code === 403 ? 'Access denied' : code === 401 ? 'Session expired' : code === 404 ? 'Record unavailable' : 'Unable to load this view'}</h2><p className="mt-2 text-sm text-muted-foreground">{safeError(error)}</p></div><div className="mt-4 flex gap-3"><Button onClick={retry}>Try again</Button>{code === 401 && <Button asChild variant="outline"><Link href="/login">Sign in</Link></Button>}</div></Card>;
}
export const dateTime = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Yangon' }).format(new Date(value));
export const human = (value: string) => value.replaceAll('_', ' ');
export const tableClass = 'w-full min-w-[650px] border-collapse';
export function Empty({ text = 'No records yet.' }: { text?: string }) { return <div role="status" className="pc-empty-state p-6 text-sm text-muted-foreground"><Illustration kind="parcel" size="small" /><p>{text}</p></div>; }
export function Pagination({ cursor, nextCursor, set }: { cursor: string; nextCursor: string | null; set: (key: string, value: string) => void }) {
  return <div className="flex gap-3 border-t border-slate-100 p-4">{cursor && <Button variant="outline" onClick={() => set('cursor', '')}>First page</Button>}{nextCursor && <Button variant="outline" onClick={() => set('cursor', nextCursor)}>Next page</Button>}</div>;
}
