'use strict';

/* =============================================================
   supabase.js — klien Supabase opsional
   -------------------------------------------------------------
   Aturan utamanya SATU: tidak boleh membuat proses mati hanya
   karena env Supabase belum diisi. Database utama proyek ini
   tetap Postgres lewat DATABASE_URL (pg.Pool) — dan Supabase
   memang Postgres, jadi cukup arahkan DATABASE_URL ke string
   koneksi Supabase bila mau memakainya sebagai database.

   Klien ini disiapkan untuk kebutuhan DI LUAR SQL langsung
   (Storage, Auth admin, dsb.). Dibuat MALAS (lazy): baru
   dibentuk pada pemanggilan pertama, sehingga deploy tanpa
   SUPABASE_URL/SUPABASE_KEY tetap sehat dan /health tetap 200.
   ============================================================= */

const SUPABASE_URL_ENV = 'SUPABASE_URL';
const SUPABASE_KEY_ENV = 'SUPABASE_KEY';

let klien = null;
let sudahDibangun = false;

function envBersih(nama) {
  const nilai = String(process.env[nama] || '').trim();
  return nilai || null;
}

function konfigurasiLengkap() {
  return Boolean(envBersih(SUPABASE_URL_ENV) && envBersih(SUPABASE_KEY_ENV));
}

/* getSupabase() → klien atau null. TIDAK PERNAH throw. */
function getSupabase() {
  if (sudahDibangun) return klien;
  sudahDibangun = true;

  const url = envBersih(SUPABASE_URL_ENV);
  const key = envBersih(SUPABASE_KEY_ENV);
  if (!url || !key) {
    console.warn('[SUPABASE] SUPABASE_URL / SUPABASE_KEY belum diatur — fitur Supabase dinonaktifkan (server tetap jalan).');
    return null;
  }
  try {
    /* require di dalam fungsi supaya modul tetap bisa dimuat
       bahkan bila dependensi belum terpasang di lingkungan tertentu. */
    const { createClient } = require('@supabase/supabase-js');
    klien = createClient(url, key, {
      auth: { persistSession: false },
    });
    return klien;
  } catch (error) {
    console.error(`[SUPABASE] gagal membuat klien: ${error.message}`);
    return null;
  }
}

/* Ringkasan aman untuk /health & log: tidak membocorkan kredensial. */
function statusSupabase() {
  return {
    configured: konfigurasiLengkap(),
    connected: Boolean(klien),
    url_host: (() => {
      try { return new URL(envBersih(SUPABASE_URL_ENV) || 'about:blank').host || null; }
      catch { return null; }
    })(),
  };
}

module.exports = { getSupabase, statusSupabase, konfigurasiLengkap };
