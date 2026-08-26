'use strict';

/* =============================================================
   rute-db.js — satu-satunya daftar jalur yang boleh jalan
   tanpa database
   -------------------------------------------------------------
   Dipisah ke modul sendiri karena DUA tempat memerlukannya dan
   keduanya tidak boleh saling require:

     - server/vercel-handler.js  → memutuskan perlu ensureSchema() atau tidak
     - server/community-server.js → penjaga configurationError

   vercel-handler sudah require community-server (untuk `app`), jadi
   kalau community-server ikut require vercel-handler, jadilah
   lingkaran. Menyalin daftarnya ke dua tempat lebih buruk lagi:
   suatu saat salah satu diedit dan bedanya tidak terlihat.

   KENAPA DAFTAR INI ADA:
   Live tracker tidak menyentuh Postgres sedikit pun — sumbernya
   Redis. Kalau database yang bermasalah (atau kuota Supabase yang
   habis, atau DATABASE_URL yang belum diisi di dashboard Vercel)
   ikut mematikan cron live dan badge live, itu kegagalan yang
   menyebar tanpa alasan teknis apa pun.
   ============================================================= */

/* HATI-HATI dengan pencocokan awalan: dulu daftar ini dicocokkan dengan
   startsWith biasa, dan itu membuat `/api/livestream` ikut tertangkap oleh
   `/api/live` — route yang BUTUH database malah dilewatkan tanpa database,
   lalu gagal dengan pesan yang menyesatkan. Sekarang pencocokannya
   memakai batas segmen: sama persis, atau diikuti "/". Jalur seperti
   `/api/live-status` karena itu harus ditulis lengkap di sini. */
const TANPA_DATABASE = [
  '/api/live',            // + /api/live/events lewat batas segmen
  '/api/live-status',
  '/api/cron',            // + /api/cron/update-live & /api/cron/update-members
  '/api/health',
  '/api/schedule',        // jadwal resmi grup — sumbernya HTTP keluar, bukan Postgres
  '/webhook',             // YouTube WebSub — menangani error DB-nya sendiri
];

function butuhDatabase(url) {
  const jalur = String(url || '').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  return !TANPA_DATABASE.some((awalan) => jalur === awalan || jalur.startsWith(`${awalan}/`));
}

module.exports = { TANPA_DATABASE, butuhDatabase };
