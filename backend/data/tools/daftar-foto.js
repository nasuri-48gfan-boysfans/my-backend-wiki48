#!/usr/bin/env node
/* =============================================================
   daftar-foto.js — DEV ONLY, TIDAK DIMUAT HALAMAN MANA PUN
   -------------------------------------------------------------
   Menulis img/DAFTAR-FOTO.md: daftar nama file foto yang dibutuhkan
   setiap member yang sudah ada di roster, lengkap dengan nama
   member dan teamnya.

   Kenapa perlu: nama file foto TIDAK bebas — card mencari
   `img/<id>.jpg`, dan id-nya dibuat importer (`jkt48-01`, `hkt48-01`,
   ...). Tanpa daftar ini, foto yang sudah diunduh harus dicocokkan
   satu-satu secara manual.

   Jalankan ulang setiap kali ada roster baru masuk ke common.js.

   PAKAI:
     node data/tools/daftar-foto.js
   ============================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..', 'frontend');
const IMG_DIR = path.join(ROOT, 'img');
const OUT = path.join(IMG_DIR, 'DAFTAR-FOTO.md');

/* common.js dieksekusi di sandbox vm, bukan di-require: file itu ditulis
   untuk browser (tanpa module.exports) dan menyentuh document di dalam
   beberapa fungsinya. Sandbox diberi stub document supaya aman kalaupun
   nanti ada pemanggilan di top level. */
function muatCommon() {
  const kode = fs.readFileSync(path.join(ROOT, 'common.js'), 'utf8');
  const sandbox = {
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: {},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(kode + '\n;({ MEMBERS, GROUPS });', sandbox);
  return vm.runInContext('({ MEMBERS, GROUPS })', sandbox);
}

function main() {
  const { MEMBERS, GROUPS } = muatCommon();
  if (MEMBERS.length === 0) {
    console.log('Roster masih kosong — belum ada foto yang perlu disiapkan.');
    return;
  }

  const ada = fs.existsSync(IMG_DIR)
    ? new Set(fs.readdirSync(IMG_DIR).map((f) => f.toLowerCase()))
    : new Set();

  const baris = [];
  baris.push('# Daftar foto yang dibutuhkan');
  baris.push('');
  baris.push('Dibuat otomatis oleh `node data/tools/daftar-foto.js` — jangan disunting');
  baris.push('tangan, isinya akan tertimpa. Jalankan ulang setiap ada roster baru.');
  baris.push('');
  baris.push('Aturan file: rasio **3:4** (mis. 600x800), format `.jpg`, nama file');
  baris.push('**harus** sama dengan kolom "File" di bawah. Kalau file belum ada, card');
  baris.push('otomatis memakai placeholder SVG — jadi tidak perlu lengkap sekaligus.');
  baris.push('');

  let perlu = 0;
  GROUPS.forEach((g) => {
    const anggota = MEMBERS.filter((m) => m.groupId === g.id);
    if (anggota.length === 0) return;

    const belum = anggota.filter((m) => !ada.has(`${m.id}.jpg`)).length;
    perlu += belum;

    baris.push(`## ${g.name} — ${anggota.length} member (${belum} foto belum ada)`);
    baris.push('');
    baris.push('| File | Nama | Team | Status |');
    baris.push('| --- | --- | --- | --- |');
    anggota.forEach((m) => {
      const nama = m.nameNative ? `${m.name} / ${m.nameNative}` : m.name;
      const status = ada.has(`${m.id}.jpg`) ? 'ada' : 'belum';
      baris.push(`| \`${m.id}.jpg\` | ${nama} | ${m.team || '-'} | ${status} |`);
    });
    baris.push('');
  });

  fs.writeFileSync(OUT, baris.join('\n'));
  console.log(`img/DAFTAR-FOTO.md ditulis — ${MEMBERS.length} member, ${perlu} foto belum ada.`);
}

if (require.main === module) main();
