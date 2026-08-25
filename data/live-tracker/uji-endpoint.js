'use strict';

/* =============================================================
   uji-endpoint.js — uji HTTP endpoint live TANPA jaringan luar
   -------------------------------------------------------------
   PAKAI:  node data/live-tracker/uji-endpoint.js
   Keluar 0 kalau semua lulus, 1 kalau ada yang gagal.

   Server Express dijalankan sungguhan di port acak lokal, tapi
   Postgres, Redis, provider live, dan Discord semuanya tiruan.
   Yang diuji adalah kontrak yang dilihat klien:
     - /api/cron/update-live menolak pemanggil tanpa CRON_SECRET
     - /api/live-status selalu array, bahkan saat Redis mati
     - header cache CDN terpasang (penjaga kuota Upstash)
     - jalur live tidak menunggu database siap
   ============================================================= */

const assert = require('node:assert');
const http = require('node:http');
const Module = require('node:module');

/* ---- Tiruan dipasang SEBELUM community-server dimuat ---- */
const RAHASIA = 'rahasia-uji-1234567890';
process.env.CRON_SECRET = RAHASIA;
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://palsu/palsu';
process.env.SESSION_SECRET = 'x'.repeat(64);
process.env.LIVE_WORKER_INPROCESS = 'false';    // jangan menyalakan loop saat uji
process.env.LIVE_SSE = 'off';
delete process.env.UPSTASH_REDIS_REST_URL;      // paksa mode memori
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.REDIS_URL;
delete process.env.DISCORD_WEBHOOK_URL;

/* `pg` diganti supaya tidak ada koneksi database sungguhan. Pool-nya
   sengaja SELALU gagal: itu justru yang ingin dibuktikan — jalur live
   tetap hidup walau database mati. */
const requireAsli = Module.prototype.require;
Module.prototype.require = function (nama) {
  if (nama === 'pg') {
    return {
      Pool: class {
        async query() { throw new Error('database sengaja dimatikan di uji ini'); }
        async end() {}
      },
    };
  }
  return requireAsli.apply(this, arguments);
};

/* Kunci pemuat env ke "lingkungan saja" SEBELUM community-server dimuat.
   Tanpa ini, loadEnv() akan membaca .env.local dan mengembalikan kredensial
   Upstash yang sengaja dihapus di atas — ujinya lalu menembak Upstash
   sungguhan, jadi lambat, berisik, dan bergantung jaringan. */
requireAsli.call(module, '../../server/env').loadEnv({ berkas: [], diam: true });

/* Blokir fetch ke host luar SEBELUM adapter live dimuat. Tanpa ini,
   siklus cron di bawah mengambil onlives Showroom/IDN sungguhan dan dua
   asersi "daftar kosong" jadi tergantung keberuntungan: lolos kalau
   kebetulan tidak ada siaran, gagal kalau ada. Satu-satunya jaringan yang
   sah di uji ini adalah loopback (server Express acak di atas). */
const fetchAsli = globalThis.fetch;
if (typeof fetchAsli === 'function') {
  globalThis.fetch = function fetchLokalSaja(url, opsi) {
    const target = String(typeof url === 'string' ? url : (url && url.url) || url);
    if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/i.test(target)) {
      return fetchAsli.call(this, url, opsi);
    }
    return Promise.reject(new Error(`jaringan luar diblokir di uji endpoint (${target.slice(0, 60)})`));
  };
}

const { app } = requireAsli.call(module, '../../server/community-server');
const { butuhDatabase } = requireAsli.call(module, '../../server/vercel-handler');
let lulus = 0;
let gagalTotal = 0;
const kegagalan = [];

async function uji(nama, fn) {
  try {
    await fn();
    lulus += 1;
    console.log(`  ok   ${nama}`);
  } catch (error) {
    gagalTotal += 1;
    kegagalan.push(`${nama}: ${error.message}`);
    console.log(`  GAGAL ${nama}\n        ${error.message}`);
  }
}

function minta(server, jalur, opsi = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: jalur, method: 'GET', headers: opsi.headers || {} },
      (response) => {
        let body = '';
        response.on('data', (c) => { body += c; });
        response.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch (error) { /* biarkan null */ }
          resolve({ status: response.statusCode, headers: response.headers, body, json });
        });
      });
    request.on('error', reject);
    request.end();
  });
}

