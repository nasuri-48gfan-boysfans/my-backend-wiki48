'use strict';

const { checkLiveStatus } = require('./status');

function createPoller({ check = checkLiveStatus, intervalMs = 45000, logger = console, onLive } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 30000 || intervalMs > 60000) throw new Error('Interval polling harus antara 30000 dan 60000 ms.');
  let stopped = false;
  let timer;
  async function poll() {
    if (stopped) return;
    try {
      await check({ logger, onTransition: (event) => { logger.log(`[LIVE] ${event.member_name} | ${event.platform} | ${event.live_url || '-'}`); if (onLive) onLive(event); } });
    } catch (error) { logger.error(`[POLL ERROR] ${error.message}`); }
    if (!stopped) timer = setTimeout(poll, intervalMs);
  }
  return { start() { stopped = false; return poll(); }, stop() { stopped = true; clearTimeout(timer); } };
}

module.exports = { createPoller };