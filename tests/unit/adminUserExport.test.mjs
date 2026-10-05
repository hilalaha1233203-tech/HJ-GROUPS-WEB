import test from 'node:test'
import assert from 'node:assert/strict'
import { inflateRawSync } from 'node:zlib'

import {
  buildAdminExportModel,
  buildAdminExportWorkbook,
  SECURITY_NOTE,
} from '../../server/adminUserExport.mjs'

const IDS = {
  user1: '11111111-1111-4111-8111-111111111111',
  user2: '22222222-2222-4222-8222-222222222222',
  user3: '33333333-3333-4333-8333-333333333333',
  story: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  episode: 101,
  book: 201,
  videoStory: 301,
  videoEpisode: 401,
}

function fixture() {
  return {
    users: [
      {
        id: IDS.user1,
        email: 'one@example.com',
        phone: '',
        created_at: '2026-01-01T00:00:00.000Z',
        email_confirmed_at: '2026-01-01T00:00:01.000Z',
        phone_confirmed_at: null,
        deleted_at: null,
        banned_until: null,
        identities: [{ provider: 'email' }, { provider: 'google', identity_data: { email: 'backup.one@gmail.com' } }],
        user_metadata: { full_name: 'One User' },
      },
      {
        id: IDS.user2,
        email: 'two@example.com',
        phone: '+910000000002',
        created_at: '2026-02-01T00:00:00.000Z',
        email_confirmed_at: null,
        phone_confirmed_at: '2026-02-01T00:00:01.000Z',
        deleted_at: null,
        banned_until: null,
        identities: [{ provider: 'email' }],
        user_metadata: { full_name: 'Two User' },
      },
      {
        id: IDS.user3,
        email: 'three@example.com',
        phone: '',
        created_at: '2026-03-01T00:00:00.000Z',
        email_confirmed_at: null,
        phone_confirmed_at: null,
        deleted_at: null,
        banned_until: null,
        identities: [],
        user_metadata: {},
      },
    ],
    profiles: [
      { id: IDS.user1, full_name: 'One User', email: 'one@example.com', role: 'user', created_at: '2026-01-01T00:00:00.000Z' },
      { id: IDS.user2, full_name: 'Two User', email: 'two@example.com', role: 'user', created_at: '2026-02-01T00:00:00.000Z' },
    ],
    activity: [
      { id: 1, user_id: IDS.user1, session_id: 'auth-session-1', event_type: 'story_view', story_id: IDS.story, episode_id: null, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'free', created_at: '2026-04-01T01:00:00.000Z' },
      { id: 2, user_id: IDS.user1, session_id: 'auth-session-1', event_type: 'episode_play', story_id: IDS.story, episode_id: IDS.episode, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'free', created_at: '2026-04-01T01:01:00.000Z' },
      { id: 3, user_id: IDS.user1, session_id: 'auth-session-1', event_type: 'episode_complete', story_id: IDS.story, episode_id: IDS.episode, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'free', created_at: '2026-04-01T01:30:00.000Z' },
      { id: 4, user_id: IDS.user1, session_id: 'auth-session-1', event_type: 'ad_unlock_started', story_id: IDS.story, episode_id: IDS.episode, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'ads', created_at: '2026-04-01T01:31:00.000Z' },
      { id: 5, user_id: IDS.user1, session_id: 'auth-session-1', event_type: 'ad_unlock_completed', story_id: IDS.story, episode_id: IDS.episode, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'ads', created_at: '2026-04-01T01:32:00.000Z' },
      { id: 6, user_id: IDS.user1, session_id: 'auth-session-1', event_type: 'shortener_unlock_started', story_id: IDS.story, episode_id: IDS.episode, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'ads+premium', created_at: '2026-04-01T01:33:00.000Z' },
      { id: 7, user_id: IDS.user1, session_id: 'auth-session-1', event_type: 'shortener_unlock_completed', story_id: IDS.story, episode_id: IDS.episode, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'ads+premium', created_at: '2026-04-01T01:34:00.000Z' },
      { id: 8, user_id: IDS.user2, session_id: 'auth-session-2', event_type: 'story_view', story_id: IDS.story, episode_id: null, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'free', created_at: '2026-04-02T01:00:00.000Z' },
      { id: 9, user_id: null, session_id: 'visitor-linked', event_type: 'episode_play', story_id: IDS.story, episode_id: IDS.episode, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'free', created_at: '2026-04-03T01:00:00.000Z' },
      { id: 10, user_id: null, session_id: 'visitor-linked', event_type: 'ad_unlock_completed', story_id: IDS.story, episode_id: IDS.episode, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'ads', created_at: '2026-04-03T01:01:00.000Z' },
      { id: 11, user_id: null, session_id: 'visitor-anon', event_type: 'shortener_unlock_completed', story_id: IDS.story, episode_id: null, book_id: null, video_story_id: null, video_episode_id: null, access_type: 'ads+premium', created_at: '2026-04-04T01:01:00.000Z' },
    ],
    purchases: [
      { id: 'purchase-1', user_id: IDS.user1, story_id: IDS.story, product_type: 'story-lifetime', expires_at: null, created_at: '2026-04-05T01:00:00.000Z' },
      { id: 'purchase-2', user_id: IDS.user2, story_id: IDS.story, product_type: 'monthly', expires_at: '2099-04-05T01:00:00.000Z', created_at: '2026-04-06T01:00:00.000Z' },
    ],
    paymentOrders: [
      { id: 'order-1', user_id: IDS.user1, cashfree_order_id: 'cf-1', product_key: 'story-lifetime', content_type: 'story', content_id: IDS.story, amount: 99, currency: 'INR', status: 'PAID', paid_at: '2026-04-05T01:00:02.000Z', created_at: '2026-04-05T00:59:50.000Z' },
      { id: 'order-2', user_id: IDS.user2, cashfree_order_id: 'cf-2', product_key: 'story-monthly', content_type: 'story', content_id: IDS.story, amount: 29, currency: 'INR', status: 'PAID', paid_at: '2026-04-06T01:00:02.000Z', created_at: '2026-04-06T00:59:50.000Z' },
    ],
    adUnlocks: [
      { id: 1, user_id: IDS.user1, provider: 'rewarded_ad', content_type: 'episode', content_id: IDS.episode, created_at: '2026-04-01T01:32:01.000Z' },
    ],
    shortenerUnlocks: [
      { id: 2, user_id: IDS.user1, provider: 'arolinks', content_type: 'episode', content_id: IDS.episode, created_at: '2026-04-01T01:34:01.000Z' },
    ],
    sessionLinks: [
      { id: 1, session_id: 'visitor-linked', user_id: IDS.user1, linked_at: '2026-04-03T01:02:00.000Z' },
      { id: 2, session_id: 'visitor-linked', user_id: IDS.user2, linked_at: '2026-04-03T01:03:00.000Z' },
    ],
    stories: [{ id: IDS.story, title: 'Story One', created_at: '2026-01-01T00:00:00.000Z' }],
    episodes: [{ id: IDS.episode, story_id: IDS.story, episode_number: 1, number: 1, title: 'Episode One' }],
    books: [{ id: IDS.book, title: 'Book One', created_at: '2026-01-01T00:00:00.000Z' }],
    videoStories: [{ id: IDS.videoStory, title: 'Video Story', created_at: '2026-01-01T00:00:00.000Z' }],
    videoEpisodes: [{ id: IDS.videoEpisode, video_story_id: IDS.videoStory, story_id: null, episode_number: 1, number: 1, title: 'Video Episode' }],
    range: { label: 'all', start: '', end: '' },
    exportedAt: '2026-10-03T05:00:00.000Z',
  }
}

