#!/usr/bin/env node
/* =============================================================
   import-bio.js — DEV ONLY, TIDAK DIMUAT HALAMAN MANA PUN
   -------------------------------------------------------------
   Mengubah paste biodata jadi blok `const BIO = { … }` di common.js.

   Semua situs resmi tidak bisa dijangkau dari lingkungan ini, jadi
   biodata HARUS ditempel manual. Tool ini hanya merapikan: ia tidak
   pernah menebak, melengkapi, atau "memperbaiki" isi yang kamu tulis.

   FORMAT SUMBER — data/sumber/bio/<grup>.txt
     Satu blok per member, dipisah baris kosong. Baris pertama = nama
     Latin persis seperti di roster (atau id member-nya). Sisanya
     "kunci: nilai". Kunci yang kosong dilewati, jadi mengisi sebagian
     tidak masalah.

       Fiony Alveria Tantri
       panggilan: Fiony
       angkatan: Gen 8
       lahir: 2003-06-06
       asal: Jakarta
       tinggi: 158
       darah: O
       instagram: fionyalveria

     Baris yang dimulai "#" dianggap catatan dan diabaikan.

   PAKAI
     node data/tools/import-bio.js                     # status semua grup
     node data/tools/import-bio.js jkt48 --template    # buat kerangka isi
     node data/tools/import-bio.js jkt48               # pratinjau hasil baca
     node data/tools/import-bio.js jkt48 --write       # tulis ke common.js

   Menulis satu grup TIDAK menghapus biodata grup lain: blok BIO dibaca
   dulu dari common.js, digabung, lalu ditulis ulang seluruhnya.
   ============================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..', 'frontend');
const COMMON_JS = path.join(ROOT, 'common.js');
const BIO_DIR = path.join(ROOT, 'data', 'sumber', 'bio');

/* ---------------------------------------------------------------
   1. KUNCI YANG DIKENALI
   Alias ditulis lengkap supaya kamu tidak perlu hafal ejaan resmi.
   Semua dibandingkan setelah dikecilkan & spasi dirapikan.
   --------------------------------------------------------------- */
const ALIAS = {
  nickname: ['panggilan', 'nama panggung', 'nama panggilan', 'julukan', 'nickname', 'nick'],
  gen: ['angkatan', 'generasi', 'gen', 'generation'],
  role: ['jabatan', 'posisi', 'peran', 'role', 'position'],
  birthDate: ['lahir', 'tanggal lahir', 'tgl lahir', 'ultah', 'birthday', 'birthdate', 'dob'],
  birthPlace: ['asal', 'tempat lahir', 'kota asal', 'daerah', 'birthplace', 'hometown'],
  height: ['tinggi', 'tinggi badan', 'height'],
  bloodType: ['darah', 'golongan darah', 'gol darah', 'gol. darah', 'blood', 'bloodtype', 'blood type'],
  debut: ['gabung', 'bergabung', 'tanggal gabung', 'debut', 'tanggal debut', 'joined'],
  jikoshoukai: ['salam', 'perkenalan', 'jikoshoukai', 'catchphrase', 'moto', 'motto'],
};

/* Kunci sosial harus sama dengan kunci di SOSIAL_META (common.js) —
   kalau tidak cocok, normalisasiSosial() akan membuang nilainya. */
const ALIAS_SOSIAL = {
  x: ['x', 'twitter', 'tweet'],
  instagram: ['instagram', 'ig', 'insta'],
  tiktok: ['tiktok', 'tt'],
  youtube: ['youtube', 'yt', 'kanal youtube'],
  showroom: ['showroom', 'sr', 'showroom live'],
  idn: ['idn', 'idn live', 'idnlive'],
  weibo: ['weibo'],
  facebook: ['facebook', 'fb'],
};

const URUTAN_FIELD = ['name', 'nickname', 'gen', 'role', 'birthDate', 'birthPlace',
  'height', 'bloodType', 'debut', 'jikoshoukai'];
const URUTAN_SOSIAL = ['x', 'instagram', 'tiktok', 'youtube', 'showroom', 'idn', 'weibo', 'facebook'];

