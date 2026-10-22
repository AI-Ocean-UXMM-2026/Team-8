'use client';
import { useEffect, useRef } from 'react';
import { useResource } from '../warehouse/shared';
export function usePolling<T>(key: string, load: (signal: AbortSignal) => Promise<T>, interval = 15000) {
  const resource = useResource(key, load);
  const reload = resource.reload;
  // A refresh must not abort a slow read that still has time before its deadline.
  const loading = useRef(resource.loading);
  loading.current = resource.loading;
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden && !loading.current) reload(); }, interval);
    return () => window.clearInterval(timer);
  }, [key, interval]);
  return resource;
}
