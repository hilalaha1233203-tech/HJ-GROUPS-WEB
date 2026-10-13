const STORAGE_OBJECT_PATH = /\/storage\/v1\/object\/(?:public|authenticated|sign)\//i

export function isSupabaseStorageObjectUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return false

  try {
    const parsed = new URL(raw, 'https://local.invalid')
    const host = parsed.hostname.toLowerCase()
    const isSupabaseHost = host === 'supabase.co' || host.endsWith('.supabase.co')
    return isSupabaseHost && STORAGE_OBJECT_PATH.test(parsed.pathname)
  } catch {
    return false
  }
}

export function resolveAudioEpisodeUrl({ streamUrl, fileUrl, audioUrl, fallbackUrl } = {}) {
  const candidates = [streamUrl, fileUrl, audioUrl, fallbackUrl]

  for (const candidate of candidates) {
    const url = String(candidate || '').trim()
    if (!url || url.includes('example.com')) continue
    if (isSupabaseStorageObjectUrl(url)) continue
    return url
  }

  return null
}
