import { createClient } from '@supabase/supabase-js'
import { isAdminUser, envString, headersForCors, jsonResponse } from './runtime.js'

const DEFAULT_SUPABASE_URL = 'https://yajkfglagnyvenddyvok.supabase.co'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DATE_STYLE_INDEX = 2
const NUMBER_STYLE_INDEX = 3

export const SECURITY_NOTE =
  'This export excludes passwords, password hashes, authentication tokens, recovery credentials, service credentials, API keys, OTP values, card data, and payment secrets.'

const asText = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const normalizeId = (value) => {
  const text = String(value ?? '').trim()
  return text || null
}

const parseDateMs = (value) => {
  const time = new Date(value || '').getTime()
  return Number.isFinite(time) ? time : null
}

const isDateValue = (value) => parseDateMs(value) != null

const excelSerial = (value) => {
  const time = parseDateMs(value)
  return time == null ? null : (time / 86400000) + 25569
}

const xmlEscape = (value) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const unique = (items) => Array.from(new Set(items.filter(Boolean)))

async function listAllUsers(client) {
  const users = []
  const perPage = 1000
  for (let page = 1; page <= 1000; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const batch = Array.isArray(data?.users) ? data.users : []
    users.push(...batch)
    if (batch.length < perPage) break
  }
  return users.filter((user) => user?.is_anonymous !== true)
}

async function fetchAllRows(client, table, select, {
  start = '',
  end = '',
  orderColumn = 'id',
} = {}) {
  const rows = []
  const pageSize = 1000

  for (let offset = 0; offset <= 2_000_000; offset += pageSize) {
    let query = client
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (start) query = query.gte('created_at', start)
    if (end) query = query.lt('created_at', end)

    const { data, error } = await query
    if (error) throw new Error(table + ': ' + error.message)

    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }

  return rows
}

function resolveDateRange(searchParams) {
  const explicitStart = parseDateMs(searchParams.get('start'))
  const explicitEnd = parseDateMs(searchParams.get('end'))
  if (explicitStart != null && explicitEnd != null && explicitEnd > explicitStart) {
    return {
      label: asText(searchParams.get('range'), 'custom'),
      start: new Date(explicitStart).toISOString(),
      end: new Date(explicitEnd).toISOString(),
    }
  }

  const label = asText(searchParams.get('range'), '7d')
  if (label === 'all') return { label, start: '', end: '' }

  const now = new Date()
  const start = new Date(now)
  if (label === 'today') start.setUTCHours(0, 0, 0, 0)
  else if (label === '30d') start.setUTCDate(start.getUTCDate() - 30)
  else start.setUTCDate(start.getUTCDate() - 7)

  return {
    label: label === 'today' || label === '30d' ? label : '7d',
    start: start.toISOString(),
    end: now.toISOString(),
  }
}

function userNumberMap(users) {
  const ordered = [...users].sort((a, b) => {
    const ad = parseDateMs(a?.created_at) ?? Number.MAX_SAFE_INTEGER
    const bd = parseDateMs(b?.created_at) ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd
    return asText(a?.email).localeCompare(asText(b?.email))
  })
  return new Map(ordered.map((user, index) => [normalizeId(user.id), 'User ' + (index + 1)]))
}

function accountStatus(user) {
  if (parseDateMs(user?.deleted_at) != null) return 'Deleted'
  const bannedUntil = parseDateMs(user?.banned_until)
  if (bannedUntil != null && bannedUntil > Date.now()) return 'Banned'
  return 'Active'
}

function authProviders(user) {
  return unique((Array.isArray(user?.identities) ? user.identities : [])
    .map((identity) => asText(identity?.provider)))
}

function backupGoogleEmails(user) {
  return unique((Array.isArray(user?.identities) ? user.identities : [])
    .filter((identity) => asText(identity?.provider).toLowerCase() === 'google')
    .map((identity) => asText(identity?.identity_data?.email)))
}

function recoveryStatus({ emailVerified, phoneVerified, googleBackups }) {
  const values = []
  if (emailVerified) values.push('Email verified')
  if (phoneVerified) values.push('Phone verified')
  if (googleBackups.length) values.push('Google backup linked')
  return values.length ? values.join('; ') : 'No verified recovery method recorded'
}

function contentMaps(data) {
  return {
    stories: new Map(data.stories.map((row) => [normalizeId(row.id), row])),
    episodes: new Map(data.episodes.map((row) => [normalizeId(row.id), row])),
    books: new Map(data.books.map((row) => [normalizeId(row.id), row])),
    videoStories: new Map(data.videoStories.map((row) => [normalizeId(row.id), row])),
    videoEpisodes: new Map(data.videoEpisodes.map((row) => [normalizeId(row.id), row])),
  }
}

