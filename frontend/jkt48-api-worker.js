/* =============================================================
   jkt48-api-worker.js — proxy Cloudflare Worker untuk API jkt48.com
   -------------------------------------------------------------
   MASALAH: jkt48.com memblokir request dari IP datacenter dengan
   challenge "Just a moment..." (HTTP 403).

   STRATEGI BERLAPIS (coba berurutan sampai dapat JSON valid):
     1. Langsung ke jkt48.com (kadang lolos)
     2. allorigins.win  — proxy publik, mengambil dari IP lain
     3. codetabs.com    — proxy publik kedua
   Respons dianggap VALID bila dimulai '{' dan bukan halaman
   "Just a moment". Semua percobaan gagal → 502 dengan pesan.

   DEPLOY / UPDATE (URL tetap sama setiap kali):
     npx wrangler deploy frontend/jkt48-api-worker.js --name wiki48-jkt48-api --compatibility-date=2024-09-01
   ============================================================= */

const TARGET_HOST = 'https://jkt48.com';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function corsHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  };
}

/* Respons sah = JSON object yang BUKAN halaman tantangan Cloudflare.
   Toleran terhadap pembungkus teks/markdown dari layanan reader. */
function jsonValid(teks) {
  if (!teks) return false;
  const potong = String(teks).trim();
  if (!potong.includes('{')) return false;
  if (/just a moment/i.test(potong.slice(0, 400))) return false;
  const awal = potong.indexOf('{');
  const akhir = potong.lastIndexOf('}');
  if (akhir <= awal) return false;
  try { const p = JSON.parse(potong.slice(awal, akhir + 1)); return Boolean(p && typeof p === 'object'); }
  catch { return false; }
}

/* Ambil inti JSON dari teks apa pun (reader bisa membungkus dengan
   markdown/fence). Return string JSON murni. */
function intiJson(teks) {
  const awal = teks.indexOf('{');
  const akhir = teks.lastIndexOf('}');
  return awal >= 0 && akhir > awal ? teks.slice(awal, akhir + 1) : teks;
}

async function ambil(urlStr, { sebagaiReader = false } = {}) {
  const res = await fetch(urlStr, {
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Referer: `${TARGET_HOST}/schedule?lang=id` },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  let teks = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (sebagaiReader) teks = intiJson(teks);
  if (!jsonValid(teks)) throw new Error('respons bukan JSON valid (kemungkinan challenge)');
  return teks;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method tidak didukung.' }), { status: 405, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const target = `${TARGET_HOST}${url.pathname}${url.search}`;
    const encoded = encodeURIComponent(target);

    /* Urutan strategi: langsung → allorigins → codetabs → corsproxy
       → r.jina.ai (reader dengan browser sungguhan, paling tahan
       challenge tapi paling boros — sengaja terakhir). */
    const strategi = [
      ['langsung', target, {}],
      ['allorigins', `https://api.allorigins.win/raw?url=${encoded}`, {}],
      ['codetabs', `https://api.codetabs.com/v1/proxy?quest=${encoded}`, {}],
      ['corsproxy', `https://corsproxy.io/?url=${encoded}`, {}],
      ['jina-reader', `https://r.jina.ai/${target}`, { sebagaiReader: true }],
    ];

    let kesalahanTerakhir = 'tidak ada percobaan';
    for (const [nama, u, opsi] of strategi) {
      try {
        const teks = await ambil(u, opsi);
        console.log(`[jkt48-worker] sukses via ${nama}`);
        return new Response(teks, { status: 200, headers: corsHeaders() });
      } catch (error) {
        kesalahanTerakhir = `${nama}: ${error.message}`;
      }
    }

    return new Response(
      JSON.stringify({ error: 'Semua jalur proxy gagal.', detail: kesalahanTerakhir }),
      { status: 502, headers: corsHeaders() },
    );
  },
};
