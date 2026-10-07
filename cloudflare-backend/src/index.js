import { Container, getContainer } from "@cloudflare/containers";

export class HJWebBackend extends Container {
  defaultPort = 4173;
  sleepAfter = "15m";
  enableInternet = true;
  pingEndpoint = "/health";
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

    return getContainer(env.HJ_WEB_BACKEND).fetch(request);
  },
};