function resolveActivityContent(row, maps) {
  const episode = maps.episodes.get(normalizeId(row.episode_id))
  if (episode) {
    const story = maps.stories.get(normalizeId(episode.story_id || row.story_id))
    return {
      type: 'Audio episode',
      title: asText(episode.title, 'Episode ' + asText(episode.episode_number || episode.number)),
      story: asText(story?.title),
      videoStory: '',
      episodeNumber: episode.episode_number ?? episode.number ?? '',
      book: '',
    }
  }

  const videoEpisode = maps.videoEpisodes.get(normalizeId(row.video_episode_id))
  if (videoEpisode) {
    const story = maps.videoStories.get(normalizeId(videoEpisode.video_story_id || videoEpisode.story_id || row.video_story_id))
    return {
      type: 'Video episode',
      title: asText(videoEpisode.title, 'Episode ' + asText(videoEpisode.episode_number || videoEpisode.number)),
      story: '',
      videoStory: asText(story?.title),
      episodeNumber: videoEpisode.episode_number ?? videoEpisode.number ?? '',
      book: '',
    }
  }

  const story = maps.stories.get(normalizeId(row.story_id))
  if (story) {
    return {
      type: 'Audio story',
      title: asText(story.title),
      story: asText(story.title),
      videoStory: '',
      episodeNumber: '',
      book: '',
    }
  }

  const videoStory = maps.videoStories.get(normalizeId(row.video_story_id))
  if (videoStory) {
    return {
      type: 'Video story',
      title: asText(videoStory.title),
      story: '',
      videoStory: asText(videoStory.title),
      episodeNumber: '',
      book: '',
    }
  }

  const book = maps.books.get(normalizeId(row.book_id))
  if (book) {
    return {
      type: 'Book',
      title: asText(book.title),
      story: '',
      videoStory: '',
      episodeNumber: '',
      book: asText(book.title),
    }
  }

  return { type: '', title: '', story: '', videoStory: '', episodeNumber: '', book: '' }
}

const sortUserNumbers = (a, b) =>
  String(a['User Number']).localeCompare(String(b['User Number']), undefined, { numeric: true })

const ensureUserActivityStat = (map, uid) => {
  if (!map.has(uid)) {
    map.set(uid, {
      storyViews: 0,
      episodePlays: 0,
      episodeCompletions: 0,
      uniqueEpisodes: new Set(),
      first: null,
      last: null,
    })
  }
  return map.get(uid)
}

const touchBounds = (bucket, timestamp) => {
  const time = parseDateMs(timestamp)
  if (time == null) return
  if (bucket.first == null || time < bucket.first) bucket.first = time
  if (bucket.last == null || time > bucket.last) bucket.last = time
}