function zipEntries(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.notEqual(eocd, -1, 'XLSX is missing ZIP EOCD')
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const end = centralOffset + centralSize
  const entries = new Map()
  let cursor = centralOffset

  while (cursor < end) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, 'invalid ZIP central-directory signature')
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    entries.set(name, inflateRawSync(compressed).toString('utf8'))
    cursor += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

test('admin export builds the required sheets and maps actual first-party analytics', () => {
  const model = buildAdminExportModel(fixture())
  assert.deepEqual(
    model.sheets.map((sheet) => sheet.name),
    ['Users', 'User Activity', 'User Story Interest', 'User Episode Activity', 'User Purchases', 'User Unlock Activity', 'Visitor Sessions', 'Export Summary']
  )

  const users = model.sheets[0].rows
  assert.deepEqual(users.map((row) => row['User Number']), ['User 1', 'User 2', 'User 3'])
  assert.equal(users[2]['Total Purchase Count'], 0)
  assert.equal(users[0]['Total Episode Plays'], 1)
  assert.equal(users[0]['Total Episode Completions'], 1)
  assert.equal(users[0]['Rewarded Ad Unlocks'], 1)
  assert.equal(users[0]['Shortener Unlocks'], 1)
  assert.equal(users[0]['Total Unlocks'], 2)
  assert.match(users[0]['Most Frequently Listened Stories'], /Story One \(1\)/)

  const storyRows = model.sheets[2].rows
  assert.equal(storyRows.length, 2)
  assert.equal(storyRows[0]['Story'], 'Story One')

  const episodeRows = model.sheets[3].rows
  assert.equal(episodeRows.length, 1)
  assert.equal(episodeRows[0]['Episode Number'], 1)
  assert.equal(episodeRows[0]['Play Count'], 1)

  const purchaseRows = model.sheets[4].rows
  assert.equal(purchaseRows.length, 2)
  assert.equal(purchaseRows[0]['User ID'], IDS.user1)

  const unlockRows = model.sheets[5].rows
  assert.equal(unlockRows.length, 3)
  assert.equal(unlockRows[0]['Actual Rewarded Ad Unlocks'], 1)
  assert.equal(unlockRows[0]['Actual Shortener Unlocks'], 1)

  const visitorRows = model.sheets[6].rows
  assert.equal(visitorRows.length, 2)
  assert.equal(visitorRows[0]['Known Account'], 'Multiple linked accounts (2)')
  assert.equal(visitorRows[1]['Known Account'], 'Anonymous visitor')

  const summary = model.sheets[7].rows
  assert.ok(String(summary.find((row) => row.Key === 'IP Data')?.Value).includes('no new IP collection'))
  assert.ok(String(summary.find((row) => row.Key === 'Password Set')?.Value).includes('no credential data'))
  assert.ok(SECURITY_NOTE.includes('passwords'))
})

