'use strict';

/* =============================================================
   youtube-webhook.js — penerima WebSub/PubSubHubbub YouTube
   -------------------------------------------------------------
   ALUR:
     1. Kita SUBSCRIBE ke hub Google untuk tiap Channel ID di
        env YOUTUBE_CHANNEL_IDS (topic = feed XML resmi channel).
     2. Saat channel mengunggah video, hub mengirim POST Atom ke
        callback ini (YOUTUBE_WEBHOOK_URL).
     3. Verifikasi challenge (GET), validasi tanda tangan HMAC
        (opsional, YOUTUBE_WEBHOOK_SECRET), parse XML, simpan ke
        tabel youtube_videos di Postgres (Supabase).

   KEAMANAN & SOPAN-SANTUNAN TERHADAP HUB:
     - Challenge hanya dibalas untuk channel milik kita.
     - Notifikasi dari channel lain DILEWATI dengan 200 (membalas
       error membuat hub terus mencoba ulang tanpa guna).
     - Duplikat ditangani database (ON CONFLICT), bukan dengan
       menolak request.
     - Langganan TIDAK diperbarui tiap restart: leased_until disimpan
       di tabel youtube_subscriptions; perpanjangan hanya bila sisa
       umur < 2 hari, dicek berkala oleh timer (bukan lokal PC).
   ============================================================= */

const crypto = require('node:crypto');

const HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';
const UMAH_UMUR_HARI = 10;                                   // minta sewa 10 hari
const PERPANJANG_BILA_SISA_DETIK = 2 * 24 * 3600;            // sisa < 2 hari → perpanjang
const CEK_TIAP_MS = 6 * 3600 * 1000;                         // pemeriksaan tiap 6 jam

function topikChannel(channelId) {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
}

/* Daftar Channel ID sah dari env. Format UC + 22 karakter dipaksa —
   salah tempel handle (@nama) tidak akan lolos diam-diam. */
function daftarChannel(env = process.env) {
  return String(env.YOUTUBE_CHANNEL_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^UC[\w-]{22}$/.test(s));
}

/* Token verifikasi stabil per channel (dikirim saat subscribe,
   lalu dicocokkan kembali saat hub melakukan challenge). */
function tokenVerifikasi(channelId, secret) {
  return crypto
    .createHash('sha256')
    .update(`${secret || ''}|${channelId}`)
    .digest('hex')
    .slice(0, 32);
}

/* Validasi X-Hub-Signature-256 (HMAC body dengan hub.secret).
   Tanpa secret dikonfigurasi → selalu lolos (fitur opsional). */
function verifikasiTandaTangan(secret, body, headerSignature) {
  if (!secret) return true;
  const header = String(headerSignature || '');
  if (!header.startsWith('sha256=')) return false;
  const harapan = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(harapan);
  const b = Buffer.from(header.slice(7), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* Parser Atom YouTube — sadar namespace yt:. Entri tanpa videoId
   (mis. aktivitas hapus) dilewati. Tidak butuh dependensi XML. */
function parseAtomFeed(xml) {
  const hasil = [];
  const bloks = String(xml || '').match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const blok of bloks) {
    const ambil = (tag) => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(blok);
      return m ? m[1].trim() : '';
    };
    const videoId = ambil('yt:videoId');
    const channelId = ambil('yt:channelId');
    if (!/^[\w-]{11}$/.test(videoId) || !channelId) continue;
    const judul = ambil('title').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const link = /<link[^>]*href="([^"]*watch\?v=[^"]*)"/.exec(blok);
    hasil.push({
      videoId,
      channelId,
      title: judul || '(tanpa judul)',
      url: link ? link[1].replace(/&amp;/g, '&') : `https://www.youtube.com/watch?v=${videoId}`,
      published: ambil('published') || null,
      updated: ambil('updated') || null,
    });
  }
  return hasil;
}

