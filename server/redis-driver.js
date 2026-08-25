'use strict';

/* =============================================================
   redis-driver.js — dua cara bicara dengan Redis, satu antarmuka
   -------------------------------------------------------------
   KENAPA DUA:
     - REST (Upstash)  : HTTP biasa, tanpa koneksi menetap. Ini yang
                         cocok untuk serverless: tiap invocation Vercel
                         hidup sebentar, dan membuka koneksi TCP baru
                         tiap request itu boros + sering kena batas
                         jumlah koneksi. REST TIDAK punya pub/sub.
     - TCP (node-redis): Redis biasa (localhost, Redis Cloud, Railway).
                         Punya pub/sub, cocok untuk proses yang hidup
                         terus seperti `npm run live`.

   Pemilihan lewat env, bukan lewat cabang di kode aplikasi:
     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  → REST
     REDIS_URL                                          → TCP
     tidak ada dua-duanya                               → null (mode memori)

   Antarmuka yang dijanjikan ke live-cache.js:
     kind, host, supportsPubsub, connect(), get(key), setEx(key, val, ttl),
     setNx(key, val, ttl), publish(channel, val), subscribe(channel, handler),
     close()
   Semua boleh throw; live-cache.js yang menelan dan melaporkannya.

   Token/kredensial TIDAK PERNAH masuk log — hanya host yang dicatat.
   ============================================================= */

function backoffMs(attempt) {
  return Math.min(1000 * 2 ** Math.min(attempt, 5), 30000);
}

function hostLabel(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch (error) {
    return '(URL tidak valid)';
  }
}

/* ---------------------------------------------------------------
   TCP — node-redis
   --------------------------------------------------------------- */
function createTcpDriver({ url, logger = console, createClientFn, onError }) {
  let commandClient = null;
  let subscriberClient = null;

  function newClient() {
    if (createClientFn) return createClientFn({ url });
    /* require di dalam fungsi supaya modul ini tetap bisa di-load (dan diuji)
       di lingkungan tanpa paket redis terpasang. */
    const { createClient } = require('redis');
    return createClient({ url, socket: { reconnectStrategy: (retries) => backoffMs(retries) } });
  }

  return {
    kind: 'tcp',
    host: hostLabel(url),
    supportsPubsub: true,

    async connect() {
      commandClient = newClient();
      subscriberClient = typeof commandClient.duplicate === 'function' ? commandClient.duplicate() : newClient();
      [commandClient, subscriberClient].forEach((client) => {
        if (typeof client.on !== 'function') return;
        /* node-redis memancarkan 'error' pada setiap percobaan reconnect.
           Wajib ada listener: tanpa ini error jadi unhandled dan mematikan
           proses hanya karena Redis sempat putus sedetik. */
        client.on('error', (error) => { if (onError) onError(error); });
      });
      await commandClient.connect();
      await subscriberClient.connect();
    },

    async get(key) {
      return commandClient.get(key);
    },

    async setEx(key, value, ttlSeconds) {
      await commandClient.set(key, value, { EX: ttlSeconds });
    },

    /* SET … NX EX — dipakai untuk "klaim sekali pakai" (dedupe notifikasi).
       Balasan Redis: 'OK' kalau kunci berhasil dibuat, null kalau sudah ada.
       Keatomikannya penting: dua cron yang tumpang tindih tidak boleh
       dua-duanya merasa jadi yang pertama. */
    async setNx(key, value, ttlSeconds) {
      const hasil = await commandClient.set(key, value, { NX: true, EX: ttlSeconds });
      return hasil === 'OK' || hasil === true;
    },

    async publish(channel, value) {
      await commandClient.publish(channel, value);
      return true;
    },

    async subscribe(channel, handler) {
      await subscriberClient.subscribe(channel, handler);
    },

    async close() {
      const clients = [commandClient, subscriberClient].filter(Boolean);
      commandClient = null;
      subscriberClient = null;
      await Promise.allSettled(clients.map((client) => (typeof client.quit === 'function' ? client.quit() : null)));
    },
  };
}

/* ---------------------------------------------------------------
   REST — Upstash
   --------------------------------------------------------------- */
