'use strict';

/* =============================================================
   uji-env.js — uji pemeriksa kredensial (tanpa jaringan)
   -------------------------------------------------------------
   PAKAI:  node data/live-tracker/uji-env.js
   Keluar 0 kalau semua lulus, 1 kalau ada yang gagal.

   KENAPA BERKAS INI ADA:
   Token Upstash yang salah tidak pernah mengeluh di tempat yang
   benar. Gejalanya cuma HTTP 401 di log cron dua menit kemudian,
   dan snapshot yang diam-diam tidak tersimpan. Bentuk token bisa
   dinilai tanpa jaringan sama sekali, jadi kesalahan tempel harus
   ketahuan saat start.

   Kasus nyata yang melahirkan pemeriksa ini: `.env.local` berisi
   delapan karakter simbol yang sama persis. Itu tampilan
   tersembunyi di dashboard yang ikut tersalin — bukan tokennya.
   Pemeriksa yang hanya melihat panjang akan bilang "terlalu
   pendek", padahal penyebab sebenarnya beda dan penjelasannya
   juga beda.

   Uji terpenting di berkas ini yang terakhir: pesan peringatan
   TIDAK BOLEH memuat nilai tokennya. Peringatan kredensial itu
   sering disalin-tempel ke chat atau isu publik.
   ============================================================= */

const assert = require('node:assert');
const Module = require('node:module');

/* Modul env menyimpan status "sudah dimuat" di tingkat modul, dan uji ini
   perlu memanggil loadEnv() berkali-kali dengan isi berbeda. Karena itu
   cache-nya dibersihkan tiap kali, bukan dipakai ulang. */
const JALUR_ENV = require.resolve('../../server/env');
function muatUlangEnv() {
  delete require.cache[JALUR_ENV];
  return require('../../server/env');
}

const { periksaTokenUpstash, TOKEN_MIN } = muatUlangEnv();

/* Token REST asli bentuknya seperti ini: panjang, base64, diawali A.
   Nilai di bawah sengaja dikarang — bukan kredensial siapa pun. */
const TOKEN_MIRIP_ASLI = `A${'ZmFrZS10b2tlbi11bnR1ay11ppQtc2FqYS1idWthbi1hc2xp'.repeat(2)}`;

let lulus = 0;
let gagalTotal = 0;
const kegagalan = [];

function uji(nama, fn) {
  try {
    fn();
    lulus += 1;
    console.log(`  ok   ${nama}`);
  } catch (error) {
    gagalTotal += 1;
    kegagalan.push(`${nama}: ${error.message}`);
    console.log(`  GAGAL ${nama}\n        ${error.message}`);
  }
}

console.log('UJI PEMERIKSA KREDENSIAL (tanpa jaringan)\n');

console.log('bentuk token yang harus DITERIMA');
uji('token panjang mirip token REST asli: lolos', () => {
  const h = periksaTokenUpstash(TOKEN_MIRIP_ASLI);
  assert.strictEqual(h.ok, true, `ditolak dengan alasan: ${h.alasan}`);
  assert.strictEqual(h.kode, 'ok');
  assert.strictEqual(h.alasan, null, 'token yang sah tidak boleh membawa keluhan');
});
uji('token panjang berisi - dan _ (base64url) tetap lolos', () => {
  const h = periksaTokenUpstash(`Aa1_-${'b'.repeat(40)}Z9_x-Q`);
  assert.strictEqual(h.ok, true, `ditolak: ${h.alasan}`);
});
uji(`ambang batasnya ${TOKEN_MIN}: tepat di ambang diterima`, () => {
  /* Karakter dibuat beragam supaya yang diuji betul-betul panjangnya,
     bukan aturan "topeng". */
  const tepat = 'Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0'.slice(0, TOKEN_MIN);
  assert.strictEqual(tepat.length, TOKEN_MIN);
  assert.strictEqual(periksaTokenUpstash(tepat).ok, true);
});

