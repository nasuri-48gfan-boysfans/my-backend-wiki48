var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// showroom-proxy-worker.js
var SHOWROOM_URL = "https://api.showroom-live.com/api/live/onlives";
var JKT48_FALLBACK_URL = "https://api.jkt48points.my.id/api/showroom/onlives";
var ALLOWED_ORIGIN = "*";
var SHOWROOM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.showroom-live.com/"
};
function corsHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": contentType
  };
}
__name(corsHeaders, "corsHeaders");
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders()
  });
}
__name(json, "json");
var showroom_proxy_worker_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== "GET") return json({ error: "Method tidak didukung." }, 405);
    const fetchJson = /* @__PURE__ */ __name(async (url, scraperApiKey) => {
      const target = scraperApiKey ? `https://api.scraperapi.com?api_key=${encodeURIComponent(scraperApiKey)}&url=${encodeURIComponent(url)}&render=false` : url;
      const response = await fetch(target, {
        method: "GET",
        headers: SHOWROOM_HEADERS,
        cf: { cacheTtl: 0, cacheEverything: false }
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(body);
    }, "fetchJson");
    try {
      let data;
      try {
        data = await fetchJson(SHOWROOM_URL, env.SCRAPER_API_KEY);
      } catch (globalError) {
        data = await fetchJson(JKT48_FALLBACK_URL, env.SCRAPER_API_KEY);
      }
      return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders() });
    } catch (error) {
      return json({ error: "Gagal menghubungi API SHOWROOM." }, 502);
    }
  }
};
export {
  showroom_proxy_worker_default as default
};
//# sourceMappingURL=showroom-proxy-worker.js.map
