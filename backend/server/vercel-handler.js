'use strict';

/* =============================================================
   vercel-handler.js — pembungkus Express untuk fungsi Vercel
   -------------------------------------------------------------
   Dipakai oleh api/index.js dan api/[...path].js supaya keduanya
   tidak lagi menyimpan salinan logika yang sama (dan tidak bisa
   lagi berbeda diam-diam saat salah satu diedit).

   KENAPA ADA DAFTAR JALUR TANPA DATABASE:
   Lihat server/rute-db.js — daftarnya dipindah ke sana karena
   community-server.js juga memerlukannya, dan modul ini sudah
   require community-server (jadi tidak boleh sebaliknya).
   ============================================================= */

const { TANPA_DATABASE, butuhDatabase } = require('./rute-db');

function createVercelHandler({ label = 'API' } = {}) {
  let app;
  let ensureSchema;
  let loadError;
  try {
    ({ app, ensureSchema } = require('./community-server'));
  } catch (error) {
    loadError = error;
  }

  let databaseReady;

  return async function handler(request, response) {
    if (loadError) {
      console.error(`[${label} LOAD]`, loadError.message);
      return response.status(500).json({ error: 'Backend gagal dimuat. Periksa dependencies dan konfigurasi Vercel.' });
    }
    if (!butuhDatabase(request.url)) return app(request, response);
    try {
      /* Dipoles sekali per instance; kalau gagal, cache-nya dibuang supaya
         request berikutnya mencoba lagi, bukan gagal selamanya. */
      databaseReady ||= ensureSchema();
      await databaseReady;
      return app(request, response);
    } catch (error) {
      databaseReady = undefined;
      console.error(`[${label} STARTUP]`, error.message);
      return response.status(500).json({
        error: 'Backend database belum siap. Periksa environment variables Vercel dan koneksi Supabase.',
      });
    }
  };
}

module.exports = { createVercelHandler, butuhDatabase, TANPA_DATABASE };
