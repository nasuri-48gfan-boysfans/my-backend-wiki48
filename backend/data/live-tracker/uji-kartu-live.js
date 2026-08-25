'use strict';

/* =============================================================
   uji-kartu-live.js — uji keadaan kartu live TANPA browser
   -------------------------------------------------------------
   PAKAI:  node data/live-tracker/uji-kartu-live.js
   Keluar 0 kalau semua lulus, 1 kalau ada yang gagal.

   common.js dimuat di dalam vm dengan DOM tiruan (pola yang sama
   dipakai data/tools/audit.js). Yang diuji adalah keputusan murni:
   kapan situs boleh berkata "belum ada yang live", dan kapan dia
   HARUS mengaku tidak tahu.

   Kenapa ini perlu diuji sama sekali: sebelum tambalan ini, frontend
   membuang field `stale` dan `tracker.has_snapshot`, jadi tracker yang
   mati total tampil sebagai "Belum ada yang live" — salah, terdengar
   yakin, dan tidak meninggalkan jejak apa pun untuk dilacak. Kegagalan
   seperti itu tidak akan pernah muncul sebagai error di console.
   ============================================================= */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AKAR = path.join(__dirname, '..', '..', '..', 'frontend');
const BAHASA = ['id', 'en', 'ja', 'th', 'zh-CN', 'zh-TW', 'ms'];
const KUNCI_KEADAAN = ['liveNone', 'liveNeverChecked', 'liveStale', 'liveStaleLast', 'liveOffline', 'liveOfflineLast'];

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

