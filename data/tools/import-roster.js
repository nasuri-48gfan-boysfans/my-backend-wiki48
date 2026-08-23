#!/usr/bin/env node
/* =============================================================
   import-roster.js — DEV ONLY, TIDAK DIMUAT HALAMAN MANA PUN
   -------------------------------------------------------------
   Mengubah hasil copy-paste halaman wiki/situs resmi menjadi blok
   ROSTER_* yang siap ditempel ke common.js.

   Situs tetap tanpa build step: script ini dijalankan manual di
   terminal, hasilnya kamu tempel sendiri. Tidak ada <script> yang
   menunjuk ke file ini.

   PAKAI:
     node data/tools/import-roster.js                 # semua file di data/sumber/
     node data/tools/import-roster.js jkt48           # satu grup saja
     node data/tools/import-roster.js --write         # timpa blok di common.js
     node data/tools/import-roster.js --debug         # tampilkan baris yang dibuang

   File sumber diletakkan di  data/sumber/<slug>.txt  (atau .html)
   mis. data/sumber/jkt48.txt, data/sumber/akb48.txt
   Nama file menentukan grupnya, jadi jangan diubah polanya.
   ============================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(ROOT, 'data', 'sumber');
const COMMON_JS = path.join(ROOT, 'common.js');

/* Slug → { konstanta blok di common.js, accent default } ------- */
const GROUPS = {
  akb48:           { konst: 'ROSTER_AKB48',    accent: 'pink'   },
  ske48:           { konst: 'ROSTER_SKE48',    accent: 'cyan'   },
  nmb48:           { konst: 'ROSTER_NMB48',    accent: 'cyan'   },
  hkt48:           { konst: 'ROSTER_HKT48',    accent: 'violet' },
  ngt48:           { konst: 'ROSTER_NGT48',    accent: 'amber'  },
  stu48:           { konst: 'ROSTER_STU48',    accent: 'pink'   },
  jkt48:           { konst: 'ROSTER_JKT48',    accent: 'pink'   },
  bnk48:           { konst: 'ROSTER_BNK48',    accent: 'violet' },
  'akb48-team-sh': { konst: 'ROSTER_AKB48TSH', accent: 'amber', idBase: 'akb48tsh' },
  tpe48:           { konst: 'ROSTER_TPE48',    accent: 'cyan'   },
  cgm48:           { konst: 'ROSTER_CGM48',    accent: 'pink'   },
  klp48:           { konst: 'ROSTER_KLP48',    accent: 'violet' },
};

/* ---------------------------------------------------------------
   1. NORMALISASI INPUT
   --------------------------------------------------------------- */

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&apos;': "'", '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '-',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-z#0-9]+;/gi, (m) => (m in ENTITIES ? ENTITIES[m] : m));
}

/* HTML → teks berbaris. Blok yang jelas bukan konten dibuang dulu,
   lalu tag penutup blok jadi newline supaya satu nama = satu baris. */
function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(li|p|div|tr|h1|h2|h3|h4|h5|h6|td|th|dt|dd|figcaption)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

/* ---------------------------------------------------------------
   2. PENGENALAN BARIS
   --------------------------------------------------------------- */

/* Heading / label team. Menangkap ragam penulisan:
   "Team J", "Team KIII", "Team 4", "Team Passion", "Team Dream",
   "Kenkyuusei", "Trainee", "Traine" (salah tulis), "Academy",
   "Gen 12", "Generasi 3", "Generasi 2.5" (STU48 New Wave),
   "Unit Daisy" / "Unit Bellflower" (TPE48). */
const RE_TEAM = new RegExp(
  '^(?:' +
    'team\\s+([a-z0-9]{1,12})' +
    '|((?:kenkyuusei|kenkyusei|train(?:ee|e|ing)?|academy)(?:\\s+class\\s+\\w+)?)' +
    '|(?:gen(?:erasi|eration)?)\\s*\\.?\\s*(\\d{1,2}(?:\\.\\d)?)' +
    '|unit\\s+([a-z0-9]{1,14})' +
  ')\\b',
  'i'
);

/* Kata setelah "Team" yang jelas bukan nama team — biar heading seperti
   "Team Shuffle" atau "Team Members" tidak jadi team palsu. */
const TEAM_BUKAN = new Set([
  'shuffle', 'members', 'member', 'list', 'history', 'name', 'names',
  'stage', 'stages', 'roster', 'captain', 'lineup', 'profile', 'photo',
]);

/* Kode team resmi di keluarga 48G — ini yang ditulis KAPITAL (Team K,
   Team KIII, Team BII, Team 4). Nama team berupa kata biasa (Love,
   Passion, Dream) ditulis Title Case supaya konsisten satu sama lain. */
const KODE_TEAM = new Set([
  'a', 'b', 'c', 'd', 'e', 'g', 'h', 'j', 'k', 'm', 'n', 's', 't', 'z',
  '4', '8', 'kii', 'kiii', 'kiv', 'bii', 'biii', 'nii', 'niii', 'tii',
  'sii', 'nv', 'tp', 'st',
]);

