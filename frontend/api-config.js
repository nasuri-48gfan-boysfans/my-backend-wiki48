/* =============================================================
   api-config.js — penentu alamat API untuk seluruh halaman
   -------------------------------------------------------------
   Urutan prioritas base API (yang pertama ditemukan dipakai):

     1. Query param  : ?api=https://xxx.up.railway.app
                       (sekali dipakai, otomatis diingat di
                       localStorage — berguna saat migrasi/
                       debugging tanpa redeploy)
     2. localStorage : kunci 'WIKI48_API_BASE'
     3. window.WIKI48_API_BASE di baris bawah — isi manual di sini
        bila frontend dan backend memang beda domain permanen.
     4. Kosong ('')  → same-origin: /api/* dilayani hosting frontend
        sendiri (Vercel serverless). INI MODE DEFAULT.

   PERINGATAN ARSITEKTUR: live tracker menyimpan snapshot di Redis.
   Bila frontend memakai mode same-origin (Vercel) sementara worker
   jalan di Railway, KEDUA platform WAJIB menunjuk Upstash yang
   sama (UPSTASH_REDIS_REST_URL/TOKEN identik di kedua dashboard).
   Beda Redis = frontend selalu membaca data lama tanpa error apa
   pun. Bandingkan "redis.host" di /api/diag kedua domain untuk
   memastikannya.

   Saat halaman dibuka dari file:// atau Live Server, path relatif
   /api/* pasti gagal. Sediakan daftar kandidat alamat API supaya
   client bisa mencari server yang hidup sendiri.
   ============================================================= */

window.WIKI48_API_BASE = '';

(function tentukanBaseApi() {
  const KUNCI_SIMPAN = 'WIKI48_API_BASE';

  /* Normalisasi base API. Dulu pernah ada kasus nilai tersimpan TANPA
     protokol (mis. "xxx.up.railway.app") sehingga fetch() melempar
     "Failed to parse URL" dan fitur live/schedule mati total. Kini:
     - spasi & garis miring di ujung dibuang,
     - tanpa skema → diberi https:// (http:// khusus localhost),
     - nilai yang tetap tidak valid dibuang (return '') supaya urutan
       prioritas lanjut ke sumber berikutnya. */
  function normalkanBase(nilai) {
    let v = String(nilai || '').trim().replace(/\/+$/, '');
    if (!v) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v)) {
      const lokal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(v);
      v = (lokal ? 'http://' : 'https://') + v;
    }
    try {
      const u = new URL(v);
      if (u.origin === 'null' || !u.hostname) return '';
      return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, ''));
    } catch (error) {
      return '';
    }
  }

  /* Terima nilai baru hanya kalau hasil normalisasinya valid. */
  function pakaiBase(nilai) {
    const base = normalkanBase(nilai);
    if (!base) return false;
    window.WIKI48_API_BASE = base;
    return true;
  }

  /* 1. Query param ?api=… — juga disimpan supaya navigasi berikutnya
        dalam browser yang sama tidak perlu param lagi. Yang disimpan
        adalah versi yang sudah dinormalkan. */
  let dariQuery = '';
  try {
    dariQuery = new URLSearchParams(window.location.search).get('api') || '';
  } catch (error) { /* URLSearchParams tidak tersedia — lanjut */ }
  if (dariQuery && pakaiBase(dariQuery)) {
    try { localStorage.setItem(KUNCI_SIMPAN, window.WIKI48_API_BASE); } catch (e) { /* private mode */ }
    return;
  }

  /* 2. Override tersimpan (dipakai admin/dev saat mengalihkan traffic).
        Nilailama tanpa protokol ikut disembuhkan di sini dan ditulis
        balik, jadi pengunjung tidak perlu menghapus localStorage manual. */
  try {
    const tersimpan = localStorage.getItem(KUNCI_SIMPAN);
    if (tersimpan && pakaiBase(tersimpan)) {
      if (normalkanBase(tersimpan) !== tersimpan.trim()) {
        try { localStorage.setItem(KUNCI_SIMPAN, window.WIKI48_API_BASE); } catch (e) { /* private mode */ }
      }
      return;
    }
    /* Nilai tersimpan sama sekali tidak bisa dipakai → buang agar
       tidak dievaluasi ulang di setiap kunjungan. */
    if (tersimpan) localStorage.removeItem(KUNCI_SIMPAN);
  } catch (error) { /* localStorage diblokir — lanjut */ }

  /* 3–4. Biarkan nilai default (isi manual atau same-origin). */
})();

window.wiki48ApiUrl = function wiki48ApiUrl(path) {
  return `${window.WIKI48_API_BASE.replace(/\/$/, '')}${path}`;
};

window.wiki48Fetch = async function wiki48Fetch(path, opsi = {}) {
  /* Fetch dinamis: selalu lewati cache HTTP (no-store) supaya yang
     tampil adalah jawaban terbaru, bukan salinan CDN/browser. */
  return fetch(window.wiki48ApiUrl(path), {
    cache: 'no-store',
    ...opsi,
    headers: { accept: 'application/json', ...(opsi.headers || {}) },
  });
};

(function apiKandidat() {
  const proto = window.location.protocol;
  const host = window.location.hostname;
  const diFile = proto === 'file:';
  const diLocalHttp = /^https?:$/.test(proto) && /^(localhost|127\.0\.0\.1)$/.test(host);
  if (!diFile && !diLocalHttp) return;
  const daftar = [];
  if (diLocalHttp) daftar.push('');
  ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8787'].forEach((url) => {
    if (!daftar.includes(url)) daftar.push(url);
  });
  window.WIKI48_API_CANDIDATES = daftar;
})();
