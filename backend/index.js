#!/usr/bin/env node
'use strict';

/* =============================================================
   index.js — entry point untuk platform deploy (Railway/Render)
   -------------------------------------------------------------
   Seluruh aplikasi hidup di server/community-server.js; file ini
   hanya peluncur tipis supaya `npm start` (yang dipakai Railway)
   sederhana dan selalu menunjuk ke satu tempat:

     "start": "node index.js"

   PENTING UNTUK RAILWAY:
   Bila start() gagal (mis. port bentrok, env rusak), proses HARUS
   mati total dengan exit code non-zero. Dulu di sini hanya
   `process.exitCode = 1` — Node tetap hidup karena listener/worker
   lain masih menahan event loop, akibatnya Railway membaca proses
   zombie sebagai server yang "jalan" tapi tidak pernah merespons
   → 502 Bad Gateway / Application failed to respond.
   ============================================================= */

require('./server/community-server')
  .start()
  .catch((error) => {
    console.error('[INDEX] server gagal dimulai:');
    /* Objek error utuh, bukan cuma message → stack trace tercetak. */
    console.error(error);
    /* Kill total sekarang juga. Railway akan menandai deploy gagal
       dan menampilkan log-nya, alih-alih menggantung jadi zombie. */
    process.exit(1);
  });
