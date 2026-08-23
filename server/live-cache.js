'use strict';

const { createClient } = require('redis');

const LIVE_KEY = 'wiki48:live:current';
const LIVE_CHANNEL = 'wiki48:live:update';

function createLiveCache({ url = process.env.REDIS_URL, logger = console } = {}) {
  let memorySnapshot = { checked_at: null, live: [] };
  let redisClient;
  let publisher;
  let subscriber;

  async function connect() {
    if (!url) {
      logger.warn('[LIVE] REDIS_URL belum diatur; memakai cache memory untuk development.');
      return;
    }
    redisClient = createClient({ url });
    publisher = redisClient.duplicate();
    subscriber = redisClient.duplicate();
    [redisClient, publisher, subscriber].forEach((client) => client.on('error', (error) => logger.error(`[REDIS] ${error.message}`)));
    await Promise.all([redisClient.connect(), publisher.connect(), subscriber.connect()]);
  }

  async function getSnapshot() {
    if (!redisClient) return memorySnapshot;
    const value = await redisClient.get(LIVE_KEY);
    return value ? JSON.parse(value) : memorySnapshot;
  }

  async function publish(snapshot) {
    memorySnapshot = snapshot;
    if (redisClient) {
      await redisClient.set(LIVE_KEY, JSON.stringify(snapshot), { EX: 180 });
      await publisher.publish(LIVE_CHANNEL, JSON.stringify(snapshot));
    }
  }

  async function subscribe(onSnapshot) {
    if (!subscriber) return;
    await subscriber.subscribe(LIVE_CHANNEL, (message) => onSnapshot(JSON.parse(message)));
  }

  async function close() {
    await Promise.all([redisClient, publisher, subscriber].filter(Boolean).map((client) => client.quit()));
  }

  return { connect, getSnapshot, publish, subscribe, close };
}

module.exports = { LIVE_KEY, LIVE_CHANNEL, createLiveCache };
