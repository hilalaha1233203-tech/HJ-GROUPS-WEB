const CACHE_TTL_SECONDS = 300;

const TABLES = {
  stories: [
    "id","title","genre","language","cover_url","cover_file_id","cover_path",
    "description","access_type","status"
  ],
  episodes: [
    "id","story_id","episode_number","number","title","type","telegram_message_id",
    "telegram_import_key","file_url","audio_url","file_path","language","available",
    "access_type","created_at"
  ],
  books: [
    "id","title","author","description","type","category","language","cover_url",
    "cover_file_id","cover_path","file_url","file_id","file_path","telegram_message_id",
    "volumes","access_type","status"
  ],
  video_stories: [
    "id","title","category","language","cover_url","cover_file_id","cover_path",
    "telegram_message_id","access_type","status"
  ],
  video_episodes: [
    "id","video_story_id","number","title","type","file_id","file_url","file_path",
    "telegram_message_id","access_type","available","language"
  ],
};

function getEnv(env, ...keys) {
  for (const key of keys) {
    const value = String(env?.[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function baseHeaders() {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Vary": "Accept-Encoding",
  });
}

async function fetchTable(supabaseUrl, supabaseKey, table, columns) {
  const params = new URLSearchParams({
    select: columns.join(","),
    order: "id.asc",
  });

  const response = await fetch(
    supabaseUrl.replace(/\/+$/, "") + "/rest/v1/" + table + "?" + params.toString(),
    {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Accept: "application/json",
      },
    },
  );

  if (response.ok) {
    return await response.json();
  }

  const body = await response.text().catch(() => "");
  if (
    response.status === 404 &&
    /could not find the table|schema cache|relation .* does not exist/i.test(body)
  ) {
    return [];
  }

  throw new Error("Supabase " + table + " request failed: HTTP " + response.status);
}

export async function onRequestGet(context) {
  const request = context.request;
  const url = new URL(request.url);

  if (request.headers.has("Authorization") || request.headers.has("Cookie")) {
    return new Response(
      JSON.stringify({ error: "PUBLIC_CATALOG_AUTH_NOT_SUPPORTED" }),
      { status: 400, headers: new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      }) },
    );
  }

  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("X-HJ-Public-Catalog-Cache", "HIT");
    return new Response(cached.body, {
      status: cached.status,
      headers,
    });
  }

  const supabaseUrl = getEnv(context.env, "VITE_SUPABASE_URL", "SUPABASE_URL");
  const supabaseKey = getEnv(
    context.env,
    "VITE_HJ_CLIENT_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  );

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "PUBLIC_CATALOG_SUPABASE_NOT_CONFIGURED" }),
      {
        status: 503,
        headers: new Headers({
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        }),
      },
    );
  }

  try {
    const [stories, episodes, books, videoStories, videoEpisodes] = await Promise.all([
      fetchTable(supabaseUrl, supabaseKey, "stories", TABLES.stories),
      fetchTable(supabaseUrl, supabaseKey, "episodes", TABLES.episodes),
      fetchTable(supabaseUrl, supabaseKey, "books", TABLES.books),
      fetchTable(supabaseUrl, supabaseKey, "video_stories", TABLES.video_stories),
      fetchTable(supabaseUrl, supabaseKey, "video_episodes", TABLES.video_episodes),
    ]);

    const headers = baseHeaders();
    headers.set("X-HJ-Public-Catalog-Cache", "MISS");

    const response = new Response(
      JSON.stringify({
        ok: true,
        stories: Array.isArray(stories) ? stories : [],
        episodes: Array.isArray(episodes) ? episodes : [],
        books: Array.isArray(books) ? books : [],
        videoStories: Array.isArray(videoStories) ? videoStories : [],
        videoEpisodes: Array.isArray(videoEpisodes) ? videoEpisodes : [],
      }),
      { status: 200, headers },
    );

    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "PUBLIC_CATALOG_UNAVAILABLE",
        detail: String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 180),
      }),
      {
        status: 503,
        headers: new Headers({
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        }),
      },
    );
  }
}
