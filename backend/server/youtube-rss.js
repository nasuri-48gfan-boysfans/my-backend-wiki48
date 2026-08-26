'use strict';

/* =============================================================
   youtube-rss.js — jaminan kartu YouTube tidak pernah kosong
   -------------------------------------------------------------
   MASALAH: tabel youtube_videos hanya terisi oleh webhook WebSub.
   Bila langganan hub belum aktif / Railway baru restart / env
   belum lengkap, /api/youtube/videos mengembalikan kosong dan
   kartu "Upload terbaru" di beranda tampil hampa.

   SOLUSI: feed RSS resmi tiap channel
        https://www.youtube.com/feeds/videos.xml?channel_id=UC…
   selalu bisa diambil dari sisi server TANPA API key. Modul ini:
     1. Membandingkan isi DB dengan daftar channel yang seharusnya
        ada (env YOUTUBE_CHANNEL_IDS, atau daftar bawaan keluarga
        48G bila env kosong).
     2. Channel yang datanya kosong / kedaluwarsa diambil feed-nya
        secara paralel (timeout 8 dtk per channel).
     3. Hasilnya di-upsert ke youtube_videos (ON CONFLICT DO NOTHING
        — kebenaran tetap milik webhook) lalu digabung ke respons.
     4. Cache memori 15 menit per channel supaya kunjungan ramai
        tidak mendorang YouTube berkali-kali.
   ============================================================= */

const { parseAtomFeed } = require('./youtube-webhook');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TIMEOUT_MS = 8000;               // batas ambil satu feed
const CACHE_TTL_MS = 15 * 60 * 1000;   // umur cache memori per channel
const STALE_DB_MS = 12 * 3600 * 1000;  // DB dianggap basi bila terbaru lebih tua dari ini
const VIDEO_PER_CHANNEL = 3;           // cukup untuk "terbaru"

/* Daftar channel bawaan keluarga 48G — dipakai HANYA bila env
   YOUTUBE_CHANNEL_IDS tidak berisi ID valid. Sengaja sama dengan
   contoh di backend/.env.example. */
const KANAL_BAKU = [
  'UCfmrcEdes7yDtEISGPM1T-A', // AKB48
  'UCaIbbu5Xg3DpHsn_3Zw2m9w', // JKT48
  'UCadv-UfEyjjwOPcZHc2QvIQ', // JKT48 TV
  'UCG-5D9k_fL4FnMeNuraeAtA', // SKE48
  'UCnhrIe3jZNmqDEL_zSBXADQ', // NMB48
  'UCPQ0GEWwLaam1lTX9P-CgGA', // HKT48
  'UCIfuY0NRq1szr_6tzFy23NQ', // NGT48
  'UCa8GISK9_hsZ8aEJEL1u1Sg', // STU48
  'UClIsaGq7vBEW00ASqwQyzPw', // BNK48
  'UC0ca9IoigIsaRJL5nF3p3pw', // TSH48
  'UCajEDiZYhD_9NbFA3nqFYjw', // TPE48
  'UCxk6_F4aXUG6EkVvjFj0Ryg', // CGM48
  'UCVOBJSAK2wqQD9Lm1rE-TdQ', // KLP48
];

function daftarKanal(env = process.env) {
  const dariEnv = String(env.YOUTUBE_CHANNEL_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^UC[\w-]{22}$/.test(s));
  return dariEnv.length ? dariEnv : KANAL_BAKU;
}

function urlFeed(channelId) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/* Bentuk hasil disamakan dengan kolom youtube_videos supaya bisa
   langsung di-upsert maupun digabung ke respons route. */
