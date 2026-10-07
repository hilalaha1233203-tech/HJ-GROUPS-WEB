import { Container, getContainer } from "@cloudflare/containers";

const CONTAINER_ENV_KEYS = [
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "UNLOCK_TOKEN_SECRET",
  "HJ_PUBLIC_BASE_URL",
  "AROLINKS_API_TOKEN",
  "EARN4LINK_API_TOKEN",
  "CASHFREE_CLIENT_ID",
  "CASHFREE_CLIENT_SECRET",
  "CASHFREE_ENVIRONMENT",
  "HJ_PAYMENTS_ENABLED",
  "WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_VAPID_SUBJECT",
  "SARVAM_API_KEY",
  "SARVAM_API_SUBSCRIPTION_KEY",
  "SARVAM_SUBSCRIPTION_KEY",
  "SARVAM_TTS_DICT_ID",
  "HJ_GITHUB_ACTIONS_TOKEN",
];

export class HJWebBackend extends Container {
  defaultPort = 4173;
  sleepAfter = "15m";
  enableInternet = true;
  pingEndpoint = "/health";
}

function containerEnv(env) {
  const values = {};
  for (const key of CONTAINER_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined && value !== null && String(value) !== "") {
      values[key] = String(value);
    }
  }
  return values;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isBackendRoute =
      url.pathname === "/health" ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/unlock/");

    if (!isBackendRoute) {
      return new Response("Not Found", { status: 404 });
    }

    const container = getContainer(env.HJ_WEB_BACKEND);
    if (!container.running) {
      await container.start({
        enableInternet: true,
        env: containerEnv(env),
      });
    }

    return container.fetch(request);
  },
};
