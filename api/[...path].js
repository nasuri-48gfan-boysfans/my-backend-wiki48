/* Titik masuk fungsi Vercel untuk /api/<apa pun>.
   Logikanya ada di server/vercel-handler.js — lihat catatan di sana soal
   jalur live/cron yang sengaja tidak menunggu database siap. */
module.exports = require('../server/vercel-handler').createVercelHandler({ label: 'API' });
