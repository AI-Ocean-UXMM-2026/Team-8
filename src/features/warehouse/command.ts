'use client';
import { useEffect, useRef, useState } from 'react';
import { safeError } from '../../shared/i18n/errors';
import { ApiError } from '../../shared/api';
import { isUUID } from '../../shared/api/transport';
import { canReleaseCommand } from './command-policy';

type Pending<B> = { key: string; body: B };
export function useCommand<B, R>(storageKey: string, send: (body: B, key: string) => Promise<R>, committed: () => void) {
  const lock = useRef(false);
  const pendingRef = useRef<Pending<B> | null>(null);
  const [pending, setPending] = useState<Pending<B> | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<R | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Pending<B>;
        if (!isUUID(saved.key) || !saved.body || typeof saved.body !== 'object') throw new Error('Invalid saved command');
        pendingRef.current = saved; setPending(saved);
      }
      setReady(true);
    } catch { setError('Unable to recover submission state. Please contact your administrator before submitting again.'); }
  }, [storageKey]);
  async function execute(body?: B) {
    if (lock.current || !ready) return;
    const retrying = pendingRef.current !== null;
    const command = pendingRef.current ?? (body ? { key: crypto.randomUUID(), body: structuredClone(body) } : null);
    if (!command) return;
    lock.current = true; setBusy(true); setError(''); setResult(null);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(command));
      pendingRef.current = command; setPending(command);
      const response = await send(command.body, command.key);
      setResult(response);
      pendingRef.current = null; setPending(null);
      try { sessionStorage.removeItem(storageKey); } catch { /* A reload can safely replay the same completed command. */ }
      committed();
      window.dispatchEvent(new Event('parcelcare:warehouse-changed'));
    } catch (err) {
      if (canReleaseCommand(err, retrying)) {
        // Only a known first-attempt rejection can release the saved command.
        pendingRef.current = null; setPending(null);
        try { sessionStorage.removeItem(storageKey); } catch { /* Preserve recoverability on reload. */ }
        if (err instanceof ApiError && err.status === 409) committed();
      }
      setError(err instanceof ApiError ? `${safeError(err, pendingRef.current !== null)}${err.correlationId ? ` Reference: ${err.correlationId}` : ''}` : 'Unable to submit. Retry the same request before entering another.');
    } finally { lock.current = false; setBusy(false); }
  }
  return { pending, ready, busy, error, result, execute, clearResult: () => setResult(null) };
}