test('admin export strips XML 1.0 control characters from user data', () => {
  const model = fixture()
  model.users[0].user_metadata.full_name = 'One\\u0001User\\u000b'
  const workbook = buildAdminExportWorkbook(buildAdminExportModel(model))
  const entries = zipEntries(workbook)
  const allXml = [...entries.values()].join('\\n')
  assert.equal(allXml.includes('OneUser'), true)
  assert.equal(allXml.includes('\\u0001'), false)
  assert.equal(allXml.includes('\\u000b'), false)
})

test('admin export workbook is a valid XLSX zip and contains no credential fields', () => {
  const workbook = buildAdminExportWorkbook(buildAdminExportModel(fixture()))
  assert.equal(workbook.subarray(0, 2).toString('ascii'), 'PK')
  const entries = zipEntries(workbook)
  assert.ok(entries.has('xl/workbook.xml'))
  assert.ok(entries.has('xl/styles.xml'))
  for (let index = 1; index <= 8; index += 1) assert.ok(entries.has('xl/worksheets/sheet' + index + '.xml'))

  const workbookXml = entries.get('xl/workbook.xml')
  for (const name of ['Users', 'User Activity', 'User Story Interest', 'User Episode Activity', 'User Purchases', 'User Unlock Activity', 'Visitor Sessions', 'Export Summary']) {
    assert.ok(workbookXml.includes('name="' + name + '"'))
  }

  const allXml = [...entries.values()].join('\n').toLowerCase()
  for (const forbidden of [
    'encrypted_password',
    'password_hash',
    'plaintext_password',
    'current_password',
    'refresh_token',
    'recovery_token',
    'service_role',
    'api_key',
    'otp_code',
    'client_secret',
    'cvv',
    'card_number',
    'private_key',
  ]) {
    assert.equal(allXml.includes(forbidden), false, 'forbidden credential field leaked: ' + forbidden)
  }
})
