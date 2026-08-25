'use strict';

/* =============================================================
   uji-discord.js — uji notifikasi Discord TANPA jaringan
   -------------------------------------------------------------
   PAKAI:  node data/live-tracker/uji-discord.js
   Keluar 0 kalau semua lulus, 1 kalau ada yang gagal.

   Semua request HTTP diganti fungsi palsu, jadi tidak ada webhook
   sungguhan yang terpanggil. Yang diuji adalah hal-hal yang paling
   mudah salah dan paling mahal kalau lolos ke produksi:
     - spam: satu siaran hanya dikabarkan SEKALI meski cron berulang
     - webhook gagal TIDAK menggagalkan penulisan snapshot ke Redis
     - isi embed sesuai permintaan (judul, warna, penonton, tautan)
     - URL webhook tidak pernah muncul di log
   ============================================================= */

const assert = require('node:assert');
const {
  createDiscordNotifier, kumpulkanWebhook, labelWebhook, buatEmbed, jamMulai, WARNA,
} = require('../../server/discord-notify');
const { createLiveCache } = require('../../server/live-cache');

const HOOK_A = 'https://discord.com/api/webhooks/1111111111111111111/aaaaaaaaaaaaaaaaaaaaaaaa';
const HOOK_B = 'https://discord.com/api/webhooks/2222222222222222222/bbbbbbbbbbbbbbbbbbbbbbbb';

let lulus = 0;
let gagalTotal = 0;
const kegagalan = [];

function uji(nama, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { lulus += 1; console.log(`  ok   ${nama}`); })
    .catch((error) => {
      gagalTotal += 1;
      kegagalan.push(`${nama}: ${error.message}`);
      console.log(`  GAGAL ${nama}\n        ${error.message}`);
    });
}

/* Pencatat log yang bisa diperiksa: dipakai untuk membuktikan tidak ada
   kredensial yang bocor ke stdout. */
function logPalsu() {
  const baris = [];
  const catat = (...args) => baris.push(args.join(' '));
  return { baris, log: catat, warn: catat, error: catat };
}

/* fetch palsu. `balas` menentukan jawaban per panggilan. */
function fetchPalsu(balas = () => ({ ok: true, status: 204 })) {
  const panggilan = [];
  const fn = async (url, opts) => {
    const body = JSON.parse(opts.body);
    panggilan.push({ url, body });
    const r = balas(panggilan.length, url) || { ok: true, status: 204 };
    return {
      ok: r.ok !== false && r.status < 400,
      status: r.status || 204,
      async json() { return r.json || {}; },
      async text() { return r.text || ''; },
    };
  };
  fn.panggilan = panggilan;
  return fn;
}

/* Redis palsu di tingkat driver: cukup untuk membuktikan SET NX EX benar
   menolak klaim kedua. */
function driverPalsu() {
  const isi = new Map();
  return {
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
    _isi: isi,
  };
}

function transisi(lebih = {}) {
  return {
    type: 'started',
    id: 'jkt48-fiony',
    member_name: 'Fiony Alveria Tantri',
    platform: 'showroom',
    title: 'Nyanyi dulu ya',
    live_url: 'https://www.showroom-live.com/jkt48_fiony',
    avatar_url: 'https://example.test/fiony.jpg',
    viewer_count: 1234,
    started_at: '2026-08-24T12:00:00.000Z',
    since: '2026-08-24T12:00:00.000Z',
    checked_at: '2026-08-24T12:01:00.000Z',
    ...lebih,
  };
}

