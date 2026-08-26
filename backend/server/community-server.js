const crypto = require('node:crypto');
/* loadEnv() menggantikan dotenv.config(): dotenv hanya membaca `.env`,
   sementara kredensial Upstash biasanya ada di `.env.local`. Lihat env.js. */require('./env').loadEnv();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const session = require('cookie-session');
const { Pool } = require('pg');
const { createLiveCache } = require('./live-cache');
const { createLiveWorker } = require('./live-worker');
const { getOfficialSchedule, grupDidukung } = require('./schedule-proxy');
/* Daftar jalur bebas-database dipakai bersama dengan vercel-handler.js;
   satu sumber, supaya keduanya tidak bisa berbeda diam-diam. */
const { butuhDatabase } = require('./rute-db');

const app = express();
/* Railway/Render menyuntikkan PORT sendiri; fallback 5000 untuk lokal
   tanpa .env. Nama konstanta mengikuti standar env-nya (PORT). */
const PORT = Number(process.env.PORT || 5000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined,
});
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const isProduction = process.env.NODE_ENV === 'production';
/* Worker hanya boleh jalan in-process saat dev/host sendiri. Di serverless
   fungsi mati begitu response selesai, jadi loop 60 detik tidak akan pernah
   sampai siklus kedua — di sana API cuma pembaca Redis. Paksa dengan
   LIVE_WORKER_INPROCESS=true/false kalau perlu. */
const liveWorkerInProcess = process.env.LIVE_WORKER_INPROCESS
  ? process.env.LIVE_WORKER_INPROCESS === 'true'
  : !isServerless;
/* SSE menahan koneksi terbuka; di serverless itu tagihan durasi tanpa guna
   (maxDuration 30s lalu terputus). Frontend otomatis jatuh ke polling. */
const liveSseEnabled = process.env.LIVE_SSE ? process.env.LIVE_SSE !== 'off' : !isServerless;
const liveCache = createLiveCache({ logger: console });
const liveWorker = liveWorkerInProcess ? createLiveWorker({ logger: console, cache: liveCache }) : null;
const liveClients = new Set();
const connectSources = ["'self'"];
if (!isProduction) { connectSources.push('http://localhost:*', 'http://127.0.0.1:*'); }
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' },
});
const liveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan live tracker.' },
});
const scheduleLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan jadwal. Coba lagi sebentar.' },
});
const communityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan komunitas.' },
});
const accessRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak pengajuan dari jaringan ini. Coba lagi nanti.' },
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login admin.' },
});

/* Dijadikan FUNGSI, bukan const, karena dua alasan:
   (1) bisa diuji — nilainya tidak lagi terkunci pada saat modul dimuat,
       jadi uji bisa mencabut DATABASE_URL lalu memeriksa perilakunya;
   (2) di serverless, environment kadang baru lengkap setelah modul dimuat. */
function masalahKonfigurasi() {
  if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    return 'SESSION_SECRET production belum diatur atau panjangnya kurang dari 32 karakter.';
  }
  if (!process.env.DATABASE_URL) return 'DATABASE_URL belum diatur di environment deployment.';
  return null;
}
app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : 0);

/* =============================================================
    CORS — WAJIB paling atas, sebelum route & middleware lain.

    Aturan:
    - FRONTEND_URL diset (URL Vercel; boleh banyak, pisahkan
      dengan koma di .env / dashboard Railway) → mode whitelist:
      hanya origin terdaftar yang mendapat header CORS.
    - FRONTEND_URL TIDAK diset → fallback terbuka (semantik '*').
    ============================================================= */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',              // frontend dev
  'http://localhost:5000',
];
const envOrigins = String(process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const legacyOrigin = process.env.FRONTEND_ORIGIN ? [process.env.FRONTEND_ORIGIN] : [];
/* Fallback terbuka (semantik "*") HANYA bila tidak ada satu pun origin
   produksi yang dikonfigurasi. Literal '*' tidak dipakai karena respons
   memakai credentials: cookie — browser menolak '*' + credentials;
   refleksi origin request adalah bentuk aman yang setara. */
const corsTerbuka = envOrigins.length === 0 && legacyOrigin.length === 0;
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...legacyOrigin, ...envOrigins])];

