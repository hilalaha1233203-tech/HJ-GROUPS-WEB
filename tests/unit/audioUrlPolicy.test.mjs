import test from 'node:test'
import assert from 'node:assert/strict'
import { isSupabaseStorageObjectUrl, resolveAudioEpisodeUrl } from '../../src/lib/audioUrlPolicy.js'

const supabaseAudio = 'https://yajkfglagnyvenddyvok.supabase.co/storage/v1/object/public/audio/story.mp3'
const supabaseLegacyFiles = 'https://yajkfglagnyvenddyvok.supabase.co/storage/v1/object/public/telegram_files/story.mp3'
const workerStream = 'https://hj-telegram-streaming.hilalaha1233203.workers.dev/audio/message/42'

test('detects public and authenticated Supabase Storage object URLs', () => {
  assert.equal(isSupabaseStorageObjectUrl(supabaseAudio), true)
  assert.equal(isSupabaseStorageObjectUrl(supabaseLegacyFiles), true)
  assert.equal(isSupabaseStorageObjectUrl('https://cdn.example.test/audio/story.mp3'), false)
  assert.equal(isSupabaseStorageObjectUrl('/audio/message/42'), false)
})

test('a Telegram episode stream URL wins over old Supabase Storage columns', () => {
  assert.equal(resolveAudioEpisodeUrl({
    streamUrl: workerStream,
    fileUrl: supabaseAudio,
    audioUrl: supabaseAudio,
  }), workerStream)
})

test('does not return a Supabase Storage object URL as an audio fallback', () => {
  assert.equal(resolveAudioEpisodeUrl({
    fileUrl: supabaseAudio,
    audioUrl: supabaseLegacyFiles,
  }), null)
})

test('keeps a valid Cloudflare or non-Supabase URL when no Telegram stream exists', () => {
  assert.equal(resolveAudioEpisodeUrl({
    fileUrl: '/api/audio/sha256-version.mp3',
    audioUrl: supabaseAudio,
  }), '/api/audio/sha256-version.mp3')
})

test('ignores example.com placeholders before considering other audio sources', () => {
  assert.equal(resolveAudioEpisodeUrl({
    audioUrl: 'https://example.com/placeholder.mp3',
    fallbackUrl: workerStream,
  }), workerStream)
})
