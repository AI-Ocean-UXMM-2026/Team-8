'use client';
import Link from 'next/link';
import {safeError} from '../../shared/i18n/errors';
import Image from 'next/image';
import { Illustration } from '../../shared/ui/illustration';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Card, Input } from '../../shared/ui';
import { browserAuth } from './browser-client';
import { createApiClient, createLiveTransport } from '../../shared/api';
import { loadWorkspaceIdentity } from '../../shared/api/identity';
import { workspacePath } from './roles';

class SignInError extends Error {}
export function Login() {
  const lock = useRef(false);
  const [ready, setReady] = useState(false);
  const [courier,setCourier]=useState(false);
  useEffect(() => { setReady(true);setCourier(new URLSearchParams(window.location.search).get('next')==='/courier'); }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress,setProgress]=useState('');
  const identityRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>identityRequest.current?.abort(),[]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError('');setProgress('Checking your sign-in…');
    const data = new FormData(event.currentTarget);
    try {
      const auth = browserAuth();
      if (!auth) throw new SignInError('Sign-in is unavailable. Please contact your administrator.');
      const result = await auth.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) });
      if (result.error) {
        const code = result.error.code;
        throw new SignInError(code === 'invalid_credentials'
          ? 'Incorrect email or password.'
          : code === 'email_not_confirmed' ? 'Please ask your warehouse operator to confirm your account email.'
          : result.error.status === 429 ? 'Too many sign-in attempts. Please wait a few minutes and try again.'
          : 'The sign-in service is unavailable. Please try again shortly.');
      }
      const origin = window.location.origin;
      const api = createApiClient(createLiveTransport({ baseUrl: origin, timeoutMs: 75_000, getAccessToken: async () => result.data.session?.access_token ?? null }));
      identityRequest.current=new AbortController();
      setProgress('Connecting to your workspace. The free server may need up to two minutes to start…');
      const identity = await loadWorkspaceIdentity(signal=>api.getMe(signal),{signal:identityRequest.current.signal,onWaiting:()=>setProgress('The workspace server is starting. Retrying automatically; please keep this page open…')}).catch(error=>{throw new SignInError(safeError(error));});
      const destination = workspacePath(identity.memberships);
      if (!destination) throw new SignInError('Your account has no active workspace. Please contact your operator.');
      const next=new URLSearchParams(window.location.search).get('next');
      const courierNext=next==='/courier'&&identity.memberships.some(m=>m.role==='rider');
      const smeNext=next&&/^\/sme\/shipments\/[0-9a-f-]{36}$/i.test(next)&&identity.memberships.some(m=>m.role==='sme');
      window.location.replace(courierNext?'/courier':smeNext?next:destination);
    } catch (err) {
      setError(err instanceof SignInError ? err.message : safeError(err));
      lock.current = false; setBusy(false);
    }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-ink"><Card className="pc-login-card w-full max-w-md">
    <Link href="/" aria-label="ParcelCare home" className="inline-block"><Image src="/brand/parcelcare-logo.png" alt="ParcelCare" width={2171} height={724} priority className="h-auto w-64 max-w-full" /></Link>
    <Illustration kind="truck" size="large" className="pc-login-illustration" />
    <h1 className="mt-6 text-2xl font-semibold">Sign in to ParcelCare</h1><p className="mt-2 text-sm text-muted">For warehouse staff, SME owners and couriers.</p>
    <form onSubmit={submit} className="mt-6" aria-busy={busy}><fieldset disabled={!ready || busy} className="space-y-4">
      <div><label htmlFor="email" className="mb-2 block text-sm">Email</label><Input id="email" name="email" type="email" autoComplete="username" required disabled={busy} /></div>
      <div><label htmlFor="password" className="mb-2 block text-sm">Password</label><Input id="password" name="password" type="password" autoComplete="current-password" required disabled={busy} /></div>
      {busy&&<p role="status" className="text-sm text-muted">{progress}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={!ready || busy}>{!ready ? 'Preparing sign-in…' : busy ? 'Signing in…' : 'Sign in'}</Button>
    </fieldset></form><p className="mt-5 text-sm text-muted">Need an account? Contact your warehouse operator. Accounts are created for you.</p><p className="mt-6 text-sm"><Link className="text-brand underline" href="/demo">Explore the demo</Link></p>
  </Card></main>;
}
