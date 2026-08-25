'use strict';

/* =============================================================
   live-cache.js — jembatan snapshot live antara worker dan API
   -------------------------------------------------------------
   Worker (cron atau proses terpisah) menulis snapshot ke Redis;
   setiap instance API membacanya. Redis dipakai karena serverless
   dan multi-instance tidak punya memori bersama: apa yang ditulis
   satu invocation tidak terlihat oleh invocation lain.

   Transport-nya diserahkan ke redis-driver.js (Upstash REST atau
   node-redis TCP). Modul ini memegang KEBIJAKANnya:

     - TIDAK PERNAH throw ke pemanggil. Redis mati = situs tetap
       buka, `/api/live` tetap 200, dan status() melaporkan apa
       adanya supaya frontend bisa jujur ke user (bukan diam-diam
       menampilkan "tidak ada yang live", yang artinya beda).
     - Tanpa konfigurasi Redis, jatuh ke mode 'memory': worker dan
       API dalam satu proses tetap jalan (dev), lintas proses tidak.
     - Gagal tersambung bukan akhir cerita: ada retry backoff, jadi
       Redis yang baru dinyalakan tersambung sendiri.
     - Snapshot terakhir yang berhasil dibaca disimpan di memori,
       jadi Redis yang putus di tengah jalan tidak langsung
       mengosongkan tampilan.
     - status() tidak pernah memuat kredensial, hanya host:port.
   ============================================================= */

const { pickDriver, hostLabel, backoffMs } = require('./redis-driver');

const LIVE_KEY = 'wiki48:live:current';
const LIVE_CHANNEL = 'wiki48:live:update';
/* Penanda dedupe notifikasi. Prefiks terpisah supaya mudah dilihat/dibuang
   di dashboard Upstash tanpa menyentuh snapshot. */
const CLAIM_PREFIX = 'wiki48:live:notified:';
const EMPTY_SNAPSHOT = { checked_at: null, live: [] };

