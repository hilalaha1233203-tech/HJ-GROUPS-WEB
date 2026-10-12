import {
  authenticateUser,
  envString,
  getRuntimeEnv,
  jsonResponse,
  headersForCors,
} from './runtime.js';

const SARVAM_ENDPOINT = 'https://api.sarvam.ai/text-to-speech/stream';
const GOOGLE_TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const AZURE_TTS_ENDPOINT = 'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_VERSION = '143.0.3650.75';
const EDGE_VERSION_HEADER = '1-' + EDGE_VERSION;
const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
const EDGE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
// Set true only after a new real Wrangler/Workers probe returns valid MP3 bytes.
const EDGE_TTS_WORKERS_VIABLE = false;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_CHARS = 2000;
const HARD_MAX_CHARS = 10000;
const DEFAULT_DAILY_LIMIT = 30;
const FALLBACK_VOICE = 'ta-IN-PallaviNeural';
const ALLOWED_VOICES = new Set([
  'ta-IN-PallaviNeural',
  'ta-IN-ValluvarNeural',
  'en-IN-NeerjaNeural',
]);

const cleanText = (value) => {
  let output = '';
  for (const character of String(value ?? '').replace(/\u00a0/g, ' ')) {
    const code = character.codePointAt(0) || 0;
    if (code >= 0x20 && code !== 0x7f) output += character;
    else if (code === 0x09 || code === 0x0a || code === 0x0d) output += ' ';
  }
  return output.replace(/[ \t\r\n]+/g, ' ').trim();
};

export function normalizeSpeechText(value) {
  return cleanText(value).replace(/(?:[\u0B80-\u0BFF](?:\s+|$)){3,}/gu, (run) => run.replace(/\s+/gu, ''));
}

function isTamilText(value) {
  return /[\u0B80-\u0BFF]/u.test(String(value || ''));
}

function normalizeVoice(value, text) {
  const requested = String(value || '').trim();
  if (ALLOWED_VOICES.has(requested)) return requested;
  return isTamilText(text) ? FALLBACK_VOICE : 'en-IN-NeerjaNeural';
}

function envInteger(name, fallback, min, max) {
  const raw = Number.parseInt(envString(name), 10);
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : fallback;
}

function jsonError(request, status, code, message, extra = {}) {
  return jsonResponse(request, status, { error: message, code, ...extra });
}

function getCacheBucket() {
  const bucket = getRuntimeEnv().MEDIA_CACHE;
  return bucket && typeof bucket.get === 'function' && typeof bucket.put === 'function'
    ? bucket
    : null;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validMp3(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes.length > MAX_AUDIO_BYTES) return false;
  return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

function randomHexId() {
  return crypto.randomUUID().replace(/-/g, '').toUpperCase();
}

function edgeTimestamp() {
  const date = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (value) => String(value).padStart(2, '0');
  return days[date.getUTCDay()] + ' ' + months[date.getUTCMonth()] + ' '
    + pad(date.getUTCDate()) + ' ' + date.getUTCFullYear() + ' '
    + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds())
    + ' GMT+0000 (Coordinated Universal Time)';
}