export function buildAdminExportModel({
  users,
  profiles,
  activity,
  purchases,
  paymentOrders,
  adUnlocks,
  shortenerUnlocks,
  sessionLinks,
  stories,
  episodes,
  books,
  videoStories,
  videoEpisodes,
  range,
  exportedAt = new Date().toISOString(),
}) {
  const safeUsers = users.filter((user) => user?.is_anonymous !== true)
  const userNumbers = userNumberMap(safeUsers)
  const profileById = new Map(profiles.map((row) => [normalizeId(row.id), row]))
  const maps = contentMaps({ stories, episodes, books, videoStories, videoEpisodes })
  const registeredActivity = activity.filter((row) => userNumbers.has(normalizeId(row.user_id)))
  const activityByUser = new Map()
  const lastPlayedEpisodeByUser = new Map()
  const storyStats = new Map()
  const episodeStats = new Map()
  const unlockStats = new Map()

  for (const row of registeredActivity) {
    const uid = normalizeId(row.user_id)
    const userActivity = ensureUserActivityStat(activityByUser, uid)
    const eventType = asText(row.event_type)
    touchBounds(userActivity, row.created_at)

    if (eventType === 'story_view') userActivity.storyViews += 1
    if (eventType === 'episode_play') {
      userActivity.episodePlays += 1
      const eid = normalizeId(row.episode_id)
      if (eid) userActivity.uniqueEpisodes.add(eid)
    }
    if (eventType === 'episode_complete') userActivity.episodeCompletions += 1

    const episode = maps.episodes.get(normalizeId(row.episode_id))
    if (eventType === 'episode_play' && episode) {
      const playedAt = parseDateMs(row.created_at)
      const current = lastPlayedEpisodeByUser.get(uid)
      if (playedAt != null && (!current || playedAt > current.playedAt)) {
        lastPlayedEpisodeByUser.set(uid, {
          playedAt,
          episodeNumber: episode.episode_number ?? episode.number ?? '',
          title: asText(episode.title),
        })
      }
    }

    const storyId = normalizeId(episode?.story_id || row.story_id)
    if (storyId) {
      const key = uid + '|' + storyId
      const stat = storyStats.get(key) || {
        userId: uid,
        storyId,
        storyViews: 0,
        episodePlays: 0,
        episodeCompletions: 0,
        uniqueEpisodes: new Set(),
        first: null,
        last: null,
      }
      if (eventType === 'story_view') stat.storyViews += 1
      if (eventType === 'episode_play') {
        stat.episodePlays += 1
        const eid = normalizeId(row.episode_id)
        if (eid) stat.uniqueEpisodes.add(eid)
      }
      if (eventType === 'episode_complete') stat.episodeCompletions += 1
      touchBounds(stat, row.created_at)
      storyStats.set(key, stat)
    }

    const audioEpisodeId = normalizeId(row.episode_id)
    const videoEpisodeId = normalizeId(row.video_episode_id)
    if (audioEpisodeId || videoEpisodeId) {
      const contentId = audioEpisodeId || videoEpisodeId
      const contentType = audioEpisodeId ? 'Audio episode' : 'Video episode'
      const key = uid + '|' + contentType + '|' + contentId
      const stat = episodeStats.get(key) || {
        userId: uid,
        contentType,
        contentId,
        playCount: 0,
        completionCount: 0,
        first: null,
        last: null,
      }
      if (eventType === 'episode_play' || eventType === 'video_play') stat.playCount += 1
      if (eventType === 'episode_complete' || eventType === 'video_complete') stat.completionCount += 1
      touchBounds(stat, row.created_at)
      episodeStats.set(key, stat)
    }

    if (eventType === 'ad_unlock_started' || eventType === 'ad_unlock_completed' ||
        eventType === 'shortener_unlock_started' || eventType === 'shortener_unlock_completed') {
      const stat = unlockStats.get(uid) || {
        adStarts: 0,
        adCompletions: 0,
        actualAds: 0,
        shortenerStarts: 0,
        shortenerCompletions: 0,
        actualShorteners: 0,
        first: null,
        last: null,
      }
      if (eventType === 'ad_unlock_started') stat.adStarts += 1
      if (eventType === 'ad_unlock_completed') stat.adCompletions += 1
      if (eventType === 'shortener_unlock_started') stat.shortenerStarts += 1
      if (eventType === 'shortener_unlock_completed') stat.shortenerCompletions += 1
      touchBounds(stat, row.created_at)
      unlockStats.set(uid, stat)
    }
  }

  for (const row of adUnlocks.filter((unlock) => unlock?.provider === 'rewarded_ad')) {
    const uid = normalizeId(row.user_id)
    if (!userNumbers.has(uid)) continue
    const stat = unlockStats.get(uid) || {
      adStarts: 0,
      adCompletions: 0,
      actualAds: 0,
      shortenerStarts: 0,
      shortenerCompletions: 0,
      actualShorteners: 0,
      first: null,
      last: null,
    }
    stat.actualAds += 1
    touchBounds(stat, row.created_at)
    unlockStats.set(uid, stat)
  }

  for (const row of shortenerUnlocks) {
    const uid = normalizeId(row.user_id)
    if (!userNumbers.has(uid)) continue
    const stat = unlockStats.get(uid) || {
      adStarts: 0,
      adCompletions: 0,
      actualAds: 0,
      shortenerStarts: 0,
      shortenerCompletions: 0,
      actualShorteners: 0,
      first: null,
      last: null,
    }
    stat.actualShorteners += 1
    touchBounds(stat, row.created_at)
    unlockStats.set(uid, stat)
  }

  const paymentByUserContent = new Map()
  for (const order of paymentOrders) {
    const key = normalizeId(order.user_id) + '|story|' + asText(order.content_id)
    const list = paymentByUserContent.get(key) || []
    list.push(order)
    paymentByUserContent.set(key, list)
  }

  const purchaseByUser = new Map()
  for (const purchase of purchases) {
    const uid = normalizeId(purchase.user_id)
    if (!userNumbers.has(uid)) continue
    const list = purchaseByUser.get(uid) || []
    list.push(purchase)
    purchaseByUser.set(uid, list)
  }

  const findPaymentOrder = (purchase) => {
    const key = normalizeId(purchase.user_id) + '|story|' + asText(purchase.story_id)
    const candidates = paymentByUserContent.get(key) || []
    const purchaseTime = parseDateMs(purchase.created_at) ?? Number.MAX_SAFE_INTEGER
    return [...candidates].sort((a, b) => {
      const aPaid = asText(a.status).toUpperCase() === 'PAID' ? 1 : 0
      const bPaid = asText(b.status).toUpperCase() === 'PAID' ? 1 : 0
      if (aPaid !== bPaid) return bPaid - aPaid
      const ad = Math.abs((parseDateMs(a.paid_at || a.created_at) ?? purchaseTime) - purchaseTime)
      const bd = Math.abs((parseDateMs(b.paid_at || b.created_at) ?? purchaseTime) - purchaseTime)
      if (ad !== bd) return ad - bd
      return String(b.id ?? '').localeCompare(String(a.id ?? ''))
    })[0] || null
  }

  const storyRollupsByUser = new Map()
  for (const stat of storyStats.values()) {
    const list = storyRollupsByUser.get(stat.userId) || []
    list.push(stat)
    storyRollupsByUser.set(stat.userId, list)
  }

  const topStoryText = (items, metric) => [...items]
    .sort((a, b) => {
      const delta = Number(b[metric] ?? 0) - Number(a[metric] ?? 0)
      if (delta) return delta
      return String(a.title).localeCompare(String(b.title))
    })
    .slice(0, 3)
    .filter((item) => Number(item[metric] ?? 0) > 0)
    .map((item) => item.title + ' (' + item[metric] + ')')
    .join('; ')

  const usersRows = safeUsers.map((user) => {
    const uid = normalizeId(user.id)
    const profile = profileById.get(uid) || {}
    const providers = authProviders(user)
    const googleBackups = backupGoogleEmails(user)
    const emailVerified = Boolean(user.email_confirmed_at)
    const phoneVerified = Boolean(user.phone_confirmed_at)
    const activityStat = activityByUser.get(uid) || {
      storyViews: 0,
      episodePlays: 0,
      episodeCompletions: 0,
      uniqueEpisodes: new Set(),
      first: null,
      last: null,
    }
    const unlock = unlockStats.get(uid) || {
      adStarts: 0,
      adCompletions: 0,
      actualAds: 0,
      shortenerStarts: 0,
      shortenerCompletions: 0,
      actualShorteners: 0,
      first: null,
      last: null,
    }
    const userPurchases = purchaseByUser.get(uid) || []
    const successfulPurchaseAmount = userPurchases.reduce((sum, purchase) => {
      const order = findPaymentOrder(purchase)
      if (asText(order?.status).toUpperCase() !== 'PAID') return sum
      const amount = Number(order?.amount)
      return Number.isFinite(amount) ? sum + amount : sum
    }, 0)
    const currentActivePurchases = userPurchases.filter((purchase) => {
      if (!purchase.expires_at) return true
      const expiry = parseDateMs(purchase.expires_at)
      return expiry != null && expiry > Date.now()
    })
    const rollups = (storyRollupsByUser.get(uid) || []).map((stat) => ({
      title: asText(maps.stories.get(stat.storyId)?.title, 'Unknown story'),
      views: stat.storyViews,
      plays: stat.episodePlays,
      engagement: stat.storyViews + stat.episodePlays + stat.episodeCompletions,
    }))

    return {
      'User Number': userNumbers.get(uid),
      'User ID': uid,
      'Full Name': asText(profile.full_name, asText(user.user_metadata?.full_name)),
      'Gmail / Email': asText(user.email, asText(profile.email)),
      'Account Created At': asText(user.created_at),
      'First Activity': activityStat.first == null ? '' : new Date(activityStat.first).toISOString(),
      'Last Activity': activityStat.last == null ? '' : new Date(activityStat.last).toISOString(),
      'Last Played Episode': (() => {
        const latest = lastPlayedEpisodeByUser.get(uid)
        if (!latest) return ''
        const number = latest.episodeNumber === '' ? '' : 'Episode ' + latest.episodeNumber
        return number && latest.title ? number + ' — ' + latest.title : number || latest.title
      })(),
      'Account Status': accountStatus(user),
      'Auth Method(s)': providers.join(', '),
      'Email Verified': emailVerified ? 'Yes' : 'No',
      'Phone Verified': phoneVerified ? 'Yes' : 'No',
      'Password Set': 'Not available from a trusted application source',
      'Last Password Change': '',
      'Backup Google Account': googleBackups.join('; '),
      'Mobile Number': asText(user.phone),
      'Recovery Status': recoveryStatus({ emailVerified, phoneVerified, googleBackups }),
      'Profile Role': asText(profile.role),
      'Total Story Views': activityStat.storyViews,
      'Total Episode Plays': activityStat.episodePlays,
      'Total Episode Completions': activityStat.episodeCompletions,
      'Unique Episodes Played': activityStat.uniqueEpisodes.size,
      'Most Frequently Viewed Stories': topStoryText(rollups.map((item) => ({ title: item.title, value: item.views })), 'value'),
      'Most Frequently Listened Stories': topStoryText(rollups.map((item) => ({ title: item.title, value: item.plays })), 'value'),
      'Stories with Highest Engagement': topStoryText(rollups.map((item) => ({ title: item.title, value: item.engagement })), 'value'),
      'Rewarded Ad Unlocks': unlock.actualAds,
      'Shortener Unlocks': unlock.actualShorteners,
      'Total Unlocks': unlock.actualAds + unlock.actualShorteners,
      'Total Purchase Count': userPurchases.length,
      'Total Successful Purchase Amount': successfulPurchaseAmount,
      'Current Premium/VIP Access': isAdminUser(user)
        ? 'Admin VIP'
        : currentActivePurchases.length
          ? 'Active paid purchase access'
          : 'No active purchase access',
    }
  }).sort(sortUserNumbers)

  const userActivityRows = registeredActivity.map((row) => {
    const uid = normalizeId(row.user_id)
    const content = resolveActivityContent(row, maps)
    return {
      'User Number': userNumbers.get(uid),
      'User ID': uid,
      'Activity ID': row.id,
      'Activity Time': asText(row.created_at),
      'Event Type': asText(row.event_type),
      'Content Type': content.type,
      'Content Title': content.title,
      'Story': content.story,
      'Video Story': content.videoStory,
      'Episode Number': content.episodeNumber,
      'Book': content.book,
      'Access Type': asText(row.access_type),
      'Session': asText(row.session_id) ? '…' + asText(row.session_id).slice(-8) : '',
    }
  })

  const storyInterestRows = [...storyStats.values()].map((stat) => {
    const story = maps.stories.get(stat.storyId)
    return {
      'User Number': userNumbers.get(stat.userId),
      'User ID': stat.userId,
      'Story': asText(story?.title, 'Unknown story'),
      'Story ID': stat.storyId,
      'Story Views': stat.storyViews,
      'Episode Plays': stat.episodePlays,
      'Episode Completions': stat.episodeCompletions,
      'Unique Episodes Played': stat.uniqueEpisodes.size,
      'First Activity': stat.first == null ? '' : new Date(stat.first).toISOString(),
      'Last Activity': stat.last == null ? '' : new Date(stat.last).toISOString(),
      'Engagement Events': stat.storyViews + stat.episodePlays + stat.episodeCompletions,
    }
  }).sort((a, b) => {
    const byUser = sortUserNumbers(a, b)
    return byUser || Number(b['Engagement Events']) - Number(a['Engagement Events'])
  })

  const episodeActivityRows = [...episodeStats.values()].map((stat) => {
    const episode = stat.contentType === 'Audio episode'
      ? maps.episodes.get(stat.contentId)
      : maps.videoEpisodes.get(stat.contentId)
    const story = stat.contentType === 'Audio episode'
      ? maps.stories.get(normalizeId(episode?.story_id))
      : maps.videoStories.get(normalizeId(episode?.video_story_id || episode?.story_id))
    return {
      'User Number': userNumbers.get(stat.userId),
      'User ID': stat.userId,
      'Content Type': stat.contentType,
      'Story': asText(story?.title),
      'Episode Number': episode?.episode_number ?? episode?.number ?? '',
      'Episode ID': stat.contentId,
      'Play Count': stat.playCount,
      'Completion Count': stat.completionCount,
      'First Played': stat.first == null ? '' : new Date(stat.first).toISOString(),
      'Last Played': stat.last == null ? '' : new Date(stat.last).toISOString(),
    }
  }).sort((a, b) => {
    const byUser = sortUserNumbers(a, b)
    if (byUser) return byUser
    const byStory = String(a.Story).localeCompare(String(b.Story))
    return byStory || Number(a['Episode Number'] || 0) - Number(b['Episode Number'] || 0)
  })

  const purchaseRows = purchases.filter((purchase) => userNumbers.has(normalizeId(purchase.user_id))).map((purchase) => {
    const uid = normalizeId(purchase.user_id)
    const order = findPaymentOrder(purchase)
    const story = maps.stories.get(normalizeId(purchase.story_id))
    const expiry = parseDateMs(purchase.expires_at)
    return {
      'User Number': userNumbers.get(uid),
      'User ID': uid,
      'Purchase ID': purchase.id,
      'Purchase Date': asText(purchase.created_at),
      'Provider': order?.cashfree_order_id ? 'Cashfree' : '',
      'Product / Plan Name': asText(order?.product_key, asText(purchase.product_type)),
      'Story Purchased': asText(story?.title),
      'Story ID': normalizeId(purchase.story_id) || '',
      'Access Type': asText(purchase.product_type),
      'Amount': Number.isFinite(Number(order?.amount)) ? Number(order.amount) : '',
      'Currency': asText(order?.currency),
      'Payment Status': asText(order?.status),
      'Purchase Validity / Expiry': asText(purchase.expires_at),
      'Lifetime vs Subscription': purchase.expires_at ? 'Subscription / timed access' : 'Lifetime',
      'Subscription Period': '',
      'Premium/VIP Status': expiry == null || expiry > Date.now() ? 'Active purchase access' : 'Expired',
    }
  }).sort(sortUserNumbers)

  const unlockRows = safeUsers.map((user) => {
    const uid = normalizeId(user.id)
    const unlock = unlockStats.get(uid) || {
      adStarts: 0,
      adCompletions: 0,
      actualAds: 0,
      shortenerStarts: 0,
      shortenerCompletions: 0,
      actualShorteners: 0,
      first: null,
      last: null,
    }
    return {
      'User Number': userNumbers.get(uid),
      'User ID': uid,
      'Rewarded Ad Unlock Starts': unlock.adStarts,
      'Rewarded Ad Unlock Completions': unlock.adCompletions,
      'Actual Rewarded Ad Unlocks': unlock.actualAds,
      'Shortener Unlock Starts': unlock.shortenerStarts,
      'Shortener Unlock Completions': unlock.shortenerCompletions,
      'Actual Shortener Unlocks': unlock.actualShorteners,
      'Total Unlocks': unlock.actualAds + unlock.actualShorteners,
      'First Unlock Activity': unlock.first == null ? '' : new Date(unlock.first).toISOString(),
      'Last Unlock Activity': unlock.last == null ? '' : new Date(unlock.last).toISOString(),
    }
  }).sort(sortUserNumbers)

  const knownUsersBySession = new Map()
  for (const link of sessionLinks) {
    const sessionId = asText(link?.session_id)
    const uid = normalizeId(link?.user_id)
    if (!sessionId || !userNumbers.has(uid)) continue
    const list = knownUsersBySession.get(sessionId) || []
    if (!list.includes(uid)) list.push(uid)
    knownUsersBySession.set(sessionId, list)
  }

  const visitorStats = new Map()
  for (const row of activity.filter((item) => !normalizeId(item?.user_id) && asText(item?.session_id))) {
    const sessionId = asText(row.session_id)
    const stat = visitorStats.get(sessionId) || { sessionId, last: null, plays: 0, rewarded: 0, shortener: 0 }
    const time = parseDateMs(row.created_at)
    if (time != null && (stat.last == null || time > stat.last)) stat.last = time
    if (row.event_type === 'episode_play') stat.plays += 1
    if (row.event_type === 'ad_unlock_completed') stat.rewarded += 1
    if (row.event_type === 'shortener_unlock_completed') stat.shortener += 1
    visitorStats.set(sessionId, stat)
  }

  const visitorRows = [...visitorStats.values()].map((stat) => {
    const linkedIds = knownUsersBySession.get(stat.sessionId) || []
    const linkedAccounts = linkedIds.map((uid) => {
      const user = safeUsers.find((item) => normalizeId(item.id) === uid)
      const profile = profileById.get(uid) || {}
      const displayName = asText(
        profile.full_name,
        asText(user?.user_metadata?.full_name, asText(user?.email, 'Unnamed account'))
      )
      return user?.email ? displayName + ' <' + user.email + '>' : displayName
    })

    return {
      'Session': '…' + stat.sessionId.slice(-8),
      'Known Account': linkedAccounts.length === 0
        ? 'Anonymous visitor'
        : linkedAccounts.length === 1
          ? linkedAccounts[0]
          : 'Multiple linked accounts (' + linkedAccounts.length + ')',
      'Linked Account Count': linkedAccounts.length,
      'Linked Accounts': linkedAccounts.join('; '),
      'Last Activity': stat.last == null ? '' : new Date(stat.last).toISOString(),
      'Plays': stat.plays,
      'Rewarded Ad Unlocks': stat.rewarded,
      'Shortener Unlocks': stat.shortener,
      'Total Unlocks': stat.rewarded + stat.shortener,
    }
  }).sort((a, b) => String(a.Session).localeCompare(String(b.Session)))

  const summaryRows = [
    { Key: 'Exported At (UTC)', Value: exportedAt },
    { Key: 'Selected Analytics Range', Value: range.label === 'all' ? 'All Time' : range.label },
    { Key: 'Range Start (UTC)', Value: range.start || 'All available records' },
    { Key: 'Range End (UTC)', Value: range.end || 'All available records' },
    { Key: 'Registered Users', Value: safeUsers.length },
    { Key: 'User Activity Rows', Value: userActivityRows.length },
    { Key: 'User Story Interest Rows', Value: storyInterestRows.length },
    { Key: 'User Episode Activity Rows', Value: episodeActivityRows.length },
    { Key: 'User Purchase Rows', Value: purchaseRows.length },
    { Key: 'User Unlock Rows', Value: unlockRows.length },
    { Key: 'Visitor Session Rows', Value: visitorRows.length },
    { Key: 'IP Data', Value: 'Not currently available from the application-owned analytics source; no new IP collection was added.' },
    { Key: 'Password Set', Value: 'Not available from a trusted application source; no credential data is accessed or exported.' },
    { Key: 'Last Password Change', Value: 'Not available from the current trusted application data source.' },
    { Key: 'Security', Value: SECURITY_NOTE },
  ]

  return {
    sheets: [
      { name: 'Users', rows: usersRows },
      { name: 'User Activity', rows: userActivityRows },
      { name: 'User Story Interest', rows: storyInterestRows },
      { name: 'User Episode Activity', rows: episodeActivityRows },
      { name: 'User Purchases', rows: purchaseRows },
      { name: 'User Unlock Activity', rows: unlockRows },
      { name: 'Visitor Sessions', rows: visitorRows },
      { name: 'Export Summary', rows: summaryRows },
    ],
  }
}

