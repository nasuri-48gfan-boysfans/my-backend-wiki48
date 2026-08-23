'use strict';

const http = require('http');
const { RateLimiter } = require('./rate-limit');
const { DEFAULT_FILE, readStore } = require('./store');
const { ShowroomAdapter } = require('./showroom');
const { IdnAdapter } = require('./idn');
const { YouTubeAdapter } = require('./youtube');
const { discoverMappings } = require('./discovery');
const { checkLiveStatus } = require('./status');

function createTracker({ file = DEFAULT_FILE, minDelayMs = 3500, showroomBaseUrl, idnBaseUrl, youtubeApiKey, authTokens = {}, logger = console } = {}) {
  const showroomLimiter = new RateLimiter({ minDelayMs });
  const idnLimiter = new RateLimiter({ minDelayMs });
  const showroom = new ShowroomAdapter({ baseUrl: showroomBaseUrl, limiter: showroomLimiter, authToken: authTokens.showroom });
  const idn = new IdnAdapter({ baseUrl: idnBaseUrl, limiter: idnLimiter, authToken: authTokens.idn });
  const youtube = new YouTubeAdapter({ apiKey: youtubeApiKey, limiter: new RateLimiter({ minDelayMs }), authToken: authTokens.youtube });

  async function jsonResponse(response, status, body) {
    const payload = JSON.stringify(body);
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
    response.end(payload);
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method !== 'GET') return jsonResponse(response, 405, { error: 'Method tidak didukung.' });
      if (url.pathname === '/api/members') return jsonResponse(response, 200, readStore(file));
      if (url.pathname === '/api/discover') return jsonResponse(response, 200, await discoverMappings({ showroom, file, logger }));
      if (url.pathname === '/api/live') return jsonResponse(response, 200, { checked_at: new Date().toISOString(), live: await checkLiveStatus({ showroom, idn, youtube, file, logger }) });
      return jsonResponse(response, 404, { error: 'Endpoint tidak ditemukan.' });
    } catch (error) {
      logger.error(error);
      return jsonResponse(response, error.status || 500, { error: error.message });
    }
  });
}

module.exports = { createTracker };
