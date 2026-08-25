#!/usr/bin/env node
/* =============================================================
   audit.js — DEV ONLY, TIDAK DIMUAT HALAMAN MANA PUN
   -------------------------------------------------------------
   Memeriksa hal-hal yang paling sering bikin halaman mati total atau
   diam-diam salah. Tidak ada browser di lingkungan ini, jadi audit
   dilakukan di Node dengan stub DOM secukupnya.

   Yang diperiksa:
     1. Urutan <script> di tiap HTML — common.js wajib lebih dulu.
     2. Deklarasi top-level kembar antar file (const ganda = SyntaxError,
        halaman mati total).
     3. Sintaks tiap file JS.
     4. Integritas data: id unik, accent valid, groupId nyambung ke GROUPS,
        slug unik, liveUrl tidak mati.
     5. Foto member yang belum ada di img/ (info saja, bukan error).

   PAKAI:  node data/tools/audit.js
   ============================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..', 'frontend');
const JS_FILES = ['common.js', 'script.js', 'groups.js', 'member.js', 'news.js'];
const HTML_FILES = ['index.html', 'groups.html', 'member.html', 'members.html', 'news.html'];
const ACCENTS = ['pink', 'cyan', 'violet', 'amber'];

const errors = [];
const warns = [];
const infos = [];

const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);
const info = (m) => infos.push(m);

const baca = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ada = (f) => fs.existsSync(path.join(ROOT, f));

/* ---------------------------------------------------------------
   1. URUTAN SCRIPT DI HTML
   --------------------------------------------------------------- */
function auditUrutanScript() {
  HTML_FILES.forEach((file) => {
    if (!ada(file)) { warn(`${file} tidak ada — dilewati.`); return; }
    const html = baca(file);
    const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);

    const iCommon = srcs.findIndex((s) => /common\.js$/.test(s));
    if (iCommon === -1) {
      err(`${file}: tidak memuat common.js — GROUPS/MEMBERS tidak akan ada.`);
      return;
    }
    let salah = false;
    srcs.forEach((s, i) => {
      if (/(script|groups|member)\.js$/.test(s) && i < iCommon) {
        salah = true;
        err(`${file}: ${s} dimuat SEBELUM common.js (urutan wajib: common.js dulu).`);
      }
    });
    if (!salah) info(`${file}: urutan script benar (${srcs.join(' → ')}).`);
  });
}

/* ---------------------------------------------------------------
   2. DEKLARASI TOP-LEVEL KEMBAR
   Semua file berbagi scope global, jadi nama yang sama di dua file
   = SyntaxError saat halaman dibuka.
   --------------------------------------------------------------- */
function auditDeklarasiKembar() {
  const milik = new Map(); // nama → [file, …]

  JS_FILES.forEach((file) => {
    if (!ada(file)) return;
    const src = baca(file);
    // Hanya kolom 0 = top-level. Deklarasi di dalam fungsi selalu terindentasi
    // di codebase ini, jadi cukup akurat tanpa parser penuh.
    const re = /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
    for (const m of src.matchAll(re)) {
      if (!milik.has(m[1])) milik.set(m[1], []);
      const arr = milik.get(m[1]);
      if (!arr.includes(file)) arr.push(file);
    }
  });

  let bentrok = 0;
  milik.forEach((files, nama) => {
    if (files.length > 1) {
      bentrok += 1;
      err(`Deklarasi "${nama}" muncul di ${files.join(' dan ')} — halaman akan mati (SyntaxError).`);
    }
  });
  if (!bentrok) info(`Tidak ada deklarasi top-level kembar (${milik.size} nama global diperiksa).`);
}

/* ---------------------------------------------------------------
   3. SINTAKS
   --------------------------------------------------------------- */
function auditSintaks() {
  JS_FILES.forEach((file) => {
    if (!ada(file)) return;
    try {
      new vm.Script(baca(file), { filename: file });
      info(`${file}: sintaks OK.`);
    } catch (e) {
      err(`${file}: SyntaxError — ${e.message}`);
    }
  });
}

/* ---------------------------------------------------------------
   4. DATA
   common.js dijalankan di sandbox. Ia tidak menyentuh DOM di
   top-level, tapi stub tetap disiapkan agar aman kalau nanti berubah.
   --------------------------------------------------------------- */
