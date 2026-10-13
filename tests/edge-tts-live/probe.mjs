import { spawn } from 'node:child_process';

const origin = 'http://127.0.0.1:8789';
const child = spawn('npx', [
  '--yes',
  'wrangler@4.149.0',
  'dev',
  '--local',
  '--config',
  'tests/edge-tts-live/wrangler.jsonc',
  '--ip',
  '127.0.0.1',
  '--port',
  '8789',
], {
  stdio: 'ignore',
  env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
});

let completed = false;
let startupError = null;
child.once('error', (error) => { startupError = error; });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForLocalWorker() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (startupError) throw new Error('WRANGLER_SPAWN_FAILED');
    if (child.exitCode !== null) throw new Error('WRANGLER_EXITED_EARLY_' + child.exitCode);
    try {
      const response = await fetch(origin + '/healthz', { signal: AbortSignal.timeout(1500) });
      if (response.status === 200 && (await response.text()) === 'ready') return;
    } catch {}
    await sleep(250);
  }
  throw new Error('WRANGLER_DEV_STARTUP_TIMEOUT');
}

async function main() {
  try {
    await waitForLocalWorker();
    const response = await fetch(origin + '/probe', { signal: AbortSignal.timeout(30000) });
    const result = await response.json().catch(() => ({}));
    const viable = response.status === 200
      && result.ok === true
      && result.provider === 'edge'
      && result.contentType === 'audio/mpeg'
      && Number(result.bytes) >= 4;
    const verifiedNotViable = response.status === 502
      && result.ok === false
      && result.code === 'EDGE_TTS_HANDSHAKE_FAILED'
      && Number(result.upstreamStatus) === 403;
    const safe = {
      classification: viable ? 'viable' : verifiedNotViable ? 'not_viable_current_workers_handshake' : 'unexpected_failure',
      httpStatus: response.status,
      ok: viable,
      code: result.code || null,
      upstreamStatus: result.upstreamStatus || null,
      bytes: Number(result.bytes) || 0,
      voice: result.voice || 'ta-IN-PallaviNeural',
      runtime: result.runtime || 'wrangler-dev-local-workers-runtime',
      provider: result.provider || null,
      contentType: result.contentType || null,
    };
    process.stdout.write(JSON.stringify(safe) + '\n');
    if (verifiedNotViable) {
      process.stdout.write('NOT VIABLE: Microsoft Edge Read Aloud rejected the Workers-runtime WebSocket handshake with HTTP 403.\n');
      completed = true;
      return;
    }
    if (!viable) throw new Error('EDGE_TTS_LIVE_PROBE_UNEXPECTED_FAILURE');
    process.stdout.write('VIABLE: real Tamil audio was generated inside the Wrangler local Workers runtime.\n');
    completed = true;
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(3000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
}

main().catch((error) => {
  const code = String(error?.message || 'EDGE_TTS_LIVE_PROBE_FAILED').replace(/[^A-Z0-9_-]/gi, '').slice(0, 80);
  process.stderr.write(code + '\n');
  process.exitCode = completed ? 0 : 1;
});