async function edgeSecurityToken() {
  const windowsEpoch = Math.floor(Date.now() / 1000) + 11644473600;
  const roundedSeconds = windowsEpoch - (windowsEpoch % 300);
  const windowsTicks = String(Math.round(roundedSeconds * 10000000));
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(windowsTicks + TRUSTED_CLIENT_TOKEN),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function parseEdgeHeaderBlock(value) {
  const headers = {};
  for (const line of String(value || '').split('\r\n')) {
    const separator = line.indexOf(':');
    if (separator > 0) headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return headers;
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// This deliberately uses Workers' fetch-based outbound WebSocket API. It does
// not import Node ws, Buffer, or crypto, and does not rely on a legacy backend.
// The Microsoft endpoint is unofficial; live availability must be verified in Wrangler.
export async function synthesizeEdgeTts({ text, voice = FALLBACK_VOICE, timeoutMs = 20000 } = {}) {
  const normalizedText = normalizeSpeechText(text);
  if (!normalizedText) throw Object.assign(new Error('TTS text is empty'), { code: 'EDGE_TTS_EMPTY_TEXT' });
  if (normalizedText.length > HARD_MAX_CHARS) throw Object.assign(new Error('TTS text is too long'), { code: 'EDGE_TTS_TEXT_TOO_LONG' });

  const selectedVoice = normalizeVoice(voice, normalizedText);
  const connectionId = randomHexId();
  const requestId = randomHexId();
  const gec = await edgeSecurityToken();
  const url = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
    + '?TrustedClientToken=' + TRUSTED_CLIENT_TOKEN
    + '&ConnectionId=' + connectionId
    + '&Sec-MS-GEC=' + gec
    + '&Sec-MS-GEC-Version=' + encodeURIComponent(EDGE_VERSION_HEADER);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Origin: EDGE_ORIGIN,
        'User-Agent': EDGE_USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Cookie: 'muid=' + randomHexId() + ';',
      },
    });
  } catch {
    throw Object.assign(new Error('Edge TTS WebSocket connection failed'), { code: 'EDGE_TTS_CONNECT_FAILED' });
  }

  const socket = response?.webSocket;
  if (!socket) {
    throw Object.assign(new Error('Edge TTS WebSocket handshake was rejected'), {
      code: 'EDGE_TTS_HANDSHAKE_FAILED',
      status: Number(response?.status) || 0,
    });
  }

  return await new Promise((resolve, reject) => {
    const audioChunks = [];
    let totalBytes = 0;
    let settled = false;
    let turnEnded = false;
    let timer = null;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      try { socket.close(1000, 'TTS finished'); } catch {}
      if (error) reject(error);
      else resolve(result);
    };

    const onMessage = async (event) => {
      try {
        if (typeof event.data === 'string') {
          const delimiter = event.data.indexOf('\r\n\r\n');
          if (delimiter < 0) {
            finish(Object.assign(new Error('Edge TTS text frame was malformed'), { code: 'EDGE_TTS_PROTOCOL_ERROR' }));
            return;
          }
          const headers = parseEdgeHeaderBlock(event.data.slice(0, delimiter));
          const path = headers.path;
          if (path === 'turn.end') {
            turnEnded = true;
            if (!totalBytes) {
              finish(Object.assign(new Error('Edge TTS returned no audio'), { code: 'EDGE_TTS_NO_AUDIO' }));
              return;
            }
            const output = new Uint8Array(totalBytes);
            let offset = 0;
            for (const chunk of audioChunks) {
              output.set(chunk, offset);
              offset += chunk.byteLength;
            }
            if (!validMp3(output)) {
              finish(Object.assign(new Error('Edge TTS returned invalid MP3 data'), { code: 'EDGE_TTS_INVALID_AUDIO' }));
              return;
            }
            finish(null, output);
          } else if (path && !['response', 'turn.start', 'audio.metadata'].includes(path)) {
            finish(Object.assign(new Error('Edge TTS returned an unexpected text frame'), { code: 'EDGE_TTS_PROTOCOL_ERROR' }));
          }
          return;
        }

        let bytes;
        if (event.data instanceof ArrayBuffer) bytes = new Uint8Array(event.data);
        else if (ArrayBuffer.isView(event.data)) bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
        else if (typeof Blob !== 'undefined' && event.data instanceof Blob) bytes = new Uint8Array(await event.data.arrayBuffer());
        else {
          finish(Object.assign(new Error('Edge TTS returned an unsupported frame type'), { code: 'EDGE_TTS_PROTOCOL_ERROR' }));
          return;
        }

        if (bytes.byteLength < 2) {
          finish(Object.assign(new Error('Edge TTS binary frame was too short'), { code: 'EDGE_TTS_PROTOCOL_ERROR' }));
          return;
        }

        const headerLength = (bytes[0] << 8) | bytes[1];
        if (headerLength > bytes.byteLength - 2) {
          finish(Object.assign(new Error('Edge TTS binary header was malformed'), { code: 'EDGE_TTS_PROTOCOL_ERROR' }));
          return;
        }

        const headers = parseEdgeHeaderBlock(new TextDecoder().decode(bytes.slice(2, 2 + headerLength)));
        const body = bytes.slice(2 + headerLength);
        if (headers.path !== 'audio') {
          finish(Object.assign(new Error('Edge TTS binary frame was not audio'), { code: 'EDGE_TTS_PROTOCOL_ERROR' }));
          return;
        }
        if (!body.byteLength && !headers['content-type']) return;
        if (headers['content-type'] && headers['content-type'].toLowerCase() !== 'audio/mpeg') {
          finish(Object.assign(new Error('Edge TTS returned a non-MP3 format'), { code: 'EDGE_TTS_INVALID_AUDIO' }));
          return;
        }
        if (!body.byteLength) return;
        totalBytes += body.byteLength;
        if (totalBytes > MAX_AUDIO_BYTES) {
          finish(Object.assign(new Error('Edge TTS audio exceeded the size limit'), { code: 'EDGE_TTS_AUDIO_TOO_LARGE' }));
          return;
        }
        audioChunks.push(body);
      } catch {
        finish(Object.assign(new Error('Edge TTS frame processing failed'), { code: 'EDGE_TTS_PROTOCOL_ERROR' }));
      }
    };

    timer = setTimeout(() => {
      finish(Object.assign(new Error('Edge TTS timed out'), { code: 'EDGE_TTS_TIMEOUT' }));
    }, timeoutMs);

    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', () => {
      finish(Object.assign(new Error('Edge TTS WebSocket errored'), { code: 'EDGE_TTS_SOCKET_ERROR' }));
    });
    socket.addEventListener('close', () => {
      if (!settled && !turnEnded) {
        finish(Object.assign(new Error('Edge TTS closed before turn.end'), { code: 'EDGE_TTS_PREMATURE_CLOSE' }));
      }
    });

    try {
      socket.accept();
      const timestamp = edgeTimestamp();
      const config = 'X-Timestamp:' + timestamp
        + '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n'
        + '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n';
      const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='"
        + (selectedVoice.startsWith('ta-') ? 'ta-IN' : 'en-IN') + "'><voice name='"
        + selectedVoice + "'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>"
        + xmlEscape(normalizedText) + '</prosody></voice></speak>';
      const speech = 'X-RequestId:' + requestId
        + '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' + timestamp + 'Z\r\nPath:ssml\r\n\r\n'
        + ssml;
      socket.send(config);
      socket.send(speech);
    } catch {
      finish(Object.assign(new Error('Edge TTS WebSocket could not send the request'), { code: 'EDGE_TTS_SEND_FAILED' }));
    }
  });
}

