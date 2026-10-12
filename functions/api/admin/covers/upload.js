import { requireAdmin, setRuntimeEnv } from '../../../_lib/runtime.js';

const THUMBNAIL_MAX_BYTES = 80 * 1024;
const LARGE_MAX_BYTES = 2 * 1024 * 1024;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function webpFile(form, key, maxBytes) {
  const file = form.get(key);
  if (!file || typeof file.arrayBuffer !== 'function') return { error: key + ' image is required' };
  if (String(file.type || '').toLowerCase() !== 'image/webp') return { error: key + ' must be WebP' };
  if (file.size < 12 || file.size > maxBytes) return { error: key + ' size is outside the allowed range' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return { error: key + ' is not a valid WebP container' };
  return { bytes };
}

async function digestCoverPair(thumbnail, large) {
  const combined = new Uint8Array(thumbnail.length + 1 + large.length);
  combined.set(thumbnail, 0);
  combined[thumbnail.length] = 0;
  combined.set(large, thumbnail.length + 1);
  const digest = await crypto.subtle.digest('SHA-256', combined);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function safePublicBase(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  setRuntimeEnv(context.env || {});
  const request = context.request;
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const bucket = context.env && context.env.COVERS_BUCKET;
  if (!bucket || typeof bucket.put !== 'function') {
    return json(503, { error: 'Cover R2 bucket binding is missing', code: 'COVER_STORAGE_NOT_CONFIGURED' });
  }

  let form;
  try { form = await request.formData(); }
  catch { return json(400, { error: 'Expected a multipart image upload' }); }

  const thumbnailResult = await webpFile(form, 'thumbnail', THUMBNAIL_MAX_BYTES);
  if (thumbnailResult.error) return json(413, { error: thumbnailResult.error, code: 'INVALID_COVER_THUMBNAIL' });
  const largeResult = await webpFile(form, 'large', LARGE_MAX_BYTES);
  if (largeResult.error) return json(413, { error: largeResult.error, code: 'INVALID_COVER_LARGE_IMAGE' });

  const width = Number(form.get('width'));
  const height = Number(form.get('height'));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 12000 || height > 12000) {
    return json(400, { error: 'Image dimensions are invalid', code: 'INVALID_COVER_DIMENSIONS' });
  }

  const publicBase = safePublicBase(context.env.COVER_PUBLIC_BASE_URL);
  if (publicBase === null) return json(503, { error: 'COVER_PUBLIC_BASE_URL must be a valid HTTPS origin', code: 'COVER_PUBLIC_BASE_URL_INVALID' });

  const thumbnail = thumbnailResult.bytes;
  const large = largeResult.bytes;
  const assetId = await digestCoverPair(thumbnail, large);
  const url = new URL(request.url);
  const branch = String(context.env.CF_PAGES_BRANCH || '').toLowerCase();
  const prefix = branch === 'main' || url.hostname === 'hj-groups-web.pages.dev' ? 'prod-' : 'preview-';
  const thumbnailName = prefix + assetId + '-400.webp';
  const largeName = prefix + assetId + '-800.webp';
  const metadata = {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      originalWidth: String(width),
      originalHeight: String(height),
      variantSetHash: assetId,
    },
  };

  try {
    await bucket.put(thumbnailName, thumbnail, metadata);
    await bucket.put(largeName, large, metadata);
  } catch {
    return json(503, { error: 'Could not save cover image to R2', code: 'COVER_STORAGE_WRITE_FAILED' });
  }

  const path = publicBase ? publicBase + '/' + largeName : '/api/covers/' + largeName;
  const thumbnailUrl = publicBase ? publicBase + '/' + thumbnailName : '/api/covers/' + thumbnailName;
  return json(201, { ok: true, url: path, thumbnailUrl, path: assetId, width, height, thumbnailBytes: thumbnail.length, largeBytes: large.length });
}
