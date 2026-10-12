import { supabase } from '../supabase'

export function getFileExtension(
  filename
) {
  return (
    filename
      .split('.')
      .pop()
      ?.toLowerCase() || ''
  )
}

export function makeSafeFileName(
  filename
) {
  return filename
    .replace(/\s+/g, '-')
    .replace(
      /[^a-zA-Z0-9._-]/g,
      ''
    )
}

function canvasWebp(bitmap, targetWidth, quality, maxBytes = Infinity) {
  const width = Math.min(targetWidth, bitmap.width);
  const height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Could not prepare the cover image.');
  context.drawImage(bitmap, 0, 0, width, height);

  const encode = (q) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('The browser could not convert this cover to WebP.'));
      if (blob.type !== 'image/webp') return reject(new Error('This browser cannot create WebP images.'));
      resolve(blob);
    }, 'image/webp', q);
  });

  return (async () => {
    const qualities = [quality, ...[0.76, 0.68, 0.60, 0.52, 0.44, 0.36, 0.28, 0.20, 0.12].filter((q) => q < quality)];
    let finalBlob = null;
    for (const q of qualities) {
      finalBlob = await encode(q);
      if (finalBlob.size <= maxBytes) return finalBlob;
    }
    if (maxBytes !== Infinity) {
      throw new Error('The cover thumbnail could not be reduced below 80 KB. Choose a simpler or smaller cover image.');
    }
    if (finalBlob.size > 2 * 1024 * 1024) {
      throw new Error('The large WebP cover exceeds 2 MB after optimization.');
    }
    return finalBlob;
  })();
}

export async function uploadCoverToR2(file) {
  if (!file) throw new Error('No cover image selected.');
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
  const type = String(file.type || '').toLowerCase();
  if (type && !allowed.has(type)) {
    throw new Error('Use a JPEG, PNG, WebP, GIF or AVIF cover image. SVG uploads are not accepted.');
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('Cover source image must be 20 MB or smaller.');
  if (typeof createImageBitmap !== 'function') throw new Error('This browser does not support safe cover-image optimization.');

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height || bitmap.width > 12000 || bitmap.height > 12000) {
      throw new Error('Cover dimensions are invalid or too large.');
    }
    const thumbnail = await canvasWebp(bitmap, 400, 0.84, 80 * 1024);
    const large = await canvasWebp(bitmap, 800, 0.82, 2 * 1024 * 1024);
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error('Could not verify the admin session for cover upload.');
    const token = data?.session?.access_token;
    if (!token) throw new Error('Please sign in again before uploading a cover.');

    const form = new FormData();
    form.append('thumbnail', thumbnail, 'cover-400.webp');
    form.append('large', large, 'cover-800.webp');
    form.append('width', String(bitmap.width));
    form.append('height', String(bitmap.height));
    const response = await fetch('/api/admin/covers/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Cover upload to Cloudflare R2 failed (HTTP ' + response.status + ').');
    }
    if (!payload.url || !payload.path) throw new Error('Cover upload returned an invalid response.');
    return { url: payload.url, originalUrl: payload.url, path: payload.path, thumbnailUrl: payload.thumbnailUrl };
  } catch (error) {
    throw new Error(String(error?.message || 'Cover optimization/upload failed.'), { cause: error });
  } finally {
    try { bitmap?.close(); } catch {}
  }
}

export async function uploadFileToBucket(
  bucket,
  folder,
  file
) {
  if (bucket === 'story-covers') return uploadCoverToR2(file);

  if (!file) {
    throw new Error(
      'No file selected'
    )
  }

  const safeName =
    makeSafeFileName(
      file.name
    )

  const path = folder
    ? `${folder}/${Date.now()}-${safeName}`
    : `${Date.now()}-${safeName}`

  const {
    error: uploadError,
  } =
    await supabase.storage
      .from(bucket)
      .upload(
        path,
        file,
        {
          cacheControl:
            '3600',
          upsert: false,
          contentType:
            file.type ||
            undefined,
        }
      )

  if (uploadError) {
    throw new Error(
      uploadError.message
    )
  }

  const { data } =
    supabase.storage
      .from(bucket)
      .getPublicUrl(
        path
      )

  return {
    url: data.publicUrl,
    originalUrl: data.publicUrl,
    path,
  }
}