async function sarvamAudio({ text, languageCode, speaker = 'ratan', pace = 1, temperature = 0.35 }) {
  const apiKey = envString('SARVAM_API_KEY');
  if (!apiKey) throw Object.assign(new Error('Sarvam is not configured'), { code: 'SARVAM_NOT_CONFIGURED' });
  if (text.length > 3500) throw Object.assign(new Error('Text exceeds the Sarvam request limit'), { code: 'SARVAM_TEXT_TOO_LONG' });

  const language = /^(ta-IN|en-IN|hi-IN)$/i.test(String(languageCode || ''))
    ? String(languageCode)
    : (isTamilText(text) ? 'ta-IN' : 'en-IN');
  const safeSpeaker = /^[a-z][a-z0-9_-]{1,40}$/i.test(String(speaker || 'ratan'))
    ? String(speaker || 'ratan').toLowerCase()
    : 'ratan';
  const response = await fetch(SARVAM_ENDPOINT, {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      target_language_code: language,
      speaker: safeSpeaker,
      pace: Math.max(0.5, Math.min(2, Number(pace) || 1)),
      temperature: Math.max(0.01, Math.min(1, Number(temperature) || 0.35)),
      model: 'bulbul:v3',
      output_audio_codec: 'mp3',
    }),
  });
  if (!response.ok) throw Object.assign(new Error('Sarvam TTS request failed'), { code: 'SARVAM_HTTP_' + response.status });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!validMp3(bytes)) throw Object.assign(new Error('Sarvam returned invalid MP3 data'), { code: 'SARVAM_INVALID_AUDIO' });
  return bytes;
}

async function googleAudio({ text }) {
  const key = envString('GOOGLE_CLOUD_TTS_API_KEY');
  if (!key) throw Object.assign(new Error('Google TTS is not configured'), { code: 'GOOGLE_NOT_CONFIGURED' });
  const response = await fetch(GOOGLE_TTS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: isTamilText(text) ? 'ta-IN' : 'en-IN', name: isTamilText(text) ? 'ta-IN-Standard-A' : 'en-IN-Standard-A' },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });
  if (!response.ok) throw Object.assign(new Error('Google Cloud TTS request failed'), { code: 'GOOGLE_HTTP_' + response.status });
  const payload = await response.json();
  if (typeof payload?.audioContent !== 'string' || !payload.audioContent) {
    throw Object.assign(new Error('Google Cloud TTS returned no audio'), { code: 'GOOGLE_INVALID_AUDIO' });
  }
  const raw = atob(payload.audioContent);
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  if (!validMp3(bytes)) throw Object.assign(new Error('Google Cloud TTS returned invalid MP3 data'), { code: 'GOOGLE_INVALID_AUDIO' });
  return bytes;
}

