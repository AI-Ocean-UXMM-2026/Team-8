'use client';
import { useEffect } from 'react';
import { useResource } from '../warehouse/shared';
export function usePolling<T>(key: string, load: (signal: AbortSignal) => Promise<T>, interval = 15000) {
  const resource = useResource(key, load);
  const reload = resource.reload;
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) reload(); }, interval);
    return () => window.clearInterval(timer);
  }, [key, interval]);
  return resource;
}