const petaKunci = new Map();
Object.keys(ALIAS).forEach((f) => ALIAS[f].forEach((a) => petaKunci.set(a, { jenis: 'field', nama: f })));
Object.keys(ALIAS_SOSIAL).forEach((f) => ALIAS_SOSIAL[f].forEach((a) => petaKunci.set(a, { jenis: 'sosial', nama: f })));

/* ---------------------------------------------------------------
   2. NORMALISASI NILAI
   --------------------------------------------------------------- */
const rapi = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const kunciNama = (s) => rapi(s).toLowerCase().replace(/[.,'’`-]/g, '');

/* Baris nama boleh diberi catatan di belakangnya: "Ikuno Rina  # kapten".
   Hanya berlaku untuk baris nama — pada baris "kunci: nilai" tanda '#'
   dibiarkan, karena bisa jadi bagian sah dari nilai (tagar, fragment URL). */
const bersihkanNama = (s) => rapi(String(s).replace(/\s+#.*$/, ''));

const BULAN = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7,
  agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7,
  august: 8, october: 10, december: 12, jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, agu: 8, sep: 9, sept: 9, oct: 10, okt: 10,
  nov: 11, dec: 12, des: 12,
};

/* Tanggal harus benar-benar ada. Regex saja meloloskan 1998-02-30, yang
   nanti tampil sebagai string kosong di halaman tanpa pesan apa pun —
   jadi divalidasi ulang lewat Date UTC. */
function iso(th, bl, tg) {
  const d = new Date(Date.UTC(th, bl - 1, tg));
  if (d.getUTCFullYear() !== th || d.getUTCMonth() !== bl - 1 || d.getUTCDate() !== tg) return null;
  return `${th}-${String(bl).padStart(2, '0')}-${String(tg).padStart(2, '0')}`;
}

/* Mengembalikan { iso } atau { salah: alasan }. Format ambigu seperti
   05/06/2003 diterima sebagai HARI/BULAN (kebiasaan Indonesia) TAPI
   dilaporkan, supaya kamu bisa memeriksa yang tanggalnya <= 12. */
function bacaTanggal(nilai) {
  const s = rapi(nilai);
  if (!s) return { salah: 'kosong' };

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const hasil = iso(+m[1], +m[2], +m[3]);
    return hasil ? { iso: hasil } : { salah: `tanggal tidak ada di kalender: "${s}"` };
  }

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const hasil = iso(+m[3], +m[2], +m[1]);
    if (!hasil) return { salah: `tanggal tidak ada di kalender: "${s}"` };
    return { iso: hasil, ragu: +m[1] <= 12 ? `"${s}" dibaca hari/bulan → ${hasil}` : '' };
  }

  m = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const bl = BULAN[m[2].toLowerCase()];
    if (!bl) return { salah: `nama bulan tidak dikenali: "${m[2]}"` };
    const hasil = iso(+m[3], bl, +m[1]);
    return hasil ? { iso: hasil } : { salah: `tanggal tidak ada di kalender: "${s}"` };
  }

  m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) {
    const bl = BULAN[m[1].toLowerCase()];
    if (!bl) return { salah: `nama bulan tidak dikenali: "${m[1]}"` };
    const hasil = iso(+m[3], bl, +m[2]);
    return hasil ? { iso: hasil } : { salah: `tanggal tidak ada di kalender: "${s}"` };
  }

  /* Tahun saja tidak cukup: usia & zodiak diturunkan dari tanggal penuh,
     jadi setengah tanggal lebih berbahaya daripada tidak ada. */
  return { salah: `format tanggal tidak dikenali: "${s}" (pakai 2003-06-06)` };
}

function bacaTinggi(nilai) {
  const s = rapi(nilai).toLowerCase();
  if (!s) return { salah: 'kosong' };
  const m = /^(\d+(?:[.,]\d+)?)\s*(cm|m)?$/.exec(s);
  if (!m) return { salah: `tinggi tidak dikenali: "${nilai}"` };
  let n = parseFloat(m[1].replace(',', '.'));
  if (m[2] === 'm' || (!m[2] && n > 1 && n < 2.5)) n *= 100;
  n = Math.round(n);
  if (n < 120 || n > 210) return { salah: `tinggi di luar rentang wajar: "${nilai}" → ${n} cm` };
  return { nilai: n };
}