async function azureAudio({ text, voice }) {
  const key = envString('AZURE_SPEECH_KEY');
  const region = envString('AZURE_SPEECH_REGION');
  if (!key || !region) throw Object.assign(new Error('Azure Speech is not configured'), { code: 'AZURE_NOT_CONFIGURED' });
  if (!/^[a-z0-9-]{2,40}$/i.test(region)) throw Object.assign(new Error('Azure Speech region is invalid'), { code: 'AZURE_REGION_INVALID' });
  const selectedVoice = normalizeVoice(voice, text);
  const language = selectedVoice.startsWith('ta-') ? 'ta-IN' : 'en-IN';
  const ssml = "<speak version='1.0' xml:lang='" + language + "' xmlns='http://www.w3.org/2001/10/synthesis'><voice name='"
    + selectedVoice + "'>" + xmlEscape(text) + '</voice></speak>';
  const response = await fetch(AZURE_TTS_ENDPOINT.replace('{region}', region), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      Accept: 'audio/mpeg',
    },
    body: ssml,
  });
  if (!response.ok) throw Object.assign(new Error('Azure Speech request failed'), { code: 'AZURE_HTTP_' + response.status });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!validMp3(bytes)) throw Object.assign(new Error('Azure Speech returned invalid MP3 data'), { code: 'AZURE_INVALID_AUDIO' });
  return bytes;
}

function parseByteRange(headerValue, size) {
  if (!headerValue) return { kind: 'none' };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(headerValue).trim());
  if (!match) return { kind: 'invalid' };
  if (!match[1] && !match[2]) return { kind: 'invalid' };
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { kind: 'invalid' };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return { kind: 'invalid' };
  end = Math.min(end, size - 1);
  return { kind: 'range', start, end, length: end - start + 1 };
}

