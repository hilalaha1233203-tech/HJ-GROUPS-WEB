export async function onRequest(context) {
  const url = new URL(context.request.url);
  const backendBase = String(context.env.HJ_WEB_BACKEND_URL || "").trim().replace(/\/+$/, "");

  if (!backendBase) {
    return new Response(JSON.stringify({
      error: "HJ_WEB_BACKEND_URL is not configured"
    }), {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  const upstreamUrl = backendBase + url.pathname + url.search;
  const headers = new Headers(context.request.headers);

  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

  return fetch(new Request(upstreamUrl, {
    method: context.request.method,
    headers,
    body: ["GET", "HEAD"].includes(context.request.method)
      ? undefined
      : context.request.body,
    redirect: "manual"
  }));
}