/* ---------- muat common.js dengan DOM tiruan ---------- */
function muatCommon() {
  const kotak = { bahasa: 'id', fetchBalasan: null, fetchDipanggil: 0 };

  const stubEl = new Proxy({}, {
    get: (t, k) => {
      if (k === 'lang') return kotak.bahasa;          // dipakai currentUiCode()
      if (k === 'style' || k === 'dataset' || k === 'classList') return stubEl;
      if (typeof k === 'string' && /^(querySelector|closest|appendChild|addEventListener|setAttribute|add|remove|toggle|contains|focus)$/.test(k)) {
        return () => (k === 'querySelector' || k === 'closest' ? null : undefined);
      }
      return '';
    },
    set: () => true,
  });

  const sandbox = {
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => stubEl,
      addEventListener: () => {},
      dispatchEvent: () => {},
      documentElement: stubEl,
      body: stubEl,
    },
    /* setTimeout dipakai loader stage di common.js saat modul dimuat;
       versi no-op supaya timer tidak menahan proses uji.
       `location` level atas dipakai initActiveNav() (bukan window.location). */
    location: { href: 'https://wiki48.test/index.html', pathname: '/index.html', search: '', hash: '', protocol: 'https:' },
    /* CustomEvent dipakai initI18n saat modul dimuat. */
    CustomEvent: class CustomEvent { constructor(type, opsi = {}) { this.type = type; this.detail = opsi.detail; } },
    window: { addEventListener: () => {}, location: { search: '', hash: '', protocol: 'https:' }, setTimeout: () => 0, clearTimeout: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console: { log() {}, warn() {}, error() {} },
    encodeURIComponent,
    URLSearchParams,
    URL,
    Date,
    Math,
    JSON,
    /* fetch tiruan: dikendalikan lewat kotak.fetchBalasan */
    fetch: async () => {
      kotak.fetchDipanggil += 1;
      const b = kotak.fetchBalasan;
      if (typeof b === 'function') return b();
      return b;
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const kode = fs.readFileSync(path.join(AKAR, 'common.js'), 'utf8');
  const ekspor = '\n;({ MEMBERS, liveTrackerHealth, liveTrackerCardState, liveTrackerStampText,'
    + ' catatKesehatanLive, catatGagalLive, fetchLiveTrackerSnapshot, uiCardText, liveMembers });';
  const api = new vm.Script(kode + ekspor, { filename: 'common.js' }).runInContext(sandbox);
  return { api, kotak };
}

function balasan(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

function payloadLive(daftar, tambahan = {}) {
  return {
    checked_at: new Date().toISOString(),
    live: daftar,
    age_ms: 1000,
    stale: false,
    tracker: { worker: 'external', sse: false, redis: {}, has_snapshot: true },
    ...tambahan,
  };
}

async function main() {
  console.log('UJI KEADAAN KARTU LIVE (common.js di vm, tanpa browser)\n');
  const { api, kotak } = muatCommon();
  const {
    liveTrackerHealth, liveTrackerCardState, liveTrackerStampText,
    catatKesehatanLive, catatGagalLive, fetchLiveTrackerSnapshot, uiCardText, MEMBERS, liveMembers,
  } = api;

  /* ---------- 1. Matriks keputusan (fungsi murni) ---------- */
  console.log('keputusan: kapan boleh bilang "belum ada yang live"');

  await uji('tracker tidak terjangkau + 0 live → BUKAN "kosong"', () => {
    const k = liveTrackerCardState({ reachable: false }, 0);
    assert.strictEqual(k.kode, 'takTerjangkau');
    assert.notStrictEqual(k.kode, 'kosong', 'inilah bug yang ditambal: tidak tahu ≠ tidak ada');
    assert.strictEqual(k.nada, 'peringatan');
  });

  await uji('tracker tidak terjangkau + masih ada nama → nama tetap ditampilkan', () => {
    const k = liveTrackerCardState({ reachable: false }, 3);
    assert.strictEqual(k.kode, 'takTerjangkau');
    assert.strictEqual(k.tampilkanNama, true,
      'daftar terakhir lebih berguna daripada layar kosong, asal dilabeli');
    assert.strictEqual(k.kunci, 'liveOfflineLast');
  });

  await uji('terjangkau tapi belum pernah ada snapshot → "belumPernah"', () => {
    const k = liveTrackerCardState({ reachable: true, hasSnapshot: false, stale: true }, 0);
    assert.strictEqual(k.kode, 'belumPernah');
    assert.strictEqual(k.nada, 'peringatan');
  });

  await uji('snapshot kedaluwarsa → "kedaluwarsa", bukan "kosong"', () => {
    const k = liveTrackerCardState({ reachable: true, hasSnapshot: true, stale: true }, 0);
    assert.strictEqual(k.kode, 'kedaluwarsa');
  });

  await uji('snapshot kedaluwarsa + ada nama → nama + label kedaluwarsa', () => {
    const k = liveTrackerCardState({ reachable: true, hasSnapshot: true, stale: true }, 2);
    assert.strictEqual(k.kode, 'kedaluwarsa');
    assert.strictEqual(k.tampilkanNama, true);
    assert.strictEqual(k.kunci, 'liveStaleLast');
  });

  await uji('sehat + 0 live → "kosong" (satu-satunya keadaan yang boleh berkata begitu)', () => {
    const k = liveTrackerCardState({ reachable: true, hasSnapshot: true, stale: false }, 0);
    assert.strictEqual(k.kode, 'kosong');
    assert.strictEqual(k.nada, 'netral');
    assert.strictEqual(k.kunci, 'liveNone');
  });

  await uji('sehat + ada live → "live"', () => {
    const k = liveTrackerCardState({ reachable: true, hasSnapshot: true, stale: false }, 4);
    assert.strictEqual(k.kode, 'live');
    assert.strictEqual(k.nada, 'ok');
    assert.strictEqual(k.kunci, null, 'nama member yang tampil, bukan teks keadaan');
  });

  await uji('health kosong/undefined tidak melempar', () => {
    assert.strictEqual(liveTrackerCardState(undefined, 0).kode, 'takTerjangkau');
    assert.strictEqual(liveTrackerCardState(null, NaN).kode, 'takTerjangkau');
  });

  /* ---------- 2. Terjemahan lengkap ---------- */
  console.log('\nterjemahan keadaan');
  await uji(`${KUNCI_KEADAAN.length} kunci keadaan terisi di ${BAHASA.length} bahasa`, () => {
    const bolong = [];
    BAHASA.forEach((kode) => {
      kotak.bahasa = kode;
      KUNCI_KEADAAN.forEach((kunci) => {
        const teks = uiCardText(kunci);
        if (typeof teks !== 'string' || teks.trim() === '') bolong.push(`${kode}.${kunci}`);
      });
    });
    kotak.bahasa = 'id';
    assert.deepStrictEqual(bolong, [], `kosong/undefined: ${bolong.join(', ')}`);
  });

  await uji('"sepi" dan "tidak tahu" tidak memakai kalimat yang sama', () => {
    BAHASA.forEach((kode) => {
      kotak.bahasa = kode;
      assert.notStrictEqual(uiCardText('liveNone'), uiCardText('liveOffline'), `bahasa ${kode}`);
      assert.notStrictEqual(uiCardText('liveNone'), uiCardText('liveNeverChecked'), `bahasa ${kode}`);
    });
    kotak.bahasa = 'id';
  });

  /* ---------- 3. Teks cap waktu ---------- */
  console.log('\nteks cap waktu');
  await uji('tak terjangkau: tidak menyebut "diperbarui"', () => {
    const teks = liveTrackerStampText({ reachable: false, checkedAt: null });
    assert.match(teks, /tidak terjangkau/i);
    assert.doesNotMatch(teks, /diperbarui/i, 'jangan mengaku baru memperbarui saat gagal menghubungi');
  });
  await uji('tak terjangkau tapi ada data lama: sebutkan jamnya', () => {
    const teks = liveTrackerStampText({ reachable: false, checkedAt: '2026-08-24T03:00:00.000Z' });
    assert.match(teks, /\d{2}[.:]\d{2}/, `tidak ada jam: ${teks}`);
  });
  await uji('belum pernah dicek: dikatakan apa adanya', () => {
    assert.match(liveTrackerStampText({ reachable: true, hasSnapshot: false }), /belum pernah/i);
  });
  await uji('sehat: sebut interval polling', () => {
    const teks = liveTrackerStampText(
      { reachable: true, hasSnapshot: true, stale: false, checkedAt: new Date().toISOString() },
      { intervalMs: 30000 },
    );
    assert.match(teks, /30 detik/);
  });
  await uji('kedaluwarsa: kata "kedaluwarsa" muncul, interval tidak diklaim', () => {
    const teks = liveTrackerStampText(
      { reachable: true, hasSnapshot: true, stale: true, checkedAt: new Date().toISOString() },
      { intervalMs: 30000 },
    );
    assert.match(teks, /kedaluwarsa/i);
    assert.doesNotMatch(teks, /otomatis tiap/);
  });
  await uji('checkedAt rusak tidak menghasilkan "Invalid Date"', () => {
    const teks = liveTrackerStampText({ reachable: true, hasSnapshot: true, stale: false, checkedAt: 'bukan-tanggal' });
    assert.doesNotMatch(teks, /invalid/i, teks);
    assert.doesNotMatch(teks, /NaN/, teks);
  });

  /* ---------- 4. Pencatatan kesehatan dari jaringan ---------- */
  console.log('\npencatatan kesehatan saat mengambil data');
  const idContoh = MEMBERS[0] && MEMBERS[0].id;
  assert.ok(idContoh, 'roster kosong — uji ini butuh minimal satu member');

  await uji('sukses: kesehatan tercatat & isLive menempel ke member', async () => {
    kotak.fetchBalasan = balasan(payloadLive([{
      id: idContoh, member_name: 'Contoh', platform: 'showroom', live_url: 'https://x/y',
    }]));
    const hasil = await fetchLiveTrackerSnapshot();
    assert.strictEqual(hasil.length, 1);
    assert.strictEqual(liveTrackerHealth.reachable, true);
    assert.strictEqual(liveTrackerHealth.hasSnapshot, true);
    assert.strictEqual(liveTrackerHealth.stale, false);
    assert.strictEqual(liveTrackerHealth.sse, false, 'tracker.sse harus terbaca supaya SSE tidak dibuka sia-sia');
    assert.strictEqual(liveMembers().length, 1);
    assert.strictEqual(liveTrackerCardState(liveTrackerHealth, 1).kode, 'live');
  });

  await uji('jaringan gagal: dicatat DULU lalu dilempar', async () => {
    kotak.fetchBalasan = () => { throw new Error('fetch failed'); };
    await assert.rejects(() => fetchLiveTrackerSnapshot(), /fetch failed/);
    assert.strictEqual(liveTrackerHealth.reachable, false);
    assert.match(liveTrackerHealth.error, /fetch failed/);
  });

  await uji('setelah gagal, daftar live lama TIDAK dihapus', () => {
    assert.strictEqual(liveMembers().length, 1,
      'menghapus daftar saat kehilangan kabar = memalsukan "sudah selesai live"');
    const k = liveTrackerCardState(liveTrackerHealth, 1);
    assert.strictEqual(k.kode, 'takTerjangkau');
    assert.strictEqual(k.tampilkanNama, true);
  });

  await uji('HTTP 500: dianggap tidak terjangkau', async () => {
    kotak.fetchBalasan = balasan({}, { ok: false, status: 500 });
    await assert.rejects(() => fetchLiveTrackerSnapshot(), /HTTP 500/);
    assert.strictEqual(liveTrackerHealth.reachable, false);
  });

  await uji('payload tanpa array live: ditolak, bukan dipercaya separuh', async () => {
    kotak.fetchBalasan = balasan({ checked_at: null, live: 'bukan-array' });
    await assert.rejects(() => fetchLiveTrackerSnapshot(), /tidak valid/);
    assert.strictEqual(liveTrackerHealth.reachable, false);
  });

  await uji('regresi asli: snapshot kosong + belum pernah dicek ≠ "belum ada yang live"', async () => {
    /* Ini persis balasan /api/live saat cron belum pernah jalan —
       keadaan nyata di proyek ini sebelum mapping & Upstash dibereskan. */
    kotak.fetchBalasan = balasan({
      checked_at: null, live: [], age_ms: null, stale: true,
      tracker: { worker: 'external', sse: false, redis: {}, has_snapshot: false },
    });
    await fetchLiveTrackerSnapshot();
    assert.strictEqual(liveMembers().length, 0);
    const k = liveTrackerCardState(liveTrackerHealth, 0);
    assert.strictEqual(k.kode, 'belumPernah',
      'kalau ini "kosong", situs kembali berbohong dengan percaya diri');
    kotak.bahasa = 'id';
    assert.notStrictEqual(uiCardText(k.kunci), uiCardText('liveNone'));
  });

  await uji('pulih: sekali sukses, label peringatan hilang', async () => {
    kotak.fetchBalasan = balasan(payloadLive([]));
    await fetchLiveTrackerSnapshot();
    const k = liveTrackerCardState(liveTrackerHealth, 0);
    assert.strictEqual(k.kode, 'kosong', 'tracker sehat & memang sepi → boleh berkata sepi');
    assert.strictEqual(k.nada, 'netral');
  });

  console.log(`\n${lulus} lulus, ${gagalTotal} gagal`);
  if (gagalTotal > 0) {
    console.log('\nRINCIAN GAGAL:');
    kegagalan.forEach((k) => console.log(`  - ${k}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`uji-kartu-live.js bermasalah: ${error.stack}`);
  process.exitCode = 1;
});
