/* Titik masuk fungsi Vercel untuk /api (lihat rewrite di vercel.json).
   Logikanya ada di server/vercel-handler.js supaya berkas ini dan
   api/[...path].js tidak bisa berbeda diam-diam. */
module.exports = require('../server/vercel-handler').createVercelHandler({ label: 'API' });