/* Team dengan kode resmi ditulis kapital (Team A, Team KIII, Team BII),
   nama team berupa kata ditulis Title Case (Team Passion, Team Love). */
function normalizeTeam(m) {
  if (m[1]) {
    const t = m[1];
    const low = t.toLowerCase();
    if (TEAM_BUKAN.has(low)) return null;
    const kapital = KODE_TEAM.has(low) || /\d/.test(t) || t.length <= 2;
    return 'Team ' + (kapital
      ? t.toUpperCase()
      : t[0].toUpperCase() + t.slice(1).toLowerCase());
  }
  if (m[2]) {
    const t = m[2].toLowerCase();
    if (t.startsWith('academy')) return 'Academy';
    if (t.startsWith('train')) return 'Trainee';   // "TRAINE" ikut ke sini
    return 'Kenkyuusei';
  }
  if (m[3]) return 'Gen ' + m[3];
  if (m[4]) {
    const t = m[4];
    return 'Unit ' + (t.length <= 2
      ? t.toUpperCase()
      : t[0].toUpperCase() + t.slice(1).toLowerCase());
  }
  return null;
}

/* Baris yang jelas bukan nama member — nav, UI wiki, boilerplate. */
const RE_NOISE = new RegExp(
  '^(?:' +
    'edit|edit source|view source|history|talk|read|share|sunting|riwayat' +
    '|contents?|isi|daftar isi|references?|referensi|see also|lihat juga' +
    '|external links?|pranala luar|gallery|galeri|categor(?:y|ies)|kategori' +
    '|navigation|menu|search|cari|sign in|masuk|register|daftar' +
    '|fandom|wiki|advertisement|iklan|explore|community|jump to' +
    '|current members?|former members?|graduated members?|member aktif' +
    '|members?|anggotanya|daftar member|line ?up' +
    '|discography|diskografi|singles?|albums?|stages?|setlist|trivia' +
    '|notes?|catatan|sources?|sumber|more|selengkapnya|show|hide|expand' +
    '|profile|profil|photo|foto|name|nama|birthdate|born|age|usia|umur' +
    '|nickname|panggilan|position|posisi|status|group|grup|generation' +
    '|nama member|member name|generasi|angkatan|anggota|anggota resmi' +
    '|official members?|kapten|captain|vice[\\s-]?captain|wakil kapten' +
    '|team shuffle|shuffle|stage units?|sub ?units?|sister groups?' +
    '|senbatsu|general election|sousenkyo|janken|theater|graduation' +
    '|jump to \\w+|main page|random page|recent changes|read more' +
    '|from [\\w\\s]*wiki|special:\\w+|talk:\\w+|user:\\w+' +
  ')$',
  'i'
);

/* Penanda bagian alumni. Importer tidak tahu siapa yang sudah lulus,
   jadi begitu heading ini muncul pembacaan DIHENTIKAN — kalau tidak,
   nama alumni akan ikut terserap memakai team heading terakhir. */
const RE_STOP = /^(?:former|graduated|graduating|alumni|past|mantan|eks)\b/i;

/* Nama orang: 1–6 kata huruf Latin/Jepang (aksen sudah termasuk \p{L}).
   Sampai 6 kata karena nama lengkap Indonesia bisa panjang, mis.
   "Jazzlyn Agatha Thrisha Indra Putri" (5 kata).
   Angka diizinkan DI DALAM kata supaya nama panggung seperti
   "Gracia JKT48" tidak ikut terbuang, tapi angka berdiri sendiri
   tetap tersaring oleh cek \d{3,} dan RE_NOISE di parse(). */
const RE_NAME = /^[\p{L}][\p{L}\d'’\-.]*(?:\s+[\p{L}][\p{L}\d'’\-.]*){0,5}$/u;

/* Penanda non-nama yang menempel di daftar resmi (mis. ★ untuk member
   baru/terpilih). Dihitung dulu di parse(), lalu dibuang dari nama. */
const RE_PENANDA = /[★☆※†‡]/g;

