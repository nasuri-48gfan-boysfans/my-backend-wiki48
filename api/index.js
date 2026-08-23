const { app, ensureSchema } = require('../server/community-server');

let databaseReady;

module.exports = async function vercelHandler(request, response) {
  databaseReady ||= ensureSchema();
  try {
    await databaseReady;
    return app(request, response);
  } catch (error) {
    console.error(error.message);
    return response.status(500).json({ error: 'Backend database belum siap.' });
  }
};