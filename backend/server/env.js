'use strict';

/* =============================================================
   env.js — pemuat variabel lingkungan
   -------------------------------------------------------------
   KENAPA ADA MODUL INI:
   `require('dotenv').config()` hanya membaca `.env`. Kredensial
   Upstash biasanya ditaruh di `.env.local` (kebiasaan Next.js/Vite),
   dan kalau berkas itu tidak ikut dibaca, gejalanya menyesatkan:
   aplikasi tetap start, tidak ada error, tapi Redis jatuh ke mode
   memori dan snapshot live tidak pernah nyambung antar proses.

   Urutan muat (yang belakangan menimpa yang depan):
     1. .env
     2. .env.local          ← paling menang, khusus mesin sendiri
   Variabel yang SUDAH ada di process.env (mis. dari dashboard
   Vercel) tidak pernah ditimpa berkas — di produksi dashboard yang
   berkuasa.

   ALIAS: integrasi Upstash/KV di Vercel menyuntikkan
   KV_REST_API_URL / KV_REST_API_TOKEN, bukan UPSTASH_REDIS_REST_*.
   Keduanya diterima supaya tidak perlu menyalin ulang variabel
   hanya karena beda nama.
   ============================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
/* Setelah pemisahan repo, backend/ adalah Root Directory Railway
   sementara berkas .env lokal kebiasaannya ada di ROOT REPO.
   Berkas dicari BERDUA: yang lebih dekat (backend/) menang bila
   sama-sama ada. */
const ROOTS = [ROOT, path.resolve(ROOT, '..')];
let sudah = false;

/* Dicatat SEBELUM berkas apa pun dimuat, supaya bisa dibedakan mana yang
   benar-benar dari lingkungan (dashboard Vercel, shell) dan mana dari berkas. */
const prosesAsli = new Set(Object.keys(process.env));

function muatBerkas(nama, { bolehTimpa }) {
  for (const dir of ROOTS) {
    const file = path.join(dir, nama);
    if (!fs.existsSync(file)) continue;
    const dotenv = require('dotenv');
    const parsed = dotenv.parse(fs.readFileSync(file));
    Object.entries(parsed).forEach(([kunci, nilai]) => {
      if (prosesAsli.has(kunci)) return;   // lingkungan asli tidak pernah ditimpa berkas
      if (process.env[kunci] === undefined || bolehTimpa) process.env[kunci] = nilai;
    });
    return true;
  }
  return false;
}

function aliasUpstash() {
  if (!process.env.UPSTASH_REDIS_REST_URL && process.env.KV_REST_API_URL) {
    process.env.UPSTASH_REDIS_REST_URL = process.env.KV_REST_API_URL;
  }
  if (!process.env.UPSTASH_REDIS_REST_TOKEN && process.env.KV_REST_API_TOKEN) {
    process.env.UPSTASH_REDIS_REST_TOKEN = process.env.KV_REST_API_TOKEN;
  }
}

/* =============================================================
   periksaTokenUpstash — menolak token yang BENTUKNYA sudah salah
   -------------------------------------------------------------
   Kenapa perlu: token yang salah cuma menghasilkan HTTP 401 dari
   Upstash, dan 401 itu muncul jauh dari penyebabnya (di log cron,
   dua menit kemudian, saat snapshot diam-diam tidak tersimpan).
   Bentuk token bisa diperiksa TANPA jaringan, jadi lebih baik
   diteriakkan saat start.

   Kasus nyata yang memicu fungsi ini: `.env.local` berisi delapan
   karakter simbol yang sama persis — itu tampilan tersembunyi di
   dashboard (••••••••) yang ikut tersalin, bukan tokennya. Panjang
   saja tidak cukup untuk menjelaskannya; orangnya yakin sudah
   menempel token yang benar, dan secara visual memang begitu.

   NILAI TOKEN TIDAK PERNAH MASUK KE PESAN — hanya bentuknya.
   ============================================================= */
const TOKEN_MIN = 30;   // token REST Upstash asli 100+; 40 pun sudah mencurigakan

