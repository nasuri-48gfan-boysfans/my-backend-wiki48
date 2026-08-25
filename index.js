#!/usr/bin/env node
'use strict';

/* =============================================================
   index.js — entry point untuk platform deploy (Railway/Render)
   -------------------------------------------------------------
   Seluruh aplikasi hidup di server/community-server.js; file ini
   hanya peluncur tipis supaya `npm start` (yang dipakai Railway)
   sederhana dan selalu menunjuk ke satu tempat:

     "start": "node index.js"

   Yang membuat deploy lolos tanpa 502 ada di community-server.js:
     - app.listen(PORT, '0.0.0.0', …)  ← bind semua antarmuka
     - PORT = process.env.PORT || 5000 ← disuntikkan Railway
     - GET /health → {"status":"ok","message":"Server is healthy"}
   ============================================================= */

require('./server/community-server')
  .start()
  .catch((error) => {
    console.error(`[INDEX] server gagal dimulai: ${error.message}`);
    process.exitCode = 1;
  });