function columnLetter(number) {
  let value = number
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

function inferType(header, value) {
  if (
    /At$|Time$|Date$|Played$|Activity$|Expiry$|Exported At|Range Start|Range End/.test(header) &&
    typeof value === 'string' &&
    isDateValue(value)
  ) return 'date'
  if (
    /Amount|Count|Views|Plays|Completions|Unlocks|Events|Rows$/.test(header) &&
    value !== '' &&
    Number.isFinite(Number(value))
  ) return 'number'
  return 'text'
}

function cellXml(ref, value, type, style) {
  if (value == null || value === '') return ''
  if (type === 'date') {
    const serial = excelSerial(value)
    if (serial == null) {
      return '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEscape(value) + '</t></is></c>'
    }
    return '<c r="' + ref + '" s="' + style + '" t="n"><v>' + serial.toFixed(10) + '</v></c>'
  }
  if (type === 'number' && Number.isFinite(Number(value))) {
    return '<c r="' + ref + '" s="' + style + '" t="n"><v>' + String(Number(value)) + '</v></c>'
  }
  return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>'
}

function worksheetXml(sheet) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : []
  const headers = rows.length ? Object.keys(rows[0]) : ['Value']
  const matrix = [Object.fromEntries(headers.map((header) => [header, header])), ...rows]

  const sheetData = matrix.map((row, rowIndex) => {
    const cells = headers.map((header, columnIndex) => {
      const ref = columnLetter(columnIndex + 1) + (rowIndex + 1)
      const value = row?.[header] ?? ''
      const type = rowIndex === 0 ? 'text' : inferType(header, value)
      const style = rowIndex === 0 ? 1 : type === 'date' ? DATE_STYLE_INDEX : type === 'number' ? NUMBER_STYLE_INDEX : 0
      return cellXml(ref, value, type, style)
    }).join('')
    return '<row r="' + (rowIndex + 1) + '">' + cells + '</row>'
  }).join('')

  const widths = headers.map((header) => {
    const maxLength = Math.max(
      String(header).length,
      ...rows.slice(0, 2000).map((row) => String(row?.[header] ?? '').length)
    )
    return Math.min(42, Math.max(12, maxLength + 2))
  })
  const cols = widths.map((width, index) =>
    '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>'
  ).join('')

  const endRef = columnLetter(headers.length) + Math.max(1, matrix.length)

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
    '</sheetView></sheetViews>' +
    '<cols>' + cols + '</cols>' +
    '<sheetData>' + sheetData + '</sheetData>' +
    '<autoFilter ref="A1:' + endRef + '"/>' +
    '</worksheet>'
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="D9EAF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
}

