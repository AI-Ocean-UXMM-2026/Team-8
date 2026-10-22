'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Card, Input } from '../../shared/ui';
import { browserAuth } from './browser-client';
import { createApiClient, createLiveTransport } from '../../shared/api';
import { workspacePath } from './roles';

export function Login() {
  const lock = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const auth = browserAuth();
      if (!auth) throw new Error('Sign-in is unavailable. Please contact your administrator.');
      const result = await auth.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) });
      if (result.error) {
        const code = result.error.code;
        throw new Error(code === 'invalid_credentials'
          ? 'Incorrect email or password.'
          : code === 'email_not_confirmed' ? 'Please ask your warehouse operator to confirm your account email.'
          : result.error.status === 429 ? 'Too many sign-in attempts. Please wait a few minutes and try again.'
          : 'The sign-in service is unavailable. Please try again shortly.');
      }
      const origin = process.env.NEXT_PUBLIC_PARCELCARE_API_URL;
      if (!origin) throw new Error('Workspace connection is unavailable. Please contact your operator.');
      const api = createApiClient(createLiveTransport({ baseUrl: origin, timeoutMs: 75_000, getAccessToken: async () => result.data.session?.access_token ?? null }));
      const identity = await api.getMe();
      const destination = workspacePath(identity.memberships);
      if (!destination) throw new Error('Your account has no active workspace. Please contact your operator.');
      window.location.replace(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Try again.');
      lock.current = false; setBusy(false);
    }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-ink"><Card className="w-full max-w-md">
    <Link href="/" aria-label="ParcelCare home" className="inline-block"><Image src="/brand/parcelcare-logo.png" alt="ParcelCare" width={2171} height={724} priority className="h-auto w-64 max-w-full" /></Link>
    <h1 className="mt-6 text-2xl font-semibold">Sign in to ParcelCare</h1><p className="mt-2 text-sm text-muted">For warehouse staff, SMEs, and riders.</p>
    <form onSubmit={submit} className="mt-6" aria-busy={busy}><fieldset disabled={!ready || busy} className="space-y-4">
      <div><label htmlFor="email" className="mb-2 block text-sm">Email</label><Input id="email" name="email" type="email" autoComplete="username" required disabled={busy} /></div>
      <div><label htmlFor="password" className="mb-2 block text-sm">Password</label><Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required disabled={busy} /><button type="button" className="mt-2 text-sm text-brand underline" aria-controls="password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide password' : 'Show password'}</button></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={!ready || busy}>{!ready ? 'Preparing sign-in…' : busy ? 'Signing in…' : 'Sign in'}</Button>
    </fieldset></form><p className="mt-5 text-sm text-muted">Need an account? Contact your warehouse operator. Accounts are created for you.</p><p className="mt-6 text-sm"><Link className="text-brand underline" href="/demo/warehouse">Explore the demo</Link></p>
  </Card></main>;
}
