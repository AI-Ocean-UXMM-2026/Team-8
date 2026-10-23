// Wake only the configured workspace API; never forward user credentials.
export async function GET(request: Request) {
  const reply = (ready: boolean) => Response.json({ready}, {status: ready ? 200 : 503, headers: {'Cache-Control': 'no-store'}});
  try {
    const base = new URL(process.env.PARCELCARE_API_URL || process.env.NEXT_PUBLIC_PARCELCARE_API_URL || '');
    if (base.username || base.password || base.pathname !== '/' || base.search || base.hash || base.origin === new URL(request.url).origin ||
      !(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))) return reply(false);
    const response = await fetch(new URL('/health', base), {cache: 'no-store', redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)])});
    const data = response.ok ? await response.json() : null;
    return reply(data?.status === 'ok' && data?.service === 'parcelcare-api');
  } catch { return reply(false); }
}