console.log('\nbentuk token yang harus DITOLAK');
uji('delapan simbol yang sama: dikenali sebagai topeng, bukan "terlalu pendek"', () => {
  /* Inilah isi .env.local yang sebenarnya saat pemilik proyek yakin
     tokennya sudah benar. Kalau uji ini suatu hari berubah jadi 'pendek',
     pesan yang keluar akan menyuruh orang mencari token yang lebih
     panjang — padahal masalahnya cara menyalin. */
  const h = periksaTokenUpstash('•'.repeat(8));
  assert.strictEqual(h.ok, false);
  assert.strictEqual(h.kode, 'topeng', `dapat kode ${h.kode} — diagnosanya jadi salah arah`);
  assert.match(h.saran, /salin/i, 'sarannya harus menyebut cara menyalin, bukan panjang token');
});
uji('bintang dan placeholder xxxxxxxx juga topeng', () => {
  assert.strictEqual(periksaTokenUpstash('********').kode, 'topeng');
  assert.strictEqual(periksaTokenUpstash('xxxxxxxxxxxx').kode, 'topeng');
  assert.strictEqual(periksaTokenUpstash('••••••••••••••••').kode, 'topeng');
});
uji('password TCP pendek: kode pendek, sarannya menyebut tab REST API', () => {
  const h = periksaTokenUpstash('p4ssw0rdTCP');
  assert.strictEqual(h.kode, 'pendek');
  assert.match(h.saran, /REST API/, 'tanpa ini orang akan mencari-cari sendiri di dashboard');
});
uji('URL koneksi rediss:// dikenali sebagai salah tempel, bukan token pendek', () => {
  const h = periksaTokenUpstash('rediss://default:rahasia@master-titmouse.upstash.io:6379');
  assert.strictEqual(h.ok, false);
  assert.strictEqual(h.kode, 'urlRedis', `dapat ${h.kode} — panjangnya lolos, jadi tanpa aturan ini diam saja`);
});
uji('token dengan baris baru/spasi: kode spasi', () => {
  assert.strictEqual(periksaTokenUpstash(`${TOKEN_MIRIP_ASLI.slice(0, 50)} ${TOKEN_MIRIP_ASLI.slice(50)}`).kode, 'spasi');
  assert.strictEqual(periksaTokenUpstash(`${TOKEN_MIRIP_ASLI}\n`).kode, 'spasi');
});
uji('token yang masih membawa kutip: kode kutip', () => {
  assert.strictEqual(periksaTokenUpstash(`"${TOKEN_MIRIP_ASLI}`).kode, 'kutip');
});
uji('kosong, undefined, null: kode kosong dan tidak melempar', () => {
  ['', undefined, null].forEach((nilai) => {
    const h = periksaTokenUpstash(nilai);
    assert.strictEqual(h.ok, false);
    assert.strictEqual(h.kode, 'kosong', `nilai ${String(nilai)} memberi kode ${h.kode}`);
  });
});

console.log('\nkerahasiaan pesan');
uji('nilai token TIDAK pernah muncul di alasan/saran', () => {
  /* Peringatan kredensial sering disalin ke chat atau isu publik. Pemeriksa
     ini boleh menyebut panjang dan bentuk, tidak boleh menyebut isinya. */
  const contoh = [
    'p4ssw0rdTCP',
    'rediss://default:rahasiaBanget@host.upstash.io:6379',
    `"${TOKEN_MIRIP_ASLI}`,
    `${TOKEN_MIRIP_ASLI.slice(0, 20)} ${TOKEN_MIRIP_ASLI.slice(20)}`,
  ];
  contoh.forEach((nilai) => {
    const h = periksaTokenUpstash(nilai);
    const pesan = `${h.alasan || ''} ${h.saran || ''}`;
    assert.ok(!pesan.includes(nilai), `pesan memuat token utuh untuk: ${nilai.slice(0, 12)}...`);
    /* Potongan panjang pun tidak boleh — 16 karakter awal sudah cukup
       untuk dipakai orang lain kalau tokennya asli. */
    assert.ok(!pesan.includes(nilai.slice(0, 16)),
      `pesan memuat 16 karakter awal token untuk: ${nilai.slice(0, 12)}...`);
    assert.ok(!pesan.includes('rahasiaBanget'), 'password dari URL ikut tercetak');
  });
});

