const immutableHeaders = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Content-Type': 'image/webp',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

function assetName(context) {
  const params = context.params || {};
  return String(params.asset || '');
}

export async function onRequest(context) {
  const request = context.request;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const name = assetName(context);
  if (!/^(?:preview-|prod-)?[a-f0-9]{64}-(?:400|800)\.webp$/i.test(name)) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const bucket = context.env && context.env.COVERS_BUCKET;
  if (!bucket || typeof bucket.get !== 'function') {
    return new Response(JSON.stringify({ error: 'Cover storage is not configured', code: 'COVER_STORAGE_NOT_CONFIGURED' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const cache = globalThis.caches && globalThis.caches.default;
  let cacheRequest;
  try {
    const keyUrl = new URL(request.url);
    keyUrl.search = '';
    cacheRequest = new Request(keyUrl.toString(), { method: 'GET' });
    if (request.method === 'GET' && cache) {
      const cached = await cache.match(cacheRequest);
      if (cached) return cached;
    }
  } catch {}

  let object;
  try {
    object = await bucket.get(name);
  } catch {
    return new Response('Cover storage temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!object || !object.body) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const storedType = String(object.httpMetadata && object.httpMetadata.contentType || '');
  if (storedType && storedType.toLowerCase() !== 'image/webp') {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const headers = new Headers(immutableHeaders);
  const etag = object.httpEtag || object.etag;
  if (etag) headers.set('ETag', String(etag));
  const response = new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });

  if (request.method === 'GET' && cache && cacheRequest) {
    try { await cache.put(cacheRequest, response.clone()); } catch {}
  }
  return response;
}
