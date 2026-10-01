export const DEFAULT_AD_UNLOCK_RULES = Object.freeze([
  Object.freeze({ startEpisode: 1, endEpisode: 1000, unlockCount: 10 }),
  Object.freeze({ startEpisode: 1001, endEpisode: 1500, unlockCount: 5 }),
  Object.freeze({ startEpisode: 1501, endEpisode: null, unlockCount: 3 }),
])

const cloneDefaults = () => DEFAULT_AD_UNLOCK_RULES.map((rule) => ({ ...rule }))

const isUnlimitedEnd = (value) => {
  if (value === null || value === undefined) return true
  const text = String(value).trim().toLowerCase()
  return !text || text === 'infinity' || text === 'inf' || text === '∞' || text === 'unlimited' || text === 'no upper limit'
}

const parseInteger = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const numeric = Number(value)
  return Number.isInteger(numeric) ? numeric : Number.NaN
}

const getRawRuleValue = (rule, keys) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(rule || {}, key)) return rule[key]
  }
  return undefined
}

export function normalizeAdUnlockRules(value) {
  const source = Array.isArray(value) ? value : cloneDefaults()
  return source.map((rule) => ({
    startEpisode: getRawRuleValue(rule, ['startEpisode', 'start', 'episodeStart']) ?? '',
    endEpisode: isUnlimitedEnd(getRawRuleValue(rule, ['endEpisode', 'end', 'episodeEnd']))
      ? null
      : getRawRuleValue(rule, ['endEpisode', 'end', 'episodeEnd']),
    unlockCount: getRawRuleValue(rule, ['unlockCount', 'count', 'episodesPerAd', 'episodesUnlocked']) ?? '',
  }))
}

export function validateAdUnlockRules(value) {
  const normalized = normalizeAdUnlockRules(value)
  const errors = []
  const parsed = normalized.map((rule, index) => {
    const start = parseInteger(rule.startEpisode)
    const end = rule.endEpisode === null ? null : parseInteger(rule.endEpisode)
    const unlockCount = parseInteger(rule.unlockCount)

    if (!Number.isInteger(start) || start < 1) {
      errors.push(`Rule ${index + 1}: Start Episode must be a positive integer.`)
    }
    if (rule.endEpisode !== null && (!Number.isInteger(end) || end < 1)) {
      errors.push(`Rule ${index + 1}: End Episode must be blank/∞ or a positive integer.`)
    }
    if (Number.isInteger(start) && end !== null && Number.isInteger(end) && start > end) {
      errors.push(`Rule ${index + 1}: Start Episode cannot be greater than End Episode.`)
    }
    if (!Number.isInteger(unlockCount) || unlockCount < 1) {
      errors.push(`Rule ${index + 1}: Episodes Per Ad must be a positive integer.`)
    }

    return { start, end, unlockCount }
  })

  if (!normalized.length) errors.push('Add at least one Ads unlock rule.')

  const validRows = parsed.every((rule) => Number.isInteger(rule.start) && rule.start >= 1 && (rule.end === null || (Number.isInteger(rule.end) && rule.end >= rule.start)) && Number.isInteger(rule.unlockCount) && rule.unlockCount >= 1)
  const sorted = validRows
    ? parsed
      .map((rule) => ({
        startEpisode: rule.start,
        endEpisode: rule.end,
        unlockCount: rule.unlockCount,
      }))
      .sort((a, b) => a.startEpisode - b.startEpisode)
    : normalized

  if (validRows) {
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (previous.endEpisode === null) {
        errors.push(`Rule ${index + 1}: An unlimited rule must be the final rule; multiple unlimited/overlapping rules are not allowed.`)
        continue
      }
      if (current.startEpisode <= previous.endEpisode) {
        errors.push(`Rules overlap: ${previous.startEpisode}–${previous.endEpisode} and ${current.startEpisode}–${current.endEpisode ?? '∞'}.`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedRules: sorted,
  }
}

export function findAdUnlockRule(episodeNumber, rules) {
  const episode = parseInteger(episodeNumber)
  if (!Number.isInteger(episode) || episode < 1) return null
  const validation = validateAdUnlockRules(rules)
  if (!validation.valid) return null
  return validation.normalizedRules.find((rule) => (
    episode >= rule.startEpisode &&
    (rule.endEpisode === null || episode <= rule.endEpisode)
  )) || null
}

export function resolveAdUnlockPlan(episodeNumber, rules) {
  const episode = parseInteger(episodeNumber)
  if (!Number.isInteger(episode) || episode < 1) throw new Error('Invalid starting episode number.')
  const validation = validateAdUnlockRules(rules)
  if (!validation.valid) throw new Error(validation.errors.join(' '))
  const rule = validation.normalizedRules.find((candidate) => (
    episode >= candidate.startEpisode &&
    (candidate.endEpisode === null || episode <= candidate.endEpisode)
  ))
  if (!rule) throw new Error(`No Ads unlock rule matches Episode ${episode}.`)
  return {
    unlockCount: rule.unlockCount,
    startEpisode: episode,
    endEpisode: episode + rule.unlockCount - 1,
    ruleStartEpisode: rule.startEpisode,
    ruleEndEpisode: rule.endEpisode,
  }
}