async function ambilFeedChannel(channelId, logger = console) {
  const response = await fetch(urlFeed(channelId), {
    headers: { accept: 'application/atom+xml, application/xml, text/xml, */*', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`feed HTTP ${response.status}`);
  const xml = await response.text();
  const entri = parseAtomFeed(xml).slice(0, VIDEO_PER_CHANNEL);
  return entri.map((e) => ({
    video_id: e.videoId,
    channel_id: e.channelId || channelId,
    title: e.title,
    video_url: e.url,
    published_at: e.published,
    updated_at: e.updated || e.published,
  }));
}

function buatModulYoutubeRss({ pool, logger = console } = {}) {
  /* channelId → { fetchedAt, rows } */
  const cache = new Map();

  async function simpanKeDb(rows) {
    if (!pool || !rows.length) return;
    for (const r of rows) {
      try {
        await pool.query(
          `INSERT INTO youtube_videos (video_id, channel_id, title, video_url, published_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (video_id) DO NOTHING`,
          [r.video_id, r.channel_id, r.title, r.video_url, r.published_at, r.updated_at],
        );
      } catch (error) {
        /* Satu video gagal tersimpan tidak boleh memutus sisanya. */
        logger.warn(`[YT-RSS] upsert gagal ${r.video_id}: ${error.message}`);
      }
    }
  }

  /* Ambil feed beberapa channel secara bertahap: batch kecil dengan
     jeda pendek. Menembak 13 feed serentak membuat YouTube menjawab
     404/500 sesaat (throttle), itu sudah dibuktikan saat uji. */
  async function ambilBertahap(channelIds, { ukuranBatch = 4 } = {}) {
    const sukses = new Map();   // channelId → rows
    let tersisa = [...channelIds];

    for (let putaran = 0; putaran < 2 && tersisa.length; putaran += 1) {
      if (putaran > 0) await new Promise((r) => setTimeout(r, 1200)); // jeda antar putaran
      for (let i = 0; i < tersisa.length; i += ukuranBatch) {
        const batch = tersisa.slice(i, i + ukuranBatch);
        const hasil = await Promise.allSettled(batch.map((id) => ambilFeedChannel(id, logger)));
        hasil.forEach((h, j) => {
          if (h.status === 'fulfilled' && h.value.length) sukses.set(batch[j], h.value);
        });
        if (i + ukuranBatch < tersisa.length) await new Promise((r) => setTimeout(r, 350));
      }
      tersisa = tersisa.filter((id) => !sukses.has(id));
    }

    return { sukses, gagal: tersisa };
  }

  /* Lengkapi baris DB dengan hasil RSS utk channel yang kosong/basi.
     Tidak pernah melempar: kegagalan feed dibiarkan, DB tetap dibalas. */
  async function lengkapiDenganRss(rowsDb) {
    const kanal = daftarKanal();
    const terbaruPerKanal = new Map();
    for (const r of rowsDb) {
      const waktu = new Date(r.published_at || r.updated_at || 0).getTime();
      if (!terbaruPerKanal.has(r.channel_id) || waktu > terbaruPerKanal.get(r.channel_id)) {
        terbaruPerKanal.set(r.channel_id, waktu);
      }
    }

    const sekarang = Date.now();
    const perluDiambil = [];
    for (const channelId of kanal) {
      const entriCache = cache.get(channelId);
      if (entriCache && sekarang - entriCache.fetchedAt < CACHE_TTL_MS) continue;
      const waktuDb = terbaruPerKanal.get(channelId) || 0;
      if (sekarang - waktuDb < STALE_DB_MS) continue;   // DB masih segar
      perluDiambil.push(channelId);
    }

    if (perluDiambil.length) {
      logger.log(`[YT-RSS] menambah ${perluDiambil.length} channel dari feed resmi…`);
      const { sukses, gagal } = await ambilBertahap(perluDiambil);
      const tambahan = [];
      for (const [channelId, rows] of sukses) {
        cache.set(channelId, { fetchedAt: Date.now(), rows });
        tambahan.push(...rows);
      }
      for (const channelId of gagal) {
        /* Gagal → jangan diulang terus-menerus: tanam cache kosong
           singkat (setengah TTL) supaya ada jeda sopan bagi YouTube. */
        cache.set(channelId, { fetchedAt: Date.now() - CACHE_TTL_MS / 2, rows: [] });
        logger.warn(`[YT-RSS] ${channelId}: feed tetap gagal setelah dua putaran`);
      }
      await simpanKeDb(tambahan);
    }

    /* Gabungkan: baris cache RSS + baris DB, buang duplikat video_id. */
    const gabungan = new Map();
    for (const entri of cache.values()) {
      for (const r of entri.rows) gabungan.set(r.video_id, r);
    }
    for (const r of rowsDb) {
      if (!gabungan.has(r.video_id)) gabungan.set(r.video_id, r);
    }
    return [...gabungan.values()].sort((a, b) =>
      String(b.published_at || '').localeCompare(String(a.published_at || '')));
  }

  return { lengkapiDenganRss };
}

module.exports = { buatModulYoutubeRss, ambilFeedChannel, daftarKanal, KANAL_BAKU };
