export const ANALYTICS_BATCH_SIZES = Object.freeze([10, 25, 50, 100])

export function getEpisodeAnalyticsBatch(episodes, startEpisodeId, batchSize = 10) {
  const rows = Array.isArray(episodes) ? episodes : []
  const startIndex = rows.findIndex((episode) => Number(episode?.id) === Number(startEpisodeId))
  if (startIndex < 0) return []
  const sizeValue = Number(batchSize)
  const size = ANALYTICS_BATCH_SIZES.includes(sizeValue) ? sizeValue : 10
  return rows.slice(startIndex, startIndex + size)
}

export function summarizeEpisodeAnalyticsBatch(rows) {
  const episodes = Array.isArray(rows) ? rows : []
  const sum = (key) => episodes.reduce((total, row) => total + Number(row?.[key] || 0), 0)
  return {
    episode_count: episodes.length,
    total_plays: sum('total_plays'),
    completed_plays: sum('completed_plays'),
    ad_unlock_starts: sum('ad_unlock_starts'),
    ad_unlock_completions: sum('ad_unlock_completions'),
    shortener_unlock_completions: sum('shortener_unlock_completions'),
    average_plays_per_episode: episodes.length ? sum('total_plays') / episodes.length : 0,
  }
}
