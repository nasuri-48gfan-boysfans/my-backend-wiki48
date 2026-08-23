'use strict';

const { EventEmitter } = require('node:events');
const { RateLimiter } = require('../data/live-tracker/rate-limit');
const { ShowroomAdapter } = require('../data/live-tracker/showroom');
const { IdnAdapter } = require('../data/live-tracker/idn');
const { YouTubeAdapter } = require('../data/live-tracker/youtube');
const { checkLiveStatus } = require('../data/live-tracker/status');
const { DEFAULT_FILE, readStore } = require('../data/live-tracker/store');
const { createLiveCache } = require('./live-cache');

function createProviderAdapters({ minDelayMs = Number(process.env.LIVE_TRACKER_DELAY_MS || 3500) } = {}) {
  const limiter = () => new RateLimiter({ minDelayMs });
  return {
    showroom: new ShowroomAdapter({ limiter: limiter(), authToken: process.env.SHOWROOM_AUTH_TOKEN }),
    idn: new IdnAdapter({ limiter: limiter(), authToken: process.env.IDN_AUTH_TOKEN }),
    youtube: process.env.YOUTUBE_API_KEY ? new YouTubeAdapter({ limiter: limiter(), apiKey: process.env.YOUTUBE_API_KEY }) : null,
  };
}

function createLiveWorker({ file = DEFAULT_FILE, intervalMs = Number(process.env.LIVE_TRACKER_INTERVAL_MS || 60000), logger = console, cache = createLiveCache({ logger }), providers = createProviderAdapters() } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 60000 || intervalMs > 120000) throw new Error('LIVE_TRACKER_INTERVAL_MS harus antara 60000 dan 120000 ms.');
  const events = new EventEmitter();
  let previous = new Map();
  let timer;
  let running = false;

  async function poll() {
    const store = readStore(file);
    const activeProviders = { showroom: providers.showroom, idn: providers.idn, youtube: providers.youtube };
    const live = await checkLiveStatus({ ...activeProviders, file, logger });
    const current = new Map(live.map((item) => [item.id, item]));
    const transitions = [];
    current.forEach((item, id) => {
      if (!previous.has(id)) transitions.push({ type: 'started', ...item });
    });
    previous.forEach((item, id) => {
      if (!current.has(id)) transitions.push({ type: 'ended', ...item, is_live: false });
    });
    const snapshot = { checked_at: new Date().toISOString(), live };
    await cache.publish(snapshot);
    events.emit('snapshot', snapshot, transitions);
    transitions.forEach((transition) => events.emit('transition', transition));
    previous = current;
    return { snapshot, transitions, members: store.members.length };
  }

  async function run() {
    if (!running) return;
    try { await poll(); } catch (error) { logger.error(`[LIVE WORKER] ${error.message}`); }
    if (running) timer = setTimeout(run, intervalMs);
  }

  return {
    events,
    cache,
    async start() { await cache.connect(); running = true; await run(); },
    stop() { running = false; clearTimeout(timer); return cache.close(); },
    poll,
  };
}

module.exports = { createLiveWorker, createProviderAdapters };