function contentTypesXml(count) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    Array.from({ length: count }, (_, index) =>
      '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    ).join('') +
    '</Types>'
}

function workbookXml(sheets) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    sheets.map((sheet, index) =>
      '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>'
    ).join('') +
    '</sheets></workbook>'
}

function workbookRelationshipsXml(sheets) {
  const rels = sheets.map((_, index) =>
    '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>'
  )
  rels.push(
    '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  )
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    rels.join('') + '</Relationships>'
}

const rootRelationshipsXml = () =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>'

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function zipBuffer(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const u16=(view,at,value)=>view.setUint16(at,value,true);
  const u32=(view,at,value)=>view.setUint32(at,value,true);

  for(const entry of entries){
    const name=encoder.encode(entry.name);
    const raw=encoder.encode(entry.content);
    const checksum=crc32(raw);
    const local=new Uint8Array(30+name.length);
    const lv=new DataView(local.buffer);
    u32(lv,0,0x04034b50); u16(lv,4,20); u16(lv,6,0); u16(lv,8,0);
    u16(lv,10,0); u16(lv,12,0); u32(lv,14,checksum);
    u32(lv,18,raw.length); u32(lv,22,raw.length); u16(lv,26,name.length); u16(lv,28,0);
    local.set(name,30);
    localParts.push(local,raw);

    const central=new Uint8Array(46+name.length);
    const cv=new DataView(central.buffer);
    u32(cv,0,0x02014b50); u16(cv,4,20); u16(cv,6,20); u16(cv,8,0); u16(cv,10,0);
    u16(cv,12,0); u16(cv,14,0); u32(cv,16,checksum); u32(cv,20,raw.length); u32(cv,24,raw.length);
    u16(cv,28,name.length); u16(cv,30,0); u16(cv,32,0); u16(cv,34,0); u16(cv,36,0);
    u32(cv,38,0); u32(cv,42,offset); central.set(name,46);
    centralParts.push(central);
    offset += local.length + raw.length;
  }

  const localLength=localParts.reduce((sum,part)=>sum+part.length,0);
  const centralLength=centralParts.reduce((sum,part)=>sum+part.length,0);
  const end=new Uint8Array(22);
  const ev=new DataView(end.buffer);
  u32(ev,0,0x06054b50); u16(ev,4,0); u16(ev,6,0); u16(ev,8,entries.length); u16(ev,10,entries.length);
  u32(ev,12,centralLength); u32(ev,16,localLength); u16(ev,20,0);

  const out=new Uint8Array(localLength+centralLength+22);
  let cursor=0;
  for(const part of localParts){out.set(part,cursor);cursor+=part.length;}
  for(const part of centralParts){out.set(part,cursor);cursor+=part.length;}
  out.set(end,cursor);
  return out;
}

export function buildAdminExportWorkbook(model) {
  const sheets = Array.isArray(model?.sheets) ? model.sheets : []
  if (!sheets.length) throw new Error('No export sheets were prepared')

  const entries = [
    { name: '[Content_Types].xml', content: contentTypesXml(sheets.length) },
    { name: '_rels/.rels', content: rootRelationshipsXml() },
    { name: 'xl/workbook.xml', content: workbookXml(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelationshipsXml(sheets) },
    { name: 'xl/styles.xml', content: stylesXml() },
  ]

  sheets.forEach((sheet, index) => {
    entries.push({
      name: 'xl/worksheets/sheet' + (index + 1) + '.xml',
      content: worksheetXml(sheet),
    })
  })

  return zipBuffer(entries)
}

export async function handleAdminUserExport(request) {
  if (request.method !== 'GET') return jsonResponse(request,405,{error:'Method not allowed'},{Allow:'GET'});

  const serviceKey=envString('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl=envString('VITE_SUPABASE_URL') || envString('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
  const authorization=String(request.headers.get('authorization')||'');
  const accessToken=authorization.startsWith('Bearer ')?authorization.slice(7).trim():'';
  if(!serviceKey || !accessToken) return jsonResponse(request,401,{error:'Unauthorized'});

  try{
    const adminClient=createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:userData,error:userError}=await adminClient.auth.getUser(accessToken);
    if(userError || !isAdminUser(userData?.user)) return jsonResponse(request,403,{error:'Forbidden'});

    const range=resolveDateRange(new URL(request.url).searchParams);
    const [
      users,profiles,activity,purchases,paymentOrders,adUnlocks,shortenerUnlocks,
      sessionLinks,stories,episodes,books,videoStories,videoEpisodes,
    ]=await Promise.all([
      listAllUsers(adminClient),
      fetchAllRows(adminClient,'profiles','id,full_name,email,role,created_at'),
      fetchAllRows(adminClient,'user_activity','id,user_id,session_id,event_type,story_id,episode_id,book_id,video_story_id,video_episode_id,access_type,created_at',range),
      fetchAllRows(adminClient,'purchases','id,user_id,story_id,product_type,expires_at,created_at'),
      fetchAllRows(adminClient,'payment_orders','id,user_id,cashfree_order_id,product_key,content_type,content_id,amount,currency,status,paid_at,created_at'),
      fetchAllRows(adminClient,'ad_unlocks','id,user_id,content_type,content_id,expires_at,created_at,story_id,start_episode_number,end_episode_number,provider',range),
      fetchAllRows(adminClient,'shortener_unlocks','id,user_id,content_type,content_id,provider,story_id,start_episode_number,end_episode_number,expires_at,created_at',range),
      fetchAllRows(adminClient,'analytics_session_links','id,session_id,user_id,linked_at'),
      fetchAllRows(adminClient,'stories','id,title,created_at'),
      fetchAllRows(adminClient,'episodes','id,story_id,episode_number,title,number'),
      fetchAllRows(adminClient,'books','id,title,created_at'),
      fetchAllRows(adminClient,'video_stories','id,title,created_at'),
      fetchAllRows(adminClient,'video_episodes','id,video_story_id,episode_number,title,number'),
    ]);

    const model=buildAdminExportModel({users,profiles,activity,purchases,paymentOrders,adUnlocks,shortenerUnlocks,sessionLinks,stories,episodes,books,videoStories,videoEpisodes,range});
    const workbook=buildAdminExportWorkbook(model);
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const headers=headersForCors(request);
    headers.set('Content-Type',XLSX_MIME);
    headers.set('Content-Disposition','attachment; filename="hj-groups-user-data-'+stamp+'.xlsx"');
    headers.set('Cache-Control','no-store, private');
    return new Response(workbook,{status:200,headers});
  }catch{
    return jsonResponse(request,500,{error:'User export could not be generated.'});
  }
}
