export function normalizeStoryAnalyticsId(value) {
  const raw = String(value ?? '').trim()
  const parsed = raw.startsWith('tg-story-') ? Number(raw.slice('tg-story-'.length)) : Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