async function main() {
  console.log('UJI NOTIFIKASI DISCORD (tanpa jaringan)\n');

  console.log('kumpulkanWebhook');
  await uji('satu variabel berisi beberapa URL dipisah koma', () => {
    const hasil = kumpulkanWebhook({ DISCORD_WEBHOOK_URL: `${HOOK_A}, ${HOOK_B}` });
    assert.deepStrictEqual(hasil, [HOOK_A, HOOK_B]);
  });
  await uji('varian bernomor ikut terbaca', () => {
    const hasil = kumpulkanWebhook({ DISCORD_WEBHOOK_URL: HOOK_A, DISCORD_WEBHOOK_URL_2: HOOK_B });
    assert.deepStrictEqual(hasil, [HOOK_A, HOOK_B]);
  });
  await uji('duplikat dibuang, URL non-Discord ditolak', () => {
    const hasil = kumpulkanWebhook({ DISCORD_WEBHOOK_URL: `${HOOK_A} ${HOOK_A} https://contoh.test/hook` });
    assert.deepStrictEqual(hasil, [HOOK_A]);
  });
  await uji('label log tidak memuat token webhook', () => {
    const label = labelWebhook(HOOK_A);
    assert.ok(!label.includes('aaaa'), 'token ikut di label');
    assert.match(label, /webhook …1111/);
  });

  console.log('\nbuatEmbed');
  await uji('judul sesuai format [PLATFORM] Nama sedang LIVE!', () => {
    const embed = buatEmbed(transisi());
    assert.strictEqual(embed.title, '[SHOWROOM] Fiony Alveria Tantri sedang LIVE!');
  });
  await uji('warna khas platform', () => {
    assert.strictEqual(buatEmbed(transisi()).color, WARNA.showroom);
    assert.strictEqual(buatEmbed(transisi({ platform: 'idn' })).color, WARNA.idn);
  });
  await uji('penonton, jam mulai, dan platform jadi fields', () => {
    const embed = buatEmbed(transisi());
    const nama = embed.fields.map((f) => f.name);
    assert.deepStrictEqual(nama, ['Penonton', 'Mulai', 'Platform']);
    assert.match(embed.fields[0].value, /1\.234|1,234/);
  });
  await uji('avatar jadi thumbnail, tautan live jadi url embed', () => {
    const embed = buatEmbed(transisi());
    assert.strictEqual(embed.thumbnail.url, 'https://example.test/fiony.jpg');
    assert.strictEqual(embed.url, 'https://www.showroom-live.com/jkt48_fiony');
  });
  await uji('viewer_count null tidak memunculkan field Penonton kosong', () => {
    const embed = buatEmbed(transisi({ viewer_count: null }));
    assert.deepStrictEqual(embed.fields.map((f) => f.name), ['Mulai', 'Platform']);
  });
  await uji('avatar non-http ditolak (cegah embed rusak)', () => {
    const embed = buatEmbed(transisi({ avatar_url: 'javascript:alert(1)' }));
    assert.strictEqual(embed.thumbnail, undefined);
  });
  await uji('judul siaran sangat panjang dipotong, bukan ditolak Discord', () => {
    const embed = buatEmbed(transisi({ title: 'a'.repeat(5000) }));
    assert.ok(embed.description.length <= 4096, `panjang ${embed.description.length}`);
  });
  await uji('tanpa started_at, jam diambil dari since dan ditandai perkiraan', () => {
    const hasil = jamMulai({ since: '2026-08-24T12:00:00.000Z' });
    assert.strictEqual(hasil.perkiraan, true);
  });

  console.log('\nnotify — penyaringan');
  await uji('hanya transisi started yang dikabarkan', async () => {
    const fetchFn = fetchPalsu();
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, logger: logPalsu() });
    const hasil = await n.notify([transisi(), { type: 'ended', id: 'x', platform: 'idn' }]);
    assert.strictEqual(hasil.sent, 1);
    assert.strictEqual(fetchFn.panggilan[0].body.embeds.length, 1);
  });
  await uji('tanpa webhook: tidak error, tidak mengirim', async () => {
    const n = createDiscordNotifier({ webhookUrls: [], logger: logPalsu() });
    const hasil = await n.notify([transisi()]);
    assert.deepStrictEqual(hasil, { sent: 0, skipped: 1, failed: 0 });
  });
  await uji('daftar transisi kosong tidak memanggil fetch', async () => {
    const fetchFn = fetchPalsu();
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, logger: logPalsu() });
    await n.notify([]);
    assert.strictEqual(fetchFn.panggilan.length, 0);
  });
  await uji('lebih dari 10 siaran dipecah beberapa pesan (batas Discord)', async () => {
    const fetchFn = fetchPalsu();
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, logger: logPalsu() });
    const banyak = Array.from({ length: 23 }, (_, i) => transisi({ id: `m${i}` }));
    const hasil = await n.notify(banyak);
    assert.strictEqual(hasil.sent, 23);
    assert.strictEqual(fetchFn.panggilan.length, 3);
    fetchFn.panggilan.forEach((p) => assert.ok(p.body.embeds.length <= 10));
  });
  await uji('tidak memicu mention dari judul siaran', async () => {
    const fetchFn = fetchPalsu();
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, logger: logPalsu() });
    await n.notify([transisi({ title: '@everyone halo' })]);
    assert.deepStrictEqual(fetchFn.panggilan[0].body.allowed_mentions, { parse: [] });
  });

  console.log('\nnotify — anti-spam lintas invocation cron');
  await uji('siaran yang sama TIDAK dikabarkan dua kali (dedupe Redis)', async () => {
    const driver = driverPalsu();
    const cache = createLiveCache({ driver, logger: logPalsu(), retry: false });
    await cache.connect();
    const fetchFn = fetchPalsu();
    /* Dua notifier berbeda = dua proses cron berbeda, memori masing-masing
       kosong. Yang menahan duplikat hanya penanda di Redis. */
    const buat = () => createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, cache, logger: logPalsu() });
    const pertama = await buat().notify([transisi()]);
    const kedua = await buat().notify([transisi()]);
    const ketiga = await buat().notify([transisi()]);
    assert.strictEqual(pertama.sent, 1, 'yang pertama harus terkirim');
    assert.strictEqual(kedua.sent, 0, 'yang kedua harus dilewati');
    assert.strictEqual(ketiga.sent, 0, 'yang ketiga harus dilewati');
    assert.strictEqual(fetchFn.panggilan.length, 1, `fetch dipanggil ${fetchFn.panggilan.length}x`);
    await cache.close();
  });
  await uji('siaran BARU (since berbeda) dikabarkan lagi', async () => {
    const driver = driverPalsu();
    const cache = createLiveCache({ driver, logger: logPalsu(), retry: false });
    await cache.connect();
    const fetchFn = fetchPalsu();
    const buat = () => createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, cache, logger: logPalsu() });
    await buat().notify([transisi({ since: '2026-08-24T12:00:00.000Z' })]);
    const lagi = await buat().notify([transisi({ since: '2026-08-24T20:00:00.000Z' })]);
    assert.strictEqual(lagi.sent, 1, 'siaran kedua di hari yang sama harus dikabarkan');
    await cache.close();
  });
  await uji('dalam satu proses pun duplikat ditahan', async () => {
    const fetchFn = fetchPalsu();
    const cache = createLiveCache({ driver: null, logger: logPalsu(), retry: false });
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, cache, logger: logPalsu() });
    await n.notify([transisi()]);
    const kedua = await n.notify([transisi()]);
    assert.strictEqual(kedua.sent, 0);
  });
  await uji('Redis error saat klaim: tetap mengirim, tidak melempar', async () => {
    const driver = driverPalsu();
    driver.setNx = async () => { throw new Error('Upstash HTTP 500'); };
    const cache = createLiveCache({ driver, logger: logPalsu(), retry: false });
    await cache.connect();
    const fetchFn = fetchPalsu();
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, cache, logger: logPalsu() });
    const hasil = await n.notify([transisi()]);
    assert.strictEqual(hasil.sent, 1, 'error Redis tidak boleh membungkam notifikasi');
    await cache.close();
  });

  console.log('\nnotify — ketahanan kegagalan');
  await uji('webhook balas HTTP 404: notify tidak melempar', async () => {
    const fetchFn = fetchPalsu(() => ({ ok: false, status: 404, text: 'Unknown Webhook' }));
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, logger: logPalsu() });
    const hasil = await n.notify([transisi()]);
    assert.deepStrictEqual(hasil, { sent: 0, skipped: 0, failed: 1 });
  });
  await uji('rate limit 429 dilaporkan, tidak melempar', async () => {
    const fetchFn = fetchPalsu(() => ({ ok: false, status: 429, json: { retry_after: 3 } }));
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, logger: logPalsu() });
    const hasil = await n.notify([transisi()]);
    assert.strictEqual(hasil.failed, 1);
    assert.match(n.status().last_error, /rate limit/);
  });
  await uji('fetch melempar (jaringan mati): ditelan', async () => {
    const n = createDiscordNotifier({
      webhookUrls: [HOOK_A],
      fetchImpl: async () => { throw new Error('ENOTFOUND discord.com'); },
      logger: logPalsu(),
    });
    const hasil = await n.notify([transisi()]);
    assert.strictEqual(hasil.failed, 1);
  });
  await uji('satu dari dua webhook mati: yang hidup tetap dapat kabar', async () => {
    const fetchFn = fetchPalsu((_, url) => (url === HOOK_A ? { ok: false, status: 404 } : { ok: true, status: 204 }));
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A, HOOK_B], fetchImpl: fetchFn, logger: logPalsu() });
    const hasil = await n.notify([transisi()]);
    assert.strictEqual(hasil.sent, 1, 'harus tetap terhitung terkirim');
    assert.strictEqual(fetchFn.panggilan.length, 2, 'kedua webhook harus dicoba');
  });
  await uji('URL webhook tidak pernah muncul di log, bahkan saat gagal', async () => {
    const logger = logPalsu();
    const fetchFn = fetchPalsu(() => ({ ok: false, status: 401, text: 'Unauthorized' }));
    const n = createDiscordNotifier({ webhookUrls: [HOOK_A], fetchImpl: fetchFn, logger });
    await n.notify([transisi()]);
    const semua = logger.baris.join('\n');
    assert.ok(semua.length > 0, 'seharusnya ada log peringatan');
    assert.ok(!semua.includes('aaaaaaaa'), `token bocor ke log:\n${semua}`);
    assert.ok(!semua.includes('/api/webhooks/'), `URL webhook bocor ke log:\n${semua}`);
  });
  await uji('timeout membatalkan request, bukan menggantung', async () => {
    const n = createDiscordNotifier({
      webhookUrls: [HOOK_A],
      timeoutMs: 20,
      logger: logPalsu(),
      fetchImpl: (url, opts) => new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    });
    const hasil = await n.notify([transisi()]);
    assert.strictEqual(hasil.failed, 1);
  });

  console.log(`\n${lulus} lulus, ${gagalTotal} gagal`);
  if (gagalTotal > 0) {
    console.log('\nRINCIAN GAGAL:');
    kegagalan.forEach((k) => console.log(`  - ${k}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`uji-discord.js bermasalah: ${error.stack}`);
  process.exitCode = 1;
});