async function main() {
  console.log('UJI ENDPOINT LIVE (server lokal, tanpa jaringan luar)\n');
  const server = await new Promise((resolve) => {
    const s = http.createServer(app);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });

  console.log('/api/live — keadaan awal (belum ada snapshot)');
  /* URUTAN PENTING: blok ini WAJIB sebelum cron dipanggil. Begitu satu
     siklus cron jalan, snapshot sudah ada di memori dan keadaan "belum
     pernah ada worker yang menulis" tidak bisa diuji lagi. Versi pertama
     uji ini menaruhnya sesudah cron dan gagal karena alasan itu, bukan
     karena kodenya salah. */
  await uji('belum ada snapshot: stale true dan has_snapshot false', async () => {
    const r = await minta(server, '/api/live');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json.live));
    assert.strictEqual(r.json.stale, true, 'belum ada snapshot = harus stale');
    assert.strictEqual(r.json.tracker.has_snapshot, false,
      'harus bisa dibedakan dari "sudah dicek, tidak ada yang live"');
  });
  await uji('cache CDN terpasang di /api/live', async () => {
    const r = await minta(server, '/api/live');
    assert.match(r.headers['cache-control'] || '', /s-maxage=\d+/);
  });
  await uji('SSE dimatikan: 501, bukan koneksi menggantung', async () => {
    const r = await minta(server, '/api/live/events');
    assert.strictEqual(r.status, 501);
  });

  console.log('\n/api/cron/update-live — perlindungan');
  await uji('tanpa header Authorization: 401', async () => {
    const r = await minta(server, '/api/cron/update-live');
    assert.strictEqual(r.status, 401, `dapat ${r.status}`);
  });
  await uji('rahasia salah (panjang sama): 401', async () => {
    const salah = 'x'.repeat(RAHASIA.length);
    const r = await minta(server, '/api/cron/update-live', { headers: { authorization: `Bearer ${salah}` } });
    assert.strictEqual(r.status, 401);
  });
  await uji('rahasia salah (panjang beda) tidak melempar, tetap 401', async () => {
    const r = await minta(server, '/api/cron/update-live', { headers: { authorization: 'Bearer pendek' } });
    assert.strictEqual(r.status, 401, `dapat ${r.status} — timingSafeEqual mungkin melempar`);
  });
  await uji('pesan 401 tidak membocorkan rahasianya', async () => {
    const r = await minta(server, '/api/cron/update-live');
    assert.ok(!r.body.includes(RAHASIA), 'CRON_SECRET ikut di balasan');
  });
  await uji('rahasia benar: 200 dan ringkasan siklus', async () => {
    const r = await minta(server, '/api/cron/update-live', { headers: { authorization: `Bearer ${RAHASIA}` } });
    assert.strictEqual(r.status, 200, `dapat ${r.status}: ${r.body.slice(0, 300)}`);
    assert.strictEqual(r.json.ok, true);
    ['live', 'started', 'ended', 'discord', 'seeded', 'truncated', 'redis', 'duration_ms'].forEach((k) => {
      assert.ok(k in r.json, `field ${k} hilang dari ringkasan`);
    });
  });
  await uji('cron jalan walau database mati total', async () => {
    /* Pool di uji ini SELALU melempar. Kalau endpoint ini tetap 200,
       berarti live tracker benar-benar tidak bergantung Postgres. */
    const r = await minta(server, '/api/cron/update-live', { headers: { authorization: `Bearer ${RAHASIA}` } });
    assert.strictEqual(r.status, 200);
  });
  await uji('balasan cron tidak boleh di-cache', async () => {
    const r = await minta(server, '/api/cron/update-live', { headers: { authorization: `Bearer ${RAHASIA}` } });
    assert.match(r.headers['cache-control'] || '', /no-store/);
  });

  console.log('\n/api/live-status');
  await uji('selalu array, bukan objek', async () => {
    const r = await minta(server, '/api/live-status');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json), `bentuknya ${typeof r.json}`);
  });
  await uji('Redis tidak dikonfigurasi: array kosong, bukan error', async () => {
    const r = await minta(server, '/api/live-status');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json, []);
  });
  await uji('header cache CDN terpasang (penjaga kuota Upstash)', async () => {
    const r = await minta(server, '/api/live-status');
    const cc = r.headers['cache-control'] || '';
    assert.match(cc, /s-maxage=\d+/, `cache-control: ${cc}`);
    assert.match(cc, /stale-while-revalidate=\d+/);
    assert.match(cc, /max-age=0/, 'browser harus tetap bertanya, CDN yang menahan');
  });

  console.log('\n/api/live — sesudah satu siklus cron');
  await uji('snapshot sudah ada: has_snapshot true dan tidak lagi stale', async () => {
    const r = await minta(server, '/api/live');
    assert.strictEqual(r.json.tracker.has_snapshot, true, 'cron sudah jalan, snapshot harus tercatat');
    assert.strictEqual(r.json.stale, false, 'snapshot baru tidak boleh dianggap kedaluwarsa');
  });
  await uji('"tidak ada yang live" berbeda dari "tracker mati"', async () => {
    const r = await minta(server, '/api/live');
    assert.deepStrictEqual(r.json.live, [], 'mapping masih kosong, jadi wajar 0 live');
    assert.strictEqual(r.json.tracker.has_snapshot, true,
      'inilah bedanya: sudah dicek dan hasilnya kosong');
  });

  console.log('\npemilahan jalur tanpa database');
  /* REGRESI YANG PERNAH LOLOS DARI UJI INI.

     Uji di atas selalu mengisi DATABASE_URL palsu, jadi penjaga
     configurationError tidak pernah aktif dan tidak ada yang menyadari
     bahwa penjaga itu berlaku untuk SEMUA request. Ketahuan hanya saat
     server dijalankan sungguhan tanpa DATABASE_URL: /api/live,
     /api/live-status, dan /api/cron/update-live semuanya balas 500
     "DATABASE_URL belum diatur" — padahal tidak satu pun menyentuh
     Postgres. Di Vercel, lupa mengisi DATABASE_URL di dashboard cukup
     untuk mematikan seluruh fitur live tanpa petunjuk apa pun.

     Karena itu di sini DATABASE_URL sengaja dicabut sementara. */
  await uji('DATABASE_URL kosong: jalur live TIDAK ikut mati', async () => {
    const simpan = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const live = await minta(server, '/api/live');
      assert.strictEqual(live.status, 200, `/api/live balas ${live.status}: ${live.body.slice(0, 160)}`);
      assert.ok(Array.isArray(live.json.live), '/api/live harus tetap punya array live');

      const status = await minta(server, '/api/live-status');
      assert.strictEqual(status.status, 200, `/api/live-status balas ${status.status}`);
      assert.ok(Array.isArray(status.json),
        'janjinya SELALU array; objek error di sini akan bikin frontend gagal tanpa menyebut database');

      const cron = await minta(server, '/api/cron/update-live', { headers: { authorization: `Bearer ${RAHASIA}` } });
      assert.strictEqual(cron.status, 200, `cron balas ${cron.status}: ${cron.body.slice(0, 160)}`);
    } finally {
      process.env.DATABASE_URL = simpan;
    }
  });
  await uji('DATABASE_URL kosong: jalur database TETAP menolak dengan jelas', async () => {
    const simpan = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const r = await minta(server, '/api/me');
      assert.strictEqual(r.status, 500, `dapat ${r.status}`);
      assert.match(r.json.error || '', /DATABASE_URL/,
        'pesannya harus menyebut penyebabnya, bukan error samar');
    } finally {
      process.env.DATABASE_URL = simpan;
    }
  });
  await uji('jalur live & cron tidak menunggu database', () => {
    ['/api/live', '/api/live/events', '/api/live-status', '/api/cron/update-live', '/api/health']
      .forEach((jalur) => assert.strictEqual(butuhDatabase(jalur), false, `${jalur} seharusnya bebas database`));
  });
  await uji('jalur lain TETAP menunggu database', () => {
    ['/api/me', '/api/login', '/api/comments', '/api/livestream']
      .forEach((jalur) => assert.strictEqual(butuhDatabase(jalur), true, `${jalur} seharusnya butuh database`));
  });
  await uji('query string tidak mengecoh pemilahan', () => {
    assert.strictEqual(butuhDatabase('/api/live-status?x=1'), false);
    assert.strictEqual(butuhDatabase('/api/me?live=1'), true);
  });

  server.close();
  console.log(`\n${lulus} lulus, ${gagalTotal} gagal`);
  if (gagalTotal > 0) {
    console.log('\nRINCIAN GAGAL:');
    kegagalan.forEach((k) => console.log(`  - ${k}`));
    process.exitCode = 1;
  }
  /* Server sudah ditutup; paksa keluar supaya timer sisa tidak menahan. */
  setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
}

main().catch((error) => {
  console.error(`uji-endpoint.js bermasalah: ${error.stack}`);
  process.exitCode = 1;
});
