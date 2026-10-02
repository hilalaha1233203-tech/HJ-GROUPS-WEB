export const MAX_GENRES = 5

export const GENRE_FALLBACK = Object.freeze(['Fantasy'])

export function normalizeGenreSelection(value, fallback = GENRE_FALLBACK) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? '').split(',')

  const selected = [...new Set(
    rawValues
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )]

  return selected.length ? selected : [...fallback]
}

export function serializeGenreSelection(value) {
  return normalizeGenreSelection(value).join(', ')
}

export function hasGenre(value, genre) {
  const target = String(genre || '').trim().toLowerCase()
  if (!target) return false

  return normalizeGenreSelection(value, []).some(
    (item) => item.toLowerCase() === target
  )
}