/* Satu permintaan subscribe/unsubscribe ke hub. */
async function mintaKeHub(mode, channelId, { callbackUrl, secret }) {
  const params = new URLSearchParams({
    'hub.mode': mode,
    'hub.topic': topikChannel(channelId),
    'hub.callback': callbackUrl,
    'hub.verify': 'sync',
    'hub.verify_token': tokenVerifikasi(channelId, secret),
    'hub.lease_seconds': String(UMAH_UMUR_HARI * 24 * 3600),
  });
  if (secret) params.set('hub.secret', secret);
  const res = await fetch(HUB_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`hub HTTP ${res.status}`);
  return true;
}

function buatModul({ app, pool, logger = console } = {}) {
  const secret = process.env.YOUTUBE_WEBHOOK_SECRET || '';
  let callbackUrl = () => String(process.env.YOUTUBE_WEBHOOK_URL || '').trim().replace(/\/+$/, '');

  /* ---- GET: verifikasi challenge dari hub ---------------------- */
  app.get('/webhook/youtube', (req, res) => {
    const mode = String(req.query['hub.mode'] || '');
    const challenge = String(req.query['hub.challenge'] || '');
    const topic = String(req.query['hub.topic'] || '');
    const token = String(req.query['hub.verify_token'] || '');
    const channelId = String(topic.split('channel_id=')[1] || '');

    logger.log(`[YT-WEBHOOK] verifikasi: mode=${mode || '-'} topic=${topic}`);

    if (!challenge) return res.status(400).json({ error: 'hub.challenge tidak ada.' });
    if (!['subscribe', 'unsubscribe'].includes(mode)) {
      return res.status(400).json({ error: 'hub.mode tidak dikenali.' });
    }
    /* Hanya terima challenge untuk channel yang terdaftar. */
    const sah = daftarChannel().includes(channelId);
    if (!sah) {
      logger.warn(`[YT-WEBHOOK] verifikasi untuk channel ASING ditolak: ${topic}`);
      return res.status(403).json({ error: 'Channel tidak terdaftar.' });
    }
    if (secret && token && token !== tokenVerifikasi(channelId, secret)) {
      logger.warn('[YT-WEBHOOK] verify_token tidak cocok.');
      return res.status(403).json({ error: 'verify_token salah.' });
    }
    logger.log(`[YT-WEBHOOK] challenge diterima (${mode}) untuk ${channelId}`);
    return res.status(200).type('text/plain').send(challenge);
  });

  /* ---- POST: notifikasi upload ---------------------------------- */
  app.post('/webhook/youtube', require('express').text({ type: '*/*', limit: '2mb' }), async (req, res) => {
    const body = typeof req.body === 'string' ? req.body : '';
    if (!body.trim()) return res.status(400).json({ error: 'Body kosong.' });

    /* Tanda tangan (opsional) — diverifikasi terhadap body mentah. */
    if (!verifikasiTandaTangan(secret, body, req.get('x-hub-signature-256'))) {
      logger.warn('[YT-WEBHOOK] tanda tangan HMAC tidak cocok — ditolak.');
      return res.status(403).json({ error: 'Signature tidak valid.' });
    }

    let entries;
    try {
      entries = parseAtomFeed(body);
    } catch (error) {
      logger.error(`[YT-WEBHOOK] XML rusak: ${error.message}`);
      return res.status(400).json({ error: 'XML tidak bisa diurai.' });
    }
    if (!entries.length && !/<feed/i.test(body)) {
      return res.status(400).json({ error: 'Bukan payload Atom YouTube.' });
    }

    const sah = new Set(daftarChannel());
    let baru = 0;
    let duplikat = 0;
    let diskip = 0;

    for (const entri of entries) {
      if (!sah.has(entri.channelId)) {
        diskip += 1;
        logger.log(`[YT-WEBHOOK] lewati: channel asing ${entri.channelId} (${entri.videoId})`);
        continue;
      }
      try {
        const hasil = await pool.query(
          `INSERT INTO youtube_videos (video_id, channel_id, title, video_url, published_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (video_id) DO UPDATE
             SET title = EXCLUDED.title,
                 updated_at = EXCLUDED.updated_at,
                 fetched_at = NOW()
           RETURNING (xmax = 0) AS inserted`,
          [entri.videoId, entri.channelId, entri.title, entri.url, entri.published, entri.updated],
        );
        const masukBaru = hasil.rows[0] && hasil.rows[0].inserted === true;
        if (masukBaru) {
          baru += 1;
          logger.log(`[YT-WEBHOOK] VIDEO BARU ${entri.channelId} · ${entri.videoId} · "${entri.title}"`);
        } else {
          duplikat += 1;
          logger.log(`[YT-WEBHOOK] duplikat dilewati: ${entri.videoId}`);
        }
      } catch (error) {
        /* Error DB per-entri tidak boleh menggagalkan entri lain,
           tapi respons tetap 500 agar hub mengirim ulang nanti. */
        logger.error(`[YT-WEBHOOK] DB gagal utk ${entri.videoId}: ${error.message}`);
        return res.status(500).json({ error: 'Gagal menyimpan ke database.' });
      }
    }

    logger.log(`[YT-WEBHOOK] notifikasi diproses: baru=${baru} duplikat=${duplikat} asing=${diskip}`);
    return res.status(200).json({ status: 'success', baru, duplikat, dilewati: diskip });
  });

  /* ---- Manajemen langganan -------------------------------------- */
  async function perbaruiSemuaLangganan(alasan = 'terjadwal') {
    const channels = daftarChannel();
    const callback = callbackUrl();
    if (!channels.length) return { dilewati: 'YOUTUBE_CHANNEL_IDS kosong.' };
    if (!callback) return { dilewati: 'YOUTUBE_WEBHOOK_URL kosong.' };

    const { rows } = await pool.query(
      'SELECT channel_id, leased_until FROM youtube_subscriptions WHERE channel_id = ANY($1)',
      [channels],
    );
    const sewa = new Map(rows.map((r) => [r.channel_id, new Date(r.leased_until).getTime()]));
    const batasPerpanjang = Date.now() + PERPANJANG_BILA_SISA_DETIK * 1000;

    const hasil = [];
    for (const channelId of channels) {
      const habis = sewa.get(channelId) || 0;
      if (habis > batasPerpanjang) {
        hasil.push({ channel_id: channelId, status: 'masih-valid', berlaku_hingga: new Date(habis).toISOString() });
        continue;
      }
      try {
        await mintaKeHub('subscribe', channelId, { callbackUrl, secret });
        const leasedUntil = new Date(Date.now() + UMAH_UMUR_HARI * 24 * 3600 * 1000).toISOString();
        await pool.query(
          `INSERT INTO youtube_subscriptions (channel_id, leased_until)
           VALUES ($1, $2)
           ON CONFLICT (channel_id) DO UPDATE SET leased_until = EXCLUDED.leased_until, updated_at = NOW()`,
          [channelId, leasedUntil],
        );
        logger.log(`[YT-WEBHOOK] subscribe OK (${alasan}): ${channelId} s.d. ${leasedUntil}`);
        hasil.push({ channel_id: channelId, status: 'disubscribe', leased_until: leasedUntil });
      } catch (error) {
        logger.error(`[YT-WEBHOOK] subscribe GAGAL ${channelId}: ${error.message}`);
        hasil.push({ channel_id: channelId, status: 'gagal', error: error.message });
      }
      await new Promise((r) => setTimeout(r, 300));   // sopan ke hub
    }
    return hasil;
  }

  function jadwalkanPembaruan() {
    const sikap = () => {
      perbaruiSemuaLangganan('berkala').catch((e) => logger.error(`[YT-WEBHOOK] pembaruan berkala gagal: ${e.message}`));
    };
    const mulai = setTimeout(sikap, 8000);
    const interval = setInterval(sikap, CEK_TIAP_MS);
    if (typeof mulai.unref === 'function') mulai.unref();
    if (typeof interval.unref === 'function') interval.unref();
  }

  return { perbaruiSemuaLangganan, jadwalkanPembaruan };
}

module.exports = {
  buatModul,
  parseAtomFeed,
  daftarChannel,
  verifikasiTandaTangan,
  tokenVerifikasi,
  topikChannel,
};
