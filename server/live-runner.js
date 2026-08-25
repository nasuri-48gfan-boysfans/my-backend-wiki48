#!/usr/bin/env node
'use strict';

/* =============================================================
   live-runner.js — proses worker live yang berdiri sendiri
   -------------------------------------------------------------
   PAKAI:  npm run live            (atau: node server/live-runner.js)
           npm run live -- --once  (satu siklus lalu keluar; untuk cron/uji)

   KENAPA PROSES SENDIRI:
   Vercel (dan serverless lain) tidak bisa menampung loop 60 detik —
   fungsinya mati begitu response selesai, filesystem-nya read-only,
   dan tiap request bisa mendarat di instance berbeda. Jadi poller
   tinggal di host yang selalu hidup, menulis snapshot ke Redis, dan
   API di Vercel hanya membaca Redis. REDIS_URL harus menunjuk Redis
   yang bisa dijangkau KEDUANYA (localhost hanya untuk development).

   Endpoint kesehatan ikut dinyalakan bila LIVE_HEALTH_PORT/PORT ada
   (Railway/Render menganggap service tanpa port terbuka sebagai gagal):
     GET /healthz   → ringkasan worker + status Redis
     GET /api/live  → snapshot terakhir langsung dari worker ini
   ============================================================= */

require('./env').loadEnv();
const http = require('node:http');
const { createLiveWorker } = require('./live-worker');

const worker = createLiveWorker({ logger: console });
const sekali = process.argv.includes('--once');
let snapshotTerakhir = { checked_at: null, live: [] };
let siklus = 0;

worker.events.on('snapshot', (snapshot, transitions) => {
  snapshotTerakhir = snapshot;
  siklus += 1;
  const m = snapshot.meta || {};
  const gagal = Object.entries(m.providers || {}).filter(([, status]) => status && status.ok === false);
  console.log(`[LIVE] #${siklus} ${snapshot.checked_at} · ${snapshot.live.length} live · mapping ${m.mapped}/${m.roster}`
    + ` · dicek {sr:${m.checked?.showroom || 0} idn:${m.checked?.idn || 0} yt:${m.checked?.youtube || 0}}`
    + (gagal.length ? ` · provider bermasalah: ${gagal.map(([nama]) => nama).join(', ')}` : ''));
  transitions.forEach((transition) => {
    const arah = transition.type === 'started' ? 'MULAI' : 'SELESAI';
    console.log(`  ${arah} ${transition.member_name} · ${transition.platform} · ${transition.live_url || '-'}`);
  });
});

function healthServer() {
  const port = Number(process.env.LIVE_HEALTH_PORT || process.env.PORT || 0);
  if (!port) return null;
  const server = http.createServer((request, response) => {
    const kirim = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    if (request.url === '/healthz') {
      return kirim(200, {
        ok: true,
        role: 'live-worker',
        cycles: siklus,
        live: snapshotTerakhir.live.length,
        checked_at: snapshotTerakhir.checked_at,
        interval_ms: worker.intervalMs,
        redis: worker.cache.status(),
        discord: worker.notifier ? worker.notifier.status() : null,
      });
    }
    if (request.url === '/api/live') return kirim(200, snapshotTerakhir);
    return kirim(404, { error: 'Endpoint tidak ditemukan.' });
  });
  server.listen(port, () => console.log(`[LIVE] health check: http://localhost:${port}/healthz`));
  return server;
}

async function main() {
  console.log(`[LIVE] worker mulai · interval ${worker.intervalMs} ms · redis ${worker.cache.status().host || '(memori)'}`);
  if (sekali) {
    await worker.cache.connect();
    const hasil = await worker.poll();
    console.log(JSON.stringify(hasil.snapshot, null, 2));
    await worker.stop();
    return;
  }
  const server = healthServer();
  await worker.start();

  let berhenti = false;
  const matikan = async (sinyal) => {
    if (berhenti) return;
    berhenti = true;
    console.log(`\n[LIVE] ${sinyal} diterima, menutup worker…`);
    if (server) server.close();
    await worker.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => { matikan('SIGINT'); });
  process.on('SIGTERM', () => { matikan('SIGTERM'); });
}

main().catch((error) => {
  console.error(`[LIVE] gagal start: ${error.message}`);
  process.exitCode = 1;
});
