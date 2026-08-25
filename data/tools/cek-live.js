#!/usr/bin/env node
'use strict';

/* =============================================================
   cek-live.js — periksa kesiapan fitur live di mesin sendiri
   -------------------------------------------------------------
   PAKAI:
     node data/tools/cek-live.js              periksa saja
     node data/tools/cek-live.js --discord    + kirim 1 notifikasi uji

   Alat ini yang menjawab "kenapa live-nya kosong terus?" tanpa harus
   membaca log Vercel. Semua yang butuh jaringan ada di sini, terpisah
   dari uji otomatis, supaya `npm run uji` tetap bisa jalan offline.

   NILAI KREDENSIAL TIDAK PERNAH DICETAK — hanya panjang, host, dan
   hasil pengujiannya.
   ============================================================= */

const path = require('node:path');
const { loadEnv, periksaTokenUpstash } = require('../../server/env');
const { pickDriver } = require('../../server/redis-driver');
const { createLiveCache } = require('../../server/live-cache');
const { createDiscordNotifier, kumpulkanWebhook, labelWebhook } = require('../../server/discord-notify');
const { readStore, DEFAULT_FILE } = require('../live-tracker/store');

loadEnv();

const kirimDiscord = process.argv.includes('--discord');
const catatan = [];
let masalah = 0;

const OK = '  ok  ';
const NG = '  !!  ';
const NB = '  ..  ';

function ok(teks) { console.log(OK + teks); }
function ng(teks) { masalah += 1; console.log(NG + teks); catatan.push(teks); }
function nb(teks) { console.log(NB + teks); }

