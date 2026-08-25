'use strict';

/* =============================================================
   uji-cron.js — uji siklus cron end-to-end TANPA jaringan
   -------------------------------------------------------------
   PAKAI:  node data/live-tracker/uji-cron.js
   Keluar 0 kalau semua lulus, 1 kalau ada yang gagal.

   Yang dibuktikan di sini adalah janji-janji yang tidak bisa
   diuji per-modul, karena baru muncul saat semuanya digabung:

     1. Cron dijalankan berulang kali (proses baru tiap kali, memori
        kosong) TAPI satu siaran hanya menghasilkan SATU notifikasi.
        Ini inti masalahnya: tanpa seed dari Redis, tiap 2 menit
        semua orang terlihat "baru mulai live".
     2. Webhook yang gagal TIDAK menggagalkan penulisan snapshot ke
        Redis — snapshot tetap tersimpan utuh.
     3. Anggaran waktu habis di tengah jalan: snapshot APA ADANYA
        tetap dipublikasikan, ditandai truncated.
     4. Provider error tidak mengosongkan daftar live.
     5. Member berhenti live -> transisi 'ended', tanpa notifikasi.

   Semua provider dan Redis diganti tiruan; roster memakai berkas
   sementara supaya members.json asli tidak tersentuh.
   ============================================================= */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLiveWorker } = require('../../server/live-worker');
const { createLiveCache } = require('../../server/live-cache');
const { createDiscordNotifier } = require('../../server/discord-notify');

const HOOK = 'https://discord.com/api/webhooks/1111111111111111111/aaaaaaaaaaaaaaaaaaaa';

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

function logSenyap() {
  const baris = [];
  const catat = (...a) => baris.push(a.join(' '));
  return { baris, log: catat, warn: catat, error: catat };
}

/* Roster sementara: dua member Showroom, satu IDN. */
function berkasRoster() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wiki48-cron-')), 'members.json');
  fs.writeFileSync(file, JSON.stringify({
    updated_at: new Date().toISOString(),
    members: [
      { id: 'jkt48-a', member_name: 'Member A', group: 'jkt48', showroom_room_id: '111', showroom_room_url_key: 'a_room', is_live: false },
      { id: 'jkt48-b', member_name: 'Member B', group: 'jkt48', showroom_room_id: '222', showroom_room_url_key: 'b_room', is_live: false },
      { id: 'jkt48-c', member_name: 'Member C', group: 'jkt48', idn_username: 'member_c', is_live: false },
    ],
  }, null, 2));
  return file;
}

/* Redis tiruan yang BERTAHAN antar "invocation" — ini yang membuat uji ini
   berarti: tiap siklus memakai worker baru (memori kosong), tapi Redis-nya
   sama, persis seperti cron di Vercel. */
function redisPalsu() {
  const isi = new Map();
  return {
    isi,
    driver: {
      kind: 'rest',
      host: 'palsu.local',
      supportsPubsub: false,
      async connect() {},
      async get(key) { return isi.has(key) ? isi.get(key) : null; },
      async setEx(key, value) { isi.set(key, value); },
      async setNx(key, value) {
        if (isi.has(key)) return false;
        isi.set(key, value);
        return true;
      },
      async publish() { return false; },
      async close() {},
    },
  };
}

function providerPalsu({ showroomLive = [], idnLive = false, showroomError = null, idnDelay = 0 } = {}) {
  return {
    showroom: {
      async onlives() {
        if (showroomError) throw new Error(showroomError);
        return showroomLive.map((r) => ({
          room_id: r.room_id,
          room_url_key: r.url_key,
          room_name: r.title || 'Siaran',
          view_num: r.viewers ?? 100,
          image_square: 'https://example.test/avatar.jpg',
          started_at: r.started_at || null,
        }));
      },
    },
    idn: {
      async check() {
        if (idnDelay) await new Promise((r) => setTimeout(r, idnDelay));
        return idnLive
          ? { is_live: true, live_url: 'https://www.idn.app/member_c', title: 'Halo IDN' }
          : { is_live: false };
      },
    },
    youtube: null,
  };
}

function fetchPalsu(balas = () => ({ ok: true, status: 204 })) {
  const panggilan = [];
  const fn = async (url, opts) => {
    panggilan.push({ url, body: JSON.parse(opts.body) });
    const r = balas(panggilan.length) || { ok: true, status: 204 };
    return {
      ok: r.ok !== false && (r.status || 204) < 400,
      status: r.status || 204,
      async json() { return r.json || {}; },
      async text() { return r.text || ''; },
    };
  };
  fn.panggilan = panggilan;
  return fn;
}

/* Satu "invocation cron": worker BARU tiap kali (memori kosong), cache baru,
   tapi driver Redis yang sama. Inilah yang membedakan uji ini dari uji unit. */
