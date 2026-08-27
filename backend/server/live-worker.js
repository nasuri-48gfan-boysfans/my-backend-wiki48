'use strict';

/* =============================================================
   live-worker.js — poller status live (Showroom / IDN / YouTube)
   -------------------------------------------------------------
   Dijalankan sebagai proses terpisah lewat `npm run live`
   (server/live-runner.js), atau in-process saat development.
   Hasil tiap siklus dipublikasikan ke Redis; API hanya membaca.

   KENAPA TIDAK SATU REQUEST PER MEMBER:
   roster ada 450 orang. Dengan jeda 3,5 detik per request, satu
   siklus "cek semua" butuh ±26 menit — lebih lama dari TTL snapshot,
   jadi statusnya kedaluwarsa sebelum siklus selesai. Karena itu:

     - Showroom : SATU request /api/live/onlives per siklus untuk
                  seluruh roster, lalu dicocokkan ke mapping lokal
                  memakai room_id / room_url_key. Biaya O(1).
     - IDN      : tidak ada endpoint massal, jadi per member tapi
                  bergilir (rotating cursor) dengan anggaran slot
                  per siklus. Member yang SEDANG live selalu dicek
                  lebih dulu supaya akhir siaran terdeteksi cepat.
     - YouTube  : search API memakan 100 unit kuota per panggilan
                  (kuota harian standar 10.000 = 100 panggilan/hari),
                  jadi anggaran default 0 dan harus dinyalakan sadar
                  lewat LIVE_YOUTUBE_BUDGET.

   Pencocokan Showroom SENGAJA hanya lewat room_id/room_url_key, tidak
   lewat nama: nama room bisa mirip antar grup dan salah cocok berarti
   menampilkan orang yang salah sebagai "sedang live".
   ============================================================= */

const { EventEmitter } = require('node:events');
const { RateLimiter } = require('../data/live-tracker/rate-limit');
const { ShowroomAdapter } = require('../data/live-tracker/showroom');
const { IdnAdapter } = require('../data/live-tracker/idn');
const { YouTubeAdapter } = require('../data/live-tracker/youtube');
const { DEFAULT_FILE, readStore, upsertMembers } = require('../data/live-tracker/store');
const { createLiveCache } = require('./live-cache');
const { createDiscordNotifier } = require('./discord-notify');
const { normalizeName } = require('../data/live-tracker/showroom');

const MIN_INTERVAL_MS = 30000;
const MAX_INTERVAL_MS = 300000;

function angka(nilai, bawaan) {
  const parsed = Number(nilai);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : bawaan;
}