function audioResponse(request, body, size, options = {}) {
  const headers = headersForCors(request);
  headers.set('Content-Type', 'audio/mpeg');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, max-age=3600');
  if (options.etag) headers.set('ETag', '"' + String(options.etag).replace(/"/g, '') + '"');
  if (options.provider) headers.set('X-TTS-Provider', String(options.provider));
  if (options.contentRange) headers.set('Content-Range', options.contentRange);
  if (options.status === 416) {
    headers.set('Content-Range', 'bytes */' + size);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Length', String(options.length ?? size));
  return new Response(body, { status: options.status || 200, headers });
}

async function serveCached(request, bucket, key, cachedObject) {
  const size = Number(cachedObject?.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_AUDIO_BYTES) {
    return jsonError(request, 503, 'TTS_CACHE_OBJECT_INVALID', 'The cached TTS audio is invalid.');
  }
  const parsedRange = parseByteRange(request.headers.get('range'), size);
  if (parsedRange.kind === 'invalid') return audioResponse(request, null, size, { status: 416 });
  if (parsedRange.kind === 'range') {
    const rangeObject = await bucket.get(key, { range: { offset: parsedRange.start, length: parsedRange.length } });
    if (!rangeObject?.body) return jsonError(request, 503, 'TTS_CACHE_READ_FAILED', 'Cached TTS audio could not be read.');
    return audioResponse(request, rangeObject.body, size, {
      status: 206,
      length: parsedRange.length,
      contentRange: 'bytes ' + parsedRange.start + '-' + parsedRange.end + '/' + size,
      etag: cachedObject.etag,
      provider: cachedObject.customMetadata?.provider,
    });
  }
  if (!cachedObject.body) return jsonError(request, 503, 'TTS_CACHE_READ_FAILED', 'Cached TTS audio could not be read.');
  return audioResponse(request, cachedObject.body, size, {
    etag: cachedObject.etag,
    provider: cachedObject.customMetadata?.provider,
  });
}

function audioBytesResponse(request, bytes, provider) {
  const range = parseByteRange(request.headers.get('range'), bytes.byteLength);
  if (range.kind === 'invalid') return audioResponse(request, null, bytes.byteLength, { status: 416 });
  if (range.kind === 'range') {
    return audioResponse(request, bytes.slice(range.start, range.end + 1), bytes.byteLength, {
      status: 206,
      length: range.length,
      contentRange: 'bytes ' + range.start + '-' + range.end + '/' + bytes.byteLength,
      provider,
    });
  }
  return audioResponse(request, bytes, bytes.byteLength, { provider });
}

async function reserveDailyUsage(bucket, userId, dailyLimit) {
  const userHash = await sha256Hex(userId);
  const day = new Date().toISOString().slice(0, 10);
  const key = 'tts-usage/' + userHash + '/' + day + '.txt';

  // R2 conditional writes provide an atomic per-user counter without adding a
  // database table or extra PostgREST reads. Fail closed if contention persists.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await bucket.get(key);
    const count = current ? Number.parseInt(await current.text(), 10) : 0;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw Object.assign(new Error('TTS usage counter is corrupt'), { code: 'TTS_USAGE_COUNTER_INVALID' });
    }
    if (count >= dailyLimit) return { allowed: false, count, key };
    const nextCount = count + 1;
    const options = {
      httpMetadata: { contentType: 'text/plain; charset=utf-8', cacheControl: 'no-store' },
      customMetadata: { kind: 'tts-daily-usage' },
    };
    if (current?.etag) options.onlyIf = { etagMatches: current.etag };
    else options.onlyIf = { etagDoesNotMatch: '*' };
    const saved = await bucket.put(key, String(nextCount), options);
    if (saved) return { allowed: true, count: nextCount, key };
  }
  throw Object.assign(new Error('TTS daily quota is temporarily busy'), { code: 'TTS_RATE_LIMIT_UNAVAILABLE' });
}

async function generateAudio({ text, voice, provider, body }) {
  const failures = [];
  const edgeEnabled = EDGE_TTS_WORKERS_VIABLE && envString('EDGE_TTS_ENABLED', 'true').toLowerCase() !== 'false';
  const providers = [];

  if (provider === 'edge') {
    return { error: 'EDGE_TTS_NOT_MIGRATED', message: 'Use the authenticated /api/tts endpoint.' };
  }
  if (provider === 'sarvam') {
    if (envString('SARVAM_API_KEY')) providers.push(['sarvam', () => sarvamAudio({
      text,
      languageCode: body?.language_code,
      speaker: body?.speaker,
      pace: body?.pace ?? body?.rate,
      temperature: body?.temperature,
    })]);
  } else {
    if (edgeEnabled) providers.push(['edge', () => synthesizeEdgeTts({ text, voice })]);
    if (envString('SARVAM_API_KEY')) providers.push(['sarvam', () => sarvamAudio({
      text,
      languageCode: body?.language_code,
      speaker: body?.speaker,
      pace: body?.pace ?? body?.rate,
      temperature: body?.temperature,
    })]);
    if (envString('GOOGLE_CLOUD_TTS_API_KEY')) providers.push(['google', () => googleAudio({ text })]);
    if (envString('AZURE_SPEECH_KEY') && envString('AZURE_SPEECH_REGION')) providers.push(['azure', () => azureAudio({ text, voice })]);
  }

  if (!providers.length) {
    return {
      error: provider === 'sarvam' ? 'SARVAM_TTS_NOT_CONFIGURED' : 'TTS_PROVIDER_NOT_CONFIGURED',
      message: 'No online text-to-speech provider is configured.',
    };
  }

  for (const [name, attempt] of providers) {
    try {
      const bytes = await attempt();
      if (!validMp3(bytes)) {
        failures.push({ provider: name, code: 'INVALID_AUDIO' });
        continue;
      }
      return { bytes, provider: name, attempted: providers.map(([providerName]) => providerName), failures };
    } catch (error) {
      const rawCode = String(error?.code || name.toUpperCase() + '_FAILED');
      failures.push({ provider: name, code: rawCode.replace(/[^A-Z0-9_-]/g, '').slice(0, 48) || 'PROVIDER_FAILED' });
    }
  }
  return {
    error: 'TTS_PROVIDERS_UNAVAILABLE',
    message: 'Online speech generation is temporarily unavailable. Use the device voice if a Tamil voice is installed.',
    attempted: providers.map(([name]) => name),
    failures,
  };
}

async function handleTtsRequest(request, provider = 'auto') {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersForCors(request) });
  if (request.method !== 'POST') return jsonResponse(request, 405, { error: 'Method not allowed' }, { Allow: 'POST, OPTIONS' });

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 64000) return jsonError(request, 413, 'TTS_REQUEST_TOO_LARGE', 'TTS request body is too large.');
    body = JSON.parse(raw);
  } catch {
    return jsonError(request, 400, 'TTS_INVALID_REQUEST', 'Invalid JSON request.');
  }

  const text = normalizeSpeechText(body?.text);
  if (!text) return jsonError(request, 400, 'TTS_TEXT_REQUIRED', 'Text is required.');
  const maxChars = envInteger('TTS_MAX_CHARS', DEFAULT_MAX_CHARS, 1, HARD_MAX_CHARS);
  if (text.length > maxChars) return jsonError(request, 413, 'TTS_MAX_CHARS_EXCEEDED', 'Text exceeds the configured character limit.', { maxCharacters: maxChars });

  if (provider === 'edge') {
    return jsonError(request, 503, 'EDGE_TTS_NOT_MIGRATED', 'The standalone Edge TTS route is not available. Use /api/tts.', {
      hint: 'Edge neural synthesis is only attempted inside the authenticated /api/tts provider chain.',
    });
  }

  const user = await authenticateUser(request);
  if (!user?.id) return jsonError(request, 401, 'TTS_AUTH_REQUIRED', 'Sign in is required for text-to-speech.');

  const bucket = getCacheBucket();
  if (!bucket) return jsonError(request, 503, 'TTS_CACHE_NOT_CONFIGURED', 'The TTS cache bucket is not bound to this Pages environment.');

  const dailyLimit = envInteger('TTS_DAILY_LIMIT', DEFAULT_DAILY_LIMIT, 1, 1000);
  let usage;
  try {
    usage = await reserveDailyUsage(bucket, String(user.id), dailyLimit);
  } catch {
    return jsonError(request, 503, 'TTS_RATE_LIMIT_UNAVAILABLE', 'The TTS daily limit could not be checked safely. Please try later.');
  }
  if (!usage.allowed) return jsonError(request, 429, 'TTS_DAILY_LIMIT_REACHED', 'The daily text-to-speech request limit has been reached.', { dailyLimit });

  const voice = normalizeVoice(body?.voice, text);
  const format = 'mp3';
  const cacheDigest = await sha256Hex(JSON.stringify([text, voice, format]));
  const cacheKey = 'tts/' + cacheDigest + '.mp3';

  try {
    const cached = await bucket.get(cacheKey);
    if (cached) return await serveCached(request, bucket, cacheKey, cached);
  } catch {
    return jsonError(request, 503, 'TTS_CACHE_READ_FAILED', 'TTS cache could not be read.');
  }

  const generated = await generateAudio({ text, voice, provider, body });
  if (generated.error) {
    return jsonError(request, 503, generated.error, generated.message, {
      providersAttempted: generated.attempted || [],
      providerFailures: generated.failures || [],
    });
  }

  try {
    await bucket.put(cacheKey, generated.bytes, {
      httpMetadata: { contentType: 'audio/mpeg', cacheControl: 'private, max-age=3600' },
      customMetadata: { provider: generated.provider, format, voice },
    });
  } catch {
    return jsonError(request, 503, 'TTS_CACHE_WRITE_FAILED', 'Generated audio could not be stored in the temporary cache.');
  }

  return audioBytesResponse(request, generated.bytes, generated.provider);
}

