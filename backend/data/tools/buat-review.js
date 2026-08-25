#!/usr/bin/env node
/* =============================================================
   buat-review.js — DEV ONLY, TIDAK DIMUAT HALAMAN MANA PUN
   -------------------------------------------------------------
   Mengubah data/sumber/<slug>.txt (paste mentah, format apa pun)
   menjadi file review berformat tetap:

       Nama Latin | Team | Aksara Asli

   Gunanya: paste mentah dari tiap grup bentuknya beda-beda dan
   susah dikoreksi manual. File review ini satu baris satu member,
   kolomnya rata, dan bisa dibaca ulang oleh import-roster.js tanpa
   perubahan (jalur "pipe 3 kolom"). Jadi alurnya:

     asli/<slug>-paste.txt   (verbatim, jangan disunting)
        -> buat-review.js -> <slug>.txt   (ini yang dikoreksi user)
        -> import-roster.js --write       -> common.js

   Paste mentah TIDAK ditimpa: yang ditulis ulang hanya <slug>.txt,
   dan sumber aslinya tetap ada di asli/ untuk pembanding.

   PAKAI:
     node data/tools/buat-review.js              # semua slug
     node data/tools/buat-review.js hkt48 ngt48  # slug tertentu
   ============================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { parse, GROUPS } = require('./import-roster.js');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(ROOT, 'data', 'sumber');

/* Lebar kolom dihitung dari isi terpanjang, bukan angka tetap — supaya
   file tetap rata untuk nama Indonesia yang panjang maupun nickname Thai
   yang pendek. Aksara CJK lebih lebar dari satu kolom monospace, tapi
   dibiarkan: yang penting pemisah "|" tetap konsisten untuk parser.

   Jumlah kolom mengikuti data yang ada. Kalau grup tidak punya team sama
   sekali (KLP48), namanya ditulis sendirian tanpa "|" — kalau tidak, baris
   berakhir dengan pemisah menggantung dan parser membuangnya karena bukan
   pola nama. Team kosong di grup yang punya kolom aksara ditulis "-",
   dibaca kembali sebagai kosong oleh import-roster.js. */
function rata(members) {
  const wN = Math.max(...members.map((m) => m.name.length), 4);
  const wT = Math.max(...members.map((m) => m.team.length), 4);
  const wA = Math.max(...members.map((m) => (m.asli || '').length), 4);
  const adaAsli = members.some((m) => m.asli);
  const adaTeam = members.some((m) => m.team);
  const adaImg = members.some((m) => m.img);

  return members.map((m) => {
    if (!adaTeam && !adaAsli && !adaImg) return m.name;
    const team = m.team || '-';
    if (!adaAsli && !adaImg) return `${m.name.padEnd(wN)} | ${team}`;
    const asli = m.asli || '-';
    if (!adaImg) return `${m.name.padEnd(wN)} | ${team.padEnd(wT)} | ${asli}`;
    /* Kolom URL selalu paling akhir dan tidak dirapikan — panjang URL jauh
       melebihi kolom lain, kalau ikut padEnd barisnya jadi tak terbaca. */
    return `${m.name.padEnd(wN)} | ${team.padEnd(wT)} | ${asli.padEnd(wA)} | ${m.img || '-'}`;
  });
}

function tulis(slug) {
  const file = path.join(SRC_DIR, `${slug}.txt`);
  if (!fs.existsSync(file)) {
    console.log(`- ${slug}: data/sumber/${slug}.txt belum ada, dilewati`);
    return 0;
  }
  const { members, catatan } = parse(fs.readFileSync(file, 'utf8'));
  if (members.length === 0) {
    console.log(`! ${slug}: 0 member terbaca — file TIDAK ditimpa`);
    return 0;
  }

  const baris = [];
  baris.push(`# ${slug.toUpperCase()} — ${members.length} member aktif`);
  baris.push('# Format: Nama Latin | Team | Aksara Asli | URL Foto');
  baris.push('#         (kolom 3 dan 4 opsional; "-" = sengaja dikosongkan)');
  baris.push('# Koreksi di file INI, bukan di asli/. Baris berawalan # diabaikan.');
  baris.push('# Hapus baris = hapus member. Nama Latin dipakai untuk search,');
  baris.push('# urutan A-Z, dan nama file foto img/<id>.jpg.');
  baris.push('# Kolom 4 boleh URL https:// dari situs resmi (foto di-hotlink,');
  baris.push('# browsermu yang mengunduh) atau path lokal img/xxx.jpg.');
  if (catatan.length) {
    baris.push('#');
    baris.push('# Perlu keputusanmu:');
    catatan.forEach((c) => baris.push(`#   - ${c}`));
  }

  /* Dikelompokkan per team dengan heading berkomentar. Heading ini murni
     untuk pembaca manusia — parser mengabaikannya karena berawalan '#',
     dan team tiap baris tetap diambil dari kolom ke-2. Jadi memindah baris
     antar kelompok TIDAK mengubah teamnya; kolomnya yang harus diubah. */
  const urutTeam = [];
  members.forEach((m) => {
    const k = m.team || '(tanpa team)';
    if (!urutTeam.includes(k)) urutTeam.push(k);
  });

  urutTeam.forEach((t) => {
    const anggota = members.filter((m) => (m.team || '(tanpa team)') === t);
    baris.push('');
    baris.push(`# ---- ${t} (${anggota.length}) ----`);
    rata(anggota).forEach((l) => baris.push(l));
  });

  fs.writeFileSync(file, baris.join('\n') + '\n');
  console.log(`+ ${slug}: ${members.length} member -> data/sumber/${slug}.txt`);
  return members.length;
}

function main() {
  const filter = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const slugs = Object.keys(GROUPS).filter((s) => filter.length === 0 || filter.includes(s));
  let total = 0;
  slugs.forEach((s) => { total += tulis(s); });
  console.log(`\nSelesai — ${total} member ditulis ke file review.`);
  console.log('Cek/koreksi filenya, lalu: node data/tools/import-roster.js <slug> --write');
}

if (require.main === module) main();
