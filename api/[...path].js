const { app, ensureSchema } = require('../server/community-server');

let databaseReady;

module.exports = async function vercelApiHandler(request, response) {
  try {
    databaseReady ||= ensureSchema();
    await databaseReady;
    return app(request, response);
  } catch (error) {
    databaseReady = undefined;
    console.error('[API STARTUP]', error.message);
    return response.status(500).json({ error: 'Backend database belum siap. Periksa environment variables Vercel dan koneksi Supabase.' });
  }
};