export function healthTts() {
  const bucket = getCacheBucket();
  const edgeEnabled = EDGE_TTS_WORKERS_VIABLE && envString('EDGE_TTS_ENABLED', 'true').toLowerCase() !== 'false';
  const sarvamConfigured = Boolean(envString('SARVAM_API_KEY'));
  const googleConfigured = Boolean(envString('GOOGLE_CLOUD_TTS_API_KEY'));
  const azureConfigured = Boolean(envString('AZURE_SPEECH_KEY') && envString('AZURE_SPEECH_REGION'));
  return {
    cacheBucketBound: Boolean(bucket),
    cachePrefix: 'tts/',
    usagePrefix: 'tts-usage/',
    edge: { enabled: edgeEnabled, viability: 'not_viable_current_workers_handshake', testedInWranglerLocal: true, testedInWorkers: false, probeHttpStatus: 502, upstreamStatus: 403, audioBytes: 0, voice: FALLBACK_VOICE },
    sarvam: { configured: sarvamConfigured },
    googleCloud: { configured: googleConfigured },
    azureSpeech: { configured: azureConfigured },
    maxCharacters: envInteger('TTS_MAX_CHARS', DEFAULT_MAX_CHARS, 1, HARD_MAX_CHARS),
    dailyLimit: envInteger('TTS_DAILY_LIMIT', DEFAULT_DAILY_LIMIT, 1, 1000),
    implementation: 'edge-disabled-after-403-with-configured-fallbacks',
  };
}

export { handleTtsRequest };
