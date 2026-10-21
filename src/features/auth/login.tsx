'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Card, Input } from '../../shared/ui';
import { browserAuth } from './browser-client';

export function Login() {
  const lock = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const auth = browserAuth();
      if (!auth) throw new Error('Sign-in is unavailable. Please contact your administrator.');
      const result = await auth.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) });
      if (result.error) throw new Error('Unable to sign in. Check your details and try again.');
      // Start a fresh authenticated tree after the SDK has persisted the session.
      // Keep submission locked until navigation so a second login cannot race it.
      const destination = String(data.get('workspace') || 'warehouse');
      window.location.replace(['warehouse', 'sme', 'rider'].includes(destination) ? `/${destination}` : '/warehouse');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Try again.');
      lock.current = false; setBusy(false);
    }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-ink"><Card className="w-full max-w-md">
    <Link href="/" className="text-2xl font-bold text-brand">ParcelCare</Link>
    <h1 className="mt-6 text-2xl font-semibold">Warehouse sign in</h1><p lang="my" className="mt-2 text-sm text-muted">အကောင့်ဝင်ရန်</p>
    <form onSubmit={submit} className="mt-6" aria-busy={busy}><fieldset disabled={!ready || busy} className="space-y-4">
      <div><label htmlFor="workspace" className="mb-2 block text-sm">Workspace / အသုံးပြုမည့်နေရာ</label><select id="workspace" name="workspace" className="w-full rounded-lg border border-slate-300 p-3"><option value="warehouse">Warehouse</option><option value="sme">SME</option><option value="rider">Rider</option></select></div>
      <div><label htmlFor="email" className="mb-2 block text-sm">Email</label><Input id="email" name="email" type="email" autoComplete="username" required disabled={busy} /></div>
      <div><label htmlFor="password" className="mb-2 block text-sm">Password</label><Input id="password" name="password" type="password" autoComplete="current-password" required disabled={busy} /></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={!ready || busy}>{!ready ? 'Preparing sign-in…' : busy ? 'Signing in…' : 'Sign in'}</Button>
    </fieldset></form><p className="mt-6 text-sm"><Link className="text-brand underline" href="/demo/warehouse">Explore the demo</Link></p>
  </Card></main>;
}