console.log('\nperingatan saat loadEnv');
uji('token bentuknya salah: loadEnv memperingatkan', () => {
  const simpanUrl = process.env.UPSTASH_REDIS_REST_URL;
  const simpanToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    process.env.UPSTASH_REDIS_REST_URL = 'https://contoh.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = '•'.repeat(8);
    const pesan = [];
    const env = muatUlangEnv();
    env.loadEnv({ berkas: [], logger: { warn: (t) => pesan.push(t), log() {}, error() {} } });
    assert.ok(pesan.some((p) => /topeng|tersembunyi|placeholder/i.test(p)),
      `tidak ada peringatan tentang bentuk token. Yang keluar: ${JSON.stringify(pesan)}`);
    assert.ok(!pesan.join(' ').includes(process.env.UPSTASH_REDIS_REST_TOKEN.slice(0, 8)),
      'peringatan loadEnv ikut mencetak nilai tokennya');
  } finally {
    if (simpanUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = simpanUrl;
    if (simpanToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = simpanToken;
  }
});
uji('token wajar: loadEnv tidak berisik', () => {
  const simpanUrl = process.env.UPSTASH_REDIS_REST_URL;
  const simpanToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    process.env.UPSTASH_REDIS_REST_URL = 'https://contoh.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = TOKEN_MIRIP_ASLI;
    const pesan = [];
    const env = muatUlangEnv();
    env.loadEnv({ berkas: [], logger: { warn: (t) => pesan.push(t), log() {}, error() {} } });
    assert.deepStrictEqual(pesan, [],
      `konfigurasi sehat tidak boleh memicu peringatan: ${JSON.stringify(pesan)}`);
  } finally {
    if (simpanUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = simpanUrl;
    if (simpanToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = simpanToken;
  }
});
uji('setengah terisi (URL ada, token kosong): tetap diperingatkan', () => {
  const simpanUrl = process.env.UPSTASH_REDIS_REST_URL;
  const simpanToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    process.env.UPSTASH_REDIS_REST_URL = 'https://contoh.upstash.io';
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_TOKEN;
    const pesan = [];
    const env = muatUlangEnv();
    env.loadEnv({ berkas: [], logger: { warn: (t) => pesan.push(t), log() {}, error() {} } });
    assert.ok(pesan.some((p) => /setengah terisi/i.test(p)), `yang keluar: ${JSON.stringify(pesan)}`);
  } finally {
    if (simpanUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = simpanUrl;
    if (simpanToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = simpanToken;
  }
});

console.log('\nalias KV_* dari integrasi Vercel');
uji('KV_REST_API_TOKEN diadopsi jadi UPSTASH_REDIS_REST_TOKEN', () => {
  const simpan = {
    u: process.env.UPSTASH_REDIS_REST_URL,
    t: process.env.UPSTASH_REDIS_REST_TOKEN,
    ku: process.env.KV_REST_API_URL,
    kt: process.env.KV_REST_API_TOKEN,
  };
  try {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.KV_REST_API_URL = 'https://contoh-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = TOKEN_MIRIP_ASLI;
    const env = muatUlangEnv();
    env.loadEnv({ berkas: [], diam: true });
    assert.strictEqual(process.env.UPSTASH_REDIS_REST_URL, 'https://contoh-kv.upstash.io');
    assert.strictEqual(process.env.UPSTASH_REDIS_REST_TOKEN, TOKEN_MIRIP_ASLI);
  } finally {
    Object.entries({
      UPSTASH_REDIS_REST_URL: simpan.u,
      UPSTASH_REDIS_REST_TOKEN: simpan.t,
      KV_REST_API_URL: simpan.ku,
      KV_REST_API_TOKEN: simpan.kt,
    }).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  }
});
uji('berkas TIDAK pernah menimpa variabel yang sudah ada di lingkungan', () => {
  /* Ini janji untuk produksi: dashboard Vercel harus berkuasa atas
     .env.local yang mungkin ikut ter-deploy. */
  const berkas = require('node:path').join(require('../../server/env').ROOT, '.env.local');
  const fs = require('node:fs');
  if (!fs.existsSync(berkas)) return;   // tidak ada berkas, tidak ada yang bisa menimpa
  const simpan = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    process.env.UPSTASH_REDIS_REST_TOKEN = TOKEN_MIRIP_ASLI;
    const env = muatUlangEnv();
    env.loadEnv({ diam: true });
    assert.strictEqual(process.env.UPSTASH_REDIS_REST_TOKEN, TOKEN_MIRIP_ASLI,
      '.env.local menimpa variabel lingkungan — di Vercel ini berarti kredensial lama menang');
  } finally {
    if (simpan === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = simpan;
  }
});

console.log(`\n${lulus} lulus, ${gagalTotal} gagal`);
if (gagalTotal > 0) {
  console.log('\nRINCIAN GAGAL:');
  kegagalan.forEach((k) => console.log(`  - ${k}`));
  process.exitCode = 1;
}

/* Modul env dibiarkan bersih untuk pemanggil berikutnya. */
delete require.cache[JALUR_ENV];
void Module;
