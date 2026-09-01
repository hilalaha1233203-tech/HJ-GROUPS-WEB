// HJ GROUPS — Telegram webhook
//
// Receives Telegram Bot API updates (admin posting a file to the bot),
// figures out what kind of content it is from the message caption,
// and upserts metadata (never the file bytes themselves) into
// Supabase. Realtime then pushes the change to the website.
//
// This function runs entirely server-side on Supabase's infrastructure.
// It is the ONLY place that ever sees TELEGRAM_BOT_TOKEN and the
// Supabase service_role key. Neither value is ever sent to the browser.
//
// Deploy:
//   supabase functions deploy telegram-webhook --no-verify-jwt
//
// Secrets (set once, see the setup guide for exact commands):
//   TELEGRAM_BOT_TOKEN         - from @BotFather
//   TELEGRAM_ADMIN_USER_ID     - your numeric Telegram user id
//   TELEGRAM_WEBHOOK_SECRET    - random string you also give Telegram
//                                as secret_token when registering the
//                                webhook, so random internet traffic
//                                can't POST fake "updates" here
//   SUPABASE_URL               - auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY  - auto-provided by Supabase
//
// Admin caption format (plain text, one "key: value" per line), e.g.
// posting an audio file with this caption:
//
//   type: episode
//   story_title: Adhi Oli
//   number: 4
//   title: Episode 04
//   access: premium
//   available: true
//
// Supported `type` values: story, episode, book, video_story,
// video_episode. See parseCaption() below for the full field list
// per type. Unknown/missing required fields are rejected with a
// reply message to the admin in Telegram explaining what's missing,
// so nothing is ever silently dropped.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const ADMIN_USER_ID = Deno.env.get('TELEGRAM_ADMIN_USER_ID') ?? ''
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function parseCaption(caption: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const line of caption.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (key) fields[key] = value
  }
  return fields
}

async function telegramApi(method: string, body: Record<string, unknown>) {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  return res.json()
}

async function reply(chatId: number, text: string) {
  try {
    await telegramApi('sendMessage', { chat_id: chatId, text })
  } catch {
    // best-effort — never let a reply failure break ingestion
  }
}

// Finds a story/video_story by exact title, creating it if it
// doesn't exist yet, so the admin doesn't need to know numeric ids.
async function findOrCreateParent(
  table: 'stories' | 'video_stories',
  title: string,
  extra: Record<string, unknown>
) {
  const { data: existing, error: findError } = await supabase
    .from(table)
    .select('id')
    .ilike('title', title)
    .limit(1)
    .maybeSingle()

  if (findError) throw findError
  if (existing) return existing.id as number

  const { data: created, error: insertError } = await supabase
    .from(table)
    .insert({ title, ...extra })
    .select('id')
    .single()

  if (insertError) throw insertError
  return created.id as number
}

function pickFileId(message: Record<string, any>) {
  if (message.document) return message.document.file_id as string
  if (message.audio) return message.audio.file_id as string
  if (message.video) return message.video.file_id as string
  if (message.voice) return message.voice.file_id as string
  if (Array.isArray(message.photo) && message.photo.length) {
    // Telegram sends multiple sizes — the last is the largest.
    return message.photo[message.photo.length - 1].file_id as string
  }
  return null
}