async function invocationCron({ redis, file, providers, fetchFn, budgetMs = 0, logger }) {
  const cache = createLiveCache({ driver: redis.driver, logger, retry: false });
  await cache.connect();
  const notifier = createDiscordNotifier({ webhookUrls: [HOOK], fetchImpl: fetchFn, cache, logger });
  const worker = createLiveWorker({
    file, logger, cache, notifier, providers, persist: false, intervalMs: 60000,
  });
  const hasil = await worker.poll({ budgetMs });
  await cache.close();
  return hasil;
}

async function main() {
  console.log('UJI SIKLUS CRON END-TO-END (tanpa jaringan)\n');
  const file = berkasRoster();

  console.log('anti-spam lintas invocation');
  await uji('3 siklus cron berturut-turut = 1 notifikasi untuk siaran yang sama', async () => {
    const redis = redisPalsu();
    const fetchFn = fetchPalsu();
    const providers = () => providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }] });
    const logger = logSenyap();
    const r1 = await invocationCron({ redis, file, providers: providers(), fetchFn, logger });
    const r2 = await invocationCron({ redis, file, providers: providers(), fetchFn, logger });
    const r3 = await invocationCron({ redis, file, providers: providers(), fetchFn, logger });

    assert.strictEqual(r1.snapshot.live.length, 1, 'siklus 1 harus melihat 1 orang live');
    assert.strictEqual(r2.snapshot.live.length, 1, 'siklus 2 harus TETAP melihat 1 orang live');
    assert.strictEqual(r3.snapshot.live.length, 1, 'siklus 3 harus TETAP melihat 1 orang live');

    assert.strictEqual(r1.transitions.filter((t) => t.type === 'started').length, 1);
    assert.strictEqual(r2.transitions.filter((t) => t.type === 'started').length, 0,
      'siklus 2 tidak boleh menganggapnya baru mulai (seed gagal?)');
    assert.strictEqual(r3.transitions.filter((t) => t.type === 'started').length, 0);

    assert.strictEqual(fetchFn.panggilan.length, 1,
      `Discord harus dipanggil tepat 1x, nyatanya ${fetchFn.panggilan.length}x`);
    assert.strictEqual(r2.snapshot.meta.seeded, 1, 'siklus 2 harus memulihkan 1 entri dari Redis');
  });

  await uji('durasi siaran tidak ter-reset tiap invocation', async () => {
    const redis = redisPalsu();
    const fetchFn = fetchPalsu();
    const logger = logSenyap();
    const providers = () => providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }] });
    const r1 = await invocationCron({ redis, file, providers: providers(), fetchFn, logger });
    await new Promise((r) => setTimeout(r, 15));
    const r2 = await invocationCron({ redis, file, providers: providers(), fetchFn, logger });
    assert.strictEqual(r2.snapshot.live[0].since, r1.snapshot.live[0].since,
      'since harus dipertahankan, kalau tidak durasi siaran selalu 0 menit');
  });

  await uji('member kedua yang menyusul live dapat notifikasi sendiri', async () => {
    const redis = redisPalsu();
    const fetchFn = fetchPalsu();
    const logger = logSenyap();
    await invocationCron({
      redis, file, fetchFn, logger,
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }] }),
    });
    const r2 = await invocationCron({
      redis, file, fetchFn, logger,
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }, { room_id: '222', url_key: 'b_room' }] }),
    });
    assert.strictEqual(r2.snapshot.live.length, 2);
    const mulai = r2.transitions.filter((t) => t.type === 'started');
    assert.strictEqual(mulai.length, 1, 'hanya member B yang baru');
    assert.strictEqual(mulai[0].id, 'jkt48-b');
    assert.strictEqual(fetchFn.panggilan.length, 2);
    assert.strictEqual(fetchFn.panggilan[1].body.embeds[0].title, '🔴 [jkt48] Member B lagi LIVE!');
  });

  await uji('member berhenti live: transisi ended, tanpa notifikasi tambahan', async () => {
    const redis = redisPalsu();
    const fetchFn = fetchPalsu();
    const logger = logSenyap();
    await invocationCron({
      redis, file, fetchFn, logger,
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }] }),
    });
    const r2 = await invocationCron({ redis, file, fetchFn, logger, providers: providerPalsu({ showroomLive: [] }) });
    assert.strictEqual(r2.snapshot.live.length, 0);
    assert.strictEqual(r2.transitions.filter((t) => t.type === 'ended').length, 1);
    assert.strictEqual(fetchFn.panggilan.length, 1, 'ended tidak boleh memicu webhook');
  });

  console.log('\nwebhook gagal tidak merusak caching');
  await uji('Discord balas 500: snapshot TETAP tersimpan di Redis', async () => {
    const redis = redisPalsu();
    const fetchFn = fetchPalsu(() => ({ ok: false, status: 500, text: 'Internal Error' }));
    const logger = logSenyap();
    const hasil = await invocationCron({
      redis, file, fetchFn, logger,
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }] }),
    });
    assert.strictEqual(hasil.snapshot.live.length, 1);
    assert.strictEqual(hasil.discord.failed, 1, 'kegagalan harus dilaporkan apa adanya');
    const tersimpan = JSON.parse(redis.isi.get('wiki48:live:current'));
    assert.strictEqual(tersimpan.live.length, 1, 'snapshot harus tetap masuk Redis meski webhook gagal');
  });

  await uji('fetch melempar (jaringan Discord mati): poll tetap sukses', async () => {
    const redis = redisPalsu();
    const logger = logSenyap();
    const hasil = await invocationCron({
      redis, file, logger,
      fetchFn: async () => { throw new Error('ENOTFOUND discord.com'); },
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }] }),
    });
    assert.ok(redis.isi.has('wiki48:live:current'), 'snapshot harus ada di Redis');
    assert.strictEqual(hasil.discord.sent, 0);
  });

  await uji('notifier rusak total (melempar sinkron): poll tetap selesai', async () => {
    const redis = redisPalsu();
    const logger = logSenyap();
    const cache = createLiveCache({ driver: redis.driver, logger, retry: false });
    await cache.connect();
    const worker = createLiveWorker({
      file, logger, cache, persist: false, intervalMs: 60000,
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }] }),
      notifier: { notify() { throw new Error('bug di notifier'); } },
    });
    const hasil = await worker.poll();
    assert.strictEqual(hasil.snapshot.live.length, 1);
    assert.ok(redis.isi.has('wiki48:live:current'));
    await cache.close();
  });

  console.log('\nketahanan lain');
  await uji('anggaran waktu habis: snapshot tetap terbit, ditandai truncated', async () => {
    const redis = redisPalsu();
    const logger = logSenyap();
    const hasil = await invocationCron({
      redis, file, logger, fetchFn: fetchPalsu(),
      /* IDN dibuat lambat + anggaran sangat kecil, jadi loop harus menyerah. */
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }], idnLive: true, idnDelay: 50 }),
      budgetMs: 30,
    });
    assert.strictEqual(hasil.snapshot.meta.truncated, true, 'harus ditandai terpotong');
    assert.ok(redis.isi.has('wiki48:live:current'), 'snapshot wajib tetap terbit');
    assert.strictEqual(hasil.snapshot.live.length, 1, 'Showroom yang sudah didapat tidak boleh hilang');
  });

  await uji('Showroom error: daftar live sebelumnya ditahan, tidak dikosongkan', async () => {
    const redis = redisPalsu();
    const fetchFn = fetchPalsu();
    const logger = logSenyap();
    await invocationCron({
      redis, file, fetchFn, logger,
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }] }),
    });
    const r2 = await invocationCron({
      redis, file, fetchFn, logger,
      providers: providerPalsu({ showroomError: 'ETIMEDOUT' }),
    });
    assert.strictEqual(r2.snapshot.live.length, 1,
      'satu error jaringan tidak boleh mengosongkan banner live');
    assert.strictEqual(r2.snapshot.meta.providers.showroom.ok, false, 'kegagalan harus jujur dilaporkan');
  });

  await uji('viewer count & avatar dari onlives ikut ke snapshot dan embed', async () => {
    const redis = redisPalsu();
    const fetchFn = fetchPalsu();
    const logger = logSenyap();
    const hasil = await invocationCron({
      redis, file, fetchFn, logger,
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room', viewers: 4321 }] }),
    });
    assert.strictEqual(hasil.snapshot.live[0].viewer_count, 4321);
    assert.strictEqual(hasil.snapshot.live[0].viewerCount, 4321, 'alias camelCase harus ada');
    const field = fetchFn.panggilan[0].body.embeds[0].fields.find((f) => f.name === 'Penonton');
    assert.ok(field && /4\.321|4,321/.test(field.value), `field penonton: ${field && field.value}`);
  });

  await uji('tanpa Redis (mode memori): poll jalan, notifikasi jalan', async () => {
    const logger = logSenyap();
    const fetchFn = fetchPalsu();
    const cache = createLiveCache({ driver: null, logger, retry: false });
    await cache.connect();
    const worker = createLiveWorker({
      file, logger, cache, persist: false, intervalMs: 60000,
      notifier: createDiscordNotifier({ webhookUrls: [HOOK], fetchImpl: fetchFn, cache, logger }),
      providers: providerPalsu({ showroomLive: [{ room_id: '111', url_key: 'a_room' }] }),
    });
    const hasil = await worker.poll();
    assert.strictEqual(hasil.snapshot.live.length, 1);
    assert.strictEqual(fetchFn.panggilan.length, 1);
    await cache.close();
  });

  console.log(`\n${lulus} lulus, ${gagalTotal} gagal`);
  if (gagalTotal > 0) {
    console.log('\nRINCIAN GAGAL:');
    kegagalan.forEach((k) => console.log(`  - ${k}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`uji-cron.js bermasalah: ${error.stack}`);
  process.exitCode = 1;
});