function muatCommon() {
  const stubEl = new Proxy({}, {
    get: (t, k) => (k === 'style' || k === 'dataset' || k === 'classList'
      ? stubEl
      : (typeof k === 'string' && /^(querySelector|closest|appendChild|addEventListener|setAttribute|add|remove|toggle|contains|focus)$/.test(k)
        ? () => (k === 'querySelector' || k === 'closest' ? null : undefined)
        : '')),
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
    /* Global yang dipakai common.js saat modul dimuat:
       location → initActiveNav, CustomEvent → initI18n. */
    location: { href: 'https://wiki48.test/index.html', pathname: '/index.html', search: '', hash: '', protocol: 'https:' },
    CustomEvent: class CustomEvent { constructor(type, opsi = {}) { this.type = type; this.detail = opsi.detail; } },
    window: {
      addEventListener: () => {},
      location: { search: '', hash: '' },
      /* Loader stage di common.js memasang timer saat modul dimuat. */
      setTimeout: () => 0,
      clearTimeout: () => {},
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console,
    encodeURIComponent,
    URLSearchParams,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(baca('common.js') + '\n;({ GROUPS, MEMBERS, ROSTERS });', { filename: 'common.js' })
    .runInContext(sandbox);
  return vm.runInContext('({ GROUPS, MEMBERS, ROSTERS })', sandbox);
}

function auditData() {
  let data;
  try {
    data = muatCommon();
  } catch (e) {
    err(`Gagal menjalankan common.js: ${e.message}`);
    return;
  }
  const { GROUPS, MEMBERS, ROSTERS } = data;

  if (!Array.isArray(GROUPS) || !GROUPS.length) { err('GROUPS kosong.'); return; }
  if (!Array.isArray(MEMBERS)) { err('MEMBERS bukan array.'); return; }

  // Slug & id grup unik — slug load-bearing untuk deep-link ?group=<slug>.
  const slugs = new Set();
  const idGrup = new Set();
  GROUPS.forEach((g) => {
    if (!g.slug) err(`Grup "${g.name}" tanpa slug — deep-link ?group= tidak bisa dipakai.`);
    if (slugs.has(g.slug)) err(`Slug grup kembar: "${g.slug}".`);
    slugs.add(g.slug);
    if (idGrup.has(g.id)) err(`id grup kembar: "${g.id}".`);
    idGrup.add(g.id);
    if (!ACCENTS.includes(g.accent)) err(`Grup ${g.name}: accent "${g.accent}" tidak dikenal CSS.`);
    if (!g.name) err(`Grup ${g.id} tanpa name — filter deep-link memakai nama grup.`);
  });

  ROSTERS.forEach((r) => {
    if (!GROUPS.some((g) => g.id === r.groupId)) {
      err(`ROSTERS memuat groupId "${r.groupId}" yang tidak ada di GROUPS — rosternya tidak akan tampil.`);
    }
  });

  // Member
  const idMember = new Map();
  let tanpaTeam = 0;
  let liveTanpaUrl = 0;
  const fotoHilang = [];

  MEMBERS.forEach((m) => {
    if (!m.name || !m.name.trim()) err(`Member id "${m.id}" tanpa nama.`);
    if (idMember.has(m.id)) {
      err(`id member kembar: "${m.id}" (${idMember.get(m.id)} vs ${m.name}) — memberById() akan ambil yang terakhir dan pin oshi tertukar.`);
    }
    idMember.set(m.id, m.name);
    if (!ACCENTS.includes(m.accent)) err(`${m.name} (${m.id}): accent "${m.accent}" tidak dikenal — card jadi abu-abu.`);
    if (!GROUPS.some((g) => g.id === m.groupId)) err(`${m.name}: groupId "${m.groupId}" tidak ada di GROUPS.`);
    if (!m.team) tanpaTeam += 1;
    if (m.isLive && !m.liveUrl) liveTanpaUrl += 1;
    if (m.liveUrl && !/^https?:\/\//.test(m.liveUrl)) err(`${m.name}: liveUrl bukan URL absolut ("${m.liveUrl}").`);
    if (m.img && !/^data:/.test(m.img) && !ada(m.img)) fotoHilang.push(m.img);
    if (Array.isArray(m.relatedMemberIds)) {
      m.relatedMemberIds.forEach((rid) => {
        if (!MEMBERS.some((x) => x.id === rid)) warn(`${m.name}: relatedMemberIds menunjuk "${rid}" yang tidak ada.`);
      });
    }
  });

  // Ringkasan per grup
  info(`${GROUPS.length} grup, ${MEMBERS.length} member.`);
  const kosong = [];
  GROUPS.forEach((g) => {
    const n = MEMBERS.filter((m) => m.groupId === g.id).length;
    if (n === 0) kosong.push(g.name);
    else info(`  ${g.name} (${g.slug}): ${n} member`);
  });
  if (kosong.length) {
    info(`Roster masih kosong: ${kosong.join(', ')}.`);
    if (kosong.length === GROUPS.length) {
      warn('SEMUA roster kosong — halaman tetap jalan, tapi direktori tidak menampilkan apa pun.');
    }
  }

  if (tanpaTeam) warn(`${tanpaTeam} member tanpa team — badge team di card akan kosong.`);
  if (liveTanpaUrl) info(`${liveTanpaUrl} member isLive tanpa liveUrl — tombol "Tonton Live" disembunyikan (sesuai desain).`);
  if (fotoHilang.length) {
    info(`${fotoHilang.length} foto belum ada di img/ — otomatis pakai placeholder SVG. Contoh: ${fotoHilang.slice(0, 3).join(', ')}`);
  }
}

/* ---------------------------------------------------------------
   4b. DEEP-LINK ?group=  → halaman tujuannya harus punya pembacanya

   Pernah putus tanpa terdeteksi: grid direktori pindah dari index.html ke
   members.html, sementara card grup masih menaut ke index.html?group=...
   Tautannya tetap "hidup" (halaman terbuka, tanpa error) tapi filternya
   tidak terjadi. Yang bisa diperiksa mesin: halaman tujuan memuat script.js
   (pembaca param) DAN punya #memberGrid tempat hasilnya dirender.
   --------------------------------------------------------------- */
function auditDeepLinkGrup() {
  /* Sengaja TIDAK mensyaratkan awalan href=": groups.js merangkai URL-nya di
     template literal (`href="${href}"`), jadi pola yang hanya mengenali atribut
     href akan melewatkan justru pemakaian yang paling penting. Komentar yang
     menyebut URL ini ikut terjaring — itu disengaja, komentar basi soal
     deep-link juga layak dilaporkan. */
  const RE = /([a-z0-9_-]+\.html)\?group=/gi;
  const tujuan = new Map();   // berkas tujuan → daftar berkas sumber

  [...JS_FILES, ...HTML_FILES].forEach((file) => {
    if (!ada(file)) return;
    const isi = baca(file);
    for (const m of isi.matchAll(RE)) {
      if (!tujuan.has(m[1])) tujuan.set(m[1], []);
      const arr = tujuan.get(m[1]);
      if (!arr.includes(file)) arr.push(file);
    }
  });

  tujuan.forEach((sumber, halaman) => {
    if (!ada(halaman)) {
      err(`deep-link ?group= menuju ${halaman} yang tidak ada (dari ${sumber.join(', ')}).`);
      return;
    }
    const isi = baca(halaman);
    const punyaScript = /src="script\.js"/.test(isi);
    const punyaGrid = /id="memberGrid"/.test(isi);
    if (!punyaScript || !punyaGrid) {
      const kurang = [!punyaScript && 'script.js', !punyaGrid && '#memberGrid'].filter(Boolean);
      err(`${halaman} jadi tujuan deep-link ?group= (dari ${sumber.join(', ')}) tapi tidak punya ${kurang.join(' & ')} — filternya tidak akan terjadi.`);
      return;
    }
    info(`deep-link ?group= → ${halaman} (dari ${sumber.join(', ')}).`);
  });
}

/* ---------------------------------------------------------------
   5. LAPORAN
   --------------------------------------------------------------- */
function main() {
  auditSintaks();
  auditUrutanScript();
  auditDeklarasiKembar();
  auditData();
  auditDeepLinkGrup();

  console.log('\n== INFO ==');
  infos.forEach((m) => console.log('  ' + m));
  if (warns.length) {
    console.log('\n== PERLU DICEK (' + warns.length + ') ==');
    warns.forEach((m) => console.log('  ! ' + m));
  }
  if (errors.length) {
    console.log('\n== ERROR (' + errors.length + ') ==');
    errors.forEach((m) => console.log('  x ' + m));
    console.log('\nGAGAL — perbaiki error di atas sebelum dianggap selesai.');
    process.exit(1);
  }
  console.log('\nLULUS' + (warns.length ? ' (dengan catatan di atas)' : '') + '.');
}

main();
