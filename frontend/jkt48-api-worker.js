/* =============================================================
   jkt48-api-worker.js — proxy Cloudflare Worker untuk API jkt48.com
   -------------------------------------------------------------
   MASALAH: jkt48.com berada di balik Cloudflare yang menantang
   request dari IP datacenter (Railway) dengan 403, padahal dari
   browser pengunjung normal-normal saja.

   SOLUSI: request diteruskan dari JARINGAN CLOUDFLARE ke situs yang
   juga ber-Cloudflare — biasanya lolos tanpa challenge.

   DEPLOY (sekali):
     npx wrangler deploy jkt48-api-worker.js --name wiki48-jkt48-api --compatibility-date=2024-01-01
   Nanti muncul URL seperti:
     https://wiki48-jkt48-api.<subdomain>.workers.dev
   Masukkan URL itu ke Railway sebagai:
     JKT48_SCHEDULE_PROXY_URL=https://wiki48-jkt48-api.<subdomain>.workers.dev

   Endpoint worker: apa pun path+query diteruskan utuh ke jkt48.com,
   contoh: /api/v1/schedules?month=8&year=2026&lang=id
   ============================================================= */

const TARGET_HOST = 'https://jkt48.com';

const JKT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://jkt48.com/schedule?lang=id',
};

function corsHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method tidak didukung.' }), {
        status: 405,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const target = `${TARGET_HOST}${url.pathname}${url.search}`;

    try {
      const response = await fetch(target, {
        method: 'GET',
        headers: JKT_HEADERS,
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      const body = await response.text();
      /* Teruskan status apa adanya; JSON rusak hasil challenge tetap
         terlihat oleh pemanggil untuk diagnosa. */
      return new Response(body, {
        status: response.status,
        headers: corsHeaders(response.headers.get('content-type') || 'application/json; charset=utf-8'),
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: `Worker gagal menghubungi jkt48.com: ${error.message}` }), {
        status: 502,
        headers: corsHeaders(),
      });
    }
  },
};
