'use strict';

/* =============================================================
   discord-notify.js — kabar "member mulai LIVE" ke Discord
   -------------------------------------------------------------
   ATURAN UTAMA: gagal kirim TIDAK BOLEH menggagalkan siklus poll.
   Notifikasi itu bonus; yang wajib selamat adalah snapshot yang
   masuk ke Redis. Karena itu setiap fungsi di sini menelan error
   sendiri dan hanya melaporkan hasilnya sebagai angka.

   KENAPA DEDUPE-NYA DI REDIS, BUKAN DI MEMORI:
   Di mode cron tiap invocation adalah proses baru. Ingatan di memori
   hilang setiap 2 menit, jadi orang yang sama akan dikabarkan terus
   setiap siklus. Penanda "sudah dikabari" karena itu disimpan di
   Redis memakai SET NX EX:
     - NX  : hanya berhasil kalau kuncinya BELUM ada, jadi dua cron
             yang jalan bersamaan tidak mungkin dua-duanya mengirim.
     - EX  : penanda kedaluwarsa sendiri, jadi kalau member itu live
             lagi besok, dia dikabarkan lagi tanpa perlu dibersihkan.

   URL webhook TIDAK PERNAH ikut ter-log — di log hanya statusnya.

   BANYAK WEBHOOK:
   Satu variabel boleh memuat beberapa URL yang dipisah koma/spasi, dan
   DISCORD_WEBHOOK_URL_2, _3, … juga dibaca. Ini bukan fitur karangan:
   menulis DISCORD_WEBHOOK_URL tiga kali di .env TIDAK bekerja — dotenv
   hanya menyimpan baris terakhir, dua sisanya hilang tanpa peringatan.
   Kegagalan satu webhook tidak menghentikan pengiriman ke yang lain.
   ============================================================= */

const WARNA = {
  showroom: 0xff5e94,   // pink-merah khas Showroom
  idn: 0x0f6fff,        // biru IDN
  youtube: 0xff0000,
};

const LABEL = { showroom: 'SHOWROOM', idn: 'IDN LIVE', youtube: 'YOUTUBE' };
const MAKS_EMBED = 10;             // batas keras Discord per pesan
const PANJANG_JUDUL = 256;
const PANJANG_DESKRIPSI = 4096;

function potong(teks, maks) {
  const bersih = String(teks == null ? '' : teks).replace(/\s+/g, ' ').trim();
  if (!bersih) return null;
  return bersih.length > maks ? `${bersih.slice(0, maks - 1)}…` : bersih;
}

/* Jam mulai ditampilkan dalam zona yang dimengerti pembaca, bukan UTC.
   Kalau platform tidak memberi started_at, dipakai waktu tracker pertama
   melihat siaran itu (since) dan diberi tanda ± supaya tidak menyesatkan. */
function jamMulai(entri, zona = process.env.LIVE_TIMEZONE || 'Asia/Jakarta') {
  const sumber = entri.started_at || entri.since;
  if (!sumber) return { teks: 'tidak diketahui', perkiraan: false };
  const tanggal = new Date(sumber);
  if (Number.isNaN(tanggal.getTime())) return { teks: 'tidak diketahui', perkiraan: false };
  try {
    const teks = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit', minute: '2-digit', timeZone: zona, hour12: false,
    }).format(tanggal);
    return { teks: `${teks} WIB`, perkiraan: !entri.started_at, stamp: Math.floor(tanggal.getTime() / 1000) };
  } catch (error) {
    return { teks: tanggal.toISOString().slice(11, 16), perkiraan: !entri.started_at };
  }
}