function bacaDarah(nilai) {
  const s = rapi(nilai).toUpperCase().replace(/型|\s*TYPE\s*|GOL\.?\s*/g, '').replace(/[^ABO+-]/g, '');
  if (!s) return { salah: 'kosong' };
  if (!/^(?:A|B|O|AB)[+-]?$/.test(s)) return { salah: `golongan darah tidak dikenali: "${nilai}"` };
  return { nilai: s };
}

/* ---------------------------------------------------------------
   3. PARSER BLOK
   --------------------------------------------------------------- */
function parseSumber(text) {
  const blok = [];
  const masalah = [];
  let kini = null;

  /* Blok kosong (nama saja, semua kunci belum diisi) tetap disimpan agar
     bisa dilaporkan "cocok tapi belum ada isinya" — bukan diam-diam hilang. */
  const simpan = () => { if (kini) blok.push(kini); };

  text.split(/\r?\n/).forEach((baris, i) => {
    const nomor = i + 1;
    const s = baris.trim();

    if (s === '' || /^[-=_]{3,}$/.test(s)) { simpan(); kini = null; return; }
    if (s.startsWith('#')) return;

    /* "kunci: nilai" — dipisah pada ':' PERTAMA saja, karena nilainya
       bisa berisi ':' (URL https://…, atau salam berisi titik dua). */
    const pisah = s.indexOf(':');
    const kunci = pisah > 0 ? kunciNama(s.slice(0, pisah)) : '';
    const dikenal = kunci && petaKunci.get(kunci);

    if (!kini) {
      if (dikenal) {
        masalah.push(`baris ${nomor}: "${s}" muncul sebelum ada nama member — dilewati.`);
        return;
      }
      kini = { nama: bersihkanNama(s), baris: nomor, isi: {}, sosial: {}, tidakDikenal: [] };
      return;
    }

    if (!dikenal) {
      /* Baris tanpa ':' di tengah blok kemungkinan besar nama member
         berikutnya yang lupa dipisahkan baris kosong. Ditebak sebagai
         blok baru, tapi tetap dilaporkan. */
      if (pisah === -1) {
        masalah.push(`baris ${nomor}: "${s}" tidak punya "kunci: nilai" — dianggap nama member baru (tambahkan baris kosong pemisah kalau bukan).`);
        simpan();
        kini = { nama: bersihkanNama(s), baris: nomor, isi: {}, sosial: {}, tidakDikenal: [] };
      } else {
        kini.tidakDikenal.push(`baris ${nomor}: kunci "${s.slice(0, pisah).trim()}" tidak dikenali`);
      }
      return;
    }

    const nilai = rapi(s.slice(pisah + 1));
    if (!nilai || nilai === '-') return; // sengaja dibiarkan kosong

    if (dikenal.jenis === 'sosial') { kini.sosial[dikenal.nama] = nilai; return; }
    kini.isi[dikenal.nama] = nilai;
  });

  simpan();
  return { blok, masalah };
}

/* ---------------------------------------------------------------
   4. ROSTER DARI common.js
   common.js dijalankan di sandbox — sumber kebenaran satu-satunya untuk
   id & nama, jadi tidak ada risiko tool ini dan halaman berbeda pendapat.
   --------------------------------------------------------------- */
