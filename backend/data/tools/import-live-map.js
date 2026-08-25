#!/usr/bin/env node
/* =============================================================
   import-live-map.js — DEV ONLY, TIDAK DIMUAT HALAMAN MANA PUN
   -------------------------------------------------------------
   Mengisi mapping platform live (Showroom / IDN Live / YouTube) di
   data/live-tracker/members.json dari berkas paste per grup.

   Tanpa mapping ini, poller tetap jalan tapi SELALU melaporkan nol
   live: ia tidak punya cara tahu room mana milik siapa. Tool ini
   tidak pernah menebak — handle yang tidak dikenali dilaporkan, bukan
   "dibetulkan" (salah cocok berarti menampilkan orang yang salah
   sebagai sedang live).

   FORMAT SUMBER — data/sumber/live/<grup>.txt
     Satu baris per member, empat kolom dipisah "|":

       Nama Latin | Showroom | IDN | YouTube

       Fiony Alveria Tantri | 48_FIONY | fionyalveria | -
       Oguri Yui            | 12345    | -            | UCxxxxxxxxxxxxxxxxxxxxxx

     - Nama harus PERSIS seperti di roster (itu yang dipakai sebagai
       checksum; nama tidak cocok = baris dilaporkan, bukan ditebak).
     - Kolom boleh berisi URL penuh, @handle, atau handle saja.
     - "-" atau kosong  = biarkan apa adanya (TIDAK menghapus isi lama;
       room_id yang diisi otomatis oleh worker tidak ikut terhapus).
     - "!"              = hapus mapping platform itu.
     - "  # catatan"    = komentar, diabaikan.

   PAKAI
     node data/tools/import-live-map.js                      # ringkasan cakupan
     node data/tools/import-live-map.js jkt48 --template     # buat kerangka isi
     node data/tools/import-live-map.js jkt48                # pratinjau hasil baca
     node data/tools/import-live-map.js jkt48 --write        # tulis ke members.json
     node data/tools/import-live-map.js --sinkron            # samakan daftar id dgn roster

   Menulis satu grup TIDAK menyentuh grup lain: members.json dibaca
   dulu, di-merge per id, lalu ditulis ulang.
   ============================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIVE_DIR = path.join(ROOT, 'data', 'sumber', 'live');
const { loadProjectData, initialMappings } = require(path.join(ROOT, 'data', 'live-tracker', 'project-data'));
const { DEFAULT_FILE, readStore, upsertMembers } = require(path.join(ROOT, 'data', 'live-tracker', 'store'));

/* Bisa diarahkan ke berkas lain untuk uji, supaya members.json asli tidak
   ikut tercoret saat menjalankan tes. */
const BERKAS = process.env.LIVE_MEMBERS_FILE ? path.resolve(process.env.LIVE_MEMBERS_FILE) : DEFAULT_FILE;

