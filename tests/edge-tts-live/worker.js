import { synthesizeEdgeTts } from '../../functions/_lib/tts.js';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') {
      return new Response('ready', { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname !== '/probe') {
      return new Response('not found', { status: 404 });
    }
    if (request.method !== 'GET') {
      return new Response('method not allowed', { status: 405, headers: { Allow: 'GET' } });
    }

    try {
      const audio = await synthesizeEdgeTts({
        text: 'வணக்கம். This is a real Cloudflare Workers local-runtime TTS probe.',
        voice: 'ta-IN-PallaviNeural',
        timeoutMs: 20000,
      });
      const validMp3 = audio instanceof Uint8Array
        && audio.byteLength >= 4
        && ((audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33)
          || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0));
      if (!validMp3) {
        return Response.json({ ok: false, code: 'EDGE_TTS_PROBE_INVALID_MP3', bytes: audio?.byteLength || 0 }, {
          status: 502,
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      return Response.json({
        ok: true,
        provider: 'edge',
        voice: 'ta-IN-PallaviNeural',
        bytes: audio.byteLength,
        contentType: 'audio/mpeg',
        runtime: 'wrangler-dev-local-workers-runtime',
      }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({
        ok: false,
        code: String(error?.code || 'EDGE_TTS_PROBE_FAILED'),
        upstreamStatus: Number(error?.status) || null,
        runtime: 'wrangler-dev-local-workers-runtime',
      }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
  },
};