/* ---------- 1. Variabel lingkungan ---------- */
function cekEnv() {
  console.log('\n1. VARIABEL LINGKUNGAN');
  const url = process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || '';
  const redisUrl = process.env.REDIS_URL || '';

  if (url) {
    let host = '(tidak bisa dibaca)';
    try { host = new URL(url).hostname; } catch (error) { /* biarkan */ }
    ok(`UPSTASH_REDIS_REST_URL → ${host}`);
    if (!/^https:\/\//i.test(url)) ng('URL Upstash harus diawali https:// (REST API, bukan rediss://).');
  } else {
    nb('UPSTASH_REDIS_REST_URL kosong.');
  }

  if (token) {
    /* Bentuk token diperiksa oleh server/env.js — satu sumber, supaya pesan
       di sini tidak bisa berbeda dari peringatan saat server start. */
    const periksa = periksaTokenUpstash(token);
    if (periksa.ok) ok(`UPSTASH_REDIS_REST_TOKEN terisi (${token.length} karakter)`);
    else ng(`${periksa.alasan} ${periksa.saran}`);
  } else {
    nb('UPSTASH_REDIS_REST_TOKEN kosong.');
  }

  if (url && !token) ng('URL Upstash ada tapi token kosong — Upstash akan dilewati seluruhnya.');
  if (!url && !token && !redisUrl) {
    ng('Tidak ada Upstash maupun REDIS_URL. Snapshot hanya hidup di memori satu proses,'
      + ' jadi cron dan API tidak akan pernah melihat data yang sama.');
  }
  if (redisUrl) {
    const lokal = /localhost|127\.0\.0\.1/.test(redisUrl);
    nb(`REDIS_URL terisi${lokal ? ' (localhost — tidak bisa dijangkau dari Vercel)' : ''}.`);
    if (url && token) nb('Upstash dan REDIS_URL dua-duanya ada → Upstash yang dipakai.');
  }

  const hooks = kumpulkanWebhook();
  if (hooks.length === 0) {
    nb('DISCORD_WEBHOOK_URL kosong/tidak valid — notifikasi mati, fitur lain tetap jalan.');
  } else {
    ok(`${hooks.length} webhook Discord terbaca: ${hooks.map(labelWebhook).join(', ')}`);
  }

  if (!process.env.CRON_SECRET) {
    ng('CRON_SECRET kosong. Di produksi endpoint /api/cron/update-live akan MATI (401).'
      + ' Bikin dengan: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  } else if (process.env.CRON_SECRET.length < 24) {
    ng(`CRON_SECRET hanya ${process.env.CRON_SECRET.length} karakter — terlalu pendek, pakai 32 byte hex.`);
  } else {
    ok('CRON_SECRET terisi.');
  }

  const budget = Number(process.env.LIVE_CRON_BUDGET_MS || 45000);
  const cdn = Number(process.env.LIVE_CDN_S_MAXAGE || 20);
  if (cdn > 0 && cdn * 1000 > 120000) {
    ng(`LIVE_CDN_S_MAXAGE ${cdn}s lebih lama dari jarak cron 120s — snapshot baru tidak akan terlihat.`);
  }
  nb(`Anggaran cron ${budget} ms. Pastikan maxDuration di vercel.json lebih besar dari ini.`);
}

/* ---------- 2. Mapping platform ---------- */
function cekMapping() {
  console.log('\n2. MAPPING PLATFORM (members.json)');
  let store;
  try {
    store = readStore(DEFAULT_FILE);
  } catch (error) {
    ng(`members.json tidak bisa dibaca: ${error.message}`);
    return;
  }
  const anggota = store.members || [];
  const showroom = anggota.filter((m) => m.showroom_room_id || m.showroom_room_url_key).length;
  const idn = anggota.filter((m) => m.idn_username).length;
  const youtube = anggota.filter((m) => m.youtube_video_id || m.youtube_channel_id).length;
  const total = new Set(anggota.filter((m) => m.showroom_room_id || m.showroom_room_url_key || m.idn_username
    || m.youtube_video_id || m.youtube_channel_id).map((m) => m.id)).size;

  console.log(`       roster ${anggota.length} · showroom ${showroom} · idn ${idn} · youtube ${youtube}`);
  if (total === 0) {
    ng('TIDAK ADA satu pun mapping platform. Ini penyebab paling sering "live selalu kosong":'
      + ' poller tidak tahu room mana milik siapa. Isi dulu dengan'
      + ' `node data/tools/import-live-map.js <grup> --template` lalu `--write`.');
  } else {
    ok(`${total} member punya mapping (${Math.round((total / Math.max(anggota.length, 1)) * 100)}% roster).`);
  }
}

/* ---------- 3. Sambungan Redis ---------- */
async function cekRedis() {
  console.log('\n3. SAMBUNGAN REDIS');
  const driver = pickDriver({ logger: { log: nb, warn: nb, error: nb } });
  if (!driver) {
    nb('Tidak ada driver (mode memori). Lewati.');
    return null;
  }
  console.log(`       transport ${driver.kind.toUpperCase()} → ${driver.host}`);
  const cache = createLiveCache({ driver, logger: { log() {}, warn() {}, error() {} }, retry: false });
  const hasil = await cache.connect();
  if (!hasil.connected) {
    const status = cache.status();
    ng(`gagal tersambung: ${status.last_error}`);
    if (/401|unauthor/i.test(status.last_error || '')) ng('HTTP 401 = token salah. Salin ulang token REST-nya.');
    if (/404/.test(status.last_error || '')) ng('HTTP 404 = URL salah. Pastikan URL REST, bukan URL koneksi Redis.');
    if (/fetch failed|ENOTFOUND|EAI_AGAIN/i.test(status.last_error || '')) ng('Host tidak terjangkau — periksa jaringan/firewall.');
    await cache.close();
    return null;
  }
  ok('PING berhasil.');

  /* Tulis-baca sungguhan: PING lulus tidak menjamin izin tulis. */
  const uji = { checked_at: new Date().toISOString(), live: [], meta: { cek: true } };
  const tertulis = await cache.publish(uji);
  if (!tertulis) ng('PING lulus tapi tulis snapshot gagal — periksa izin/kuota database Upstash.');
  else ok('tulis snapshot berhasil.');

  const dibaca = await cache.getSnapshot();
  if (dibaca && dibaca.checked_at === uji.checked_at) ok('baca snapshot berhasil (isi cocok).');
  else ng('snapshot terbaca tidak sama dengan yang ditulis — curigai automaticDeserialization atau TTL.');

  const klaim1 = await cache.claimOnce('cek-live-probe', 60);
  const klaim2 = await cache.claimOnce('cek-live-probe-lain', 60);
  const klaim3 = await cache.claimOnce('cek-live-probe', 60);
  if (klaim1 && klaim2 && !klaim3) ok('dedupe SET NX EX bekerja (klaim kedua ditolak) — notifikasi tidak akan spam.');
  else ng(`dedupe TIDAK bekerja (${klaim1}/${klaim2}/${klaim3}). Notifikasi Discord berisiko berulang tiap siklus.`);

  if (!driver.supportsPubsub) nb('Transport ini tanpa pub/sub → SSE tidak instan, frontend memakai polling. Ini normal untuk Upstash.');
  return cache;
}

/* ---------- 4. Notifikasi Discord (opsional) ---------- */
async function cekDiscord(cache) {
  console.log('\n4. NOTIFIKASI DISCORD');
  if (!kirimDiscord) {
    nb('Dilewati. Tambahkan --discord untuk mengirim satu notifikasi uji sungguhan.');
    return;
  }
  const notifier = createDiscordNotifier({ cache, logger: { log: nb, warn: ng, error: ng } });
  if (!notifier.enabled) {
    ng('Tidak ada webhook yang valid, tidak ada yang dikirim.');
    return;
  }
  const hasil = await notifier.notify([{
    type: 'started',
    id: 'cek-live-probe',
    member_name: 'Uji Notifikasi',
    platform: 'showroom',
    title: 'Ini pesan uji dari cek-live.js — aman diabaikan.',
    live_url: 'https://www.showroom-live.com/',
    viewer_count: 0,
    /* since diberi cap waktu sekarang supaya penanda dedupe-nya unik dan
       perintah ini bisa dijalankan berkali-kali saat men-debug. */
    since: new Date().toISOString(),
    checked_at: new Date().toISOString(),
  }]);
  if (hasil.sent > 0) ok('notifikasi uji terkirim — cek channel Discord-mu.');
  else ng(`gagal mengirim (sent ${hasil.sent}, failed ${hasil.failed}): ${notifier.status().last_error || 'tanpa keterangan'}`);
}

async function main() {
  console.log('CEK KESIAPAN LIVE TRACKER');
  console.log(`berkas mapping: ${path.relative(process.cwd(), DEFAULT_FILE)}`);
  cekEnv();
  cekMapping();
  let cache = null;
  try {
    cache = await cekRedis();
    await cekDiscord(cache);
  } finally {
    if (cache) await cache.close();
  }

  console.log('\n----------------------------------------');
  if (masalah === 0) {
    console.log('SIAP. Tidak ada masalah yang terdeteksi.');
  } else {
    console.log(`${masalah} hal perlu dibereskan:`);
    catatan.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`cek-live.js bermasalah: ${error.stack}`);
  process.exitCode = 1;
});