function safeLiveTimestamp(item) {
  const rawTime = item?.started_at || item?.live_at || item?.created_at || item?.date || Date.now();
  if (rawTime instanceof Date) return Number.isNaN(rawTime.getTime()) ? Date.now() : rawTime.getTime();
  if (typeof rawTime === 'number' || /^\d+(?:\.\d+)?$/.test(String(rawTime).trim())) {
    const numeric = Number(rawTime);
    if (!Number.isFinite(numeric) || numeric <= 0) return Date.now();
    return numeric < 10000000000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(String(rawTime));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

function createProviderAdapters({
  minDelayMs = angka(process.env.LIVE_TRACKER_DELAY_MS, 3500),
  idnDelayMs = angka(process.env.LIVE_IDN_DELAY_MS, angka(process.env.LIVE_TRACKER_DELAY_MS, 3500)),
} = {}) {
  return {
    showroom: new ShowroomAdapter({ limiter: new RateLimiter({ minDelayMs }), authToken: process.env.SHOWROOM_AUTH_TOKEN }),
    idn: new IdnAdapter({ limiter: new RateLimiter({ minDelayMs: idnDelayMs }), authToken: process.env.IDN_AUTH_TOKEN }),
    youtube: process.env.YOUTUBE_API_KEY
      ? new YouTubeAdapter({ limiter: new RateLimiter({ minDelayMs }), apiKey: process.env.YOUTUBE_API_KEY })
      : null,
  };
}

function urlKeyOf(mapping) {
  return mapping.showroom_room_url_key ? String(mapping.showroom_room_url_key).toLowerCase() : null;
}

function roomNameValues(room) {
  return [room.room_url_key, room.roomUrlKey, room.url_key, room.slug, room.main_name,
    room.mainName, room.room_name, room.roomName, room.member_name, room.memberName,
    room.name, room.title].filter(Boolean).map(normalizeName).filter(Boolean);
}

function rosterNameValues(mapping) {
  return [mapping.member_name, mapping.name, mapping.nameLatin, mapping.nameNative]
    .filter(Boolean).map(normalizeName).filter(Boolean);
}

function matchShowroomRoom(room, mappings, logger = console) {
  const roomValues = roomNameValues(room);
  const candidates = mappings.map((mapping) => ({ mapping, names: rosterNameValues(mapping) }));
  const matched = candidates.find(({ names }) => names.some((name) => roomValues.some((value) => value === name || value.includes(name) || name.includes(value))));
  if (matched) return matched.mapping;
  logger.warn(`[SHOWROOM Unmatched Room] main_name="${room.main_name || room.room_name || room.name || ''}" room_url_key="${room.room_url_key || room.roomUrlKey || room.url_key || ''}" normalized="${roomValues.join(' | ')}"`);
  return null;
}

function dynamicShowroomMapping(room) {
  const roomId = room.room_id || room.live_id || room.roomId || room.liveId || room.room_url_key || room.roomUrlKey;
  if (!roomId) return null;
  return {
    id: `showroom-${roomId}`,
    member_name: normalizeName(room.main_name || room.mainName || room.room_name || room.roomName || room.member_name || room.name || room.title) || 'SHOWROOM Live',
    group: room.groupName,
    category: room.category,
    showroom_room_id: String(room.room_id || room.live_id || room.roomId || room.liveId || ''),
    showroom_room_url_key: room.room_url_key || room.roomUrlKey || room.url_key || room.slug || null,
    is_live: false,
    last_live_at: null,
  };
}

function dynamicIdnMapping(item) {
  const id = item.member_id || item.username || item.member_name;
  if (!id) return null;
  return { id: `idn-${id}`, member_name: item.member_name || item.username || 'JKT48 Live', group: 'JKT48', category: 'Kaigai', idn_username: item.username || null };
}

function matchIdnMember(item, mappings) {
  const values = [item.member_name, item.username].filter(Boolean).map(normalizeName);
  return mappings.find((mapping) => rosterNameValues(mapping).some((name) => values.some((value) => value === name || value.includes(name) || name.includes(value)))) || null;
}

/* Kunci status per member+platform: satu orang bisa live di dua platform
   sekaligus, dan keduanya layak ditampilkan. */
function stateKey(id, platform) {
  return `${id}:${platform}`;
}

function createLiveWorker({
  file = DEFAULT_FILE,
  intervalMs = angka(process.env.LIVE_TRACKER_INTERVAL_MS, 60000),
  holdMs = angka(process.env.LIVE_HOLD_MS, 300000),
  idnBudget,
  youtubeBudget = angka(process.env.LIVE_YOUTUBE_BUDGET, 0),
  idnDelayMs = angka(process.env.LIVE_IDN_DELAY_MS, angka(process.env.LIVE_TRACKER_DELAY_MS, 3500)),
  persist = process.env.LIVE_TRACKER_PERSIST !== 'false',
  logger = console,
  cache = createLiveCache({ logger }),
  notifier = createDiscordNotifier({ logger, cache }),
  providers = createProviderAdapters({ idnDelayMs }),
  now = () => Date.now(),
} = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) {
    throw new Error(`LIVE_TRACKER_INTERVAL_MS harus antara ${MIN_INTERVAL_MS} dan ${MAX_INTERVAL_MS} ms (sekarang: ${intervalMs}).`);
  }
  /* Anggaran slot IDN: pakai ~60% durasi siklus supaya masih ada ruang
     untuk request Showroom, latensi jaringan, dan retry limiter. */
  const slotIdn = idnBudget === undefined
    ? Math.max(1, Math.floor((intervalMs * 0.6) / Math.max(idnDelayMs, 250)))
    : idnBudget;

  const events = new EventEmitter();
  const liveState = new Map();   // `${id}:${platform}` → entri live terakhir
  let idnCursor = 0;
  let youtubeCursor = 0;
  let timer = null;
  let running = false;
  let polling = null;
  let persistDisabled = !persist;
  let warnedMappingKosong = false;
  let warnedPersist = false;
  let warnedYoutubeKey = false;
  let sudahSeed = false;

  /* SEED DARI SNAPSHOT SEBELUMNYA — wajib untuk mode cron.
     Tiap invocation serverless adalah proses baru dengan liveState kosong.
     Tanpa seed, SEMUA orang yang sedang live terlihat "baru mulai" setiap
     2 menit: transitions jadi bohong dan notifikasi Discord membanjir.
     Dengan membaca snapshot terakhir dari Redis lebih dulu, siklus ini tahu
     siapa yang sudah live sejak tadi, jadi `started` benar-benar berarti baru.

     `since` dan `started_at` ikut dipulihkan supaya durasi siaran tidak
     ter-reset tiap invocation. `last_seen` diambil dari checked_at snapshot,
     bukan dari now(): kalau snapshot ternyata sudah tua, entri itu memang
     pantas kena stale-drop di siklus ini. */
  async function seedDariCache() {
    if (sudahSeed) return 0;
    sudahSeed = true;
    if (liveState.size > 0) return 0;
    let snapshot = null;
    try {
      snapshot = await cache.getSnapshot();
    } catch (error) {
      logger.warn(`[LIVE] gagal membaca snapshot awal: ${error.message} — mulai dari kosong.`);
      return 0;
    }
    const daftar = Array.isArray(snapshot && snapshot.live) ? snapshot.live : [];
    let dipulihkan = 0;
    daftar.forEach((entri) => {
      if (!entri || !entri.id || !entri.platform) return;
      const stamp = Date.parse(entri.checked_at || (snapshot && snapshot.checked_at) || '');
      liveState.set(stateKey(entri.id, entri.platform), {
        ...entri,
        last_seen: Number.isFinite(stamp) ? stamp : now(),
      });
      dipulihkan += 1;
    });
    if (dipulihkan > 0) logger.log(`[LIVE] ${dipulihkan} entri live dipulihkan dari snapshot sebelumnya.`);
    return dipulihkan;
  }

  function catatMappingKosong(mapped) {
    if (mapped > 0 || warnedMappingKosong) return;
    warnedMappingKosong = true;
    logger.warn('[LIVE] Tidak ada satu pun mapping platform di members.json — poller akan selalu melaporkan 0 live.');
    logger.warn('[LIVE] Isi dulu: node data/tools/import-live-map.js <grup> --template lalu --write.');
  }

  function simpanMapping(updates) {
    if (persistDisabled || updates.length === 0) return;
    try {
      upsertMembers(updates, file);
    } catch (error) {
      persistDisabled = true;
      if (!warnedPersist) {
        warnedPersist = true;
        logger.warn(`[LIVE] members.json tidak bisa ditulis (${error.message}); status tetap jalan di memori + Redis.`);
      }
    }
  }

  /* Ambil `budget` entri berikutnya secara bergilir, dengan yang sedang
     live didahulukan. Cursor BARU tidak langsung dipakai: pemanggil yang
     memajukannya sebanyak entri rotasi yang betul-betul dicek, supaya
     member yang dibatalkan tenggat tidak ikut terlewat siklus berikutnya. */
  function ambilBergilir(list, cursor, budget, platform) {
    if (list.length === 0 || budget <= 0) return { pilihan: [], awal: cursor, prioritas: 0 };
    const prioritas = list.filter((m) => liveState.has(stateKey(m.id, platform)));
    const sisa = list.filter((m) => !liveState.has(stateKey(m.id, platform)));
    const pilihan = prioritas.slice(0, budget);
    const jumlahPrioritas = pilihan.length;
    let nextCursor = cursor;
    while (pilihan.length < budget && sisa.length > 0) {
      const kandidat = sisa[nextCursor % sisa.length];
      nextCursor += 1;
      if (!pilihan.includes(kandidat)) pilihan.push(kandidat);
      if (nextCursor - cursor >= sisa.length) break;   // sudah satu putaran penuh
    }
    return { pilihan, awal: cursor, prioritas: jumlahPrioritas };
  }

  function tandaiLive({ mapping, platform, liveUrl, title, startedAt, viewers, avatarUrl, group, category, waktu }) {
    const key = stateKey(mapping.id, platform);
    const sebelum = liveState.get(key);
    const iso = new Date(waktu).toISOString();
    const entri = {
      id: mapping.id,
      member_name: mapping.member_name,
      group: group || mapping.group || null,
      category: category || mapping.category || null,
      platform,
      is_live: true,
      live_url: liveUrl || null,
      title: title || null,
      started_at: new Date(safeLiveTimestamp({ started_at: startedAt || sebelum?.started_at })).toISOString(),
      /* since = kapan TRACKER pertama melihatnya live; started_at = kapan
         siarannya benar-benar mulai menurut platform. Dua-duanya disimpan
         karena started_at sering null (IDN) dan durasi tetap perlu ditampilkan. */
      since: sebelum?.since || iso,
      viewer_count: Number.isFinite(viewers) ? viewers : (sebelum?.viewer_count ?? null),
      avatar_url: avatarUrl || sebelum?.avatar_url || null,
      checked_at: iso,
      last_seen: waktu,
    };
    /* Alias camelCase: konsumen baru boleh pakai memberId/streamUrl/viewerCount,
       sementara common.js yang sudah jalan tetap membaca id/live_url. Menambah
       nama baru aman; MENGGANTI nama lama akan membuat badge live hilang. */
    entri.memberId = entri.id;
    entri.memberName = entri.member_name;
    entri.streamUrl = entri.live_url;
    entri.startedAt = entri.started_at || entri.since;
    entri.viewerCount = entri.viewer_count;
    entri.avatarUrl = entri.avatar_url;
    liveState.set(key, entri);
    return { baru: !sebelum, entri };
  }

  function tandaiMati(id, platform) {
    const key = stateKey(id, platform);
    const entri = liveState.get(key);
    if (!entri) return null;
    liveState.delete(key);
    return entri;
  }

  async function poll({ budgetMs = 0 } = {}) {
    const waktu = now();
    /* Seed lebih dulu, sebelum satu pun provider dicek: kalau tidak, member
       yang sebetulnya sudah live sejak tadi akan tercatat sebagai baru. */
    const dipulihkan = await seedDariCache();
    /* ANGGARAN WAKTU (mode cron).
       Fungsi serverless dibunuh saat maxDuration terlampaui — kalau itu
       terjadi sebelum cache.publish(), seluruh siklus terbuang dan snapshot
       lama keburu kedaluwarsa. Jadi loop per-member berhenti sendiri di
       tenggat, lalu snapshot APA ADANYA tetap dipublikasikan: data separuh
       yang terkirim jauh lebih berguna daripada siklus yang mati di tengah.
       Sisa 20% dipakai untuk stale-drop, tulis members.json, dan publish. */
    const tenggat = budgetMs > 0 ? waktu + Math.floor(budgetMs * 0.8) : Infinity;
    const cukupWaktu = (biayaMs) => now() + biayaMs <= tenggat;
    let terpotong = false;

    const store = readStore(file);
    const mappings = store.members;
    const showroomList = mappings.filter((m) => m.showroom_room_id || m.showroom_room_url_key);
    const all48List = mappings.filter((m) => /^[a-z0-9]+(?:48|48tsh)-/i.test(String(m.id || '')));
    const idnList = mappings.filter((m) => m.idn_username);
    const youtubeList = mappings.filter((m) => m.youtube_video_id || m.youtube_channel_id);

console.log('[DEBUG SHOWROOM]', {
  totalMembers: mappings.length,
  all48List: all48List.length,
  showroomList: showroomList.length,
  idnList: idnList.length,
});
     
    const mapped = new Set([...all48List, ...showroomList, ...idnList, ...youtubeList].map((m) => m.id)).size;
    catatMappingKosong(mapped);

    const transitions = [];
    const diperiksa = { showroom: 0, idn: 0, youtube: 0 };
    const providerStatus = {};
    const perubahan = new Map();   // id → patch mapping yang perlu disimpan
    const catatPatch = (mapping, patch) => {
      perubahan.set(mapping.id, { ...mapping, ...(perubahan.get(mapping.id) || {}), ...patch });
    };
    const mulai = (mapping, platform, data) => {
      const { baru, entri } = tandaiLive({ mapping, platform, waktu, ...data });
      if (baru) transitions.push({ type: 'started', ...entri });
      catatPatch(mapping, { last_live_at: entri.started_at || new Date(waktu).toISOString() });
    };
    const selesai = (mapping, platform) => {
      const entri = tandaiMati(mapping.id, platform);
      if (entri) transitions.push({ type: 'ended', ...entri, is_live: false });
    };
     console.log('[DEBUG SHOWROOM] mencoba memanggil Cloudflare...');

try {
  const testRooms = await providers.showroom.onlivesBy48Groups();

  console.log('[DEBUG SHOWROOM] Cloudflare response:', {
    jumlah: testRooms.length,
    rooms: testRooms.map((room) => ({
      room_id: room.room_id,
      room_url_key: room.room_url_key,
      member_name: room.member_name,
      group: room.groupName,
    })),
  });
} catch (error) {
  console.error('[DEBUG SHOWROOM] Cloudflare gagal:', error.message);
}

    /* ---------- Showroom: satu fetch massal seluruh 48 Group Family ---------- */
    if (providers.showroom && all48List.length > 0 && typeof providers.showroom.onlivesBy48Groups === 'function') {
      try {
        const rooms = await providers.showroom.onlivesBy48Groups();
        providerStatus.showroom = {
          ok: !providers.showroom.lastError,
          source: providers.showroom.lastSource || 'cloudflare-showroom-worker',
          groups: [...new Set(rooms.map((room) => room.groupName))],
          rooms_live: rooms.length,
          ...(providers.showroom.lastError ? { error: providers.showroom.lastError } : {}),
        };
        if (providers.showroom.lastError) logger.warn(`[LIVE] API SHOWROOM gagal: ${providers.showroom.lastError}`);
        diperiksa.showroom = all48List.length;
        const matchedIds = new Set();
        let matchedRoster = 0;
        let dynamicCount = 0;
        rooms.forEach((room) => {
          const rosterMapping = matchShowroomRoom(room, all48List, logger);
          const mapping = rosterMapping || dynamicShowroomMapping(room);
          if (!mapping) return;
          if (rosterMapping) {
            matchedRoster += 1;
          } else {
            dynamicCount += 1;
            logger.log(`[SHOWROOM Dynamic Verified] Name: ${room.main_name || room.member_name || room.name || room.title || mapping.member_name} | Key: ${room.room_url_key || room.roomUrlKey || room.url_key || ''}`);
          }
          matchedIds.add(mapping.id);
          const roomKey = room.room_url_key || mapping.showroom_room_url_key;
          mulai(mapping, 'showroom', {
            /* Format URL Showroom konsisten: /{room_url_key} tanpa prefiks
               /r/ — sama dengan fallback, common.js, dan mock test. */
            liveUrl: room.live_url || (roomKey ? `https://www.showroom-live.com/${roomKey}` : null),
            title: room.title || room.room_name || room.member_name,
            startedAt: room.started_at || room.startedAt || null,
            viewers: Number(room.view_num ?? room.viewNum ?? room.viewer_count ?? NaN),
            avatarUrl: room.image_square || room.image || room.avatar || null,
            group: room.groupName,
            category: room.category,
          });
        });
        logger.log(`[SHOWROOM Scan] Total 48G Lives Found: ${rooms.length} (Matched Roster: ${matchedRoster}, Dynamic: ${dynamicCount})`);
        all48List.forEach((mapping) => {
          if (!matchedIds.has(mapping.id)) selesai(mapping, 'showroom');
        });
      } catch (error) {
        providerStatus.showroom = { ok: false, source: 'cloudflare-showroom-worker', error: error.message };
        logger.warn(`[LIVE] Fetch SHOWROOM gagal: ${error.message}`);
      }
    } else if (providers.showroom && showroomList.length > 0) {
      /* Fallback untuk grup lain yang masih memakai mapping room lokal. */
      try {
        const rooms = await providers.showroom.onlives();
        const byRoomId = new Map();
        const byUrlKey = new Map();
        rooms.forEach((room) => {
          const roomId = String(room.room_id || room.roomId || room.id || '');
          const key = String(room.room_url_key || room.roomUrlKey || room.url_key || '').toLowerCase();
          if (roomId) byRoomId.set(roomId, room);
          if (key) byUrlKey.set(key, room);
        });
        providerStatus.showroom = { ok: true, rooms_live: rooms.length };
        diperiksa.showroom = showroomList.length;
        showroomList.forEach((mapping) => {
          const room = (mapping.showroom_room_id && byRoomId.get(String(mapping.showroom_room_id)))
            || (urlKeyOf(mapping) && byUrlKey.get(urlKeyOf(mapping)))
            || null;
          if (!room) {
            selesai(mapping, 'showroom');
            return;
          }
          const roomId = String(room.room_id || room.roomId || room.id || '') || mapping.showroom_room_id;
          const roomKey = room.room_url_key || room.roomUrlKey || room.url_key || mapping.showroom_room_url_key;
          mulai(mapping, 'showroom', {
            liveUrl: roomKey ? `https://www.showroom-live.com/${roomKey}` : null,
            title: room.room_name || room.roomName || room.main_name || room.name || null,
            startedAt: room.started_at || room.startedAt || null,
            /* onlives sudah membawa jumlah penonton dan avatar, jadi keduanya
               gratis di sini — tidak perlu request tambahan per member. */
            viewers: Number(room.view_num ?? room.viewNum ?? room.viewer_count ?? NaN),
            avatarUrl: room.image_square || room.image || room.main_image || null,
          });
          /* Mapping menyembuhkan dirinya sendiri: room_id numerik dan
             url_key terisi begitu member pertama kali terlihat live,
             jadi tidak perlu resolver terpisah. */
          const patch = {};
          if (roomId && String(mapping.showroom_room_id || '') !== String(roomId)) patch.showroom_room_id = String(roomId);
          if (roomKey && mapping.showroom_room_url_key !== roomKey) patch.showroom_room_url_key = roomKey;
          if (Object.keys(patch).length) catatPatch(mapping, patch);
        });
      } catch (error) {
        /* Provider gagal ≠ semua orang berhenti live. Entri lama ditahan
           sampai holdMs supaya satu error jaringan tidak mengosongkan banner. */
        providerStatus.showroom = { ok: false, error: error.message };
        logger.warn(`[LIVE] Showroom onlives gagal: ${error.message}`);
      }
    } else if (showroomList.length > 0) {
      providerStatus.showroom = { ok: false, error: 'adapter Showroom tidak aktif' };
    }

    /* ---------- IDN: bergilir, yang sedang live didahulukan ---------- */
    if (providers.idn && typeof providers.idn.onlivesJkt48 === 'function') {
      try {
        const items = await providers.idn.onlivesJkt48();
        const matchedIds = new Set();
        let matchedRoster = 0;
        let dynamicCount = 0;
        items.forEach((item) => {
          const rosterMapping = matchIdnMember(item, mappings.filter((mapping) => String(mapping.id).toLowerCase().startsWith('jkt48-')));
          const mapping = rosterMapping || dynamicIdnMapping(item);
          if (!mapping) return;
          if (rosterMapping) {
            matchedRoster += 1;
            matchedIds.add(mapping.id);
          } else {
            dynamicCount += 1;
          }
          mulai(mapping, 'idn', {
            liveUrl: item.live_url,
            title: item.title,
            viewers: item.viewer_count,
            avatarUrl: item.avatar_url,
            group: 'JKT48',
            category: 'Kaigai',
          });
        });
        logger.log(`[IDN Scan] JKT48 Lives Found: ${items.length} (Matched Roster: ${matchedRoster}, Dynamic: ${dynamicCount})`);
        providerStatus.idn = { ok: true, source: 'idn-next-data', lives: items.length, checked: items.length };
        diperiksa.idn = items.length;
        idnList.filter((mapping) => String(mapping.id).toLowerCase().startsWith('jkt48-')).forEach((mapping) => {
          if (!matchedIds.has(mapping.id)) selesai(mapping, 'idn');
        });
      } catch (error) {
        providerStatus.idn = { ok: false, source: 'idn-next-data', error: error.message };
        logger.warn(`[LIVE] IDN __NEXT_DATA__ gagal: ${error.message}`);
      }
    } else if (providers.idn && idnList.length > 0) {
      const { pilihan, awal, prioritas } = ambilBergilir(idnList, idnCursor, slotIdn, 'idn');
      let gagal = 0;
      let rotasiDicek = 0;
      for (const [urutan, mapping] of pilihan.entries()) {
        if (!cukupWaktu(idnDelayMs + 2000)) { terpotong = true; break; }
        /* Cursor hanya maju sebanyak entri rotasi yang BETUL-BETUL dicek,
           supaya member yang dibatalkan tenggat tidak ikut terlewat pada
           siklus berikutnya. */
        if (urutan >= prioritas) rotasiDicek += 1;
        try {
          const hasil = await providers.idn.check(mapping.idn_username);
          diperiksa.idn += 1;
          if (hasil.is_live) {
            mulai(mapping, 'idn', {
              liveUrl: hasil.live_url || `https://www.idn.app/${mapping.idn_username}`,
              title: hasil.title || null,
              startedAt: hasil.started_at || null,
            });
          } else {
            selesai(mapping, 'idn');
          }
        } catch (error) {
          gagal += 1;
          logger.warn(`[LIVE] IDN ${mapping.member_name}: ${error.message}`);
        }
      }
      idnCursor = awal + rotasiDicek;
      providerStatus.idn = { ok: gagal < pilihan.length, checked: diperiksa.idn, failed: gagal, queue: idnList.length, budget: slotIdn };
    }

    /* ---------- YouTube: hemat kuota, default mati ---------- */
    if (youtubeList.length > 0 && !providers.youtube && !warnedYoutubeKey) {
      warnedYoutubeKey = true;
      logger.warn('[LIVE] Ada mapping YouTube tetapi YOUTUBE_API_KEY kosong — dilewati.');
    }
    if (providers.youtube && youtubeList.length > 0 && youtubeBudget > 0) {
      const { pilihan, awal, prioritas } = ambilBergilir(youtubeList, youtubeCursor, youtubeBudget, 'youtube');
      let gagal = 0;
      let rotasiDicek = 0;
      for (const [urutan, mapping] of pilihan.entries()) {
        if (!cukupWaktu(2000)) { terpotong = true; break; }
        if (urutan >= prioritas) rotasiDicek += 1;
        try {
          const hasil = await providers.youtube.check(mapping);
          diperiksa.youtube += 1;
          if (hasil.is_live) {
            mulai(mapping, 'youtube', { liveUrl: hasil.live_url, title: hasil.title, startedAt: hasil.started_at });
          } else {
            selesai(mapping, 'youtube');
          }
        } catch (error) {
          gagal += 1;
          logger.warn(`[LIVE] YouTube ${mapping.member_name}: ${error.message}`);
        }
      }
      youtubeCursor = awal + rotasiDicek;
      providerStatus.youtube = { ok: gagal < pilihan.length, checked: diperiksa.youtube, failed: gagal, queue: youtubeList.length, budget: youtubeBudget };
    }

    /* ---------- Buang entri yang sudah terlalu lama tidak terlihat ---------- */
    [...liveState.entries()].forEach(([key, entri]) => {
      if (waktu - entri.last_seen <= holdMs) return;
      liveState.delete(key);
      transitions.push({ type: 'ended', ...entri, is_live: false, reason: 'stale' });
    });

    const live = [...liveState.values()]
      .map(({ last_seen: lastSeen, ...entri }) => entri)
      .sort((a, b) => a.id.localeCompare(b.id) || a.platform.localeCompare(b.platform));

    /* is_live di members.json dihitung dari gabungan semua platform, bukan
       per platform: member yang live di IDN tidak boleh ditulis "mati" hanya
       karena room Showroom-nya tidak menyala. */
    const idLive = new Set(live.map((entri) => entri.id));
    mappings.forEach((mapping) => {
      const sekarang = idLive.has(mapping.id);
      if (Boolean(mapping.is_live) !== sekarang) catatPatch(mapping, { is_live: sekarang });
    });

    const snapshot = {
      checked_at: new Date(waktu).toISOString(),
      live,
      meta: {
        interval_ms: intervalMs,
        hold_ms: holdMs,
        mapped,
        roster: mappings.length,
        queues: { showroom: Math.max(showroomList.length, all48List.length), idn: idnList.length, youtube: youtubeList.length },
        checked: diperiksa,
        providers: providerStatus,
        /* truncated = tenggat habis sebelum semua slot dicek. Bukan error,
           tapi tanda bahwa anggaran waktu cron perlu dinaikkan (atau
           interval-nya dirapatkan) kalau sering terjadi. */
        budget_ms: budgetMs || null,
        truncated: terpotong,
        duration_ms: now() - waktu,
        seeded: dipulihkan,
      },
    };

    simpanMapping([...perubahan.values()]);
    /* URUTAN INI DISENGAJA: snapshot masuk Redis DULU, notifikasi belakangan.
       Permintaannya jelas — webhook yang gagal tidak boleh menggagalkan
       caching. Karena publish() sudah selesai di sini, apa pun yang terjadi
       pada Discord tidak bisa lagi merusak data yang tersimpan. */
    await cache.publish(snapshot);
    let discord = { sent: 0, skipped: 0, failed: 0 };
    if (notifier && typeof notifier.notify === 'function') {
      try {
        discord = await notifier.notify(transitions);
      } catch (error) {
        /* notify() sudah menelan error-nya sendiri; ini jaring terakhir
           kalau ada bug di notifier, supaya siklus tetap dianggap sukses. */
        logger.warn(`[DISCORD] notifier bermasalah: ${error.message}`);
      }
    }
    snapshot.meta.discord = discord;   // hanya untuk laporan; snapshot di Redis sudah ditulis di atas
    events.emit('snapshot', snapshot, transitions);
    transitions.forEach((transition) => events.emit('transition', transition));
    return { snapshot, transitions, members: mappings.length, discord };
  }

  async function run() {
    if (!running) return;
    polling = poll()
      .catch((error) => {
        logger.error(`[LIVE WORKER] ${error.message}`);
        return null;
      })
      .finally(() => { polling = null; });
    await polling;
    /* Timer ini SENGAJA tidak di-unref: pada `npm run live` dialah satu-satunya
       hal yang menahan proses tetap hidup. stop() yang membersihkannya. */
    if (running) timer = setTimeout(run, intervalMs);
  }

  return {
    events,
    cache,
    notifier,
    get intervalMs() { return intervalMs; },
    get liveCount() { return liveState.size; },
    async start() {
      await cache.connect();
      running = true;
      await run();
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      if (polling) await polling.catch(() => {});
      await cache.close();
    },
    poll,
  };
}

module.exports = { createLiveWorker, createProviderAdapters, MIN_INTERVAL_MS, MAX_INTERVAL_MS };