function muatCommon() {
  const stub = new Proxy({}, {
    get: (t, k) => (['style', 'dataset', 'classList'].includes(k) ? stub
      : (typeof k === 'string' ? () => null : '')),
    set: () => true,
  });
  const sandbox = {
    document: {
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      createElement: () => stub, addEventListener: () => {}, documentElement: stub, body: stub,
    },
    window: { addEventListener: () => {}, location: { search: '', hash: '' } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console: { warn: () => {}, log: () => {}, error: () => {} },
    encodeURIComponent, URLSearchParams,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(fs.readFileSync(COMMON_JS, 'utf8'), { filename: 'common.js' }).runInContext(sandbox);
  return vm.runInContext('({ GROUPS, MEMBERS, BIO })', sandbox);
}

function cariGrup(GROUPS, arg) {
  const a = String(arg || '').toLowerCase();
  return GROUPS.find((g) => g.id.toLowerCase() === a || g.slug.toLowerCase() === a) || null;
}

/* Berkas sumber: <groupId>.txt lebih diutamakan karena itu yang disebut
   pesan "biodata belum diisi" di halaman member; <slug>.txt tetap
   diterima supaya penamaan lama tidak jadi jalan buntu. */
function berkasSumber(grup) {
  const kandidat = [`${grup.id}.txt`, `${grup.slug}.txt`];
  for (const nama of kandidat) {
    const p = path.join(BIO_DIR, nama);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/* ---------------------------------------------------------------
   5. COCOKKAN BLOK → MEMBER
   --------------------------------------------------------------- */
function cocokkan(blok, anggota) {
  const petaId = new Map(anggota.map((m) => [m.id.toLowerCase(), m]));
  const petaNama = new Map();
  const petaAsli = new Map();
  anggota.forEach((m) => {
    const k = kunciNama(m.name);
    if (!petaNama.has(k)) petaNama.set(k, []);
    petaNama.get(k).push(m);
    if (m.nameNative) {
      const ka = rapi(m.nameNative).replace(/\s+/g, '');
      if (!petaAsli.has(ka)) petaAsli.set(ka, []);
      petaAsli.get(ka).push(m);
    }
  });

  const hasil = [];
  const gagal = [];
  const dipakai = new Map();

  blok.forEach((b) => {
    const nama = b.nama;
    let cocok = petaId.get(nama.toLowerCase()) || null;
    let lewat = 'id';

    if (!cocok) {
      const kandidat = petaNama.get(kunciNama(nama)) || petaAsli.get(rapi(nama).replace(/\s+/g, '')) || [];
      if (kandidat.length === 1) { cocok = kandidat[0]; lewat = 'nama'; }
      else if (kandidat.length > 1) {
        gagal.push(`"${nama}" (baris ${b.baris}): ada ${kandidat.length} member bernama sama — pakai id-nya: ${kandidat.map((m) => m.id).join(', ')}`);
        return;
      }
    }

    if (!cocok) {
      gagal.push(`"${nama}" (baris ${b.baris}): tidak ada di roster grup ini — cek ejaannya, atau member-nya belum masuk common.js`);
      return;
    }

    if (dipakai.has(cocok.id)) {
      gagal.push(`"${nama}" (baris ${b.baris}): id ${cocok.id} sudah dipakai blok baris ${dipakai.get(cocok.id)} — blok ini dilewati`);
      return;
    }
    dipakai.set(cocok.id, b.baris);
    hasil.push({ blok: b, member: cocok, lewat });
  });

  return { hasil, gagal };
}

/* ---------------------------------------------------------------
   6. BANGUN ENTRI BIO
   --------------------------------------------------------------- */
function bangunEntri(pasangan) {
  const { blok, member } = pasangan;
  const catatan = [];
  const entri = { name: member.name };

  ['nickname', 'gen', 'role', 'birthPlace', 'jikoshoukai'].forEach((f) => {
    if (blok.isi[f]) entri[f] = blok.isi[f];
  });

  ['birthDate', 'debut'].forEach((f) => {
    if (!blok.isi[f]) return;
    const t = bacaTanggal(blok.isi[f]);
    if (t.iso) {
      entri[f] = t.iso;
      if (t.ragu) catatan.push(`${member.id} ${f}: ${t.ragu}`);
    } else {
      catatan.push(`${member.id} ${f}: ${t.salah} — tidak ditulis`);
    }
  });

  if (blok.isi.height) {
    const h = bacaTinggi(blok.isi.height);
    if (h.nilai) entri.height = h.nilai;
    else catatan.push(`${member.id} tinggi: ${h.salah} — tidak ditulis`);
  }

  if (blok.isi.bloodType) {
    const d = bacaDarah(blok.isi.bloodType);
    if (d.nilai) entri.bloodType = d.nilai;
    else catatan.push(`${member.id} darah: ${d.salah} — tidak ditulis`);
  }

  const sosial = {};
  URUTAN_SOSIAL.forEach((k) => {
    const v = blok.sosial[k];
    if (!v) return;
    /* Username diterima apa adanya (URL dirangkai di common.js). Yang
       ditolak: teks yang jelas bukan keduanya, mis. "tidak ada". */
    if (/\s/.test(v) && !/^https?:\/\//i.test(v)) {
      catatan.push(`${member.id} ${k}: "${v}" mengandung spasi — bukan username/URL, tidak ditulis`);
      return;
    }
    sosial[k] = v.replace(/^@/, '');
  });
  if (Object.keys(sosial).length) entri.social = sosial;

  blok.tidakDikenal.forEach((t) => catatan.push(`${member.id} — ${t}`));

  return { id: member.id, entri, catatan };
}

/* ---------------------------------------------------------------
   7. RENDER BLOK BIO
   Seluruh objek ditulis ulang dari data yang sudah ada + yang baru,
   dikelompokkan per grup dan diurutkan menurut id, supaya diff-nya
   kecil dan mudah dibaca.
   --------------------------------------------------------------- */
const kutip = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function renderEntri(id, entri) {
  const isi = [];
  URUTAN_FIELD.forEach((f) => {
    if (entri[f] === undefined || entri[f] === '') return;
    isi.push(`    ${f}: ${typeof entri[f] === 'number' ? entri[f] : kutip(entri[f])},`);
  });
  if (entri.social && Object.keys(entri.social).length) {
    const baris = URUTAN_SOSIAL
      .filter((k) => entri.social[k])
      .map((k) => `      ${k}: ${kutip(entri.social[k])},`);
    Object.keys(entri.social)
      .filter((k) => !URUTAN_SOSIAL.includes(k))
      .forEach((k) => baris.push(`      ${k}: ${kutip(entri.social[k])},`));
    isi.push('    social: {', ...baris, '    },');
  }
  return `  ${kutip(id)}: {\n${isi.join('\n')}\n  },`;
}

function renderBlokBIO(bio, GROUPS) {
  const ids = Object.keys(bio).sort();
  if (ids.length === 0) {
    return 'const BIO = {\n  // Diisi oleh: node data/tools/import-bio.js <slug> --write\n};';
  }

  const perGrup = new Map();
  ids.forEach((id) => {
    const g = GROUPS.find((x) => id.startsWith(x.id + '-'));
    const kunci = g ? g.id : '(lain)';
    if (!perGrup.has(kunci)) perGrup.set(kunci, []);
    perGrup.get(kunci).push(id);
  });

  const bagian = [];
  GROUPS.concat([{ id: '(lain)', name: 'Tanpa grup yang cocok' }]).forEach((g) => {
    const daftar = perGrup.get(g.id);
    if (!daftar || !daftar.length) return;
    bagian.push(`  /* ${g.name} — ${daftar.length} member */`);
    daftar.forEach((id) => bagian.push(renderEntri(id, bio[id])));
    bagian.push('');
  });
  while (bagian.length && bagian[bagian.length - 1] === '') bagian.pop();

  return `const BIO = {\n${bagian.join('\n')}\n};`;
}

function tulisKeCommonJs(blokBaru) {
  let src = fs.readFileSync(COMMON_JS, 'utf8');
  const re = /const BIO = \{[\s\S]*?\n\};/;
  if (!re.test(src)) {
    console.error('  ! blok "const BIO = {…};" tidak ditemukan di common.js — tidak ada yang ditulis.');
    return false;
  }
  src = src.replace(re, blokBaru);
  fs.writeFileSync(COMMON_JS, src);
  return true;
}

/* ---------------------------------------------------------------
   8. TEMPLATE
   Kerangka berisi nama + id tiap member dan kunci yang KOSONG. Sengaja
   tidak diisi apa pun: tidak ada sumber yang bisa dijangkau dari sini,
   dan biodata yang ditebak lebih buruk daripada kolom kosong.
   --------------------------------------------------------------- */
function buatTemplate(grup, anggota, adaBio) {
  const kepala = [
    `# BIODATA ${grup.name} — tempel isinya di sini.`,
    '#',
    '# Aturan:',
    '#   - Satu blok per member, dipisah baris kosong. JANGAN ubah baris nama/id.',
    '#   - Isi setelah tanda ":". Yang tidak kamu tahu, biarkan kosong (atau hapus barisnya).',
    '#   - lahir/gabung: pakai 2003-06-06. Tinggi: angka cm saja. Darah: A/B/O/AB.',
    '#   - Sosial: cukup username (tanpa @) atau URL lengkap.',
    '#   - Baris yang diawali "#" diabaikan.',
    '#',
    `# Lalu: node data/tools/import-bio.js ${grup.id} --write`,
    '',
  ];

  const blok = anggota.map((m) => {
    /* Aksara asli & status ditaruh di baris "# ---", BUKAN di baris nama.
       Baris nama harus persis sama dengan roster karena itu yang dicocokkan;
       komentar di belakangnya cuma jadi sumber salah cocok. */
    const kepalaBlok = [`# --- ${m.id}`, m.team, m.nameNative,
      adaBio.has(m.id) ? 'sudah ada biodata' : ''].filter(Boolean).join('  ·  ');
    return [
      kepalaBlok,
      m.name,
      'panggilan:',
      'angkatan:',
      'jabatan:',
      'lahir:',
      'asal:',
      'tinggi:',
      'darah:',
      'gabung:',
      'salam:',
      'x:',
      'instagram:',
      '',
    ].join('\n');
  });

  return kepala.join('\n') + blok.join('\n');
}

/* ---------------------------------------------------------------
   9. MAIN
   --------------------------------------------------------------- */
function statusSemua(GROUPS, MEMBERS, BIO) {
  console.log('Status biodata per grup:\n');
  let adaSumber = false;
  GROUPS.forEach((g) => {
    const anggota = MEMBERS.filter((m) => m.groupId === g.id);
    const terisi = anggota.filter((m) => BIO[m.id]).length;
    const berkas = berkasSumber(g);
    if (berkas) adaSumber = true;
    const catatan = anggota.length === 0
      ? 'roster masih kosong'
      : `${terisi}/${anggota.length} biodata` + (berkas ? `, sumber: data/sumber/bio/${path.basename(berkas)}` : ', belum ada berkas sumber');
    console.log(`  ${g.id.padEnd(9)} ${g.name.padEnd(14)} ${catatan}`);
  });

  console.log('\nLangkah berikutnya:');
  console.log('  1. node data/tools/import-bio.js <grup> --template   → buat kerangka di data/sumber/bio/');
  console.log('  2. isi kerangkanya (tempel dari situs resmi grupnya)');
  console.log('  3. node data/tools/import-bio.js <grup>              → pratinjau');
  console.log('  4. node data/tools/import-bio.js <grup> --write      → tulis ke common.js');
  if (!adaSumber) console.log('\n(belum ada berkas sumber sama sekali — mulai dari langkah 1)');
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const template = args.includes('--template');
  const target = args.filter((a) => !a.startsWith('--'));

  let data;
  try {
    data = muatCommon();
  } catch (e) {
    console.error(`Gagal menjalankan common.js: ${e.message}`);
    process.exit(1);
  }
  const { GROUPS, MEMBERS, BIO } = data;

  if (target.length === 0) { statusSemua(GROUPS, MEMBERS, BIO); return; }

  const bioGabungan = JSON.parse(JSON.stringify(BIO));
  let berubah = false;
  let adaError = false;

  for (const arg of target) {
    const grup = cariGrup(GROUPS, arg);
    if (!grup) {
      console.error(`\n"${arg}" bukan grup yang dikenal. Pilihan: ${GROUPS.map((g) => g.id).join(', ')}`);
      adaError = true;
      continue;
    }

    const anggota = MEMBERS.filter((m) => m.groupId === grup.id);
    console.log(`\n=== ${grup.name} (${grup.id}) ===`);

    if (anggota.length === 0) {
      console.log('Roster grup ini masih kosong di common.js — isi roster dulu (import-roster.js), biodata butuh id member.');
      continue;
    }

    if (template) {
      if (!fs.existsSync(BIO_DIR)) fs.mkdirSync(BIO_DIR, { recursive: true });
      const tujuan = path.join(BIO_DIR, `${grup.id}.txt`);
      if (fs.existsSync(tujuan) && !args.includes('--paksa')) {
        console.log(`data/sumber/bio/${grup.id}.txt sudah ada — tidak ditimpa.`);
        console.log('(tambahkan --paksa kalau memang mau dibuat ulang; isian lamamu akan hilang)');
      } else {
        const adaBio = new Set(Object.keys(bioGabungan));
        fs.writeFileSync(tujuan, buatTemplate(grup, anggota, adaBio));
        console.log(`Kerangka ${anggota.length} member ditulis ke data/sumber/bio/${grup.id}.txt`);
      }
      continue;
    }

    const berkas = berkasSumber(grup);
    if (!berkas) {
      console.log(`Belum ada data/sumber/bio/${grup.id}.txt.`);
      console.log(`Buat kerangkanya: node data/tools/import-bio.js ${grup.id} --template`);
      continue;
    }

    const { blok, masalah } = parseSumber(fs.readFileSync(berkas, 'utf8'));
    const berisi = blok.filter((b) => Object.keys(b.isi).length || Object.keys(b.sosial).length);
    const { hasil, gagal } = cocokkan(berisi, anggota);

    const entri = hasil.map(bangunEntri);
    const catatan = entri.flatMap((e) => e.catatan);
    const kosong = entri.filter((e) => Object.keys(e.entri).length <= 1);

    console.log(`${path.basename(berkas)}: ${blok.length} blok dibaca, ${berisi.length} berisi data, ${hasil.length} cocok ke roster.`);

    if (masalah.length) {
      console.log('\n! Format sumber:');
      masalah.forEach((m) => console.log('    ' + m));
    }
    if (gagal.length) {
      console.log('\n! Tidak bisa dicocokkan (biodatanya TIDAK ditulis):');
      gagal.forEach((m) => console.log('    ' + m));
    }
    if (catatan.length) {
      console.log('\n! Nilai yang perlu dicek:');
      catatan.forEach((m) => console.log('    ' + m));
    }
    if (kosong.length) {
      console.log(`\ni ${kosong.length} blok cocok tapi tidak ada field sah — dilewati: ${kosong.map((e) => e.id).join(', ')}`);
    }

    const dipakai = entri.filter((e) => Object.keys(e.entri).length > 1);
    if (dipakai.length === 0) {
      console.log('\nTidak ada biodata yang bisa ditulis.');
      continue;
    }

    /* Nama di entri diambil dari roster (bukan dari berkas sumber) supaya
       pengaman cocokNama() di common.js pasti lolos — pengaman itu untuk
       mendeteksi id yang bergeser, bukan salah ketik di sumber. */
    dipakai.forEach((e) => { bioGabungan[e.id] = e.entri; berubah = true; });

    const belum = anggota.filter((m) => !bioGabungan[m.id]);
    console.log(`\n${dipakai.length} biodata siap ditulis. Masih kosong: ${belum.length}/${anggota.length} member.`);
    if (belum.length && belum.length <= 12) {
      console.log('    ' + belum.map((m) => `${m.id} ${m.name}`).join(', '));
    }

    const contoh = dipakai[0];
    console.log('\nContoh entri:\n' + renderEntri(contoh.id, contoh.entri));
  }

  if (!template && berubah) {
    if (write) {
      if (tulisKeCommonJs(renderBlokBIO(bioGabungan, GROUPS))) {
        console.log(`\nBlok BIO di common.js ditulis ulang — total ${Object.keys(bioGabungan).length} entri.`);
        console.log('Verifikasi: node data/tools/audit.js');
      } else {
        adaError = true;
      }
    } else {
      console.log('\n(pratinjau saja — tambahkan --write untuk menulis ke common.js)');
    }
  }

  if (adaError) process.exit(1);
}

main();