function buatEmbed(entri) {
  const platform = String(entri.platform || '').toLowerCase();
  const label = LABEL[platform] || platform.toUpperCase() || 'LIVE';
  const nama = potong(entri.member_name || entri.memberName || entri.id, 80) || 'Member';
  const groupName = potong(entri.group || entri.groupName, 60);
  const category = potong(entri.category, 20);
  const url = entri.live_url || entri.streamUrl || null;
  const jam = jamMulai(entri);
  const fields = [];

  if (Number.isFinite(entri.viewer_count) && entri.viewer_count >= 0) {
    fields.push({ name: 'Penonton', value: `${entri.viewer_count.toLocaleString('id-ID')} orang`, inline: true });
  }
  fields.push({
    name: 'Mulai',
    /* Timestamp relatif Discord (<t:…:R>) ikut dipasang supaya pembaca di
       zona lain tetap paham "berapa lama sudah siaran". */
    value: jam.stamp ? `<t:${jam.stamp}:t> (<t:${jam.stamp}:R>)${jam.perkiraan ? ' ±' : ''}` : jam.teks,
    inline: true,
  });
  fields.push({ name: 'Platform', value: label, inline: true });

  const embed = {
    title: potong(platform === 'showroom' && groupName
      ? `🔴 [${groupName}] ${nama} lagi LIVE!`
      : `[${label}] ${nama} sedang LIVE!`, PANJANG_JUDUL),
    description: potong(entri.title, PANJANG_DESKRIPSI) || 'Sedang siaran sekarang.',
    color: WARNA[platform] ?? 0x8b5cf6,
    fields,
    timestamp: new Date(entri.checked_at || Date.now()).toISOString(),
    footer: { text: platform === 'showroom' && groupName
      ? `${groupName} (${category || 'Unknown'}) • SHOWROOM Live`
      : 'WIKI48 live tracker' },
  };
  if (url) embed.url = url;
  const avatar = entri.avatar_url || entri.avatarUrl;
  if (avatar && /^https?:\/\//i.test(avatar)) embed.thumbnail = { url: avatar };
  return embed;
}

/* Discord tidak mengizinkan tombol pada pesan webhook biasa (components
   butuh bot/aplikasi). Jadi "tombol"-nya diwujudkan sebagai tautan yang
   jelas di isi pesan + judul embed yang bisa diklik. */
function barisTautan(daftar) {
  const tautan = daftar
    .map((entri) => {
      const url = entri.live_url || entri.streamUrl;
      if (!url) return null;
      const nama = potong(entri.member_name || entri.memberName, 60) || 'Member';
      return `▶ **[Tonton ${nama}](${url})**`;
    })
    .filter(Boolean);
  return tautan.length ? potong(tautan.join(' · '), 1900) : null;
}

/* Kumpulkan URL webhook dari env: satu variabel bisa memuat beberapa URL
   (dipisah koma, titik-koma, atau baris baru), plus varian bernomor. */
function kumpulkanWebhook(env = process.env) {
  const mentah = [env.DISCORD_WEBHOOK_URL];
  for (let i = 2; i <= 10; i += 1) mentah.push(env[`DISCORD_WEBHOOK_URL_${i}`]);
  const hasil = [];
  mentah.filter(Boolean).forEach((nilai) => {
    String(nilai)
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//i.test(s))
      .forEach((url) => { if (!hasil.includes(url)) hasil.push(url); });
  });
  return hasil;
}

function kumpulkanWebhookPlatform(env = process.env, fallback = []) {
  const explicit = {
    showroom: env.DISCORD_SHOWROOM_WEBHOOK_URL,
    idn: env.DISCORD_IDN_WEBHOOK_URL,
    youtube: env.DISCORD_YOUTUBE_WEBHOOK_URL,
  };
  const platform = {};
  Object.entries(explicit).forEach(([key, url]) => {
    const found = kumpulkanWebhook({ DISCORD_WEBHOOK_URL: url });
    if (found.length) platform[key] = found[0];
  });
  if (fallback.length >= 3) {
    platform.showroom ||= fallback[0];
    platform.idn ||= fallback[1];
    platform.youtube ||= fallback[2];
  }
  return platform;
}

/* Label aman untuk log: bagian rahasia (token webhook) dibuang, hanya
   4 digit terakhir id yang ditampilkan supaya bisa dibedakan satu dari
   yang lain tanpa pernah membocorkan URL-nya. */
function labelWebhook(url) {
  const m = String(url).match(/webhooks\/(\d+)\//);
  return m ? `webhook …${m[1].slice(-4)}` : 'webhook';
}

function createDiscordNotifier({
  webhookUrl,
  webhookUrls,
  logger = console,
  fetchImpl,
  timeoutMs = Number(process.env.DISCORD_TIMEOUT_MS || 8000),
  dedupeTtlSeconds = Number(process.env.DISCORD_DEDUPE_TTL_SECONDS || 21600),   // 6 jam
  cache = null,
  username = process.env.DISCORD_USERNAME || 'WIKI48 Live',
} = {}) {
  const daftarHook = (() => {
    if (Array.isArray(webhookUrls) && webhookUrls.length) return webhookUrls.filter(Boolean);
    if (webhookUrl) return [webhookUrl];
    return kumpulkanWebhook();
  })();
  const webhookPlatform = kumpulkanWebhookPlatform(process.env, daftarHook);
  const aktif = daftarHook.length > 0;
  let warnedMati = false;
  let terkirim = 0;
  let gagal = 0;
  let lastError = null;

  const ambilFetch = () => fetchImpl || (typeof fetch === 'function' ? fetch : null);

  function valid() {
    if (aktif) return true;
    if (!warnedMati) {
      warnedMati = true;
      logger.log('[DISCORD] DISCORD_WEBHOOK_URL kosong/tidak valid — notifikasi dilewati (fitur lain tetap jalan).');
    }
    return false;
  }

  /* Menyaring transitions jadi daftar yang benar-benar perlu dikabarkan.
     Penanda ditulis lewat cache.claimOnce() yang atomik (SET NX EX). Kalau
     Redis tidak tersedia, kita tetap kirim: lebih baik ada notifikasi
     (dengan risiko dobel saat dev) daripada fitur ini diam total. */
  async function saring(daftar) {
    const hasil = [];
    for (const entri of daftar) {
      const kunci = `${entri.id}:${entri.platform}:${entri.since || entri.started_at || ''}`;
      if (cache && typeof cache.claimOnce === 'function') {
        let boleh = true;
        try {
          boleh = await cache.claimOnce(kunci, dedupeTtlSeconds);
        } catch (error) {
          logger.warn(`[DISCORD] gagal menandai dedupe (${error.message}) — dikirim apa adanya.`);
        }
        if (!boleh) continue;
      }
      hasil.push(entri);
    }
    return hasil;
  }

  async function kirimSatuBatch(daftar, hook) {
    const fn = ambilFetch();
    if (!fn) throw new Error('fetch tidak tersedia (perlu Node 18+)');
    const body = {
      username,
      content: barisTautan(daftar) || undefined,
      embeds: daftar.map(buatEmbed),
      /* Jangan memicu mention siapa pun dari judul/isi siaran. */
      allowed_mentions: { parse: [] },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fn(hook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 429) {
        /* Kena rate limit: laporkan, jangan retry di dalam cron —
           siklus berikutnya akan mencoba lagi sendiri. */
        let tunggu = null;
        try {
          const info = await response.json();
          tunggu = info && info.retry_after != null ? info.retry_after : null;
        } catch (error) { /* body bukan JSON, tidak masalah */ }
        throw new Error(`rate limit Discord${tunggu ? `, coba lagi ${tunggu}s` : ''}`);
      }
      if (!response.ok) {
        const teks = await response.text().catch(() => '');
        /* Potong isi balasan: kalau URL webhook salah, Discord kadang
           mengembalikan konteks panjang yang tidak perlu masuk log. */
        throw new Error(`HTTP ${response.status}${teks ? ` ${potong(teks, 160)}` : ''}`);
      }
      return daftar.length;
    } finally {
      clearTimeout(timer);
    }
  }

  /* notify() SENGAJA tidak pernah throw. Pemanggil (worker) hanya butuh
     tahu berapa yang terkirim; kegagalan webhook bukan kegagalan siklus. */
  async function notify(transitions = []) {
    const mulai = (transitions || []).filter((t) => t && t.type === 'started' && t.id);
    if (mulai.length === 0 || !valid()) return { sent: 0, skipped: mulai.length, failed: 0 };
    let perlu;
    try {
      perlu = await saring(mulai);
    } catch (error) {
      perlu = mulai;
    }
    if (perlu.length === 0) return { sent: 0, skipped: mulai.length, failed: 0 };

    let sent = 0;
    let failed = 0;
    const batches = [];
    ['showroom', 'idn', 'youtube'].forEach((platform) => {
      const entries = perlu.filter((entry) => String(entry.platform || '').toLowerCase() === platform);
      for (let i = 0; i < entries.length; i += MAKS_EMBED) batches.push({ platform, entries: entries.slice(i, i + MAKS_EMBED) });
    });
    const unknown = perlu.filter((entry) => !['showroom', 'idn', 'youtube'].includes(String(entry.platform || '').toLowerCase()));
    for (let i = 0; i < unknown.length; i += MAKS_EMBED) batches.push({ platform: '', entries: unknown.slice(i, i + MAKS_EMBED) });
    for (const { platform, entries: batch } of batches) {
      const hooks = platform && webhookPlatform[platform] ? [webhookPlatform[platform]] : daftarHook;
      /* Setiap webhook dicoba sendiri-sendiri. Satu channel yang webhook-nya
         sudah dihapus tidak boleh membuat channel lain kehilangan kabar. */
      let adaYangSukses = false;
      for (const hook of hooks) {
        try {
          await kirimSatuBatch(batch, hook);
          adaYangSukses = true;
        } catch (error) {
          lastError = `${labelWebhook(hook)}: ${error.message}`;
          logger.warn(`[DISCORD] gagal mengirim ${batch.length} notifikasi ke ${lastError}`);
        }
      }
      /* Dihitung per-batch, bukan per-webhook: yang diukur adalah "berapa
         siaran yang berhasil dikabarkan", bukan berapa request HTTP. */
      if (adaYangSukses) sent += batch.length;
      else failed += batch.length;
    }
    terkirim += sent;
    gagal += failed;
    if (sent > 0) {
      logger.log(`[DISCORD] ${sent} notifikasi terkirim sesuai platform.`);
    }
    return { sent, skipped: mulai.length - perlu.length, failed };
  }

  return {
    notify,
    get enabled() { return aktif; },
    status() {
      return {
        enabled: aktif,
        webhooks: daftarHook.length,
        platform_webhooks: Object.keys(webhookPlatform),
        sent: terkirim,
        failed: gagal,
        last_error: lastError,
        dedupe_ttl_seconds: dedupeTtlSeconds,
      };
    },
  };
}

module.exports = {
  createDiscordNotifier,
  kumpulkanWebhook,
  kumpulkanWebhookPlatform,
  labelWebhook,
  buatEmbed,
  barisTautan,
  jamMulai,
  WARNA,
  LABEL,
  MAKS_EMBED,
};