function periksaTokenUpstash(token) {
  const nilai = String(token == null ? '' : token);
  const bungkus = (kode, alasan, saran) => ({ ok: false, kode, alasan, saran });

  if (!nilai) return bungkus('kosong', 'UPSTASH_REDIS_REST_TOKEN kosong.', 'Upstash akan dilewati seluruhnya.');

  if (/\s/.test(nilai)) {
    return bungkus('spasi', 'Token mengandung spasi/baris baru.',
      'Biasanya tanda tempelan terpotong atau terlipat. Salin ulang dalam satu baris utuh.');
  }
  if (/^rediss?:\/\//i.test(nilai)) {
    return bungkus('urlRedis', 'Yang terisi adalah URL koneksi Redis (rediss://...), bukan token REST.',
      'Ambil dari dashboard Upstash → database → tab "REST API".');
  }
  if (/["']/.test(nilai)) {
    return bungkus('kutip', 'Token masih membawa tanda kutip.',
      'Tulis tanpa kutip, atau pastikan kutip pembuka dan penutupnya sepasang.');
  }
  /* Sidik jari "topeng": nilai yang isinya cuma satu atau dua karakter
     berulang. Nyaris tidak mungkin itu token sungguhan, dan hampir selalu
     berarti yang tersalin adalah bintang/bulatan penyembunyi atau
     placeholder seperti xxxxxxxx. */
  const unik = new Set(nilai).size;
  if (unik <= 2 && nilai.length < TOKEN_MIN) {
    return bungkus('topeng',
      `Token hanya berisi ${unik} macam karakter yang diulang ${nilai.length} kali —`
      + ' ini pola tampilan tersembunyi (••••••••) atau placeholder, bukan token.',
      'Di dashboard Upstash token disembunyikan sampai ikon mata/salin diklik.'
      + ' Klik tombol salin di tab "REST API", jangan menyorot teks yang terlihat.');
  }
  if (nilai.length < TOKEN_MIN) {
    return bungkus('pendek',
      `Token hanya ${nilai.length} karakter — terlalu pendek untuk token REST Upstash (biasanya 100+).`,
      'Yang sepanjang ini biasanya password koneksi TCP. Ambil dari tab "REST API".');
  }
  return { ok: true, kode: 'ok', alasan: null, saran: null };
}


function loadEnv({ logger = console, diam = false, berkas } = {}) {
  if (sudah) return;
  sudah = true;
  /* `berkas` bisa dikosongkan ([]) untuk memaksa "lingkungan saja" —
     dipakai uji otomatis supaya kredensial nyata di .env.local tidak
     ikut terbawa dan uji tidak diam-diam menembak Upstash sungguhan. */
  const daftar = berkas === undefined ? [['.env', false], ['.env.local', true]] : berkas;
  const terbaca = daftar
    .filter(([nama, bolehTimpa]) => muatBerkas(nama, { bolehTimpa }))
    .map(([nama]) => nama);
  aliasUpstash();
  if (diam) return;
  if (terbaca.length === 0 && !process.env.VERCEL) {
    logger.warn('[ENV] .env maupun .env.local tidak ditemukan — mengandalkan variabel lingkungan saja.');
  }
  /* Peringatan setengah-terisi: gejalanya paling membingungkan karena
     aplikasi tetap jalan, hanya diam-diam tanpa Redis. */
  const adaUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const adaToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (adaUrl !== adaToken) {
    logger.warn(`[ENV] Upstash setengah terisi: URL ${adaUrl ? 'ada' : 'kosong'}, TOKEN ${adaToken ? 'ada' : 'kosong'}.`
      + ' Keduanya wajib, kalau tidak Redis dilewati.');
  }
  /* Bentuk token diperiksa di sini, bukan hanya di `npm run cek:live`,
     supaya salah tempel ketahuan saat start — bukan dua menit kemudian
     lewat HTTP 401 di log cron. */
  if (adaToken) {
    const periksa = periksaTokenUpstash(process.env.UPSTASH_REDIS_REST_TOKEN);
    if (!periksa.ok) logger.warn(`[ENV] ${periksa.alasan} ${periksa.saran}`);
  }
}

module.exports = { loadEnv, periksaTokenUpstash, ROOT, TOKEN_MIN };
