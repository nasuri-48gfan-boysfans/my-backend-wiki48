'use strict';

/* =============================================================
   api/[...path].js — fungsi Vercel: PROXY ke backend Railway
   -------------------------------------------------------------
   Setelah pemisahan repo (frontend/ di Vercel, backend/ di
   Railway), fungsi ini tidak lagi menjalankan Express. Semua
   request /api/* diteruskan utuh ke BACKEND_URL:

       GET  /api/live?x=1        → {BACKEND_URL}/api/live?x=1
       POST /api/cron/update-…   → {BACKEND_URL}/api/cron/update-…

    Yang diteruskan: method, header penting (Authorization,
    Content-Type, Accept, Cookie), body mentah, dan query string.
    Respons (status + body) dikembalikan apa adanya dengan
    cache-control no-store — data dinamis tidak boleh di-cache CDN.

    ENV WAJIB di dashboard Vercel:
      BACKEND_URL = https://<nama>.up.railway.app   (tanpa trailing /)
    ============================================================= */

const HEADER_DITERUSKAN = ['authorization', 'content-type', 'accept', 'cookie', 'user-agent'];

module.exports = async function handler(request, response) {
  const base = String(process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
  if (!base) {
    return response.status(503).json({
      error: 'BACKEND_URL belum diatur di environment Vercel.',
      hint: 'Isi dengan URL Railway, contoh: https://wiki48-backend.up.railway.app',
    });
  }

  const target = `${base}${request.url}`;
  const headers = {};
  for (const nama of HEADER_DITERUSKAN) {
    const nilai = request.headers[nama];
    if (nilai) headers[nama] = Array.isArray(nilai) ? nilai.join(', ') : nilai;
  }

  let body;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const potongan = [];
    for await (const c of request) potongan.push(c);
    if (potongan.length) body = Buffer.concat(potongan);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
      redirect: 'manual',
    });
    response.status(upstream.status);
    response.setHeader('cache-control', upstream.headers.get('cache-control') || 'no-store, max-age=0');
    const tipe = upstream.headers.get('content-type');
    if (tipe) response.setHeader('content-type', tipe);
    const isi = Buffer.from(await upstream.arrayBuffer());
    return response.send(isi);
  } catch (error) {
    const sebab = error.name === 'AbortError' ? 'timeout menghubungi backend (25s)' : error.message;
    /* 502: masalah ada di jalur ke Railway, bukan di fungsi ini. */
    return response.status(502).json({ error: `Backend tidak terjangkau: ${sebab}` });
  } finally {
    clearTimeout(timer);
  }
};
