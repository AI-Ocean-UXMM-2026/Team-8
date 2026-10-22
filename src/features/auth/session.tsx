'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createApiClient, createLiveTransport, ApiError, type ApiClient, type Schemas } from '../../shared/api';
import { loadWorkspaceIdentity } from '../../shared/api/identity';
import { browserAuth } from './browser-client';
import { cleanupSession } from '../../shared/session/cleanup';

type Session = {
  status: 'loading' | 'signed_out' | 'forbidden' | 'unavailable' | 'ready';
  api: ApiClient | null; identity: Schemas['IdentityResponse'] | null; warehouseId: string;
  audience: 'warehouse' | 'sme' | 'rider'; smeId: string; setSmeId: (id: string) => void;
  setWarehouseId: (id: string) => void; demo: boolean; reload: () => void; signOut: () => Promise<void>;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ demo = false, audience = 'warehouse', children }: { demo?: boolean; audience?: Session['audience']; children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading');
  const [api, setApi] = useState<ApiClient | null>(null);
  const [identity, setIdentity] = useState<Session['identity']>(null);
  const [warehouseId, setWarehouse] = useState('');
  const [smeId, setSME] = useState('');
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const verifiedActor = useRef<string | null>(null);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    let identityRequest:AbortController|null=null;
    verifiedActor.current = null;
    setStatus('loading');
    const accept = (client: ApiClient, who: Schemas['IdentityResponse']) => {
      if (!active) return;
      verifiedActor.current = who.actor_id;
      const staff = who.memberships.filter(m => audience === 'warehouse' ? m.role === 'owner' || m.role === 'staff' : m.role === audience);
      setIdentity(who); setApi(client);
      if (!staff.length) { setStatus('forbidden'); return; }
      setWarehouse(previous => staff.some(m => m.warehouse_id === previous) ? previous : staff[0].warehouse_id);
      setSME(previous => staff.some(m => m.sme_id === previous) ? previous : staff[0].sme_id ?? '');
      setStatus('ready');
    };
    async function start() {
      if (demo) {
        const { createMockTransport } = await import('../../shared/api/mock');
        const transport=audience==='sme'?(await import('../../shared/api/sme-tracking-mock')).createSmeTrackingMockTransport(window.sessionStorage):audience==='rider'?(await import('../../shared/api/courier-mock')).createCourierMockTransport(window.sessionStorage):createMockTransport({ dataset: 'warehouse', storage: window.sessionStorage });
        const client = createApiClient(transport);
        accept(client, await client.getMe());
        return;
      }
      const auth = browserAuth();
      const origin = window.location.origin;
      if (!auth) { if (active) setStatus('unavailable'); return; }
      const client = createApiClient(createLiveTransport({ baseUrl: origin, timeoutMs: 75_000, getAccessToken: async () => {
        const result = await auth.auth.getSession();
        if (result.error) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session expired. Sign in again.');
        return result.data.session?.access_token ?? null;
      } }));
      const check = async () => {
        if (!active) return;
        const run = ++generation.current;
        identityRequest?.abort();const request=new AbortController();identityRequest=request;
        try {
          const result = await auth!.auth.getSession();
          if (result.error) throw result.error;
          if (!result.data.session) { if (active && run === generation.current) { verifiedActor.current = null; setIdentity(null); setApi(null); setStatus('signed_out'); } return; }
          const who = await loadWorkspaceIdentity(signal=>client.getMe(signal),{signal:request.signal});
          if (active && run === generation.current) accept(client, who);
        } catch (error) {
          if (active && run === generation.current) { verifiedActor.current = null; setIdentity(null); setApi(null); setStatus(error instanceof ApiError && error.status === 403 ? 'forbidden' : error instanceof ApiError && error.status === 401 ? 'signed_out' : 'unavailable'); }
        }
      };
      const listener = auth.auth.onAuthStateChange((event, session) => {
        // Leave the Supabase auth callback before calling getSession again.
        if (!active) return;
        generation.current++;
        if (event === 'SIGNED_OUT' || !session) {
          identityRequest?.abort();
          verifiedActor.current = null; setIdentity(null); setApi(null); setStatus('signed_out');
          return;
        }
        // Same-user token refresh rechecks memberships without unmounting drafts.
        // A different user must never retain the previous user's workspace.
        if (session.user.id !== verifiedActor.current) {
          verifiedActor.current = null; setIdentity(null); setApi(null); setStatus('loading');
        }
        setTimeout(() => void check(), 0);
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
      await check();
    }
    start().catch(() => { if (active) setStatus('unavailable'); });
    return () => { active = false; generation.current++; identityRequest?.abort(); unsubscribe(); };
  }, [demo, audience, attempt]);
  const setWarehouseId = (id: string) => {
    if (identity?.memberships.some(m => m.warehouse_id === id && ['owner', 'staff'].includes(m.role))) setWarehouse(id);
  };
  const signOut = async () => {
    await cleanupSession();
    if (!demo) {
      const auth = browserAuth()?.auth;
      if (!auth) throw new Error('Authentication is unavailable.');
      const current = await auth.getSession();
      if (current.error) throw current.error;
      if (current.data.session) {
        // The SDK clears local state even when signOut returns an error.
        // Verify revocation with this user's JWT first so failures remain retryable.
        const revoked = await auth.admin.signOut(current.data.session.access_token, 'local');
        if (revoked.error && ![401, 403, 404].includes(revoked.error.status ?? 0)) throw revoked.error;
      }
      const result = await auth.signOut({ scope: 'local' });
      if (result.error) {
        const remaining = await auth.getSession();
        if (remaining.data.session) throw result.error;
      }
    }
    generation.current++; verifiedActor.current = null; setIdentity(null); setApi(null); setStatus('signed_out');
  };
  const setSmeId = (id: string) => {
    const membership = identity?.memberships.find(m => m.role === 'sme' && m.sme_id === id);
    if (membership) { setSME(id); setWarehouse(membership.warehouse_id); }
  };
  return <Context.Provider value={{ status, api, identity, warehouseId, setWarehouseId, demo, reload, signOut, audience, smeId, setSmeId }}>{children}</Context.Provider>;
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error('Warehouse session provider missing');
  return session;
}