app.use(cors({
  origin(origin, callback) {
    /* Request tanpa Origin header = curl / UptimeRobot / health check → izinkan. */
    if (!origin) return callback(null, true);
    /* FRONTEND_URL tidak diset → fallback terbuka (semantik "*"). */
    if (corsTerbuka) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    /* Mode dev: server statis lokal di port bebas & file:// tetap boleh. */
    if (!isProduction && (origin === 'null' || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin))) {
      return callback(null, true);
    }
    /* false tanpa error → respons tetap 200 tapi tanpa header CORS,
       jadi browser yang menolak, bukan server. */
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

/* =============================================================
    HEALTH CHECK — super ringan untuk UptimeRobot/Railway.
    Ditembak tiap 5 menit supaya instance tidak spin-down, dan
    jadi penanda utama Railway bahwa aplikasi hidup (anti-502).
    Sengaja dipasang SEBELUM guard database/rate limiter supaya
    selalu 200 walau DATABASE_URL belum diatur.
    ============================================================= */
app.get('/health', (request, response) => {
  response.status(200).json({ status: 'ok', message: 'Server is healthy' });
});

/* =============================================================
    GET /api/diag — diagnosa sinkronisasi Redis antar platform.
    Satu endpoint yang sama dilayani di FRONTEND Vercel (lewat
    serverless api/index.js) dan BACKEND Railway (index.js), karena
    keduanya menjalankan Express app yang sama.

    Kontrak respons (wajib):
      redis_url_host  : host dari UPSTASH_REDIS_REST_URL env
      redis_key_used  : key Redis yang dipakai READ/WRITE
      data_exists     : true bila GET ke key itu mengembalikan isi
      timestamp       : waktu endpoint dipanggil

    Bandingkan hasil dari domain Vercel vs Railway: host & key harus
    IDENTIK, dan data_exists harus true — kalau tidak, di situlah
    masalahnya. Tidak ada kredensial yang ikut tercetak.
    ============================================================= */
app.get('/api/diag', async (request, response) => {
  response.setHeader('cache-control', 'no-store, max-age=0');
  const redisStatus = liveCache.status();
  let dataExists = false;
  try {
    await liveCache.connect();
    dataExists = await liveCache.adaData();
  } catch { /* tetap jawab dengan false */ }
  return response.status(200).json({
    redis_url_host: redisStatus.host,
    redis_key_used: redisStatus.key,
    data_exists: dataExists,
    timestamp: new Date().toISOString(),
    detail: {
      ok: true,
      node: process.version,
      uptime_s: Math.round(process.uptime()),
      env: process.env.NODE_ENV || 'development',
      port: PORT,
      tracker: {
        worker: liveWorkerInProcess ? 'in-process' : 'external',
        sse: liveSseEnabled,
        redis_mode: redisStatus.mode,
        redis_transport: redisStatus.transport,
        redis_connected: redisStatus.connected,
        cron_secret_set: Boolean(process.env.CRON_SECRET),
      },
      integrasi: {
        database_url_set: Boolean(process.env.DATABASE_URL),
        frontend_url_set: Boolean(process.env.FRONTEND_URL),
        supabase: (() => { try { return require('./supabase').statusSupabase(); } catch { return null; } })(),
        /* Uji DATABASE_URL sungguhan: host + hasil SELECT 1 + kode error.
           Password TIDAK pernah disertakan. Ini penyelamat saat lupa kenapa
           login/jadwal/youtube mati serentak — selama ini hanya tebak-tebakan
           dari luar (500 "Database tidak dapat diakses" tidak menjelaskan
           apakah password salah, host salah, atau SSL ditolak). */
        database: await (async () => {
          const url = process.env.DATABASE_URL || '';
          let host = null, port = null, sslMode = null;
          try {
            const u = new URL(url);
            host = u.hostname;
            port = u.port || (u.protocol === 'postgresql:' ? '5432' : null);
            sslMode = u.searchParams.get('sslmode');
          } catch { host = 'DATABASE_URL tidak bisa diurai'; }
          const mulai = Date.now();
          try {
            const client = new pool.Client({
              connectionString: url,
              ssl: process.env.DATABASE_SSL === 'true'
                ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
                : undefined,
              connectionTimeoutMillis: 8000,
            });
            await client.connect();
            const r = await client.query('SELECT count(*)::int AS fans FROM fans');
            await client.end();
            return { ok: true, host, port, sslMode, durasi_ms: Date.now() - mulai, fans: r.rows[0].fans };
          } catch (error) {
            return {
              ok: false,
              host,
              port,
              sslMode,
              durasi_ms: Date.now() - mulai,
              kode: error.code || null,
              pesan: String(error.message || '').slice(0, 160),
            };
          }
        })(),
      },
    },
  });
});

/* -------------------------------------------------------------
   YOUTUBE WEBHOOK (WebSub/PubSubHubbub) — upload video baru
   -------------------------------------------------------------
   Route /webhook/youtube menerima GET (challenge verifikasi hub)
   dan POST (notifikasi Atom). Didaftarkan di sini, sebelum
   express.json, karena body XML dibaca mentah oleh route-level
   parser sendiri (express.text). Detail lengkap ada di modulnya.
   Timer perpanjangan langganan ikut dinyalakan — semuanya berjalan
   di proses Railway, tidak ada ketergantungan komputer lokal.
   ------------------------------------------------------------- */
const youtubeWebhook = require('./youtube-webhook').buatModul({ app, pool, logger: console });
youtubeWebhook.jadwalkanPembaruan();

/* Fallback RSS — menjamin kartu YouTube tetap terisi walau webhook
   belum mengirim apa pun. Detail ada di youtube-rss.js. */
const youtubeRss = require('./youtube-rss').buatModulYoutubeRss({ pool, logger: console });

/* GET /api/youtube/videos — daftar video terbaru hasil webhook
   untuk kartu frontend. Publik + limiter ringan.
   Bila DB kosong/basi untuk suatu channel, data dilengkapi langsung
   dari feed RSS resmi channel tersebut (ter-cache di memori). */
app.get('/api/youtube/videos', scheduleLimiter, async (request, response) => {
  const limit = Math.min(Math.max(Number(request.query.limit) || 24, 1), 50);
  const channelId = String(request.query.channel_id || '').trim();
  const params = [];
  let where = '';
  if (/^UC[\w-]{22}$/.test(channelId)) {
    params.push(channelId);
    where = `WHERE channel_id = $${params.length}`;
  }
  params.push(limit);
  try {
    const { rows } = await pool.query(
      `SELECT video_id, channel_id, title, video_url, published_at, updated_at
         FROM youtube_videos ${where}
        ORDER BY COALESCE(published_at, fetched_at) DESC
        LIMIT $${params.length}`,
      params,
    );
    rows.forEach((r) => {
      r.video_url = r.video_url || `https://www.youtube.com/watch?v=${r.video_id}`;
    });
    let items = rows;
    try {
      items = await youtubeRss.lengkapiDenganRss(rows);
      items.forEach((r) => {
        r.video_url = r.video_url || `https://www.youtube.com/watch?v=${r.video_id}`;
      });
      /* Hormati limit setelah penggabungan supaya payload terkendali. */
      items = items.slice(0, Math.max(limit, 26));
    } catch (error) {
      console.warn(`[YT-RSS] fallback dilewati: ${error.message}`);
    }
    response.setHeader('cache-control', 'public, max-age=0, s-maxage=120');
    return response.json({ items });
  } catch (error) {
    console.error(`[YT-VIDEOS] ${error.message}`);
    return response.status(500).json({ error: 'Gagal membaca video YouTube.' });
  }
});

/* GET /api/youtube/resolve-channels?key=…&handles=@JKT48,@KLP48
   Alat bantu sekali pakai: menerjemahkan handle/username menjadi
   Channel ID memakai YouTube Data API (butuh YOUTUBE_API_KEY).
   ID yang sudah berawalan UC dilewati apa adanya. */
app.get('/api/youtube/resolve-channels', async (request, response) => {
  if (!cronSah(request)) return response.status(401).json({ error: 'CRON_SECRET tidak cocok.' });
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return response.status(503).json({ error: 'YOUTUBE_API_KEY belum diatur.' });
  const handles = String(request.query.handles || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!handles.length) return response.status(400).json({ error: 'Param handles kosong. Contoh: ?key=…&handles=@JKT48,user/SKE48' });

  const hasil = [];
  for (const h of handles) {
    const bersih = h.replace(/^https?:\/\/(www\.)?youtube\.com\//i, '').replace(/^@/, '').replace(/^user\//i, '');
    if (/^UC[\w-]{22}$/.test(bersih)) { hasil.push({ input: h, channel_id: bersih }); continue; }
    try {
      const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(bersih)}&key=${key}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const j = await r.json().catch(() => null);
      const id = j && j.items && j.items[0] && j.items[0].id;
      /* forHandle kadang gagal utk username legacy → coba forUsername. */
      if (!id) {
        const u = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(bersih)}&key=${key}`;
        const r2 = await fetch(u, { signal: AbortSignal.timeout(10000) });
        const j2 = await r2.json().catch(() => null);
        hasil.push({ input: h, channel_id: (j2 && j2.items && j2.items[0] && j2.items[0].id) || null });
      } else {
        hasil.push({ input: h, channel_id: id });
      }
    } catch (error) {
      hasil.push({ input: h, channel_id: null, error: error.message });
    }
  }
  response.setHeader('cache-control', 'no-store');
  return response.json({ items: hasil });
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: connectSources,
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      workerSrc: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '3mb' }));
app.use((request, response, next) => {
  /* Penjaga ini HANYA untuk jalur yang benar-benar butuh database.

     Sebelumnya berlaku untuk semua request, dan akibatnya serius: deploy
     tanpa DATABASE_URL membuat /api/live, /api/live-status, dan
     /api/cron/update-live ikut mati dengan 500 — padahal ketiganya tidak
     menyentuh Postgres sama sekali. Itu membatalkan seluruh pemisahan di
     vercel-handler.js, dan yang paling menyesatkan: /api/live-status
     berjanji SELALU mengembalikan array, tapi malah mengembalikan objek
     error, sehingga frontend gagal dengan pesan yang tidak menyebut
     database sedikit pun.

     Ditemukan saat menjalankan server sungguhan tanpa DATABASE_URL —
     tidak terlihat di uji sebelumnya karena uji itu selalu mengisi
     DATABASE_URL palsu. */
  const masalah = masalahKonfigurasi();
  if (masalah && butuhDatabase(request.originalUrl || request.url)) {
    return response.status(500).json({ error: masalah });
  }
  next();
});
app.use(session({
  name: 'wiki48_session',
  keys: [process.env.SESSION_SECRET || 'development-only-session-secret'],
  httpOnly: true,
  /* sameSite 'none' di produksi: frontend boleh memanggil API lintas
     domain (Vercel → Railway). Dengan 'strict', browser modern MENOLAK
     cookie dari respons lintas situs — akibatnya login tampak sukses
     tapi sesi tidak pernah tersimpan, pengguna dilempar balik ke
     halaman login terus-menerus. 'none' wajib berpasangan dengan
     secure:true (https) — keduanya aktif bersama di produksi.
     Di dev (http lokal) dipakai 'lax' agar cookie tetap bekerja. */
  sameSite: isProduction ? 'none' : 'lax',
  secure: isProduction,
  maxAge: 1000 * 60 * 60 * 24 * 30,
}));
/* Static file hosting DINONAKTIFKAN: frontend terpisah ke folder ../frontend
   dan dideploy di Vercel. Di lokal, jalankan frontend dengan:
     cd frontend && npx serve . -l 3000 */
/* -------------------------------------------------------------
   LIVE TRACKER — API di sini hanya PEMBACA snapshot.
   Sumbernya Redis, bukan event in-process: worker bisa hidup di host
   lain (npm run live), dan kalau kita hanya mendengarkan
   liveWorker.events, instance API yang tidak memegang worker tidak
   akan pernah mengirim update apa pun ke SSE.
   ------------------------------------------------------------- */
const LIVE_STALE_MS = Number(process.env.LIVE_STALE_MS || 0) || 0;

function snapshotAge(snapshot) {
  if (!snapshot || !snapshot.checked_at) return null;
  const waktu = Date.parse(snapshot.checked_at);
  return Number.isFinite(waktu) ? Math.max(0, Date.now() - waktu) : null;
}

/* Batas "kedaluwarsa" mengikuti interval worker (3× siklus) supaya tidak
   perlu disetel ulang setiap kali intervalnya diubah. */
function batasStale(snapshot) {
  if (LIVE_STALE_MS > 0) return LIVE_STALE_MS;
  const interval = Number(snapshot?.meta?.interval_ms) || Number(process.env.LIVE_TRACKER_INTERVAL_MS) || 60000;
  return interval * 3;
}

function livePayload(snapshot) {
  const bersih = snapshot && Array.isArray(snapshot.live) ? snapshot : { checked_at: null, live: [] };
  const age = snapshotAge(bersih);
  const stale = age === null || age > batasStale(bersih);
  return {
    ...bersih,
    age_ms: age,
    stale,
    tracker: {
      worker: liveWorkerInProcess ? 'in-process' : 'external',
      sse: liveSseEnabled,
      redis: liveCache.status(),
      /* Snapshot tanpa checked_at berarti belum ada worker yang pernah
         menulis — beda dengan "sudah dicek, tidak ada yang live". */
      has_snapshot: Boolean(bersih.checked_at),
    },
  };
}

function sendLiveEvent(response, snapshot) {
  response.write(`event: live:update\ndata: ${JSON.stringify(livePayload(snapshot))}\n\n`);
}

/* CACHE — DINONAKTIFKAN SEPENUHNYA.
   Dulu ada edge cache CDN (s-maxage/stale-while-revalidate) untuk
   menjaga kuota Upstash, tetapi itu membuat respons live bisa basi
   sampai 60 detik dan membingungkan diagnosa antar platform.
   Sekarang SELURUH respons dinamis wajib no-store. */
function setCacheLive(response) {
  response.setHeader('cache-control', 'no-store, max-age=0');
}

let siaranTerakhir = null;
function broadcastLive(snapshot) {
  /* Snapshot yang sama bisa datang dua kali (pelanggan lokal + pub/sub
     Redis saat worker satu proses dengan API). Buang duplikatnya di sini,
     satu-satunya tempat yang tahu apa yang sudah terkirim. */
  const tanda = `${snapshot?.checked_at || ''}|${(snapshot?.live || []).length}`;
  if (tanda === siaranTerakhir) return;
  siaranTerakhir = tanda;
  liveClients.forEach((response) => {
    try {
      sendLiveEvent(response, snapshot);
    } catch (error) {
      liveClients.delete(response);
    }
  });
}

let liveSiap = null;
function siapkanLive() {
  liveSiap ||= (async () => {
    await liveCache.connect();
    await liveCache.subscribe(broadcastLive);
    if (liveWorker) {
      liveWorker.start().catch((error) => console.error(`[LIVE WORKER] ${error.message}`));
    }
  })().catch((error) => {
    liveSiap = null;
    console.error(`[LIVE] gagal menyiapkan cache: ${error.message}`);
  });
  return liveSiap;
}

async function ensureSchema() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fans (
      id BIGSERIAL PRIMARY KEY,
      public_code VARCHAR(32) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
      name VARCHAR(80) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      profile_picture TEXT,
      oshi_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE fans ADD COLUMN IF NOT EXISTS public_code VARCHAR(32)");
  await pool.query("ALTER TABLE fans ADD COLUMN IF NOT EXISTS profile_picture TEXT");
  await pool.query("ALTER TABLE fans ADD COLUMN IF NOT EXISTS oshi_reasons JSONB NOT NULL DEFAULT '{}'::jsonb");
  /* Kolom yang ditambahkan lewat ALTER tidak mewarisi DEFAULT dari
     bentuk CREATE TABLE — pastikan default-nya terpasang eksplisit,
     kalau tidak INSERT baru menghasilkan NULL dan registrasi 500. */
  await pool.query("ALTER TABLE fans ALTER COLUMN public_code SET DEFAULT encode(gen_random_bytes(12), 'hex')");
  await pool.query("UPDATE fans SET public_code = encode(gen_random_bytes(12), 'hex') WHERE public_code IS NULL");
  await pool.query("ALTER TABLE fans ALTER COLUMN public_code SET NOT NULL");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS fans_public_code_idx ON fans (public_code)");
  /* ---------- BIODATA & SOSIAL ----------
     birth_date   : tanggal lahir fans (opsional, tampil di profil publik)
     oshi_members : daftar id member oshi (maks 3, divalidasi di route) —
                    disimpan di server supaya profil publik bisa menampilkan
                    oshi pemiliknya, bukan hanya di browser sendiri.
     friendships  : pertemanan antar fans (permintaan → terima → teman). */
  await pool.query('ALTER TABLE fans ADD COLUMN IF NOT EXISTS birth_date DATE');
  await pool.query("ALTER TABLE fans ADD COLUMN IF NOT EXISTS oshi_members JSONB NOT NULL DEFAULT '[]'::jsonb");
  /* Biodata tambahan — semua opsional, diubah kapan saja dari profil. */
  await pool.query('ALTER TABLE fans ADD COLUMN IF NOT EXISTS bio VARCHAR(280)');
  await pool.query('ALTER TABLE fans ADD COLUMN IF NOT EXISTS kota VARCHAR(80)');
  await pool.query('ALTER TABLE fans ADD COLUMN IF NOT EXISTS grup_favorit VARCHAR(80)');
  /* Desain avatar bawaan: { e: emoji, g: nama gradasi } — dirender
     client-side sehingga tajam di ukuran apa pun tanpa menyimpan gambar. */
  await pool.query("ALTER TABLE fans ADD COLUMN IF NOT EXISTS avatar_desain JSONB");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id BIGSERIAL PRIMARY KEY,
      requester_id BIGINT NOT NULL REFERENCES fans(id) ON DELETE CASCADE,
      addressee_id BIGINT NOT NULL REFERENCES fans(id) ON DELETE CASCADE,
      status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (requester_id, addressee_id)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS friendships_requester_status_idx ON friendships (requester_id, status)');
  await pool.query('CREATE INDEX IF NOT EXISTS friendships_addressee_status_idx ON friendships (addressee_id, status)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_questions (
      id BIGSERIAL PRIMARY KEY,
      country_code VARCHAR(8) NOT NULL,
      topic VARCHAR(80) NOT NULL,
      prompt VARCHAR(240) NOT NULL,
      source VARCHAR(10) NOT NULL CHECK (source IN ('bot', 'fan')),
      author_id BIGINT REFERENCES fans(id) ON DELETE SET NULL,
      question_day DATE NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS community_questions_country_day_idx ON community_questions (country_code, question_day DESC)`);
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS community_questions_bot_day_idx ON community_questions (country_code, question_day) WHERE source = 'bot'");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_requests (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(255) NOT NULL,
      country_code VARCHAR(8) NOT NULL,
      access_level VARCHAR(20) NOT NULL CHECK (access_level IN ('reader', 'contributor', 'editor')),
      reason VARCHAR(500) NOT NULL,
      experience VARCHAR(500),
      agreed_rules BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      fan_id BIGINT REFERENCES fans(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS access_requests_status_created_idx ON access_requests (status, created_at DESC)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wiki_admins (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH) {
    await pool.query('INSERT INTO wiki_admins (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash', [cleanEmail(process.env.ADMIN_EMAIL), process.env.ADMIN_PASSWORD_HASH]);
  }

  /* ---------- YouTube WebSub (upload video baru per channel) ----------
     Migrasi aman: CREATE TABLE IF NOT EXISTS — tabel existing lain
     tidak disentuh sama sekali. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_videos (
      video_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT,
      video_url TEXT,
      published_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS youtube_videos_channel_published_idx ON youtube_videos (channel_id, published_at DESC)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_subscriptions (
      channel_id TEXT PRIMARY KEY,
      leased_until TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function publicFan(fan) {
  return {
    id: fan.public_code,
    name: fan.name,
    email: fan.email,
    profilePicture: fan.profile_picture || '',
    avatarDesain: fan.avatar_desain && typeof fan.avatar_desain === 'object' ? fan.avatar_desain : null,
    oshiReasons: fan.oshi_reasons || {},
    oshiMembers: Array.isArray(fan.oshi_members) ? fan.oshi_members : [],
    birthDate: fan.birth_date ? String(fan.birth_date).slice(0, 10) : '',
    bio: fan.bio || '',
    kota: fan.kota || '',
    grupFavorit: fan.grup_favorit || '',
    joinedAt: fan.created_at,
  };
}

/* Bentuk publik untuk direktori/profil fans — TANPA email (privasi). */
function fanPublik(fan) {
  return {
    code: fan.public_code,
    name: fan.name,
    photo: fan.profile_picture || '',
    avatarDesain: fan.avatar_desain && typeof fan.avatar_desain === 'object' ? fan.avatar_desain : null,
    oshiMembers: Array.isArray(fan.oshi_members) ? fan.oshi_members : [],
    bio: fan.bio || '',
    kota: fan.kota || '',
    grupFavorit: fan.grup_favorit || '',
    joinedAt: fan.created_at,
  };
}

/* Tanggal lahir opsional: terima 'YYYY-MM-DD' valid, tolak sisanya. */
function parseTanggalLahir(nilai) {
  const s = String(nilai || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  const tahun = Number(s.slice(0, 4));
  const sekarang = new Date();
  if (tahun < 1900 || t > sekarang) return null;
  return s;
}

function requireAuth(request, response, next) {
  if (!request.session.fanId) return response.status(401).json({ error: 'Belum login.' });
  next();
}

function requireReviewToken(request, response, next) {
  const expected = process.env.ACCESS_REVIEW_TOKEN;
  const received = String(request.get('x-access-review-token') || '');
  const expectedBytes = Buffer.from(expected || '', 'utf8');
  const receivedBytes = Buffer.from(received, 'utf8');
  if (!expected || receivedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(receivedBytes, expectedBytes)) {
    return response.status(401).json({ error: 'Token review tidak valid.' });
  }
  next();
}

function requireAdmin(request, response, next) {
  if (!request.session.adminId) return response.status(401).json({ error: 'Login admin diperlukan.' });
  next();
}

const COMMUNITY_COUNTRIES = [
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', groups: ['JKT48'] },
  { code: 'JP', name: 'Jepang', flag: '🇯🇵', groups: ['AKB48', 'SKE48', 'NMB48', 'HKT48', 'NGT48', 'STU48'] },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', groups: ['BNK48', 'CGM48'] },
  { code: 'CN', name: 'Tiongkok', flag: '🇨🇳', groups: ['AKB48 Team SH'] },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼', groups: ['TPE48'] },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', groups: ['KLP48'] },
];

const BOT_QUESTION_TEMPLATES = [
  { topic: 'Musik', prompt: 'Lagu 48 Group apa yang paling menggambarkan suasana harimu?' },
  { topic: 'Member', prompt: 'Member dari negara ini siapa yang ingin kamu rekomendasikan kepada fan baru?' },
  { topic: 'Teater', prompt: 'Hal apa dari theater atau live performance yang paling ingin kamu rasakan langsung?' },
  { topic: 'Fan Story', prompt: 'Momen kecil sebagai fan 48 Group apa yang masih kamu ingat sampai hari ini?' },
];

function questionView(question) {
  return { id: question.id, country: question.country_code, topic: question.topic, prompt: question.prompt, source: question.source, author: question.author_name || (question.source === 'bot' ? 'WIKI48 Bot' : 'Fan WIKI48'), createdAt: question.created_at, day: question.question_day };
}

async function ensureBotQuestions() {
  const day = new Date().toISOString().slice(0, 10);
  for (const country of COMMUNITY_COUNTRIES) {
    const existing = await pool.query("SELECT id FROM community_questions WHERE country_code = $1 AND source = 'bot' AND question_day = $2 LIMIT 1", [country.code, day]);
    if (!existing.rows.length) {
      const template = BOT_QUESTION_TEMPLATES[(new Date(`${day}T00:00:00Z`).getUTCDate() + country.code.charCodeAt(0)) % BOT_QUESTION_TEMPLATES.length];
      await pool.query("INSERT INTO community_questions (country_code, topic, prompt, source, question_day) VALUES ($1, $2, $3, 'bot', $4) ON CONFLICT (country_code, question_day) WHERE source = 'bot' DO NOTHING", [country.code, template.topic, template.prompt, day]);
    }
  }
}

app.post('/api/auth/register', authLimiter, async (request, response) => {
  const name = String(request.body.name || '').trim();
  const email = cleanEmail(request.body.email);
  const password = String(request.body.password || '');
  const birthDate = parseTanggalLahir(request.body.birthDate);
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 4 || password.length > 72) {
    return response.status(400).json({ error: 'Nama, email, dan password minimal 4 karakter wajib diisi.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    /* public_code dibuat di sini secara eksplisit: jangan bergantung pada
       DEFAULT kolom — tabel lama hasil migrasi tidak selalu memilikinya. */
    const kodePublik = crypto.randomBytes(12).toString('hex');
    const result = await pool.query(
      'INSERT INTO fans (public_code, name, email, password_hash, birth_date) VALUES ($1, $2, $3, $4, $5) RETURNING id, public_code, name, email, profile_picture, oshi_reasons, oshi_members, birth_date, created_at',
      [kodePublik, name, email, passwordHash, birthDate],
    );
    const fan = result.rows[0];
    request.session.fanId = Number(fan.id);
    return response.status(201).json({ user: publicFan(fan) });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Email sudah terdaftar.' });
    console.error(error);
    return response.status(500).json({ error: 'Gagal membuat akun.' });
  }
});

app.post('/api/auth/login', authLimiter, async (request, response) => {
  const email = cleanEmail(request.body.email);
  const password = String(request.body.password || '');
  if (!email || password.length > 72) return response.status(401).json({ error: 'Email atau password salah.' });
  try {
    const result = await pool.query('SELECT * FROM fans WHERE email = $1', [email]);
    const fan = result.rows[0];
    if (!fan || !(await bcrypt.compare(password, fan.password_hash))) {
      return response.status(401).json({ error: 'Email atau password salah.' });
    }
    request.session.fanId = Number(fan.id);
    return response.json({ user: publicFan(fan) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Database tidak dapat diakses.' });
  }
});

app.post('/api/auth/logout', (request, response) => {
  request.session = null;
  response.status(204).end();
});

app.post('/api/admin/login', adminLoginLimiter, async (request, response) => {
  const email = cleanEmail(request.body.email);
  const password = String(request.body.password || '');
  try {
    const result = await pool.query('SELECT id, email, password_hash FROM wiki_admins WHERE email = $1', [email]);
    const admin = result.rows[0];
    if (!admin || password.length > 72 || !(await bcrypt.compare(password, admin.password_hash))) return response.status(401).json({ error: 'Email atau password admin salah.' });
    request.session.adminId = admin.id;
    return response.json({ admin: { id: admin.id, email: admin.email } });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Login admin tidak tersedia.' });
  }
});

app.post('/api/admin/logout', requireAdmin, (request, response) => {
  request.session = null;
  response.status(204).end();
});

app.post('/api/access-requests', accessRequestLimiter, async (request, response) => {
  const name = String(request.body.name || '').trim();
  const email = cleanEmail(request.body.email);
  const country = String(request.body.country || '').trim().toUpperCase();
  const accessLevel = String(request.body.accessLevel || '').trim().toLowerCase();
  const reason = String(request.body.reason || '').trim();
  const experience = String(request.body.experience || '').trim();
  const agreedRules = request.body.agreedRules === true;
  const countries = ['ID', 'JP', 'TH', 'CN', 'TW', 'MY', 'OTHER'];
  const accessLevels = ['reader', 'contributor', 'editor'];
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !countries.includes(country) || !accessLevels.includes(accessLevel) || reason.length < 20 || reason.length > 500 || experience.length > 500 || !agreedRules) {
    return response.status(400).json({ error: 'Lengkapi data dengan benar dan setujui aturan komunitas.' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO access_requests (name, email, country_code, access_level, reason, experience, agreed_rules, fan_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, status, created_at
    `, [name, email, country, accessLevel, reason, experience || null, agreedRules, request.session.fanId || null]);
    return response.status(201).json({ request: result.rows[0] });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Pengajuan belum bisa disimpan.' });
  }
});

app.get('/api/admin/access-requests', requireAdmin, async (request, response) => {
  const status = String(request.query.status || 'pending');
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return response.status(400).json({ error: 'Status review tidak valid.' });
  try {
    const result = await pool.query(`
      SELECT id, name, email, country_code, access_level, reason, experience, status, created_at, reviewed_at
      FROM access_requests
      ${status === 'all' ? '' : 'WHERE status = $1'}
      ORDER BY created_at DESC
      LIMIT 100
    `, status === 'all' ? [] : [status]);
    return response.json({ requests: result.rows });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengambil pengajuan.' });
  }
});

app.patch('/api/admin/access-requests/:id', requireAdmin, async (request, response) => {
  const status = String(request.body.status || '').trim().toLowerCase();
  if (!['pending', 'approved', 'rejected'].includes(status)) return response.status(400).json({ error: 'Status review tidak valid.' });
  try {
    const result = await pool.query('UPDATE access_requests SET status = $1, reviewed_at = CASE WHEN $1 = \'pending\' THEN NULL ELSE NOW() END WHERE id = $2 RETURNING id, status, reviewed_at', [status, request.params.id]);
    if (!result.rows[0]) return response.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    return response.json({ request: result.rows[0] });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal memperbarui status pengajuan.' });
  }
});

app.get('/api/community/countries', communityLimiter, (request, response) => {
  response.json({ countries: COMMUNITY_COUNTRIES });
});

app.get('/api/community/questions', communityLimiter, async (request, response) => {
  const country = String(request.query.country || 'ID').toUpperCase();
  if (!COMMUNITY_COUNTRIES.some((item) => item.code === country)) return response.status(400).json({ error: 'Negara tidak tersedia.' });
  try {
    await ensureBotQuestions();
    const result = await pool.query(`
      SELECT q.*, f.name AS author_name
      FROM community_questions q
      LEFT JOIN fans f ON f.id = q.author_id
      WHERE q.country_code = $1 AND q.status = 'published'
      ORDER BY q.question_day DESC, q.created_at DESC
      LIMIT 20
    `, [country]);
    return response.json({ country, questions: result.rows.map(questionView) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengambil pertanyaan komunitas.' });
  }
});

app.post('/api/community/questions', communityLimiter, requireAuth, async (request, response) => {
  const country = String(request.body.country || '').toUpperCase();
  const topic = String(request.body.topic || '').trim();
  const prompt = String(request.body.prompt || '').trim();
  if (!COMMUNITY_COUNTRIES.some((item) => item.code === country) || topic.length < 2 || topic.length > 80 || prompt.length < 10 || prompt.length > 240) {
    return response.status(400).json({ error: 'Pilih negara dan topik. Pertanyaan harus 10 sampai 240 karakter.' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO community_questions (country_code, topic, prompt, source, author_id, question_day)
      VALUES ($1, $2, $3, 'fan', $4, CURRENT_DATE)
      RETURNING *
    `, [country, topic, prompt, request.session.fanId]);
    return response.status(201).json({ question: questionView(result.rows[0]) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal membuat pertanyaan.' });
  }
});

app.get('/api/me', requireAuth, async (request, response) => {
  try {
    const result = await pool.query('SELECT public_code, name, email, profile_picture, avatar_desain, oshi_reasons, oshi_members, birth_date, bio, kota, grup_favorit, created_at FROM fans WHERE id = $1', [request.session.fanId]);
    if (!result.rows[0]) return response.status(401).json({ error: 'Sesi tidak valid.' });
    const payload = publicFan(result.rows[0]);
    payload.akses = await ambilLencana(request.session.fanId);
    return response.json({ user: payload });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengambil profil.' });
  }
});

app.get('/api/live/events', liveLimiter, async (request, response) => {
  if (!liveSseEnabled) {
    /* Sengaja bukan 200: EventSource yang menerima status error akan
       memanggil onerror, dan frontend langsung memakai jalur polling
       tanpa menggantung koneksi yang tidak pernah mengirim apa pun. */
    return response.status(501).json({ error: 'SSE tidak aktif di deployment ini. Pakai GET /api/live.' });
  }
  await siapkanLive();
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  response.write(': connected\n\n');
  liveClients.add(response);
  sendLiveEvent(response, await liveCache.getSnapshot());
  /* Komentar berkala: proxy dan load balancer memutus koneksi idle,
     dan tanpa ini SSE mati diam-diam saat tidak ada yang live. */
  const denyut = setInterval(() => {
    try {
      response.write(': ping\n\n');
    } catch (error) {
      clearInterval(denyut);
    }
  }, 25000);
  if (typeof denyut.unref === 'function') denyut.unref();
  request.on('close', () => {
    clearInterval(denyut);
    liveClients.delete(response);
  });
});

app.get('/api/live', liveLimiter, async (request, response) => {
  await siapkanLive();
  setCacheLive(response);
  response.json(livePayload(await liveCache.getSnapshot()));
});

/* -------------------------------------------------------------
   GET /api/cron/update-live — dipanggil Vercel Cron
   -------------------------------------------------------------
   Di serverless tidak ada proses yang hidup terus, jadi "poller"-nya
   adalah endpoint ini: cron memanggilnya tiap 2 menit, satu siklus
   dijalankan, snapshot ditulis ke Redis, lalu fungsinya mati.

   Dilindungi CRON_SECRET karena endpoint ini memicu puluhan request
   keluar — kalau terbuka, siapa pun bisa memakainya untuk membebani
   Showroom/IDN atas nama situs ini, dan menghabiskan kuota Upstash.
   Vercel Cron mengirim `Authorization: Bearer <CRON_SECRET>` sendiri.

   Worker dibuat BARU tiap invocation, bukan memakai `liveWorker`:
   di serverless liveWorker memang null, dan bikin baru di sini
   membuat perilakunya sama di semua host.
   ------------------------------------------------------------- */
const CRON_BUDGET_MS = Number(process.env.LIVE_CRON_BUDGET_MS || 45000);

function cronSah(request) {
  const rahasia = process.env.CRON_SECRET;
  /* Tanpa CRON_SECRET, endpoint hanya boleh dipakai di luar produksi.
     Menjadikannya terbuka di produksi bukan "default yang memudahkan",
     itu lubang yang menagih kuota orang lain. */
  if (!rahasia) return !isProduction;
  const header = String(request.get('authorization') || '');
  const dikirim = header.startsWith('Bearer ') ? header.slice(7) : String(request.query.key || '');
  if (dikirim.length !== rahasia.length) return false;
  /* Perbandingan waktu-tetap: mencegah panjang/isi rahasia ditebak
     dari selisih waktu balasan. */
  return crypto.timingSafeEqual(Buffer.from(dikirim), Buffer.from(rahasia));
}

app.get('/api/cron/update-live', async (request, response) => {
  if (!cronSah(request)) {
    return response.status(401).json({
      error: process.env.CRON_SECRET
        ? 'CRON_SECRET tidak cocok.'
        : 'CRON_SECRET belum diatur; endpoint ini dimatikan di produksi.',
    });
  }
  const mulai = Date.now();
  try {
    const worker = createLiveWorker({ logger: console, cache: liveCache });
    await liveCache.connect();
    const hasil = await worker.poll({ budgetMs: CRON_BUDGET_MS });
    const meta = hasil.snapshot.meta || {};
    response.setHeader('cache-control', 'no-store');
    return response.json({
      ok: true,
      checked_at: hasil.snapshot.checked_at,
      live: hasil.snapshot.live.length,
      /* started/ended dipisah supaya dari log cron saja sudah kelihatan
         apakah notifikasi seharusnya terkirim. */
      started: hasil.transitions.filter((t) => t.type === 'started').length,
      ended: hasil.transitions.filter((t) => t.type === 'ended').length,
      discord: hasil.discord,
      seeded: meta.seeded ?? 0,
      truncated: Boolean(meta.truncated),
      checked: meta.checked,
      providers: meta.providers,
      redis: liveCache.status(),
      duration_ms: Date.now() - mulai,
    });
  } catch (error) {
    console.error(`[CRON] gagal: ${error.message}`);
    /* 500 disengaja: Vercel menandai cron run yang gagal, dan itu satu-satunya
       cara masalah ini terlihat tanpa memantau log manual. */
    return response.status(500).json({ ok: false, error: error.message, duration_ms: Date.now() - mulai });
  }
});

/* -------------------------------------------------------------
   POST/GET /api/cron/update-members — trigger manual/eksternal
   -------------------------------------------------------------
   Cron bawaan platform sering kena rate limit/kuota; endpoint ini
   memungkinkan pembaruan data member dipicu KAPAN SAJA:
     - tombol "Update Data Member" di panel admin (sesi admin),
     - cron eksternal mana pun (cron-job.org, GitHub Actions, dsb.)
       lewat header Bearer ATAU query ?key=CRON_SECRET.

   Yang dikerjakan: satu siklus poll() worker live — mapping
   member↔room diperbarui lalu disimpan ke JSON store (members.json
   bila filesystem bisa ditulis) dan disalin ke Supabase Storage
   bila dikonfigurasi. Respons mengikuti kontrak:
     200 { success: true, message: "Member data updated successfully",
           timestamp: <ISO>, ...detail }
     401 salah kunci · 409 sedang berjalan · 500 gagal (tanpa crash)
   ------------------------------------------------------------- */
let pembaruanMemberBerjalan = false;

async function jalankanPembaruanMember({ budgetMs } = {}) {
  const mulai = Date.now();
  const worker = createLiveWorker({ logger: console, cache: liveCache });
  await liveCache.connect();
  const hasil = await worker.poll({ budgetMs: budgetMs || CRON_BUDGET_MS });
  const meta = hasil.snapshot.meta || {};

  /* Salinan arsip ke Supabase Storage (opsional). Gagal di sini tidak
     boleh menggagalkan pembaruan yang sudah sukses di JSON/Redis. */
  let supabaseStatus;
  try {
    const { simpanJsonKeStorage } = require('./supabase');
    supabaseStatus = await simpanJsonKeStorage('live-tracker/members.json', {
      diperbarui_at: new Date().toISOString(),
      members_count: hasil.members,
      snapshot: hasil.snapshot,
    });
  } catch (error) {
    supabaseStatus = `gagal: ${error.message}`;
  }

  return {
    members: hasil.members,
    live: hasil.snapshot.live.length,
    started: hasil.transitions.filter((t) => t.type === 'started').length,
    ended: hasil.transitions.filter((t) => t.type === 'ended').length,
    truncated: Boolean(meta.truncated),
    checked: meta.checked,
    providers: meta.providers,
    redis: liveCache.status(),
    supabase: supabaseStatus,
    duration_ms: Date.now() - mulai,
  };
}

async function pembaruanMemberHandler(request, response) {
  response.setHeader('cache-control', 'no-store');
  /* Dua jalur sah: sesi admin (tombol dashboard) atau CRON_SECRET
     (cron eksternal). Tanpa keduanya → 401. */
  const lewatSesiAdmin = Boolean(request.session && request.session.adminId);
  if (!lewatSesiAdmin && !cronSah(request)) {
    return response.status(401).json({
      success: false,
      error: process.env.CRON_SECRET
        ? 'Unauthorized — butuh sesi admin atau CRON_SECRET yang cocok.'
        : 'CRON_SECRET belum diatur; endpoint hanya terbuka untuk admin.',
    });
  }
  /* Kunci anti tumpang-tindih: dua trigger bersamaan jangan menjalankan
     dua siklus fetch berat sekaligus. */
  if (pembaruanMemberBerjalan) {
    return response.status(409).json({ success: false, error: 'Pembaruan sedang berjalan; coba lagi beberapa saat.' });
  }
  pembaruanMemberBerjalan = true;
  try {
    const detail = await jalankanPembaruanMember({});
    return response.status(200).json({
      success: true,
      message: 'Member data updated successfully',
      timestamp: new Date(),
      ...detail,
    });
  } catch (error) {
    console.error(`[CRON-MEMBERS] gagal: ${error.message}`);
    /* 500 tanpa crash: server tetap hidup untuk permintaan berikutnya. */
    return response.status(500).json({ success: false, error: error.message });
  } finally {
    pembaruanMemberBerjalan = false;
  }
}
app.post('/api/cron/update-members', pembaruanMemberHandler);
app.get('/api/cron/update-members', pembaruanMemberHandler);   // kompatibilitas cron eksternal yang GET-only

/* -------------------------------------------------------------
   GET /api/live-status — bentuk paling sederhana untuk klien
   -------------------------------------------------------------
   Hanya array member yang sedang live. Cache miss / Redis mati
   mengembalikan array kosong, BUKAN error: konsumen tidak boleh
   rusak hanya karena tracker sedang bermasalah.
   ------------------------------------------------------------- */
app.get('/api/live-status', liveLimiter, async (request, response) => {
  try {
    await siapkanLive();
    const snapshot = await liveCache.getSnapshot();
    const live = Array.isArray(snapshot && snapshot.live) ? snapshot.live : [];
    setCacheLive(response);
    return response.json(live);
  } catch (error) {
    console.error(`[LIVE] /api/live-status: ${error.message}`);
    response.setHeader('cache-control', 'no-store');
    return response.json([]);
  }
});

/* -------------------------------------------------------------
   GET /api/schedule/meta — grup mana yang punya sumber jadwal
   -------------------------------------------------------------
   Dipakai halaman Jadwal Stage untuk menandai chip grup dengan
   titik "otomatis" tanpa menduplikasi daftar adapter di frontend.
   ------------------------------------------------------------- */
app.get('/api/schedule/meta', scheduleLimiter, (request, response) => {
  response.setHeader('cache-control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  return response.json({ supported: grupDidukung() });
});

/* -------------------------------------------------------------
   GET /api/schedule — jadwal stage resmi per grup & bulan
   -------------------------------------------------------------
   Sumbernya API/HTML resmi grup (bukan data lokal), diambil di
   sini karena browser terhalang CORS + Cloudflare. Cache CDN 5
   menit: sumber resmi tidak boleh diterjang tiap kunjungan.
   ------------------------------------------------------------- */
app.get('/api/schedule', scheduleLimiter, async (request, response) => {
  const groupId = String(request.query.group || 'jkt48').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const sekarang = new Date();
  const bulanIni = sekarang.getMonth() + 1;
  const tahunIni = sekarang.getFullYear();

  const month = Number(request.query.month);
  const year = Number(request.query.year);
  const bulan = month >= 1 && month <= 12 ? Math.trunc(month) : bulanIni;
  const tahun = year >= 2000 && year <= 2100 ? Math.trunc(year) : tahunIni;

  try {
    const payload = await getOfficialSchedule(groupId, { month: bulan, year: tahun, lang: 'id' });
    response.setHeader('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    return response.json(payload);
  } catch (error) {
    if (error.code === 'GRUP_BELUM_DIDUKUNG') {
      response.setHeader('cache-control', 'no-store');
      return response.status(404).json({ error: error.message, group: groupId });
    }
    console.error(`[SCHEDULE] ${groupId} ${tahun}-${bulan}: ${error.message}`);
    response.setHeader('cache-control', 'no-store');
    /* 502, bukan 500: masalahnya di pihak situs resmi, bukan server ini. */
    return response.status(502).json({ error: 'Gagal mengambil jadwal dari situs resmi.', detail: error.message });
  }
});

app.patch('/api/me', requireAuth, async (request, response) => {
  const name = String(request.body.name || '').trim();
  if (name.length < 2 || name.length > 80) return response.status(400).json({ error: 'Nama harus terdiri dari 2 sampai 80 karakter.' });
  const profilePicture = String(request.body.profilePicture || '');
  const oshiReasons = request.body.oshiReasons && typeof request.body.oshiReasons === 'object' && !Array.isArray(request.body.oshiReasons) ? request.body.oshiReasons : {};
  const safeReasons = Object.fromEntries(Object.entries(oshiReasons).filter(([id, reason]) => /^[a-z0-9-]{3,40}$/.test(id) && typeof reason === 'string' && reason.trim().length >= 3).map(([id, reason]) => [id, reason.trim().slice(0, 240)]));
  /* Foto profil: boleh dataURL (upload) ATAU URL https (mis. avatar
     Showroom). URL dibatasi panjang & karakter agar aman. */
  const adalahDataUrl = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(profilePicture);
  const adalahUrlFoto = /^https:\/\/[^\s"'<>\\]+$/.test(profilePicture) && profilePicture.length <= 600;
  if (profilePicture && !adalahDataUrl && !adalahUrlFoto) return response.status(400).json({ error: 'Foto profil harus berupa JPEG, PNG, WebP, atau URL https gambar.' });
  if (adalahDataUrl && profilePicture.length > 2_400_000) return response.status(400).json({ error: 'Ukuran foto profil maksimal 1,8 MB.' });
  /* Biodata opsional — kosong berarti menghapus isian. */
  const potong = (nilai, maks) => String(nilai || '').trim().slice(0, maks) || null;
  const bio = potong(request.body.bio, 280);
  const kota = potong(request.body.kota, 80);
  const grupFavorit = potong(request.body.grupFavorit, 80);
  const avatarDesain = validasiAvatarDesain(request.body.avatarDesain);
  try {
    const result = await pool.query(
      `UPDATE fans SET name = $1, profile_picture = NULLIF($2, ''), oshi_reasons = $3::jsonb,
              birth_date = $4::date, oshi_members = $5::jsonb, bio = $6, kota = $7, grup_favorit = $8,
              avatar_desain = $9::jsonb, updated_at = NOW()
        WHERE id = $10
        RETURNING id, public_code, name, email, profile_picture, avatar_desain, oshi_reasons, oshi_members, birth_date, bio, kota, grup_favorit, created_at`,
      [name, profilePicture, JSON.stringify(safeReasons), parseTanggalLahir(request.body.birthDate), JSON.stringify(validasiOshiMembers(request.body.oshiMembers)), bio, kota, grupFavorit, avatarDesain ? JSON.stringify(avatarDesain) : null, request.session.fanId],
    );
    return response.json({ user: publicFan(result.rows[0]) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal menyimpan profil.' });
  }
});

/* Daftar id member oshi: maksimal 3, hanya karakter id yang wajar.
   PATCH /api/me selalu MENIMPA daftar. */
function validasiOshiMembers(nilai, batas = 3) {
  if (!Array.isArray(nilai)) return [];
  const bersih = nilai
    .map((id) => String(id || '').trim())
    .filter((id) => /^[a-z0-9-]{2,64}$/.test(id));
  return [...new Set(bersih)].slice(0, batas);
}

const GRADIEN_AVATAR_SAHIH = ['pink', 'coral', 'lilac', 'mint', 'langit', 'lemon', 'peach', 'abu'];
const FRAME_AVATAR_SAHIH = ['polos', 'hati', 'bintang', 'pelangi', 'emas', 'neon', 'galaksi'];

/* Desain avatar: { mode: 'desain'|'foto', e: emoji, g: gradasi, f: frame }. */
function validasiAvatarDesain(nilai) {
  if (!nilai || typeof nilai !== 'object' || Array.isArray(nilai)) return null;
  const mode = nilai.mode === 'foto' ? 'foto' : nilai.mode === 'desain' ? 'desain' : null;
  if (!mode) return null;
  const e = String(nilai.e || '').trim().slice(0, 16) || '🐰';
  const g = GRADIEN_AVATAR_SAHIH.includes(nilai.g) ? nilai.g : 'pink';
  const f = FRAME_AVATAR_SAHIH.includes(nilai.f) ? nilai.f : 'polos';
  return { mode, e, g, f };
}

/* Lencana kontributor tertinggi yang disetujui untuk seorang fans. */
async function ambilLencana(fanId) {
  const result = await pool.query(
    `SELECT access_level FROM access_requests
      WHERE fan_id = $1 AND status = 'approved'
      ORDER BY CASE access_level WHEN 'editor' THEN 0 WHEN 'contributor' THEN 1 ELSE 2 END
      LIMIT 1`,
    [fanId],
  );
  return result.rows[0] ? result.rows[0].access_level : null;
}

/* =============================================================
    SOSIAL — direktori fans, profil publik, pertemanan
   =============================================================
   Tujuannya komunitas yang hidup: fans saling kenal lewat profil
   publik (biodata + oshi), lalu berteman. Email TIDAK pernah ikut
   respons publik. Semua identitas memakai public_code acak. */

async function ambilFanByKode(code) {
  const result = await pool.query(
    'SELECT id, public_code, name, profile_picture, birth_date, oshi_members, created_at FROM fans WHERE public_code = $1',
    [String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32)],
  );
  return result.rows[0] || null;
}

/* Status pertemanan viewer terhadap satu fans (null bila belum login). */
async function statusPertemanan(viewerId, targetId) {
  if (!viewerId || viewerId === targetId) return null;
  const result = await pool.query(
    `SELECT requester_id, status FROM friendships
      WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)
      LIMIT 1`,
    [viewerId, targetId],
  );
  const row = result.rows[0];
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  return Number(row.requester_id) === Number(viewerId) ? 'pending_out' : 'pending_in';
}

/* GET /api/fans — direktori fans terbaru (discovery). */
app.get('/api/fans', communityLimiter, async (request, response) => {
  const limit = Math.min(Math.max(Number(request.query.limit) || 24, 1), 50);
  try {
    const result = await pool.query(
      `SELECT public_code, name, profile_picture, birth_date, oshi_members, created_at
         FROM fans ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    response.setHeader('cache-control', 'no-store');
    return response.json({ fans: result.rows.map(fanPublik) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengambil daftar fans.' });
  }
});

/* GET /api/fans/:code — profil publik seorang fans. */
app.get('/api/fans/:code', communityLimiter, async (request, response) => {
  try {
    const result = await pool.query(
      'SELECT id, public_code, name, profile_picture, avatar_desain, birth_date, oshi_members, oshi_reasons, bio, kota, grup_favorit, created_at FROM fans WHERE public_code = $1',
      [String(request.params.code || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32)],
    );
    const fan = result.rows[0];
    if (!fan) return response.status(404).json({ error: 'Fans tidak ditemukan.' });
    /* Alasan oshi ikut dipublikasikan HANYA untuk member yang memang
       ada di daftar oshinya — biar kartu oshinya bercerita. */
    const oshiMembers = Array.isArray(fan.oshi_members) ? fan.oshi_members : [];
    const alasan = fan.oshi_reasons && typeof fan.oshi_reasons === 'object'
      ? Object.fromEntries(oshiMembers.filter((id) => fan.oshi_reasons[id]).map((id) => [id, String(fan.oshi_reasons[id]).slice(0, 240)]))
      : {};
    const isSelf = request.session.fanId === Number(fan.id);
    return response.json({
      fan: { ...fanPublik(fan), oshiReasons: alasan, akses: await ambilLencana(Number(fan.id)) },
      isSelf,
      friendship: await statusPertemanan(request.session.fanId, Number(fan.id)),
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengambil profil fans.' });
  }
});

/* POST /api/fans/:code/friend — kirim permintaan teman.
   Sopan santunnya: kalau LAWAKAN sudah mengirimi kita permintaan,
   langsung dianggap saling add → jadi teman tanpa langkah kedua. */
app.post('/api/fans/:code/friend', requireAuth, async (request, response) => {
  try {
    const fan = await ambilFanByKode(request.params.code);
    if (!fan) return response.status(404).json({ error: 'Fans tidak ditemukan.' });
    const targetId = Number(fan.id);
    const viewerId = Number(request.session.fanId);
    if (targetId === viewerId) return response.status(400).json({ error: 'Tidak bisa menambahkan diri sendiri.' });

    const balik = await pool.query(
      `UPDATE friendships SET status = 'accepted', updated_at = NOW()
        WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
        RETURNING id`,
      [targetId, viewerId],
    );
    if (balik.rows.length) return response.json({ status: 'friends' });

    const hasil = await pool.query(
      `INSERT INTO friendships (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (requester_id, addressee_id) DO UPDATE SET updated_at = NOW()
       RETURNING status`,
      [viewerId, targetId],
    );
    return response.json({ status: hasil.rows[0].status === 'accepted' ? 'friends' : 'pending_out' });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengirim permintaan teman.' });
  }
});

/* POST /api/fans/:code/friend/accept — terima permintaan masuk. */
app.post('/api/fans/:code/friend/accept', requireAuth, async (request, response) => {
  try {
    const fan = await ambilFanByKode(request.params.code);
    if (!fan) return response.status(404).json({ error: 'Fans tidak ditemukan.' });
    const hasil = await pool.query(
      `UPDATE friendships SET status = 'accepted', updated_at = NOW()
        WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
        RETURNING id`,
      [Number(fan.id), Number(request.session.fanId)],
    );
    if (!hasil.rows.length) return response.status(404).json({ error: 'Tidak ada permintaan untuk diterima.' });
    return response.json({ status: 'friends' });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal menerima permintaan teman.' });
  }
});

/* DELETE /api/fans/:code/friend — batalkan permintaan / hapus teman. */
app.delete('/api/fans/:code/friend', requireAuth, async (request, response) => {
  try {
    const fan = await ambilFanByKode(request.params.code);
    if (!fan) return response.status(404).json({ error: 'Fans tidak ditemukan.' });
    await pool.query(
      `DELETE FROM friendships
        WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
      [Number(request.session.fanId), Number(fan.id)],
    );
    return response.json({ status: 'none' });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal menghapus teman.' });
  }
});

/* GET /api/friends — teman + permintaan masuk/keluar milik sesi ini. */
app.get('/api/friends', requireAuth, async (request, response) => {
  const viewerId = Number(request.session.fanId);
  try {
    const dasar = `
      SELECT f.public_code, f.name, f.profile_picture, f.created_at, fr.requester_id, fr.status
        FROM friendships fr JOIN fans f ON f.id = fr.requester_id
       WHERE fr.addressee_id = $1
       UNION ALL
      SELECT f.public_code, f.name, f.profile_picture, f.created_at, fr.requester_id, fr.status
        FROM friendships fr JOIN fans f ON f.id = fr.addressee_id
       WHERE fr.requester_id = $1`;
    const result = await pool.query(dasar, [viewerId]);
    const teman = [];
    const masuk = [];
    const keluar = [];
    for (const row of result.rows) {
      const item = { code: row.public_code, name: row.name, photo: row.profile_picture || '', joinedAt: row.created_at };
      if (row.status === 'accepted') teman.push(item);
      else if (Number(row.requester_id) === viewerId) keluar.push(item);
      else masuk.push(item);
    }
    response.setHeader('cache-control', 'no-store');
    return response.json({ friends: teman, incoming: masuk, outgoing: keluar });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengambil daftar teman.' });
  }
});

const serverInstance = {
  app,
  /* Disimpan supaya matikanTeratur() bisa menutupnya. */
  listener: null,
};

async function start() {
  /* DATABASE_URL kosong TIDAK boleh mematikan proses: di Railway
     variabel bisa terlambat disetel, dan semua jalur yang benar-benar
     butuh database sudah dijaga masalahKonfigurasi(). Health check
     tetap harus hidup agar deploy tidak ditandai gagal (502). */
  if (!process.env.DATABASE_URL) {
    console.warn('[START] DATABASE_URL belum diatur — jalur database akan menolak dengan pesan jelas, sisanya tetap melayani.');
  } else {
    try {
      await ensureSchema();
    } catch (error) {
      console.error(`[START] ensureSchema gagal: ${error.message} — server tetap dinyalakan.`);
    }
  }

  /* KRUSIAL UNTUK RAILWAY/DOCKER: bind ke '0.0.0.0' (semua antarmuka).
     Tanpa host eksplisit, Node hanya mendengarkan IPv6 localhost pada
     beberapa versi, proxy internal Railway tidak bisa meneruskan trafik,
     dan hasilnya 502 Bad Gateway padahal proses "jalan". */
  const HOST = '0.0.0.0';
  await new Promise((resolve, reject) => {
    serverInstance.listener = app.listen(PORT, HOST, () => {
      console.log(`WIKI48 community server listening on http://${HOST}:${PORT}`);
      resolve();
    });
    serverInstance.listener.on('error', reject);
  });

  /* Cache selalu disiapkan (API perlu membaca snapshot); worker hanya ikut
     start bila memang in-process. Kegagalan Redis tidak boleh menggagalkan
     server: situs tetap harus bisa dibuka. */
  siapkanLive();
  const { statusSupabase } = require('./supabase');
  console.log(`[START] port=${PORT} · env=${process.env.NODE_ENV || 'development'} · supabase=${statusSupabase().configured ? 'aktif' : 'tidak dikonfigurasi'} · worker: ${liveWorkerInProcess ? 'in-process' : 'eksternal (jalankan npm run live)'} · SSE: ${liveSseEnabled ? 'on' : 'off'} · redis: ${liveCache.status().host || '(memori)'}`);
  return serverInstance.listener;
}

/* Matikan rapi saat platform mengirim sinyal (Railway kirim SIGTERM
   saat redeploy): berhenti menerima koneksi baru, tutup pool DB.
   Timeout pengaman 8 detik — jangan biarkan koneksi SSE menggantung
   proses selamanya. */
let sedangMatikan = false;
async function matikanTeratur(sinyal) {
  if (sedangMatikan) return;
  sedangMatikan = true;
  console.log(`[SHUTDOWN] ${sinyal} diterima, menutup server…`);
  const paksa = setTimeout(() => process.exit(0), 8000);
  if (typeof paksa.unref === 'function') paksa.unref();
  try {
    await new Promise((resolve) => {
      if (!serverInstance.listener) return resolve();
      serverInstance.listener.close(resolve);
    });
    await Promise.resolve(pool.end()).catch(() => {});
    await liveCache.close().catch(() => {});
  } catch (error) {
    console.warn(`[SHUTDOWN] ${error.message}`);
  }
  clearTimeout(paksa);
  process.exit(0);
}
process.on('SIGTERM', () => { matikanTeratur('SIGTERM'); });
process.on('SIGINT', () => { matikanTeratur('SIGINT'); });

if (require.main === module) {
  start().catch((error) => {
    console.error('[SERVER] gagal dimulai:');
    console.error(error);
    /* Exit total, bukan exitCode: proses yang setengah mati dibaca
       Railway sebagai zombie server → 502 Bad Gateway. */
    process.exit(1);
  });
}

module.exports = { app, start, ensureSchema, liveCache, livePayload, liveWorker };
