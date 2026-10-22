// Forward user-scoped API calls through this origin. Backend authentication and
// database RLS remain authoritative; no privileged credentials are added here.
export const runtime = 'nodejs';
const maxBody = 10 * 1024 * 1024;
function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
async function forward(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return failure(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const configured = process.env.PARCELCARE_API_URL || process.env.NEXT_PUBLIC_PARCELCARE_API_URL;
  if (!configured) return failure(503, 'SERVICE_UNAVAILABLE', 'Service unavailable. Please try again.');
  let base: URL;
  try {
    base = new URL(configured);
    if (base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
      !(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))) throw new Error();
    if (base.origin === new URL(request.url).origin) throw new Error();
  } catch { return failure(503, 'SERVICE_UNAVAILABLE', 'Service unavailable. Please try again.'); }
  const url = new URL(request.url);
  if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(url.pathname) || url.pathname.includes('//')) return failure(400, 'INVALID_PATH', 'Invalid request.');
  const headers = new Headers({ Authorization: authorization, Accept: 'application/json' });
  for (const key of ['content-type', 'idempotency-key', 'x-correlation-id']) {
    const value = request.headers.get(key); if (value) headers.set(key, value);
  }
  let body: Uint8Array | undefined;
  if (request.body && request.method !== 'GET') {
    const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBody) { await reader.cancel(); return failure(413, 'TOO_LARGE', 'File is too large.'); }
      chunks.push(part.value);
    }
    body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  }
  try {
    const response = await fetch(new URL(url.pathname + url.search, base), {
      method: request.method, headers, body: body as BodyInit | undefined,
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(70_000)]),
    });
    if (response.status >= 300 && response.status < 400) return failure(502, 'UPSTREAM_ERROR', 'Service unavailable. Please try again.');
    const outgoing = new Headers({ 'Cache-Control': 'no-store' });
    for (const key of ['content-type', 'x-correlation-id', 'content-disposition']) {
      const value = response.headers.get(key); if (value) outgoing.set(key, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch { return failure(503, 'SERVICE_UNAVAILABLE', 'Connection unavailable. Please try again.'); }
}
export const GET = forward;
export const POST = forward;
export const PUT = forward;
