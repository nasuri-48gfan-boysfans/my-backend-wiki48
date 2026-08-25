'use strict';

/* /api (tanpa sub-path) — diteruskan ke backend juga, sama seperti
   api/[...path].js. Dipisah hanya karena Vercel memetakan
   /api → file ini lewat rewrite di vercel.json. */

module.exports = async function handler(request, response) {
  const base = String(process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
  if (!base) {
    return response.status(503).json({
      error: 'BACKEND_URL belum diatur di environment Vercel.',
      hint: 'Isi dengan URL Railway, contoh: https://wiki48-backend.up.railway.app',
    });
  }
  try {
    const upstream = await fetch(`${base}/api`, { headers: { accept: 'application/json' } });
    response.status(upstream.status);
    response.setHeader('cache-control', 'no-store, max-age=0');
    const tipe = upstream.headers.get('content-type');
    if (tipe) response.setHeader('content-type', tipe);
    return response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    return response.status(502).json({ error: `Backend tidak terjangkau: ${error.message}` });
  }
};
