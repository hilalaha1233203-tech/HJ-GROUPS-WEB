const CONTENT_STATUS_VALUES = Object.freeze(['ongoing', 'completed', 'upcoming'])

export const CONTENT_STATUS_OPTIONS = Object.freeze([
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'upcoming', label: 'Coming Soon' },
])

export function normalizeContentStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return CONTENT_STATUS_VALUES.includes(normalized) ? normalized : 'ongoing'
}

export function contentStatusLabel(value) {
  const normalized = normalizeContentStatus(value)
  return CONTENT_STATUS_OPTIONS.find((option) => option.value === normalized)?.label || 'Ongoing'
}
