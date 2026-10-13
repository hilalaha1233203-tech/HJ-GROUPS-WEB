import {
  envString,
  jsonResponse,
  supabaseJson,
} from './runtime.js';

const DEFAULTS = {
  website: { supportTelegramUrl: '' },
  appearance: {
    typography: Object.fromEntries(['primary','heading','body','ui','reader'].map((key) => [key, 'Montserrat'])),
    colors: {
      primary: '#7C83FF',
      secondary: '#9AA0FF',
      accent: '#FFFFFF',
      background: '#050509',
      surface: '#10121B',
      text: '#F7F8FF',
      muted: '#A9AEC3',
      success: '#36D399',
      warning: '#FBBF24',
      error: '#F87171',
      premium: '#FFD166',
    },
    ui: { radius: 12, animationIntensity: 'normal' },
    emoji: { enabled: true, animationEnabled: true, style: 'native', speed: 1 },
    motion: Object.fromEntries(['global','pageTransition','cardHover','buttonHover','loading','skeleton','storyCard','player','emoji','premium','notification','modal','reader','scroll'].map((key) => [key, true])),
    logo: { watermark: true },
  },
};

const FONT_ALLOW = new Set([
  'Montserrat','Inter','Poppins','Nunito Sans','Manrope','DM Sans','Roboto','Open Sans',
  'Lato','Merriweather','Noto Sans','Noto Serif','Space Grotesk','Sora','Outfit',
  'Plus Jakarta Sans','Urbanist','Raleway','Archivo','Lexend','Work Sans','Figtree',
  'Bricolage Grotesque','Playfair Display','Cormorant Garamond','Libre Baskerville',
  'IBM Plex Sans','IBM Plex Serif'
]);
const ANIMATION_ALLOW = new Set(['off','minimal','normal','enhanced']);

function safeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
}

function safeSupportUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 't.me' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function safeAppearance(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const rawTypography = value.typography || {};
  const rawColors = value.colors || {};
  const defaultsColors = DEFAULTS.appearance.colors;

  return {
    typography: Object.fromEntries(['primary','heading','body','ui','reader'].map((key) => [
      key, FONT_ALLOW.has(rawTypography[key]) ? rawTypography[key] : 'Montserrat'
    ])),
    colors: Object.fromEntries(Object.keys(defaultsColors).map((key) => [
      key, safeHex(rawColors[key], defaultsColors[key])
    ])),
    ui: {
      radius: Math.max(0, Math.min(28, Number(value.ui?.radius) || 12)),
      animationIntensity: ANIMATION_ALLOW.has(value.ui?.animationIntensity) ? value.ui.animationIntensity : 'normal',
    },
    emoji: {
      enabled: value.emoji?.enabled !== false,
      animationEnabled: value.emoji?.animationEnabled !== false,
      style: ['native','soft','bold','mono'].includes(value.emoji?.style) ? value.emoji.style : 'native',
      speed: Math.max(.5, Math.min(2, Number(value.emoji?.speed) || 1)),
    },
    motion: Object.fromEntries(
      ['global','pageTransition','cardHover','buttonHover','loading','skeleton','storyCard','player','emoji','premium','notification','modal','reader','scroll']
        .map((key) => [key, value.motion?.[key] !== false])
    ),
    logo: { watermark: value.logo?.watermark !== false },
  };
}

export async function handlePublicSettings(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: new Headers({ ...Object.fromEntries((await import('./runtime.js')).headersForCors(request).entries()) }) });
  if (request.method !== 'GET') return jsonResponse(request, 405, { error: 'Method not allowed' }, { Allow: 'GET' });

  const serviceKey = envString('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    return jsonResponse(request, 200, {
      ok: true,
      website: DEFAULTS.website,
      appearance: DEFAULTS.appearance,
      source: 'safe-local-defaults',
    });
  }

  try {
    const rows = await supabaseJson('/rest/v1/app_settings', {
      params: { select: 'value', id: 'eq.hj_admin_settings', limit: 1 },
    });
    const value = Array.isArray(rows) ? rows[0]?.value || {} : {};
    return jsonResponse(request, 200, {
      ok: true,
      website: { supportTelegramUrl: safeSupportUrl(value.website?.supportTelegramUrl) },
      appearance: safeAppearance(value.appearance),
      source: 'cloud',
    });
  } catch {
    return jsonResponse(request, 200, {
      ok: true,
      website: DEFAULTS.website,
      appearance: DEFAULTS.appearance,
      source: 'safe-fallback',
    });
  }
}
