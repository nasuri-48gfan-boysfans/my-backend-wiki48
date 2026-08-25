'use strict';

const path = require('path');
const { RateLimiter } = require('./rate-limit');
const { DEFAULT_FILE, readStore } = require('./store');
const { ShowroomAdapter } = require('./showroom');
const { IdnAdapter } = require('./idn');
const { YouTubeAdapter } = require('./youtube');
const { discoverMappings } = require('./discovery');
const { checkLiveStatus } = require('./status');
const { createPoller } = require('./poller');
const { createTracker } = require('./server');

const file = process.env.LIVE_TRACKER_FILE || DEFAULT_FILE;
const minDelayMs = Number(process.env.LIVE_TRACKER_DELAY_MS || 3500);
function proxyDispatcher() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return undefined;
  try { return new (require('undici').ProxyAgent)(proxyUrl); } catch (error) {
    throw new Error(`Proxy dikonfigurasi tetapi undici.ProxyAgent tidak tersedia: ${error.message}`);
  }
}

const dispatcher = proxyDispatcher();
const showroom = new ShowroomAdapter({ limiter: new RateLimiter({ minDelayMs }), authToken: process.env.SHOWROOM_AUTH_TOKEN, dispatcher });
const idn = new IdnAdapter({ limiter: new RateLimiter({ minDelayMs }), authToken: process.env.IDN_AUTH_TOKEN, dispatcher });
const youtube = new YouTubeAdapter({ limiter: new RateLimiter({ minDelayMs }), authToken: process.env.YOUTUBE_AUTH_TOKEN, dispatcher });

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--discover')) {
    const result = await discoverMappings({ showroom, file });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (args.includes('--check')) {
    console.log(JSON.stringify(await checkLiveStatus({ showroom, idn, youtube, file, onTransition: (event) => console.log(`[LIVE] ${event.member_name} | ${event.platform} | ${event.live_url || '-'}`) }), null, 2));
    return;
  }
  if (args.includes('--poll')) {
    const intervalMs = Number(process.env.LIVE_TRACKER_INTERVAL_MS || 45000);
    const poller = createPoller({
      intervalMs,
      logger: console,
      check: (options) => checkLiveStatus({ ...options, showroom, idn, youtube, file }),
    });
    process.once('SIGINT', () => { poller.stop(); console.log('\nLive tracker dihentikan.'); });
    await poller.start();
    return;
  }
  if (args.includes('--members')) {
    console.log(JSON.stringify(readStore(file), null, 2));
    return;
  }
  if (args.includes('--serve')) {
    const port = Number(process.env.PORT || 8787);
    const server = createTracker({
      file,
      minDelayMs,
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
      authTokens: { showroom: process.env.SHOWROOM_AUTH_TOKEN, idn: process.env.IDN_AUTH_TOKEN, youtube: process.env.YOUTUBE_AUTH_TOKEN },
    });
    server.listen(port, () => console.log(`Live tracker API: http://localhost:${port}`));
    return;
  }
  console.log('Pakai: node data/live-tracker/cli.js --discover | --check | --poll | --members | --serve');
  console.log(`Mapping: ${path.relative(process.cwd(), file)}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
