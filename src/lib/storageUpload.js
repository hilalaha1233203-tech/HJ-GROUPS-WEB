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

export async function uploadFileToBucket(
  bucket,
  folder,
  file
) {
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
    url:
      data.publicUrl,
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