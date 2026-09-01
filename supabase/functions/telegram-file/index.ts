// HJ GROUPS — Telegram file proxy
//
// The browser never talks to Telegram directly and never sees the
// bot token. It requests:
//
//   https://<project-ref>.supabase.co/functions/v1/telegram-file?file_id=XXXX
//
// This function resolves that file_id to Telegram's (temporary,
// internal) file path via getFile, then proxies the actual bytes
// back to the browser — forwarding Range requests so <audio>/<video>
// seeking and react-pdf/epub.js's chunked loading both work
// correctly. Because resolution happens fresh on every request,
// Telegram's file paths being temporary is a non-issue: our URL
// (built from the permanent file_id) never expires even though the
// underlying Telegram path does.
//
// Deploy:
//   supabase functions deploy telegram-file --no-verify-jwt
//
// Secrets required: TELEGRAM_BOT_TOKEN (same as telegram-webhook).

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

// Restrict which origins may embed/play these files. Set this to
// your real production domain(s) once deployed — see the setup guide.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

function corsHeaders(origin: string | null) {
  const allow =
    ALLOWED_ORIGINS.includes('*') ||
    (origin && ALLOWED_ORIGINS.includes(origin))
      ? origin || '*'
      : ALLOWED_ORIGINS[0] || '*'

  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-allow-headers': 'range',
    'access-control-expose-headers':
      'content-length, content-range, accept-ranges, content-type',
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (!BOT_TOKEN) {
    return new Response('Server misconfigured: missing bot token', {
      status: 500,
      headers: cors,
    })
  }

  const url = new URL(req.url)
  const fileId = url.searchParams.get('file_id')

  if (!fileId) {
    return new Response('Missing file_id', { status: 400, headers: cors })
  }

  // 1. Resolve file_id -> Telegram's (temporary) file_path.
  let filePath: string
  try {
    const getFileRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
    )
    const getFileJson = await getFileRes.json()

    if (!getFileJson.ok || !getFileJson.result?.file_path) {
      return new Response('File not found on Telegram', {
        status: 404,
        headers: cors,
      })
    }

    filePath = getFileJson.result.file_path
  } catch {
    return new Response('Failed to resolve file from Telegram', {
      status: 502,
      headers: cors,
    })
  }

  // 2. Stream the actual bytes, forwarding Range so seeking works.
  const telegramFileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`

  const rangeHeader = req.headers.get('range')
  const upstreamHeaders: Record<string, string> = {}
  if (rangeHeader) upstreamHeaders['range'] = rangeHeader

  let upstream: Response
  try {
    upstream = await fetch(telegramFileUrl, { headers: upstreamHeaders })
  } catch {
    return new Response('Failed to fetch file from Telegram', {
      status: 502,
      headers: cors,
    })
  }

  const responseHeaders = new Headers(cors)

  const contentType = upstream.headers.get('content-type')
  if (contentType) responseHeaders.set('content-type', contentType)

  const contentLength = upstream.headers.get('content-length')
  if (contentLength) responseHeaders.set('content-length', contentLength)

  const contentRange = upstream.headers.get('content-range')
  if (contentRange) responseHeaders.set('content-range', contentRange)

  responseHeaders.set('accept-ranges', 'bytes')
  responseHeaders.set('cache-control', 'public, max-age=3600')

  return new Response(upstream.body, {
    status: upstream.status, // 200 or 206 (Partial Content)
    headers: responseHeaders,
  })
})