const rapi = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const kunciNama = (s) => rapi(s).toLowerCase().replace(/[.,'’`-]/g, '');
const buangKomentar = (s) => String(s).replace(/\s+#.*$/, '');
const KOSONG = new Set(['', '-', '—', 'n/a', 'na', 'null', 'none', 'tidak ada']);
const HAPUS = new Set(['!', 'hapus', 'clear', 'kosongkan']);

/* ---------------------------------------------------------------
   1. NORMALISASI HANDLE
   Semua menerima URL penuh, @handle, atau handle telanjang. Yang
   dikembalikan: { patch } untuk ditulis, atau { salah } untuk dilaporkan.
   --------------------------------------------------------------- */
const AMAN = /^[A-Za-z0-9_.-]+$/;

const HOST_PLATFORM = /(^|\.)(idn\.app|idnlive\.id|showroom-live\.com|showroom\.com|youtube\.com|youtu\.be)$/i;

/* Segmen path pertama yang berarti. Showroom punya dua bentuk URL:
   /<room_url_key> dan /r/<room_url_key>, jadi awalan r/room dilewati. */
function segmenPath(nilai, lewati = []) {
  const tanpaSkema = String(nilai).replace(/^[a-z]+:\/\//i, '');
  const bagian = tanpaSkema.split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (bagian.length === 0) return null;
  /* Titik saja bukan bukti hostname: username IDN boleh memuat titik
     ("jkt48.fiony"). Segmen pertama hanya dibuang kalau memang ada segmen
     setelahnya — kalau tidak, handle bertitik ikut terbuang. */
  let sisa = bagian.length > 1 && (/\./.test(bagian[0]) || HOST_PLATFORM.test(bagian[0])) ? bagian.slice(1) : bagian;
  while (sisa.length > 1 && lewati.includes(sisa[0].toLowerCase())) sisa = sisa.slice(1);
  const hasil = sisa[0] || null;
  if (hasil && HOST_PLATFORM.test(hasil)) return null;   // URL domain saja, tanpa handle
  return hasil;
}

function paramUrl(nilai, nama) {
  const cocok = String(nilai).match(new RegExp(`[?&]${nama}=([^&\\s]+)`, 'i'));
  return cocok ? cocok[1] : null;
}

function normalShowroom(mentah) {
  const nilai = rapi(mentah).replace(/^@/, '');
  const roomIdParam = paramUrl(nilai, 'room_id');
  if (roomIdParam) {
    if (!/^\d+$/.test(roomIdParam)) return { salah: `room_id "${roomIdParam}" bukan angka` };
    return { patch: { showroom_room_id: roomIdParam } };
  }
  if (/^\d+$/.test(nilai)) return { patch: { showroom_room_id: nilai } };
  const key = segmenPath(nilai, ['r', 'room']);
  if (!key) return { salah: 'tidak ada room_url_key yang bisa dibaca' };
  if (!AMAN.test(key)) return { salah: `room_url_key "${key}" memuat karakter yang tidak lazim` };
  /* room_id numerik SENGAJA tidak diminta: worker mengisinya sendiri dari
     /api/live/onlives begitu member pertama kali terlihat live. */
  return { patch: { showroom_room_url_key: key } };
}

function normalIdn(mentah) {
  const nilai = rapi(mentah);
  const handle = (segmenPath(nilai, ['profile', 'live', 'u']) || '').replace(/^@/, '');
  if (!handle) return { salah: 'username IDN tidak terbaca' };
  if (!AMAN.test(handle)) return { salah: `username "${handle}" memuat karakter yang tidak lazim` };
  return { patch: { idn_username: handle } };
}

function normalYoutube(mentah) {
  const nilai = rapi(mentah);
  const videoParam = paramUrl(nilai, 'v');
  if (videoParam) return { patch: { youtube_video_id: videoParam, youtube_channel_id: null } };
  const cocokKanal = nilai.match(/UC[A-Za-z0-9_-]{22}/);
  if (cocokKanal) return { patch: { youtube_channel_id: cocokKanal[0], youtube_video_id: null } };
  if (/(^|\/)(@|c\/|user\/)/.test(nilai) || nilai.startsWith('@')) {
    /* Handle @nama tidak bisa dipakai YouTube Data API — API butuh channel id
       UC… . Dilaporkan supaya tidak tersimpan sebagai mapping yang selalu gagal. */
    return { salah: 'handle @nama tidak bisa dipakai YouTube Data API — perlu channel id UC… (lihat "Bagikan → salin ID saluran")' };
  }
  const segmen = segmenPath(nilai, ['channel', 'watch', 'live']);
  if (segmen && /^[A-Za-z0-9_-]{11}$/.test(segmen)) return { patch: { youtube_video_id: segmen, youtube_channel_id: null } };
  return { salah: `"${nilai}" bukan channel id UC… maupun video id 11 karakter` };
}

const KOLOM = [
  { nama: 'Showroom', normal: normalShowroom, bidang: ['showroom_room_id', 'showroom_room_url_key'] },
  { nama: 'IDN', normal: normalIdn, bidang: ['idn_username'] },
  { nama: 'YouTube', normal: normalYoutube, bidang: ['youtube_channel_id', 'youtube_video_id'] },
];

/* ---------------------------------------------------------------
   2. BERKAS SUMBER
   --------------------------------------------------------------- */
function cariGrup(arg, GROUPS) {
  const a = rapi(arg).toLowerCase();
  return GROUPS.find((g) => g.id.toLowerCase() === a || g.slug.toLowerCase() === a) || null;
}

function berkasSumber(grup) {
  const kandidat = [path.join(LIVE_DIR, `${grup.id}.txt`), path.join(LIVE_DIR, `${grup.slug}.txt`)];
  return kandidat.find((f) => fs.existsSync(f)) || kandidat[0];
}

function tulisTemplate(grup, anggota, paksa) {
  const tujuan = path.join(LIVE_DIR, `${grup.id}.txt`);
  if (fs.existsSync(tujuan) && !paksa) {
    console.log(`${path.relative(ROOT, tujuan)} sudah ada — tidak ditimpa.`);
    console.log('(tambahkan --paksa kalau memang mau dibuat ulang; isian lamamu akan hilang)');
    return tujuan;
  }
  const lebar = Math.min(38, Math.max(...anggota.map((m) => m.name.length), 10));
  const baris = anggota.map((m) => {
    const nama = m.name.padEnd(lebar);
    const catatan = m.team ? `   # ${m.team}` : '';
    return `${nama} | - | - | -${catatan}`;
  });
  const isi = [
    `# Mapping live ${grup.name} — data/sumber/live/${grup.id}.txt`,
    '#',
    '# Kolom:  Nama Latin | Showroom | IDN | YouTube',
    '#   Showroom : room_url_key atau URL room (room_id numerik diisi otomatis',
    '#              oleh worker saat member pertama kali terlihat live)',
    '#   IDN      : username IDN atau URL profilnya',
    '#   YouTube  : channel id UC… atau video id (handle @nama TIDAK bisa)',
    '#',
    '#   "-" = biarkan apa adanya   "!" = hapus mapping platform itu',
    '#   Nama harus persis seperti di roster — itu yang dipakai mencocokkan id.',
    '#',
    `# Setelah diisi:  node data/tools/import-live-map.js ${grup.id} --write`,
    '',
    ...baris,
    '',
  ].join('\n');
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  fs.writeFileSync(tujuan, isi);
  console.log(`Template ${anggota.length} member ditulis ke ${path.relative(ROOT, tujuan)}.`);
  return tujuan;
}

function bacaBerkas(file) {
  const isi = fs.readFileSync(file, 'utf8');
  const entri = [];
  isi.split(/\r?\n/).forEach((baris, index) => {
    const bersih = buangKomentar(baris);
    if (!rapi(bersih) || rapi(bersih).startsWith('#')) return;
    const kolom = bersih.split('|').map((k) => rapi(k));
    entri.push({ baris: index + 1, nama: kolom[0], nilai: kolom.slice(1, 4), asli: rapi(baris) });
  });
  return entri;
}

/* ---------------------------------------------------------------
   3. PROSES SATU GRUP
   --------------------------------------------------------------- */
function prosesGrup(grup, anggota, opsi) {
  const file = berkasSumber(grup);
  if (!fs.existsSync(file)) {
    console.log(`\n${grup.name}: ${path.relative(ROOT, file)} belum ada.`);
    console.log(`  Buat dulu: node data/tools/import-live-map.js ${grup.id} --template`);
    return null;
  }
  const entri = bacaBerkas(file);
  const perNama = new Map();
  anggota.forEach((m) => {
    const kunci = kunciNama(m.name);
    if (!perNama.has(kunci)) perNama.set(kunci, m);
  });

  const updates = [];
  const takKetemu = [];
  const salah = [];
  const hitung = { showroom: 0, idn: 0, youtube: 0, dihapus: 0 };

  entri.forEach((row) => {
    const member = perNama.get(kunciNama(row.nama));
    if (!member) {
      takKetemu.push(`baris ${row.baris}: "${row.nama}" tidak ada di roster ${grup.name}`);
      return;
    }
    const patch = {};
    KOLOM.forEach((kolom, i) => {
      const mentah = rapi(row.nilai[i] || '');
      const kecil = mentah.toLowerCase();
      if (KOSONG.has(kecil)) return;
      if (HAPUS.has(kecil)) {
        kolom.bidang.forEach((b) => { patch[b] = null; });
        hitung.dihapus += 1;
        return;
      }
      const hasil = kolom.normal(mentah);
      if (hasil.salah) {
        salah.push(`baris ${row.baris} (${member.name}) kolom ${kolom.nama}: ${hasil.salah}`);
        return;
      }
      Object.assign(patch, hasil.patch);
      if (kolom.nama === 'Showroom') hitung.showroom += 1;
      if (kolom.nama === 'IDN') hitung.idn += 1;
      if (kolom.nama === 'YouTube') hitung.youtube += 1;
    });
    if (Object.keys(patch).length === 0) return;
    updates.push({ id: member.id, member_name: member.name, ...patch });
  });

  console.log(`\n${grup.name} (${path.relative(ROOT, file)})`);
  console.log(`  ${entri.length} baris dibaca · ${updates.length} member diperbarui`
    + ` · showroom ${hitung.showroom} · idn ${hitung.idn} · youtube ${hitung.youtube}`
    + (hitung.dihapus ? ` · dihapus ${hitung.dihapus}` : ''));
  takKetemu.forEach((m) => console.log(`  ! ${m}`));
  salah.forEach((m) => console.log(`  x ${m}`));

  const belum = anggota.filter((m) => !updates.some((u) => u.id === m.id));
  if (belum.length) {
    console.log(`  ${belum.length} member belum punya mapping di berkas ini`
      + (belum.length <= 6 ? `: ${belum.map((m) => m.name).join(', ')}` : `, misalnya: ${belum.slice(0, 4).map((m) => m.name).join(', ')}`));
  }

  if (!opsi.write) {
    console.log('  (pratinjau — tambahkan --write untuk menulis ke members.json)');
    if (updates.length) console.log(`  contoh: ${JSON.stringify(updates[0])}`);
    return { updates, salah, takKetemu };
  }
  if (updates.length === 0) {
    console.log('  Tidak ada yang ditulis (semua kolom kosong).');
    return { updates, salah, takKetemu };
  }

  /* upsertMembers sudah merge per id ({...lama, ...baru}), jadi mapping lain
     dan room_id hasil temuan worker tidak hilang. Yang perlu ditambah di sini
     hanya nilai bawaan untuk id yang memang belum ada. */
  const store = readStore(BERKAS);
  const adaId = new Set(store.members.map((m) => m.id));
  const digabung = updates.map((u) => (adaId.has(u.id) ? u : { is_live: false, last_live_at: null, ...u }));
  const hasil = upsertMembers(digabung, BERKAS);
  const baru = updates.filter((u) => !adaId.has(u.id)).length;
  console.log(`  Ditulis${baru ? ` (${baru} entri baru)` : ''}. ${path.basename(BERKAS)} sekarang ${hasil.members.length} entri.`);
  return { updates, salah, takKetemu, ditulis: true };
}

/* ---------------------------------------------------------------
   4. RINGKASAN & SINKRONISASI
   --------------------------------------------------------------- */
function ringkasan(GROUPS, MEMBERS) {
  const store = readStore(BERKAS);
  const perId = new Map(store.members.map((m) => [m.id, m]));
  console.log(`Mapping live: ${path.relative(ROOT, BERKAS)} — ${store.members.length} entri`
    + (store.updated_at ? ` · diperbarui ${store.updated_at}` : ''));
  let total = { sr: 0, idn: 0, yt: 0, ada: 0 };
  GROUPS.forEach((g) => {
    const anggota = MEMBERS.filter((m) => m.groupId === g.id);
    const map = anggota.map((m) => perId.get(m.id)).filter(Boolean);
    const sr = map.filter((m) => m.showroom_room_id || m.showroom_room_url_key).length;
    const idn = map.filter((m) => m.idn_username).length;
    const yt = map.filter((m) => m.youtube_channel_id || m.youtube_video_id).length;
    const ada = map.filter((m) => m.showroom_room_id || m.showroom_room_url_key || m.idn_username || m.youtube_channel_id || m.youtube_video_id).length;
    total = { sr: total.sr + sr, idn: total.idn + idn, yt: total.yt + yt, ada: total.ada + ada };
    const berkas = fs.existsSync(berkasSumber(g)) ? '' : '  (berkas sumber belum ada)';
    console.log(`  ${g.name.padEnd(16)} ${String(ada).padStart(3)}/${String(anggota.length).padEnd(3)} termapping · sr ${sr} · idn ${idn} · yt ${yt}${berkas}`);
  });
  console.log(`  ${'TOTAL'.padEnd(16)} ${total.ada}/${MEMBERS.length} termapping · sr ${total.sr} · idn ${total.idn} · yt ${total.yt}`);

  /* Checksum nama: id adalah satu-satunya penghubung ke roster, jadi nama
     yang bergeser berarti mapping menempel ke orang lain. */
  const beda = MEMBERS.filter((m) => perId.has(m.id) && kunciNama(perId.get(m.id).member_name) !== kunciNama(m.name));
  const hilang = MEMBERS.filter((m) => !perId.has(m.id));
  const yatim = store.members.filter((m) => !MEMBERS.some((x) => x.id === m.id));
  if (beda.length) {
    console.log(`\n! ${beda.length} entri namanya tidak cocok dengan roster (id-nya mungkin bergeser):`);
    beda.slice(0, 8).forEach((m) => console.log(`    ${m.id}: members.json "${perId.get(m.id).member_name}" vs roster "${m.name}"`));
    console.log('  Jalankan dengan --sinkron untuk menyamakan nama (mapping platform tetap).');
  }
  if (hilang.length) console.log(`\n! ${hilang.length} member roster belum ada di members.json — jalankan --sinkron.`);
  if (yatim.length) console.log(`\n! ${yatim.length} entri members.json tidak punya pasangan di roster: ${yatim.slice(0, 5).map((m) => m.id).join(', ')}`);
  if (total.ada === 0) {
    console.log('\nBelum ada satu pun mapping — poller akan selalu melaporkan 0 live.');
    console.log('Mulai dari: node data/tools/import-live-map.js <grup> --template');
  }
}

function sinkron(MEMBERS) {
  const store = readStore(BERKAS);
  const perId = new Map(store.members.map((m) => [m.id, m]));
  const bawaan = new Map(initialMappings().map((m) => [m.id, m]));
  const updates = MEMBERS.map((m) => {
    const lama = perId.get(m.id);
    const dasar = bawaan.get(m.id) || { id: m.id, member_name: m.name, showroom_room_id: null, showroom_room_url_key: null, idn_username: null, is_live: false, last_live_at: null };
    return { ...dasar, ...(lama || {}), id: m.id, member_name: m.name };
  });
  const baru = updates.filter((u) => !perId.has(u.id)).length;
  const namaDiperbaiki = updates.filter((u) => perId.has(u.id) && perId.get(u.id).member_name !== u.member_name).length;
  const hasil = upsertMembers(updates, BERKAS);
  console.log(`Sinkron: ${hasil.members.length} entri · ${baru} baru · ${namaDiperbaiki} nama disamakan dengan roster.`);
  const yatim = hasil.members.filter((m) => !MEMBERS.some((x) => x.id === m.id));
  if (yatim.length) console.log(`! ${yatim.length} entri lama tanpa pasangan roster dibiarkan (hapus manual bila memang sudah tidak dipakai): ${yatim.slice(0, 5).map((m) => m.id).join(', ')}`);
}

/* ---------------------------------------------------------------
   5. MAIN
   --------------------------------------------------------------- */
function main() {
  const args = process.argv.slice(2);
  const opsi = {
    write: args.includes('--write'),
    template: args.includes('--template'),
    paksa: args.includes('--paksa'),
    sinkron: args.includes('--sinkron'),
    semua: args.includes('--semua'),
  };
  const { GROUPS, MEMBERS } = loadProjectData();
  const target = args.find((a) => !a.startsWith('--'));

  if (opsi.sinkron) return sinkron(MEMBERS);
  if (!target && !opsi.semua) return ringkasan(GROUPS, MEMBERS);

  const daftar = opsi.semua ? GROUPS : [cariGrup(target, GROUPS)].filter(Boolean);
  if (daftar.length === 0) {
    console.error(`Grup "${target}" tidak dikenali. Pilihan: ${GROUPS.map((g) => g.id).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  let adaSalah = false;
  daftar.forEach((grup) => {
    const anggota = MEMBERS.filter((m) => m.groupId === grup.id);
    if (opsi.template) {
      tulisTemplate(grup, anggota, opsi.paksa);
      return;
    }
    const hasil = prosesGrup(grup, anggota, opsi);
    if (hasil && (hasil.salah.length || hasil.takKetemu.length)) adaSalah = true;
  });
  if (adaSalah) {
    console.log('\nAda baris yang tidak terpakai (tanda ! atau x di atas). Perbaiki berkas sumbernya, lalu jalankan ulang.');
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { normalShowroom, normalIdn, normalYoutube, segmenPath, bacaBerkas, kunciNama };