async function handleMessage(message: Record<string, any>) {
  const chatId = message.chat?.id
  const fromId = String(message.from?.id ?? '')

  if (!ADMIN_USER_ID || fromId !== ADMIN_USER_ID) {
    if (chatId) await reply(chatId, "You're not authorized to publish content.")
    return { status: 'rejected', detail: 'unauthorized sender' }
  }

  const caption: string = message.caption || message.text || ''
  const fields = parseCaption(caption)
  const type = (fields.type || '').toLowerCase()
  const telegramFileId = pickFileId(message)

  if (!type) {
    await reply(
      chatId,
      'Missing "type:" in the caption. Expected one of: story, episode, book, video_story, video_episode.'
    )
    return { status: 'rejected', detail: 'missing type field' }
  }

  // Download from Telegram and upload to Supabase Storage
  async function storeFile(fileId: string): Promise<string> {
    const getFileRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    )
    const getFileJson = await getFileRes.json()
    if (!getFileJson.ok || !getFileJson.result?.file_path) {
      throw new Error('Could not get file path from Telegram')
    }
    const filePath = getFileJson.result.file_path
    
    const fileRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
    if (!fileRes.ok) throw new Error('Failed to download file from Telegram')
    
    const fileBlob = await fileRes.blob()
    const ext = filePath.split('.').pop() || 'bin'
    const storagePath = `${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('telegram_files')
      .upload(storagePath, fileBlob, {
        contentType: fileRes.headers.get('content-type') || fileBlob.type,
      })
      
    if (uploadError) throw uploadError
    
    return storagePath
  }

  let fileId = null
  try {
    if (telegramFileId) {
      fileId = await storeFile(telegramFileId)
    }
    if (type === 'story') {
      if (!fields.title) throw new Error('story requires title:')
      const id = await findOrCreateParent('stories', fields.title, {
        genre: fields.genre || 'Fantasy',
        description: fields.description || '',
        cover_file_id: fileId,
      })
      await reply(chatId, `✅ Story saved (id ${id}): ${fields.title}`)
      return { status: 'ok', detail: `story ${id}` }
    }

    if (type === 'episode') {
      if (!fileId) throw new Error('episode requires an attached audio/video file')
      if (!fields.story_title) throw new Error('episode requires story_title:')
      if (!fields.number) throw new Error('episode requires number:')

      const storyId = await findOrCreateParent('stories', fields.story_title, {
        genre: fields.genre || 'Fantasy',
      })

      const episodeType = message.video ? 'video' : 'audio'

      const { error } = await supabase.from('episodes').upsert(
        {
          story_id: storyId,
          number: Number(fields.number),
          title: fields.title || `Episode ${fields.number}`,
          type: episodeType,
          file_id: fileId,
          access_type: fields.access || 'free',
          available: fields.available !== 'false',
        },
        { onConflict: 'story_id,number' }
      )

      if (error) throw error
      await reply(chatId, `✅ Episode ${fields.number} saved under "${fields.story_title}".`)
      return { status: 'ok', detail: `episode ${storyId}/${fields.number}` }
    }

    if (type === 'book') {
      if (!fileId) throw new Error('book requires an attached PDF/EPUB file')
      if (!fields.title) throw new Error('book requires title:')

      const bookType =
        (fields.format || '').toLowerCase() === 'epub' ? 'epub' : 'pdf'

      const { data, error } = await supabase
        .from('books')
        .insert({
          title: fields.title,
          author: fields.author || '',
          description: fields.description || '',
          type: bookType,
          category: fields.category || 'Other',
          file_id: fileId,
          access_type: fields.access || 'free',
        })
        .select('id')
        .single()

      if (error) throw error
      await reply(chatId, `✅ Book saved (id ${data.id}): ${fields.title}`)
      return { status: 'ok', detail: `book ${data.id}` }
    }

    if (type === 'video_story') {
      if (!fields.title) throw new Error('video_story requires title:')
      const id = await findOrCreateParent('video_stories', fields.title, {
        category: fields.category || 'Action',
        cover_file_id: fileId,
        access_type: fields.access || 'free',
      })
      await reply(chatId, `✅ Video story saved (id ${id}): ${fields.title}`)
      return { status: 'ok', detail: `video_story ${id}` }
    }

    if (type === 'video_episode') {
      if (!fileId) throw new Error('video_episode requires an attached video file')
      if (!fields.video_story_title) throw new Error('video_episode requires video_story_title:')
      if (!fields.number) throw new Error('video_episode requires number:')

      const videoStoryId = await findOrCreateParent(
        'video_stories',
        fields.video_story_title,
        { category: fields.category || 'Action' }
      )

      const { error } = await supabase.from('video_episodes').upsert(
        {
          video_story_id: videoStoryId,
          number: Number(fields.number),
          title: fields.title || `Episode ${fields.number}`,
          file_id: fileId,
          access_type: fields.access || 'free',
          available: fields.available !== 'false',
        },
        { onConflict: 'video_story_id,number' }
      )

      if (error) throw error
      await reply(chatId, `✅ Video episode ${fields.number} saved.`)
      return { status: 'ok', detail: `video_episode ${videoStoryId}/${fields.number}` }
    }

    await reply(chatId, `Unknown type "${type}".`)
    return { status: 'rejected', detail: `unknown type ${type}` }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    await reply(chatId, `❌ ${messageText}`)
    return { status: 'error', detail: messageText }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 })
  }

  // Verify this request actually came from Telegram, not a random
  // POST to a guessable URL. Telegram echoes this header back
  // exactly as configured when the webhook was registered.
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token')
  if (!WEBHOOK_SECRET || secretHeader !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  let update: Record<string, any>
  try {
    update = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }

  // Telegram retries undelivered updates — de-duplicate so a retry
  // never creates the content twice.
  const updateId = update.update_id
  if (typeof updateId === 'number') {
    const { data: seen } = await supabase
      .from('telegram_ingest_log')
      .select('id')
      .eq('update_id', updateId)
      .maybeSingle()

    if (seen) {
      return new Response('duplicate', { status: 200 })
    }
  }

  const message = update.message || update.channel_post
  let result: { status: string; detail?: string } = {
    status: 'ignored',
    detail: 'no message',
  }

  if (message) {
    result = await handleMessage(message)
  }

  if (typeof updateId === 'number') {
    await supabase.from('telegram_ingest_log').insert({
      update_id: updateId,
      status: result.status,
      detail: result.detail ?? null,
    })
  }

  // Always 200 — Telegram will keep retrying non-2xx responses,
  // and we've already logged/replied about any real problem.
  return new Response('ok', { status: 200 })
})