function createRestDriver({ url, token, logger = console, fetchImpl, sdk }) {
  let client = null;      // instance @upstash/redis kalau paketnya ada
  let pakaiFetch = false;

  const ambilFetch = () => fetchImpl || (typeof fetch === 'function' ? fetch : null);

  /* Upstash REST menerima satu perintah sebagai array JSON di body:
       POST https://<host>  ["SET","kunci","nilai","EX","120"]
     Balasannya { result: … } atau { error: "…" }. */
  async function perintah(args) {
    const fn = ambilFetch();
    if (!fn) throw new Error('fetch tidak tersedia — perlu Node 18+ untuk Upstash REST.');
    const response = await fn(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args.map((a) => String(a))),
    });
    const teks = await response.text();
    let body = null;
    try {
      body = teks ? JSON.parse(teks) : null;
    } catch (error) {
      throw new Error(`balasan Upstash bukan JSON (HTTP ${response.status})`);
    }
    /* Pesan error Upstash tidak memuat token, tapi status HTTP-nya penting:
       401 = token salah, 404 = URL salah. Dibedakan supaya tidak salah tebak. */
    if (!response.ok) throw new Error(`Upstash HTTP ${response.status}${body?.error ? `: ${body.error}` : ''}`);
    if (body && body.error) throw new Error(`Upstash: ${body.error}`);
    return body ? body.result : null;
  }

  return {
    kind: 'rest',
    host: hostLabel(url),
    /* REST tidak punya pub/sub. Ini bukan kekurangan yang disembunyikan:
       live-cache.js melaporkannya lewat status() supaya API tidak menunggu
       event yang tidak akan pernah datang, dan frontend jatuh ke polling. */
    supportsPubsub: false,

    async connect() {
      if (!token) throw new Error('UPSTASH_REDIS_REST_TOKEN kosong.');
      const muat = sdk === undefined ? (() => { try { return require('@upstash/redis'); } catch (error) { return null; } })() : sdk;
      if (muat && muat.Redis) {
        /* automaticDeserialization WAJIB dimatikan. Secara bawaan SDK
           men-JSON.parse hasil get, padahal yang kita simpan sudah berupa
           string JSON — hasilnya snapshot ter-parse dua kali lalu error.
           Dengan false, get/set murni string dan perilakunya identik
           dengan driver TCP. */
        client = new muat.Redis({ url, token, automaticDeserialization: false });
      } else {
        pakaiFetch = true;
        logger.log('[REDIS] paket @upstash/redis tidak terpasang — memakai REST lewat fetch bawaan.');
      }
      /* REST tanpa koneksi menetap, jadi "connect" = satu ping untuk
         membuktikan URL dan token benar SEKARANG, bukan nanti saat
         cron jalan tengah malam. */
      const pong = client ? await client.ping() : await perintah(['PING']);
      if (String(pong).toUpperCase() !== 'PONG') throw new Error(`balasan PING tidak terduga: ${pong}`);
    },

    async get(key) {
      const nilai = client ? await client.get(key) : await perintah(['GET', key]);
      return nilai == null ? null : String(nilai);
    },

    async setEx(key, value, ttlSeconds) {
      if (client) await client.set(key, value, { ex: ttlSeconds });
      else await perintah(['SET', key, value, 'EX', ttlSeconds]);
    },

    /* Lihat catatan setNx di driver TCP. Upstash REST mengembalikan
       result: "OK" atau result: null, sama seperti Redis asli. */
    async setNx(key, value, ttlSeconds) {
      const hasil = client
        ? await client.set(key, value, { nx: true, ex: ttlSeconds })
        : await perintah(['SET', key, value, 'EX', ttlSeconds, 'NX']);
      return hasil === 'OK' || hasil === true;
    },

    async publish() {
      return false;   // tidak didukung REST; pemanggil sudah tahu dari supportsPubsub
    },

    async subscribe() {
      throw new Error('Upstash REST tidak mendukung pub/sub.');
    },

    async close() {
      client = null;
      pakaiFetch = false;
    },

    get transport() { return client ? 'sdk' : (pakaiFetch ? 'fetch' : null); },
  };
}

/* ---------------------------------------------------------------
   Pemilih driver
   --------------------------------------------------------------- */
function pickDriver({
  restUrl = process.env.UPSTASH_REDIS_REST_URL,
  restToken = process.env.UPSTASH_REDIS_REST_TOKEN,
  url = process.env.REDIS_URL,
  logger = console,
  createClientFn,
  fetchImpl,
  sdk,
  onError,
} = {}) {
  /* REST didahulukan: kalau dua-duanya diisi, yang jalan di serverless
     adalah yang tidak butuh koneksi menetap. */
  if (restUrl && restToken) return createRestDriver({ url: restUrl, token: restToken, logger, fetchImpl, sdk });
  if (restUrl && !restToken) logger.warn('[REDIS] UPSTASH_REDIS_REST_URL ada tapi UPSTASH_REDIS_REST_TOKEN kosong — Upstash dilewati.');
  if (url) return createTcpDriver({ url, logger, createClientFn, onError });
  return null;
}

module.exports = { pickDriver, createTcpDriver, createRestDriver, hostLabel, backoffMs };