export async function deleteFileFromBucket(
  bucket,
  path
) {
  if (!path) return

  try {
    await supabase.storage
      .from(bucket)
      .remove([
        path,
      ])
  } catch {
    // best effort only
  }
}

export function getStoragePathFromPublicUrl(
  url,
  bucket = 'books'
) {
  if (
    !url ||
    typeof url !==
      'string'
  ) {
    return ''
  }

  const publicMarker =
    `/storage/v1/object/public/${bucket}/`

  const publicIndex =
    url.indexOf(
      publicMarker
    )

  if (
    publicIndex !== -1
  ) {
    return decodeURIComponent(
      url.slice(
        publicIndex +
          publicMarker.length
      )
    )
  }

  const authenticatedMarker =
    `/storage/v1/object/authenticated/${bucket}/`

  const authenticatedIndex =
    url.indexOf(
      authenticatedMarker
    )

  if (
    authenticatedIndex !==
    -1
  ) {
    return decodeURIComponent(
      url.slice(
        authenticatedIndex +
          authenticatedMarker.length
      )
    )
  }

  return ''
}

/*
  Download a file from Supabase Storage.

  Important for PDF/EPUB:
  the reader receives a local Blob URL instead of
  trying to fetch the storage URL repeatedly.
*/

export async function downloadStorageFile({
  bucket = 'books',
  path = '',
  url = '',
}) {
  let storagePath =
    path

  if (
    !storagePath &&
    url
  ) {
    storagePath =
      getStoragePathFromPublicUrl(
        url,
        bucket
      )
  }

  if (storagePath) {
    const {
      data,
      error,
    } =
      await supabase.storage
        .from(bucket)
        .download(
          storagePath
        )

    if (
      !error &&
      data
    ) {
      return data
    }

    if (
      error &&
      !url
    ) {
      throw new Error(
        error.message
      )
    }
  }

  if (!url) {
    throw new Error(
      'No file URL or storage path was provided.'
    )
  }

  const response =
    await fetch(
      url,
      {
        method: 'GET',
        cache: 'no-store',
      }
    )

  if (!response.ok) {
    throw new Error(
      `File request failed (${response.status} ${response.statusText})`
    )
  }

  const blob =
    await response.blob()

  if (
    !blob ||
    blob.size === 0
  ) {
    throw new Error(
      'The downloaded file is empty.'
    )
  }

  return blob
}

export const FILE_VALIDATORS = {
  image: {
    extensions: [
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
    ],
    mimePrefix:
      'image/',
    label:
      'image (JPG, PNG, WEBP, GIF)',
  },

  audio: {
    extensions: [
      'mp3',
      'm4a',
      'wav',
      'aac',
      'ogg',
      'flac',
    ],
    mimePrefix:
      'audio/',
    label:
      'audio (MP3, M4A, WAV, AAC, OGG, FLAC)',
  },

  video: {
    extensions: [
      'mp4',
      'webm',
      'mov',
      'm4v',
    ],
    mimePrefix:
      'video/',
    label:
      'video (MP4, WEBM, MOV)',
  },

  pdf: {
    extensions: [
      'pdf',
    ],
    mimePrefix:
      'application/pdf',
    label:
      'PDF',
  },

  epub: {
    extensions: [
      'epub',
    ],
    mimePrefix:
      null,
    label:
      'EPUB',
  },
}

export function validateFile(
  file,
  kind
) {
  const rule =
    FILE_VALIDATORS[
      kind
    ]

  if (!file) {
    return `Please select a ${rule.label} file`
  }

  const ext =
    getFileExtension(
      file.name
    )

  const extOk =
    rule.extensions.includes(
      ext
    )

  const mimeOk =
    rule.mimePrefix
      ? (
          file.type ||
          ''
        ).startsWith(
          rule.mimePrefix
        )
      : true

  if (
    !extOk &&
    !mimeOk
  ) {
    return `That doesn't look like a valid ${rule.label} file`
  }

  return null
}