function createLiveCache({
  url = process.env.REDIS_URL,
  restUrl = process.env.UPSTASH_REDIS_REST_URL,
  restToken = process.env.UPSTASH_REDIS_REST_TOKEN,
  logger = console,
  createClientFn,
  fetchImpl,
  sdk,
  driver: driverOverride,
  ttlSeconds = Number(process.env.LIVE_SNAPSHOT_TTL_SECONDS || 600),
  retry = true,
} = {}) {
  const localSubscribers = new Set();
  let memorySnapshot = { ...EMPTY_SNAPSHOT };
  let connected = false;
  let closed = false;
  let attempt = 0;
  let retryTimer = null;
  let lastError = null;
  let warnedMemory = false;
  let subscribedChannel = false;

  const catatError = (error) => {
    lastError = error.message;
    logger.error(`[REDIS] ${error.message}`);
  };

  const driver = driverOverride !== undefined
    ? driverOverride
    : pickDriver({ restUrl, restToken, url, logger, createClientFn, fetchImpl, sdk, onError: catatError });

  const enabled = Boolean(driver);
  const mode = () => (enabled ? 'redis' : 'memory');

  function notifyLocal(snapshot) {
    localSubscribers.forEach((handler) => {
      try {
        handler(snapshot);
      } catch (error) {
        logger.error(`[LIVE CACHE] subscriber gagal: ${error.message}`);
      }
    });
  }

  function terimaDariRedis(message) {
    try {
      const snapshot = JSON.parse(message);
      memorySnapshot = snapshot;
      notifyLocal(snapshot);
    } catch (error) {
      logger.warn(`[LIVE CACHE] pesan channel tidak valid: ${error.message}`);
    }
  }

  function scheduleRetry() {
    if (!retry || closed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect().catch(() => {});
    }, backoffMs(attempt));
    /* Timer tidak boleh menahan proses tetap hidup — penting untuk uji
       dan untuk shutdown yang bersih. */
    if (typeof retryTimer.unref === 'function') retryTimer.unref();
  }

  async function pasangSubscriber() {
    if (!driver || !driver.supportsPubsub || subscribedChannel || localSubscribers.size === 0) return;
    try {
      await driver.subscribe(LIVE_CHANNEL, terimaDariRedis);
      subscribedChannel = true;
    } catch (error) {
      catatError(new Error(`gagal subscribe ${LIVE_CHANNEL}: ${error.message}`));
    }
  }

  async function connect() {
    if (closed || connected) return { connected, mode: mode() };
    if (!enabled) {
      if (!warnedMemory) {
        warnedMemory = true;
        logger.warn('[LIVE] Redis belum dikonfigurasi (UPSTASH_REDIS_REST_URL/TOKEN atau REDIS_URL);'
          + ' snapshot hanya hidup di memori proses ini.');
      }
      return { connected: false, mode: 'memory' };
    }
    attempt += 1;
    try {
      await driver.connect();
      connected = true;
      attempt = 0;
      lastError = null;
      await pasangSubscriber();
      logger.log(`[REDIS] tersambung ${driver.kind.toUpperCase()} ke ${driver.host}`
        + ` · TTL snapshot ${ttlSeconds}s · pub/sub ${driver.supportsPubsub ? 'ada' : 'tidak ada (polling)'}`);
    } catch (error) {
      connected = false;
      lastError = error.message;
      logger.error(`[REDIS] gagal tersambung ke ${driver.host}: ${error.message} — memakai memori dulu, mencoba lagi.`);
      await Promise.resolve(driver.close?.()).catch(() => {});
      scheduleRetry();
    }
    return { connected, mode: mode() };
  }

  /* Nilai di Redis tersimpan sebagai STRING JSON. Parser ini toleran
     terhadap satu kecelakaan umum: nilai ter-stringify dua kali
     ('"{\"live\":…}"'). Bila tetap gagal, error MENCANTUMKAN KEY-nya —
     dulu hanya "gagal membaca snapshot" tanpa petunjuk apa pun, sehingga
     salah key antara dua deployment tidak ketahuan dari log. */
  function uraiSnapshot(value) {
    let teks = value;
    if (typeof teks === 'string' && teks.startsWith('"') && teks.endsWith('"')) {
      try { teks = JSON.parse(teks); } catch { /* bukan encode ganda */ }
    }
    const parsed = JSON.parse(teks);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.live)) {
      throw new Error('struktur snapshot tidak dikenali (field "live" hilang)');
    }
    return parsed;
  }

  async function getSnapshot() {
    if (!connected || !driver) return memorySnapshot;
    try {
      const value = await driver.get(LIVE_KEY);
      /* Kunci hilang (TTL habis) bukan error: berarti tidak ada worker yang
         menulis belakangan ini. Snapshot memori dikembalikan apa adanya dan
         `stale` di lapisan API yang memberi tahu user. */
      if (!value) return memorySnapshot;
      const parsed = uraiSnapshot(value);
      memorySnapshot = parsed;
      return parsed;
    } catch (error) {
      catatError(new Error(`gagal membaca snapshot ${LIVE_KEY}: ${error.message}`));
      return memorySnapshot;
    }
  }

  async function publish(snapshot) {
    memorySnapshot = snapshot;
    /* Pelanggan lokal selalu diberi tahu; penerima SSE membuang duplikat
       lewat checked_at, jadi aman kalau pesan yang sama juga datang lewat
       pub/sub Redis. */
    notifyLocal(snapshot);
    if (!connected || !driver) return false;
    try {
      const payload = JSON.stringify(snapshot);
      await driver.setEx(LIVE_KEY, payload, ttlSeconds);
      if (driver.supportsPubsub) await driver.publish(LIVE_CHANNEL, payload);
      return true;
    } catch (error) {
      catatError(new Error(`gagal menulis snapshot: ${error.message}`));
      return false;
    }
  }

  async function subscribe(handler) {
    localSubscribers.add(handler);
    if (connected) await pasangSubscriber();
    return () => localSubscribers.delete(handler);
  }

  /* claimOnce — "aku yang pertama, kan?" untuk penanda sekali pakai.
     Dipakai notifikasi Discord supaya satu siaran hanya dikabarkan sekali
     meski cron jalan tiap 2 menit dengan memori yang selalu kosong.

     Mengembalikan true = kamu yang pertama, silakan kerjakan.
                   false = orang lain sudah mengerjakannya, jangan ulangi.

     Kalau Redis TIDAK tersambung, jawabannya true. Itu keputusan sadar:
     tanpa Redis kita memang tidak bisa mengingat apa pun antar proses, dan
     lebih baik ada notifikasi (dengan risiko dobel saat dev satu proses)
     daripada fitur ini diam total tanpa alasan yang terlihat. Duplikat di
     dalam satu proses tetap dicegah oleh memori lokal `klaimLokal`. */
  const klaimLokal = new Map();   // kunci → kapan kedaluwarsa (ms)

  async function claimOnce(kunci, ttlSeconds = 21600) {
    const nama = `${CLAIM_PREFIX}${kunci}`;
    const sekarang = Date.now();
    /* Bersihkan yang kedaluwarsa dulu supaya Map tidak tumbuh selamanya
       pada proses yang hidup lama (`npm run live`). */
    klaimLokal.forEach((batas, k) => { if (batas <= sekarang) klaimLokal.delete(k); });
    if (klaimLokal.has(nama)) return false;
    klaimLokal.set(nama, sekarang + ttlSeconds * 1000);

    if (!connected || !driver || typeof driver.setNx !== 'function') return true;
    try {
      return await driver.setNx(nama, String(sekarang), ttlSeconds);
    } catch (error) {
      catatError(new Error(`gagal menandai klaim: ${error.message}`));
      /* Redis error ≠ sudah pernah dikerjakan. Kembalikan true supaya
         notifikasi tetap jalan; risikonya dobel, bukan hilang. */
      return true;
    }
  }

  async function close() {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    connected = false;
    subscribedChannel = false;
    if (driver) await Promise.resolve(driver.close?.()).catch(() => {});
  }

  /* adaData() — apakah RAW value di LIVE_KEY ADA (tidak NULL/kosong)?
     Tanpa parse, tanpa validasi: murni untuk diagnosa konektivitas
     /api/diag antara platform tulis (Railway) dan baca (Vercel). */
  async function adaData() {
    if (!connected || !driver) return false;
    try {
      const value = await driver.get(LIVE_KEY);
      return Boolean(value && String(value).length);
    } catch (error) {
      catatError(new Error(`gagal cek ${LIVE_KEY}: ${error.message}`));
      return false;
    }
  }

  function status() {
    return {
      mode: mode(),
      transport: driver ? driver.kind : null,
      pubsub: Boolean(driver && driver.supportsPubsub),
      connected,
      host: driver ? driver.host : null,
      /* Key persis yang dibaca endpoint — bandingkan dengan yang
         ditulis platform lain lewat /api/diag bila data terasa basi. */
      key: LIVE_KEY,
      ttl_seconds: ttlSeconds,
      last_error: lastError,
    };
  }

  return { connect, getSnapshot, publish, subscribe, claimOnce, adaData, close, status };
}

module.exports = { LIVE_KEY, LIVE_CHANNEL, CLAIM_PREFIX, EMPTY_SNAPSHOT, createLiveCache, backoffMs, hostLabel };