function cleanLine(raw) {
  return raw
    .replace(/ /g, ' ')
    .replace(/^[\s*\-–—•·▪◦|>»]+/, '')   // bullet / indent wiki
    .replace(/^\s*#.*$/, '')               // baris komentar penuh
    .replace(/\s+#.*$/, '')                // komentar di ujung baris
    .replace(/^\d+[.)]\s*/, '')            // "1. " penomoran
    .replace(/\[\s*\d+\s*\]/g, '')         // footnote [1]
    .replace(/\[(?:edit|sunting)[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*$/, '')               // label kosong: "Members:" → "Members"
    .trim();
}

/* Buang embel-embel di belakang nama:
   "Shiroma Miru (Team M)"            → "Shiroma Miru"
   "Nama Member – Team J"             → "Nama Member"
   "Chanyapak Nongbua (Kaning) – Captain" → "Chanyapak Nongbua", alias "Kaning"
   Pemisah dash/pipe dipotong DULU, baru kurung di ujung — kalau dibalik,
   kurung yang bukan di ujung baris (karena masih ada " – Captain")
   tertinggal di dalam nama dan bikin RE_NAME gagal.
   Isi kurung dikembalikan sebagai `alias`, dipakai untuk mendeteksi satu
   orang yang tertulis dua kali (nama lengkap + nama panggung). */
function stripSuffix(line) {
  let s = line
    .split(/\s+[|/•]\s+/)[0]
    .split(/\s+[–—]\s+/)[0]
    .trim();

  const alias = [];
  let sebelum;
  do {
    sebelum = s;
    s = s.replace(/\s*[（(\[]\s*([^）)\]]*)\s*[）)\]]\s*$/, (_, isi) => {
      if (isi.trim()) alias.push(isi.trim());
      return '';
    }).trim();
  } while (s !== sebelum);

  // Nama Jepang gaya wiki: "Yokoyama Yui 横山 由依" → ambil bagian Latin.
  // Hanya dijalankan kalau memang ada aksara CJK, supaya nama panggung
  // berangka ("Gracia JKT48") tidak ikut terpotong di digitnya.
  if (/[　-鿿＀-￯]/.test(s)) {
    const latin = s.match(/^[\p{Script=Latin}][\p{Script=Latin}\s'’\-.]*/u);
    if (latin && latin[0].trim().split(/\s+/).length >= 2) s = latin[0].trim();
  }
  return { nama: s.replace(/[,;:]$/, '').trim(), alias };
}

/* Baris berlabel gaya BNK48/CGM48:
     "Captain: Marine (Gen 4)"
     "Members: Fame, Hoop, Janry, Luksorn."
     "Gen 5: Galeya, Khaimook, Mayji."
   Dibentangkan jadi satu nama per baris SEBELUM pecahKoma(), karena kalau
   dipecah di koma dulu, label "Members:" cuma nempel di potongan pertama
   dan jabatan/angkatan di labelnya hilang untuk sisa nama. Jabatan dan
   angkatan ditempel ulang pakai en dash, format yang sudah dikenali
   stripSuffix() dan ambilInfoTambahan(). */
const RE_LABEL = new RegExp(
  '^(captain|kapten|co-?captain|vice[\\s-]?captain|wakil\\s+kapten' +
  '|members?|anggota(?:\\s+resmi)?|official\\s+members?' +
  '|trainee|traine|kenkyuusei|kenkyusei|academy|siswa\\s+pelatihan' +
  '|gen(?:erasi)?\\s*\\.?\\s*\\d{1,2}(?:\\.\\d)?)\\s*:\\s*(.+)$',
  'i'
);

/* Label yang menyatakan STATUS, bukan jabatan: "Trainee: A, B" berarti
   A dan B memang trainee, bukan anggota unit di heading atasnya. Label ini
   dipancarkan sebagai heading tersendiri supaya team-nya ikut berubah,
   dan otomatis kembali normal begitu heading unit berikutnya muncul. */
const RE_LABEL_STATUS = /^(?:trainee|traine|kenkyuusei|kenkyusei|academy|siswa\s+pelatihan)$/i;

function bentangkanLabel(text) {
  const keluar = [];
  text.split(/\r?\n/).forEach((baris) => {
    if (/^\s*#/.test(baris)) { keluar.push(baris); return; }
    const m = baris.trim().match(RE_LABEL);
    if (!m) { keluar.push(baris); return; }
    const label = m[1].trim();
    const gen = label.match(/gen(?:erasi)?\s*\.?\s*(\d{1,2}(?:\.\d)?)/i);
    let ekor = '';
    if (RE_LABEL_STATUS.test(label)) keluar.push(label);
    else if (/captain|kapten/i.test(label)) ekor = ' – ' + label;
    else if (gen) ekor = ' – Gen ' + gen[1];
    m[2].split(/\s*,\s*/).forEach((item) => {
      const nama = item.replace(/[.;]\s*$/, '').trim();
      if (nama) keluar.push(nama + ekor);
    });
  });
  return keluar.join('\n');
}

/* Tabel bertab gaya AKB48 Team SH:
     "Nama Member<TAB>Generasi"
     "Ye ZhiEn<TAB>Gen 1<TAB>"
   Tab diubah jadi " | " lebih dulu karena cleanLine() meringkas semua
   whitespace jadi satu spasi — kalau menunggu sampai di sana, batas
   kolomnya sudah hilang dan "Ye ZhiEn Gen 1" terbaca sebagai satu nama. */
function bentangkanTabel(text) {
  return text.split(/\r?\n/).map((baris) => {
    if (!/\t/.test(baris) || /^\s*#/.test(baris)) return baris;
    return baris
      .split(/\t+/)
      .map((sel) => sel.trim())
      .filter(Boolean)
      .join(' | ');
  }).join('\n');
}

/* Daftar satu baris dipisah koma → satu nama per baris. Bentuk yang
   ditangani:
     "ABE WAKANA, IZUMI AYANO, ..."                    (tanpa team)
     "FENI FITRIYANTI(TEAM PASSION), GITA ...(TEAM ...)" (team inline)
   Hanya dipecah kalau baris memang terlihat seperti daftar (>=2 koma)
   dan bukan format "Nama <TAB> Team" / "Nama | Team", supaya prosa
   biasa dan format eksplisit tidak ikut tercacah. */
function pecahKoma(text, catatan) {
  const keluar = [];
  text.split(/\r?\n/).forEach((baris) => {
    /* Baris komentar JANGAN dipecah. Kalau dipecah, tanda '#' hanya ikut
       potongan pertama dan sisanya terbaca sebagai nama member — komentar
       berisi daftar nama (mis. catatan "sudah dihapus: A, B, C") akan
       balik masuk ke roster. */
    if (/^\s*#/.test(baris)) { keluar.push(baris); return; }
    const isi = baris.replace(/\s+#.*$/, '');
    const koma = (isi.match(/,/g) || []).length;
    if (koma >= 2 && !/\t/.test(isi) && !/\s\|\s/.test(isi)) {
      isi.split(/\s*,\s*/).forEach((bagian) => {
        /* Titik yang dipakai sebagai pemisah, bukan singkatan:
             "... TURYBSBEK AISHA. ALICE WONG VEI YEW, ..."
           Di daftar berkoma, titik+spasi+huruf kapital hampir pasti koma
           yang salah ketik. Kalau dibiarkan, dua orang menyatu jadi satu
           nama panjang yang masih lolos RE_NAME — jadi tidak terdeteksi
           sebagai error, hanya salah diam-diam. Inisial ("J. Smith") tidak
           kena karena potongan sebelum titik harus >=2 huruf. */
        const sub = bagian.split(/(?<=\p{L}{2})\.\s+(?=\p{Lu})/u);
        if (sub.length > 1 && catatan) {
          catatan.push(`pemisah titik (bukan koma): "${bagian.trim()}" → ` +
            sub.map((s) => s.trim()).join(' + '));
        }
        sub.forEach((s) => keluar.push(s));
      });
    } else {
      keluar.push(baris);
    }
  });
  return keluar.join('\n');
}

/* Team inline dalam kurung di belakang nama:
   "FENI FITRIYANTI(TEAM PASSION)" -> { nama: 'FENI FITRIYANTI', team: 'Team Passion' }
   Kalau isi kurung bukan team (mis. tahun/kota), kurung dibiarkan utuh
   supaya dibuang stripSuffix() seperti biasa. */
function ambilTeamKurung(line) {
  const m = line.match(/^(.*?)\s*[（(]\s*([^）)]+?)\s*[）)]\s*$/);
  if (!m || !m[1].trim()) return { nama: line, team: null };
  const tm = m[2].match(RE_TEAM);
  if (!tm) return { nama: line, team: null };
  const team = normalizeTeam(tm);
  return team ? { nama: m[1].trim(), team } : { nama: line, team: null };
}

/* Format situs/wiki Jepang: "生野 莉奈 (Ikuno Rina) – Gen 6".
   Nama di situs ini ditulis romaji saja, dan romaji-nya sudah tersedia di
   dalam kurung — jadi diambil dari situ, BUKAN ditransliterasi dari kanji
   (bacaan nama Jepang tidak beraturan, menebak = salah).
   Hanya berlaku kalau di depan kurung memang ada aksara Jepang, supaya
   "Nama Member (Team J)" tidak ikut tertangkap di sini. */
const RE_CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;

/* Aksara Thai ditulis lewat escape \u supaya baris ini tetap ASCII —
   file ini sering disunting otomatis, dan pola berisi karakter non-ASCII
   rawan gagal dicocokkan. */
const RE_THAI = new RegExp('[\\u0E00-\\u0E7F]');

function ambilRomajiKurung(line) {
  const m = line.match(/[（(]\s*([\p{Script=Latin}][\p{Script=Latin}\s'’\-.]*?)\s*[）)]/u);
  if (!m) return null;
  const depan = line.slice(0, m.index);
  if (!RE_CJK.test(depan) && !RE_THAI.test(depan)) return null;
  const latin = m[1].trim();
  if (!RE_NAME.test(latin)) return null;
  /* Aksara asli = bagian sebelum kurung. cleanLine() sudah membuang bullet
     dan penomoran, jadi cukup trim. Dikembalikan DUA-DUANYA supaya kartu
     bisa menampilkan aksara asli sebagai nama utama + romaji di atasnya. */
  return { latin, asli: depan.trim() };
}

/* Kolom ke-4 file review boleh berisi URL foto dari situs resmi (hotlink).
   Yang bukan URL http(s) atau path lokal langsung dibuang — kalau tidak,
   catatan iseng di kolom itu akan jadi `img:` yang pasti gagal dimuat.
   Tanda kutip dirapikan supaya aman ditempel ke literal string. */
function bersihkanUrl(nilai) {
  const s = String(nilai || '').trim().replace(/^['"<]+|['">]+$/g, '');
  if (!s) return '';
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^img\/\S+$/i.test(s)) return s;
  return '';
}

/* Info yang dibawa baris sumber tapi belum punya kolom di ROSTER_*
   (angkatan / kapten). Tidak dibuang diam-diam — dikumpulkan lalu
   dilaporkan supaya kamu bisa memutuskan mau ditambahkan atau tidak. */
function ambilInfoTambahan(line) {
  const gen = line.match(/(draft\s+)?gen(?:erasi|eration)?\s*\.?\s*(\d{1,2})/i);
  const kapten = /\bcaptain\b|\bkapten\b/i.test(line) && !/vice|wakil/i.test(line);
  const wakil = /\bvice[\s-]?captain\b|\bwakil\s+kapten\b/i.test(line);
  return {
    gen: gen ? gen[2] : null,
    draft: gen ? Boolean(gen[1]) : false,
    kapten,
    wakil,
  };
}

/* "CHIBA ERII" -> "Chiba Erii". Hanya kata yang SELURUHNYA kapital yang
   diubah, jadi input yang sudah rapi ("Oguri Yui") tidak tersentuh dan
   token berangka ("JKT48") dibiarkan apa adanya. */
function titleCase(nama) {
  return nama.split(' ').map((w) => {
    if (/\d/.test(w)) return w;
    if (w.length < 2 || w !== w.toUpperCase()) return w;
    return w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (s, p, c) => p + c.toUpperCase());
  }).join(' ');
}

/* ---------------------------------------------------------------
   3. PARSER
   --------------------------------------------------------------- */

function parse(text) {
  const members = [];
  const dibuang = [];
  const infoGen = [];
  const infoKapten = [];
  const catatan = [];
  const seenName = new Set();
  const aliasOf = new Map();   // alias (lowercase) -> nama lengkap pemiliknya
  let team = '';
  let stopLine = '';
  let adaHeading = false; // sudah pernah lihat heading team?

  const tambah = (raw, tm, tanda, asli, img) => {
    const name = titleCase(raw);
    const key = name.toLowerCase();
    if (seenName.has(key)) return false;
    seenName.add(key);
    // `pre` = terbaca sebelum heading team pertama dan tanpa team eksplisit.
    // Di halaman wiki, bagian ini biasanya judul + navigasi, bukan member.
    members.push({
      name,
      team: tm || '',
      asli: asli || '',
      img: bersihkanUrl(img),
      pre: !adaHeading && !tm,
      tanda: !!tanda,
    });
    return true;
  };

  /* Urutan wajib: tabel dulu (tab -> " | "), baru label ("Gen 5: A, B"),
     baru koma. Kalau koma dipecah lebih dulu, label hanya menempel di
     potongan pertama; kalau tab dibiarkan sampai cleanLine(), batas kolom
     sudah hilang jadi satu spasi. */
  for (const rawLine of pecahKoma(bentangkanLabel(bentangkanTabel(text)), catatan).split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line) continue;

    /* Berhenti di bagian alumni — tapi hanya kalau sudah ada isi, supaya
       daftar isi di kepala halaman ("Contents / Former Members / …")
       tidak menghentikan pembacaan sebelum mulai. */
    if (RE_STOP.test(line)) {
      if (members.length >= 5) { stopLine = line; break; }
      dibuang.push([line, 'penanda alumni (diabaikan, isi masih kosong)']);
      continue;
    }

    if (RE_NOISE.test(line)) { dibuang.push([line, 'noise']); continue; }

    /* Format eksplisit yang kamu susun sendiri, 2-4 kolom:
         "Nama Latin | Team"
         "Nama Latin | Team | Aksara Asli"
         "Nama Latin | Team | Aksara Asli | https://.../foto.jpg"
       Paling andal, jadi dicek lebih dulu. Cek noise sudah dijalankan di
       atas supaya baris kepala tabel ("Nama Member | Generasi") tidak
       terbaca sebagai member bernama "Nama Member". */
    const pipe = line.split(/\s+\|\s+/).map((s) => s.trim());
    if (pipe.length >= 2 && pipe.length <= 4 &&
        RE_NAME.test(pipe[0]) && pipe[1].length <= 24) {
      /* Baris kepala tabel ("Nama Member | Generasi") lolos pola nama, jadi
         kolom pertamanya dicek noise sendiri — kalau tidak, tabel bertab
         menghasilkan satu "member" bernama "Nama Member". */
      if (RE_NOISE.test(pipe[0])) { dibuang.push([line, 'baris kepala tabel']); continue; }
      const nm = stripSuffix(pipe[0]).nama;
      // "-" = kolom sengaja dikosongkan di file review (team/aksara belum ada).
      const kolomTeam = pipe[1] === '-' ? '' : pipe[1];
      const kolomAsli = pipe[2] === '-' ? '' : (pipe[2] || '');
      const kolomImg = pipe[3] === '-' ? '' : (pipe[3] || '');
      const tm = kolomTeam && RE_TEAM.test(kolomTeam)
        ? normalizeTeam(kolomTeam.match(RE_TEAM))
        : kolomTeam;
      if (nm && !tambah(nm, tm, false, kolomAsli, kolomImg)) {
        dibuang.push([line, 'duplikat']);
      }
      continue;
    }

    const teamMatch = line.match(RE_TEAM);
    if (teamMatch) {
      team = normalizeTeam(teamMatch);
      adaHeading = true;
      // Heading kadang segaris dengan nama pertama: "Team J Nama Member"
      const rest = line.slice(teamMatch[0].length).trim().replace(/^[:\-–—]\s*/, '');
      if (rest && RE_NAME.test(rest)) {
        const nm = stripSuffix(rest).nama;
        if (nm) tambah(nm, team);
      }
      continue;
    }

    /* Baris gaya Jepang: kanji + romaji dalam kurung (+ Gen / Captain). */
    const romaji = ambilRomajiKurung(line);
    if (romaji) {
      const info = ambilInfoTambahan(line);
      /* Heading selalu menang. HKT48 punya heading team ("Team H") sekaligus
         Gen per baris — di situ team yang dipakai. NGT48/STU48 punya heading
         campuran ("Generasi 1 & Draft Gen 3") yang tidak bisa jadi label,
         jadi angkatan per baris dipakai sebagai cadangan. */
      const tm = team || (info.gen ? 'Gen ' + info.gen : '');
      const nama = romaji.latin;
      if (info.gen) infoGen.push(`${nama} = ${info.draft ? 'Draft ' : ''}Gen ${info.gen}`);
      if (info.kapten) infoKapten.push(`${nama} (Captain)`);
      if (info.wakil) infoKapten.push(`${nama} (Vice-Captain)`);
      if (!tambah(nama, tm, false, romaji.asli)) dibuang.push([line, 'duplikat']);
      continue;
    }

    /* Team inline di belakang nama: "FENI FITRIYANTI(TEAM PASSION)".
       Diambil SEBELUM stripSuffix(), karena stripSuffix membuang semua
       kurung di ujung baris — kalau dibalik, teamnya hilang. */
    const kurung = ambilTeamKurung(line);
    let isi = kurung.nama;
    /* Kalau kurung berisi angkatan ("Marine (Gen 4)") sementara heading team
       sudah ada ("Team BIII"), heading yang menang — angkatan bukan pengganti
       team. Kurung berisi Team/Unit tetap menang, karena itu penetapan
       eksplisit per member yang lebih spesifik daripada heading. */
    let teamBaris = kurung.team || team;
    if (kurung.team && team && /^Gen /.test(kurung.team)) teamBaris = team;

    /* Penanda seperti ★ dibuang dari nama tapi dicatat, karena artinya
       ditentukan situs sumber (member baru? kapten?) — bukan tebakan importer. */
    const tanda = (isi.match(RE_PENANDA) || []).length > 0;
    if (tanda) isi = isi.replace(RE_PENANDA, '').replace(/\s+/g, ' ').trim();

    if (/\d{3,}/.test(isi)) { dibuang.push([line, 'ada angka panjang']); continue; }
    if (isi.length > 60)    { dibuang.push([line, 'terlalu panjang']); continue; }

    const { nama: name, alias } = stripSuffix(isi);
    if (!name)                 { dibuang.push([line, 'kosong setelah dibersihkan']); continue; }
    if (!RE_NAME.test(name))   { dibuang.push([line, 'bukan pola nama']); continue; }
    // Tidak ada batas panjang minimum: BNK48 punya member yang memang
    // bernama "L". Nama 1-2 huruf dilaporkan di main() sebagai curiga,
    // biar kamu yang memutuskan itu member asli atau sisa navigasi.

    /* Info per baris yang belum punya kolom di ROSTER_* — dicatat, tidak
       dibuang diam-diam. */
    const info = ambilInfoTambahan(line);
    const genKurung = /^Gen /.test(kurung.team || '') ? kurung.team.slice(4) : null;
    const gen = info.gen || genKurung;
    const rapi = titleCase(name);
    if (gen) infoGen.push(`${rapi} = ${info.draft ? 'Draft ' : ''}Gen ${gen}`);
    if (info.kapten) infoKapten.push(`${rapi} (Captain)`);
    if (info.wakil) infoKapten.push(`${rapi} (Vice-Captain)`);

    /* Alias dalam kurung ("Chanyapak Nongbua (Kaning)") dicatat supaya orang
       yang sama tapi tertulis dua kali — sekali nama lengkap, sekali nama
       panggung — bisa dilaporkan. Dedupe berbasis nama tidak bisa melihat itu. */
    alias.forEach((a) => {
      if (RE_NAME.test(a)) aliasOf.set(a.toLowerCase(), rapi);
    });

    if (!tambah(name, teamBaris, tanda)) dibuang.push([line, 'duplikat']);
  }

  /* Kalau file ini memang berstruktur team, buang apa pun yang terbaca
     sebelum heading pertama — itu judul halaman & navigasi, bukan member.
     Untuk file datar tanpa heading sama sekali, semuanya dipertahankan. */
  let bersih = members;
  if (members.some((m) => m.team)) {
    bersih = [];
    members.forEach((m) => {
      if (m.pre) dibuang.push([m.name, 'sebelum heading team pertama']);
      else bersih.push(m);
    });
  }

  /* Satu orang tertulis dua kali: sekali "Chanyapak Nongbua (Kaning)",
     sekali "Kaning" saja. Nama panggungnya beda string, jadi dedupe biasa
     lolos. Ini TIDAK digabung otomatis — belum tentu orang yang sama, jadi
     keputusannya diserahkan ke kamu. */
  bersih.forEach((m) => {
    const pemilik = aliasOf.get(m.name.toLowerCase());
    if (pemilik && pemilik.toLowerCase() !== m.name.toLowerCase()) {
      catatan.push(`"${m.name}" juga muncul sebagai nama panggung "${pemilik}" — mungkin orang yang sama`);
    }
  });

  return { members: bersih, dibuang, stopLine, infoGen, infoKapten, catatan };
}

/* ---------------------------------------------------------------
   4. OUTPUT
   --------------------------------------------------------------- */

/* `name` selalu romaji/Latin — dipakai untuk search, urutan A-Z, monogram,
   dan nama file foto (`img/<id>.jpg`), jadi jangan ditukar dengan aksara
   asli. `nameNative` opsional: kalau ada, kartu menampilkannya sebagai nama
   utama dengan `name` diselipkan kecil di atasnya. */
function renderBlok(slug, members) {
  const g = GROUPS[slug];
  const idBase = g.idBase || slug;
  const pad = members.length > 99 ? 3 : 2;
  const adaAsli = members.some((m) => m.asli);
  const adaImg = members.some((m) => m.img);

  const wName = Math.max(...members.map((m) => m.name.length), 0);
  const wTeam = Math.max(...members.map((m) => m.team.length), 0);
  const wAsli = Math.max(...members.map((m) => (m.asli || '').length), 0);

  const baris = members.map((m, i) => {
    const id = `${idBase}-${String(i + 1).padStart(pad, '0')}`;
    const nm = `'${m.name.replace(/'/g, "\\'")}',`.padEnd(wName + 4);
    const tm = `'${m.team}',`.padEnd(wTeam + 4);
    const as = adaAsli
      ? ` nameNative: ${`'${(m.asli || '').replace(/'/g, "\\'")}',`.padEnd(wAsli + 4)}`
      : '';
    /* URL foto tidak di-padEnd: panjangnya sangat bervariasi, kalau
       disejajarkan barisnya jadi ratusan kolom dan malah sulit dibaca. */
    const im = adaImg && m.img ? ` img: '${m.img.replace(/'/g, "\\'")}',` : '';
    return `  { id: '${id}', name: ${nm} team: ${tm}${as}${im} accent: '${g.accent}' },`;
  });

  return `const ${g.konst} = [\n${baris.join('\n')}\n];`;
}

function tulisKeCommonJs(slug, blok) {
  const konst = GROUPS[slug].konst;
  let src = fs.readFileSync(COMMON_JS, 'utf8');
  const re = new RegExp(`const ${konst} = \\[[\\s\\S]*?\\n\\];`);
  if (!re.test(src)) {
    console.error(`  ! blok ${konst} tidak ditemukan di common.js — lewati`);
    return false;
  }
  src = src.replace(re, blok);
  fs.writeFileSync(COMMON_JS, src);
  return true;
}

/* ---------------------------------------------------------------
   5. MAIN
   --------------------------------------------------------------- */

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const debug = args.includes('--debug');
  const filter = args.filter((a) => !a.startsWith('--'));

  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Folder ${path.relative(ROOT, SRC_DIR)} belum ada.`);
    process.exit(1);
  }

  const files = fs.readdirSync(SRC_DIR)
    .filter((f) => /\.(txt|html?|md)$/i.test(f))
    .filter((f) => {
      const slug = path.basename(f).replace(/\.[^.]+$/, '').toLowerCase();
      return filter.length === 0 || filter.includes(slug);
    });

  if (files.length === 0) {
    console.log('Belum ada file sumber yang cocok di data/sumber/.');
    console.log('Simpan hasil copy-paste sebagai data/sumber/<slug>.txt — mis. jkt48.txt');
    console.log('Slug yang dikenali: ' + Object.keys(GROUPS).join(', '));
    return;
  }

  let total = 0;
  for (const file of files) {
    const slug = path.basename(file).replace(/\.[^.]+$/, '').toLowerCase();
    if (!GROUPS[slug]) {
      console.error(`\n${file}: slug "${slug}" tidak dikenali — lewati.`);
      continue;
    }

    const raw = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    const text = /\.html?$/i.test(file) || /<\/?(?:div|li|table|p)\b/i.test(raw)
      ? htmlToText(raw)
      : raw;

    const { members, dibuang, stopLine, infoGen, infoKapten, catatan } = parse(text);
    const tanpaTeam = members.filter((m) => !m.team).length;

    console.log(`\n=== ${slug} (${file}) ===`);
    console.log(`${members.length} member terbaca, ${dibuang.length} baris dibuang` +
      (tanpaTeam ? `, ${tanpaTeam} tanpa team` : ''));
    if (stopLine) console.log(`Pembacaan berhenti di baris "${stopLine}" (dianggap bagian alumni).`);

    const perTeam = members.reduce((a, m) => {
      const k = m.team || '(tanpa team)';
      a[k] = (a[k] || 0) + 1;
      return a;
    }, {});
    Object.entries(perTeam).forEach(([t, n]) => console.log(`  ${t}: ${n}`));

    /* Hal-hal yang importer TIDAK boleh perbaiki sendiri, hanya dilaporkan:
       nama satu kata (mungkin nama depan/belakang terpotong koma) dan nama
       yang tadinya berpenanda ★ (artinya cuma diketahui situs sumbernya). */
    const satuKata = members.filter((m) => !m.name.includes(' '));
    const berTanda = members.filter((m) => m.tanda);
    const pendek = members.filter((m) => m.name.length < 3);
    const tanpaAsli = members.filter((m) => !m.asli);
    if (satuKata.length) {
      console.log(`\n! ${satuKata.length} nama hanya satu kata — cek apakah terpotong:`);
      console.log('  ' + satuKata.map((m) => m.name).join(', '));
    }
    if (pendek.length) {
      console.log(`\n! ${pendek.length} nama di bawah 3 huruf — dipertahankan, tapi pastikan memang begitu:`);
      console.log('  ' + pendek.map((m) => m.name).join(', '));
    }
    if (berTanda.length) {
      console.log(`\n! ${berTanda.length} nama berpenanda ★ di sumber (penanda dibuang dari nama):`);
      console.log('  ' + berTanda.map((m) => m.name).join(', '));
    }
    if (catatan.length) {
      console.log(`\n! ${catatan.length} hal perlu kamu putuskan sendiri:`);
      catatan.forEach((c) => console.log('  - ' + c));
    }
    /* Aksara asli dilaporkan, tidak ditebak: transliterasi Latin -> kanji/
       Thai/Hanzi tidak mungkin akurat (banyak kandidat per bunyi). Kalau
       kolomnya kosong, kartu jatuh balik ke nama Latin saja. */
    if (tanpaAsli.length && tanpaAsli.length < members.length) {
      console.log(`\n! ${tanpaAsli.length} member belum punya aksara asli (kartu akan pakai nama Latin saja):`);
      console.log('  ' + tanpaAsli.map((m) => m.name).join(', '));
    } else if (tanpaAsli.length === members.length) {
      console.log('\ni Sumber ini tidak memuat aksara asli sama sekali — semua kartu pakai nama Latin.');
    }

    /* Info yang ada di sumber tapi belum punya kolom di ROSTER_*.
       Dilaporkan, tidak ditulis — supaya tidak hilang tanpa sepengetahuanmu. */
    if (infoKapten.length) {
      console.log(`\ni Jabatan yang disebut sumber (belum ada kolomnya di ROSTER_*):`);
      console.log('  ' + infoKapten.join(', '));
    }
    if (infoGen.length) {
      console.log(`\ni ${infoGen.length} baris menyebut angkatan per member (belum ada kolomnya):`);
      console.log('  ' + infoGen.join(', '));
    }

    if (debug && dibuang.length) {
      console.log('\n-- baris dibuang --');
      dibuang.forEach(([l, why]) => console.log(`  [${why}] ${l.slice(0, 70)}`));
    }

    if (members.length === 0) {
      console.log('Tidak ada yang bisa ditulis. Jalankan ulang dengan --debug.');
      continue;
    }

    const blok = renderBlok(slug, members);
    if (write) {
      if (tulisKeCommonJs(slug, blok)) {
        console.log(`\n→ ${GROUPS[slug].konst} ditulis ke common.js`);
        total += members.length;
      }
    } else {
      console.log('\n' + blok);
    }
  }

  if (write && total) {
    console.log(`\nSelesai — ${total} member masuk ke common.js.`);
    console.log('Cek ulang: node data/tools/audit.js');
  } else if (!write) {
    console.log('\n(pratinjau saja — tambahkan --write untuk menulis ke common.js)');
  }
}

/* main() hanya jalan kalau file ini dipanggil langsung, supaya tool dev lain
   bisa `require` parse()/renderBlok() tanpa memicu tulis-menulis. Tetap
   dev-only: tidak ada <script src> yang menunjuk ke sini. */
if (require.main === module) main();

module.exports = { parse, renderBlok, GROUPS, titleCase, normalizeTeam, RE_TEAM };
