'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useSession } from '../auth/session';
import { Button, Card, Input } from '../../shared/ui';
export function EvidenceUpload({ shipmentId, refresh }: { shipmentId: string; refresh: () => void }) {
  const { api, demo } = useSession(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const lock = useRef(false); const reservation = useRef<{ id: string; file: File } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || demo) return;
    const file = new FormData(event.currentTarget).get('file');
    if (!(file instanceof File) || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size < 1 || file.size > 10485760) { setMessage('Select JPEG, PNG or PDF, up to 10 MB.'); return; }
    lock.current = true; setBusy(true); setMessage('');
    try {
      if (!reservation.current) reservation.current = { ...await api!.reserveEvidence({ shipment_id: shipmentId, mime_type: file.type, size_bytes: file.size, sme_visible: true }), file };
      await api!.uploadEvidence(reservation.current.id, reservation.current.file);
      setMessage(`Evidence uploaded: ${reservation.current.id}. Physical verification is separate.`); reservation.current = null; refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload outcome unknown. Refresh evidence before retrying.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (demo) return null;
  return <Card className="my-5"><h2 className="font-semibold">Upload evidence / အထောက်အထားတင်ရန်</h2><form onSubmit={submit} className="mt-4 space-y-3"><label htmlFor={`evidence-file-${shipmentId}`}>JPEG, PNG or PDF · maximum 10 MB</label><Input id={`evidence-file-${shipmentId}`} name="file" type="file" accept="image/jpeg,image/png,application/pdf" required disabled={busy || !!reservation.current} /><Button type="submit" disabled={busy}>{busy ? 'Uploading…' : reservation.current ? 'Retry original upload' : 'Upload'}</Button>{message && <p role="status" className="break-words text-sm">{message}</p>}</form></Card>;
}
export function EvidenceDownload({ id }: { id: string }) {
  const { api } = useSession(); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  return <><Button variant="outline" disabled={busy} onClick={async () => {
    setBusy(true); setMessage('');
    try { const result = await api!.downloadEvidence(id); const url = new URL(result.url); if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('Evidence link is unavailable.'); window.open(url.href, '_blank', 'noopener,noreferrer'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Download unavailable.'); }
    finally { setBusy(false); }
  }}>Download evidence</Button>{message && <p role="alert">{message}</p>}</>;
}
