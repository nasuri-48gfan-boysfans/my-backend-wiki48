'use strict';

/* =============================================================
   schedule-proxy.js — pembaca jadwal stage dari situs resmi grup
   -------------------------------------------------------------
   Browser tidak bisa memanggil situs resmi langsung: Cloudflare
   menolak request tanpa User-Agent browser, dan CORS memblokir
   responsnya. Karena itu pengambilan dilakukan DI SINI (server),
   lalu hasilnya dinormalisasi ke satu bentuk JSON yang sama.

   Adapter per grup (semuanya sumber RESMI, bukan data rekayasa):
     jkt48 → API resmi  https://jkt48.com/api/v1/schedules
     akb48 → API kalender theater  POST /public/api/schedule/calendar/
     ske48 → HTML daftar jadwal    /schedule/list/{tahun}/{bulan}/
     stu48 → HTML daftar jadwal    /schedule/list/{tahun}/{bulan}/  (CMS sama dengan SKE48)
     hkt48 → HTML tabel jadwal     /schedule/{tahun}/{bulan}
     ngt48 → Google Calendar resmi NGT48 (iCal publik, kalender Web + Event)
     tpe48 → data array di halaman https://www.tpe48.tw/pages/schedule
     nmb48 → Google Calendar resmi NMB48 (embed di nmb48.com/schedule/)
     klp48 → array "events" di halaman fanclub resmi https://klp48.peeeps.jp/page/14

   Grup lain (BNK48/CGM48/AKB48 Team SH) belum punya sumber terprogram
   yang layak per Agustus 2026: halaman schedule BNK48 tidak memuat
   tanggal sama sekali (diisi lewat JS tertutup), situs baru CGM48 tidak
   punya halaman jadwal, dan domain Team SH sudah mati (kini hanya Weibo/
   aplikasi). Frontend menampilkan TAUTAN ke halaman resminya sebagai
   gantinya, bukan data basi.

   Cache memori kecil dipakai supaya situs resmi tidak melihat
   lonjakan permintaan saat banyak pengunjung membuka halaman
   pada bulan yang sama.
   ============================================================= */

const DEFAULT_TIMEOUT_MS = Number(process.env.SCHEDULE_FETCH_TIMEOUT_MS || 12000);
const CACHE_TTL_MS = Number(process.env.SCHEDULE_CACHE_TTL_MS || 300000);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const { execFile } = require('node:child_process');

/* --- Util kecil ------------------------------------------------ */
function duaDigit(n) {
  return String(n).padStart(2, '0');
}

/* "19:00:00", "2026-08-02 19:00:00", "9:30～ ..." → "19:00".
   Tidak ada jam → string kosong (frontend menampilkan "Jam menyusul"). */
function potongJam(nilai) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(nilai || ''));
  return m ? `${duaDigit(Number(m[1]))}:${m[2]}` : '';
}

function buangTag(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugTeks(teks) {
  return String(teks || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function urutkan(items) {
  return items.sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}

/* --- HTTP -------------------------------------------------------
   Situs resmi (terutama jkt48.com & akb48.co.jp) berada di balik
   Cloudflare yang memeriksa sidik jari TLS: fetch bawaan Node
   (OpenSSL) sering ditantang "Just a moment…", sementara curl
   sistem (Schannel di Windows, NSS/OpenSSL versi distribusi di
   Linux) umumnya lolos. Karena itu dicoba BERDUA: fetch dulu,
   curl sebagai jalan keluar. */

function headersUntukFetch(referer) {
  return {
    accept: 'application/json, text/plain, */*',
    'user-agent': USER_AGENT,
    ...(referer ? { referer } : {}),
  };
}

async function requestViaFetch(url, { referer, method = 'GET', form } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...headersUntukFetch(referer),
        /* Tanpa header ini body urlencoded dibaca "text/plain" dan
           $_POST di sisi situs resmi tidak terisi (respons kosong). */
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/* Status HTTP dan isi dipisah dengan penanda agar JSON yang mengandung
   angka di akhir tetap bisa diurai dengan aman. */
const CURL_STATUS_MARK = '\n__WIKI48_HTTP__';

function requestViaCurl(url, { referer, method = 'GET', form } = {}, wantStatus) {
  const binary = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const args = [
    '-sS', '-L', '--compressed', '--max-time', String(Math.ceil(DEFAULT_TIMEOUT_MS / 1000)),
    '-A', USER_AGENT,
    '-H', `accept: application/json, text/plain, */*`,
    ...(referer ? ['-H', `referer: ${referer}`] : []),
  ];
  if (form) {
    /* Objek diratakan menjadi pasangan --data-urlencode "k=v" per kunci
       supaya nilai yang mengandung "&" atau spasi tetap aman. */
    args.push('-X', method === 'GET' ? 'POST' : method);
    for (const [k, v] of Object.entries(form)) args.push('--data-urlencode', `${k}=${v}`);
  }
  if (wantStatus) args.push('-w', `${CURL_STATUS_MARK}%{http_code}`);
  args.push(url);

  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: DEFAULT_TIMEOUT_MS + 3000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) return reject(error);
      if (!wantStatus) return resolve(stdout);
      const idx = stdout.lastIndexOf(CURL_STATUS_MARK);
      if (idx === -1) return reject(new Error('curl: status HTTP tidak terbaca'));
      const status = Number(stdout.slice(idx + CURL_STATUS_MARK.length).trim());
      const body = stdout.slice(0, idx);
      if (!(status >= 200 && status < 300)) return reject(new Error(`HTTP ${status || '?'} (curl)`));
      resolve(body);
    });
  });
}

async function requestJson(url, opsi = {}) {
  try {
    const response = await requestViaFetch(url, opsi);
    return await response.json();
  } catch (errorFetch) {
    try {
      const body = await requestViaCurl(url, opsi, true);
      return JSON.parse(body);
    } catch (errorCurl) {
      /* Lapor penyebab pertama — lebih relevan bagi pembaca log. */
      throw errorFetch;
    }
  }
}

async function requestText(url, opsi = {}) {
  try {
    const response = await requestViaFetch(url, opsi);
    return await response.text();
  } catch (errorFetch) {
    try {
      return await requestViaCurl(url, opsi, true);
    } catch (errorCurl) {
      throw errorFetch;
    }
  }
}

/* --- Parser iCal (NGT48 via Google Calendar publik) ------------- */

/* Baris lanjutan iCal dimulai spasi — digabung dulu. */
function unfoldIcal(ics) {
  return String(ics || '').replace(/\r?\n[ \t]/g, '');
}

/* DTSTART iCal → { date: 'YYYY-MM-DD', time: 'HH:MM' } dalam zona JST.
   - VALUE=DATE            → all-day (time kosong)
   - berakhiran Z          → UTC, geser +09:00 (Asia/Tokyo)
   - TZID=...              → diasumsikan waktu lokal Jepang (semua
                             kalender resmi 48 Group memakai JST) */
function bacaTanggalIcal(nilai) {
  const v = String(nilai || '').trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '' };
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  let hari = Number(m[3]);
  let jam = Number(m[4]);
  const menit = m[5];
  if (m[7] === 'Z') { jam += 9; if (jam >= 24) { jam -= 24; hari += 1; } }
  return { date: `${m[1]}-${m[2]}-${duaDigit(hari)}`, time: `${duaDigit(jam)}:${menit}` };
}

const HARI_ICAL = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };

/* Kembalikan kemunculan event yang jatuh di sekitar bulan target.
   RRULE mingguan/harian dibatasi jendela ±7 hari agar murah. */
function kembangkanEvent(block, awalJendela, akhirJendela) {
  const dtstartRaw = (/^DTSTART[^:]*:(.+)$/m.exec(block) || [])[1];
  const mulai = bacaTanggalIcal(dtstartRaw);
  if (!mulai) return [];
  const rruleRaw = (/^RRULE:(.+)$/m.exec(block) || [])[1];
  const tanggal = (iso) => new Date(`${iso}T00:00:00Z`);
  const tMulai = tanggal(mulai.date);

  if (!rruleRaw) {
    return mulai.date >= awalJendela && mulai.date <= akhirJendela ? [mulai.date] : [];
  }

  const aturan = {};
  for (const bagian of rruleRaw.split(';')) {
    const idx = bagian.indexOf('=');
    if (idx > 0) aturan[bagian.slice(0, idx)] = bagian.slice(idx + 1);
  }
  const freq = String(aturan.FREQ || '').toUpperCase();
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return [];

  const sampaiIso = aturan.UNTIL ? (bacaTanggalIcal(aturan.UNTIL.replace(/Z$/, '')) || {}).date : '';
  const tSampai = sampaiIso ? tanggal(sampaiIso) : akhirJendela ? tanggal(akhirJendela) : null;
  const byday = String(aturan.BYDAY || '').split(',').map((h) => HARI_ICAL[h]).filter((n) => n !== undefined);

  const hasil = [];
  const kursor = new Date(Math.max(tMulai.getTime(), tanggal(awalJendela).getTime()));
  const batas = Math.min(tSampai ? tSampai.getTime() : Infinity, tanggal(akhirJendela).getTime());
  while (kursor.getTime() <= batas && hasil.length < 62) {
    if (freq !== 'WEEKLY' || !byday.length || byday.includes(kursor.getUTCDay())) {
      hasil.push(kursor.toISOString().slice(0, 10));
    }
    kursor.setUTCDate(kursor.getUTCDate() + 1);
  }
  return hasil;
}

function parseIcal(ics, { tahun, bulan, idPrefix = 'cal' }) {
  const teks = unfoldIcal(ics);
  const blocks = teks.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const items = [];
  const terlihat = new Set();

  const padStart = `${tahun}-${duaDigit(bulan)}-01`;
  const tglAwal = new Date(`${padStart}T00:00:00Z`);
  tglAwal.setUTCDate(tglAwal.getUTCDate() - 7);
  const tglAkhir = new Date(`${padStart}T00:00:00Z`);
  tglAkhir.setUTCMonth(tglAkhir.getUTCMonth() + 1);
  tglAkhir.setUTCDate(tglAkhir.getUTCDate() + 7);
  const awalJendela = tglAwal.toISOString().slice(0, 10);
  const akhirJendela = tglAkhir.toISOString().slice(0, 10);

  for (const block of blocks) {
    if (/^STATUS:CANCELLED/m.test(block)) continue;
    const uid = (/^UID:(.+)$/m.exec(block) || [])[1] || '';
    const summary = buangTag((/^SUMMARY:(.+)$/m.exec(block) || [])[1]);
    if (!summary) continue;
    const deskripsi = buangTag((/^DESCRIPTION:([\s\S]*?)(?=^[A-Z][A-Z-]+:|END:VEVENT)/m.exec(block) || [])[1]);
    /* URL berhenti di spasi/karakter non-Latin — deskripsi Jepang sering
       menempel teks langsung setelah tautan tanpa spasi. */
    const urlDariDeskripsi = ((deskripsi.match(/https?:\/\/[^\s<>|"]+?(?=[\u3000-\u9fff\uff01-\uff5e]|$)/) || [])[0] || '').replace(/[),.;]+$/, '');

    for (const tanggal of kembangkanEvent(block, awalJendela, akhirJendela)) {
      if (!tanggal.startsWith(`${tahun}-${duaDigit(bulan)}`)) continue;
      const kunciDuplikat = `${uid}|${tanggal}|${summary}`;
      if (terlihat.has(kunciDuplikat)) continue;
      terlihat.add(kunciDuplikat);
      const mulai = bacaTanggalIcal((/^DTSTART[^:]*:(.+)$/m.exec(block) || [])[1]);
      const selesai = (/^DTEND[^:]*:(.+)$/m.exec(block) || [])[1];
      items.push({
        id: `${idPrefix}-${tanggal}-${slugTeks(summary) || items.length}`,
        link: '',
        title: summary,
        date: tanggal,
        startTime: mulai ? mulai.time : '',
        endTime: potongJam(bacaTanggalIcal(selesai)?.time || ''),
        type: 'EVENT',
        team: '',
        birthday: false,
        url: urlDariDeskripsi,
      });
    }
  }
  return items;
}

/* Pembaca Google Calendar publik yang dipakai bersama (NGT48 & NMB48).
   Satu kalender gagal tidak boleh mengosongkan semuanya. */
async function ambilKalenderGoogle(calendarIds, { tahun, bulan }, { officialUrl, tzPrefix }) {
  const hasilPerKalender = await Promise.all(calendarIds.map(async (calId) => {
    const url = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calId)}/public/basic.ics`;
    try {
      const ics = await requestText(url, { referer: officialUrl });
      return parseIcal(ics, { tahun, bulan, idPrefix: tzPrefix });
    } catch (error) {
      if (console && console.warn) console.warn(`[${tzPrefix}] kalender ${calId}: ${error.message}`);
      return [];
    }
  }));
  const gabung = hasilPerKalender.flat();
  return urutkan(gabung.map((item, i) => ({ ...item, id: `${item.id}-${i}`, url: item.url || officialUrl })));
}

/* --- Parser array "events" ala fanclub resmi (KLP48) -------------
   Halaman https://klp48.peeeps.jp/page/14 menyematka seluruh jadwal
   sebagai array JS di dalam iframe srcdoc (ter-escape HTML):
     const events = [
       { date: '2026-08-30', category: 'live-event',
         description: 'MINI LIVE SHOW', venue: 'KLP48 Theatre…',
         time: 'OPEN 19:40/ START 20:00', details: '', url: '#' }, … ] */
function parseKlpEvents(html, { tahun, bulan }) {
  /* Srcdoc meng-escape < > dan kutip — balikkan dulu supaya bisa diurai. */
  const teks = String(html || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  const idxArray = teks.search(/const\s+events\s*=\s*\[/);
  if (idxArray === -1) throw new Error('Struktur halaman jadwal KLP48 berubah (array events tidak ada)');
  const awal = teks.indexOf('[', idxArray);
  const akhir = teks.indexOf('];', awal);
  if (awal === -1 || akhir === -1) throw new Error('Struktur halaman jadwal KLP48 berubah (array tidak tertutup)');

  const prefiks = `${tahun}-${duaDigit(bulan)}`;
  const items = [];
  const reObjek = /\{([^{}]*)\}/g;
  let objek;
  while ((objek = reObjek.exec(teks.slice(awal, akhir)))) {
    const bidang = {};
    /* Nilai string memakai kutip tunggal; \' dan \u0027 ikut dibaca. */
    const reBidang = /(\w+)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
    let pasangan;
    while ((pasangan = reBidang.exec(objek[1]))) bidang[pasangan[1]] = pasangan[2].replace(/\\u0027|\\'/g, "'");
    const iso = String(bidang.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !iso.startsWith(prefiks)) continue;
    const judul = buangTag(String(bidang.description || ''));
    if (!judul) continue;
    /* Bentuk jam yang pernah muncul: "19:00-21:00",
       "OPEN 19:40/ START 20:00", kosong. */
    const rentang = /(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})/.exec(String(bidang.time || ''));
    const startTunggal = !rentang && /START\s+(\d{1,2}:\d{2})/i.exec(String(bidang.time || ''));
    const url = String(bidang.url || '');
    items.push({
      id: `klp48-${iso}-${slugTeks(judul) || items.length}`,
      link: '',
      title: judul,
      date: iso,
      startTime: rentang ? potongJam(rentang[1]) : (startTunggal ? potongJam(startTunggal[1]) : ''),
      endTime: rentang ? potongJam(rentang[2]) : '',
      type: String(bidang.category || '') === 'fanclub' ? 'EXCLUSIVE' : 'EVENT',
      team: '',
      birthday: /birthday/i.test(judul),
      url: url && url !== '#' ? url : '',
    });
  }
  return urutkan(items);
}

/* --- Parser HTML daftar jadwal ala "fansite" (SKE48 & STU48) ----
   Struktur (kedua CMS identik):
   <li class="schedule_entry_box clearfix">
     <p class="date"><span class="md">1</span><span class="week">Sat</span></p>
     <div class="entry_box ...">
       <div class="list__txt entry live04 cat14">
         <a href="/schedule/detail/22802">
           <p class="category category--14 scheduleCateIco">公演・コンサート</p>
           <p class="tit">Judul…</p> */

function parseFansiteSchedule(html, { tahun, bulan, baseUrl }) {
  const mulaiList = html.indexOf('list--information list--schedule');
  const segmen = mulaiList >= 0 ? html.slice(mulaiList) : html;
  const items = [];
  const blokHari = segmen.split(/<li class="schedule_entry_box/);

  for (const blok of blokHari.slice(1)) {
    const hari = Number((/<span class="md">(\d{1,2})<\/span>/.exec(blok) || [])[1]);
    if (!(hari >= 1 && hari <= 31)) continue;
    const iso = `${tahun}-${duaDigit(bulan)}-${duaDigit(hari)}`;

    const reEntry = /<div class="[^"]*\bentry\b[^"]*">\s*<a href="([^"]+)">\s*(?:<p class="cat(?:egory)?[^"]*">([^<]*)<\/p>\s*)?<p class="tit">([\s\S]*?)<\/p>/g;
    let entry;
    while ((entry = reEntry.exec(blok))) {
      const labelKategori = buangTag(entry[2]);
      const judul = buangTag(entry[3]);
      if (!judul) continue;
      const href = entry[1].startsWith('//') ? `https:${entry[1]}` : entry[1].startsWith('/') ? `${baseUrl}${entry[1]}` : entry[1];
      const isShow = labelKategori.includes('公演');
      const ulangTahun = labelKategori.includes('誕生日');
      items.push({
        id: `${iso}-${slugTeks(judul) || items.length}`,
        link: '',
        title: judul,
        date: iso,
        startTime: '',
        endTime: '',
        type: isShow ? 'SHOW' : 'EVENT',
        team: '',
        birthday: ulangTahun,
        url: href,
      });
    }
  }
  return urutkan(items);
}

/* --- Parser HTML tabel HKT48 ------------------------------------
   <tr><th scope="row" id="day1"><span class="f166">1</span>日<br>(土)</th>
       <td class="boxes">
         <p class="21" data-category="21"><img …><a href="/schedule/2026/08/21009">Judul</a></p> */
function parseHktSchedule(html, { tahun, bulan }) {
  const items = [];
  const baris = html.split(/<th scope="row" id="day\d+"/);

  for (const segmen of baris.slice(1)) {
    const segmenTd = segmen.split('</tr>')[0];
    /* Nomor hari ada di <span class="f166">N</span> tepat setelah th pembuka. */
    const hari = Number((/^[\s\S]*?<span class="f166">(\d{1,2})<\/span>/.exec(segmenTd) || [])[1]);
    if (!(hari >= 1 && hari <= 31)) continue;
    const iso = `${tahun}-${duaDigit(bulan)}-${duaDigit(hari)}`;

    const reEntry = /<p class="(\d+)" data-category="\d+">\s*<img[^>]*>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/g;
    let entry;
    while ((entry = reEntry.exec(segmenTd))) {
      const kategori = entry[1];
      const judul = buangTag(entry[3]);
      if (!judul) continue;
      /* Kalender tutup theater (休館日) bukan agenda pengunjung. */
      if (kategori === '20' && judul.includes('休館日')) continue;
      const href = entry[2].startsWith('/') ? `https://www.hkt48.jp${entry[2]}` : entry[2];
      /* Jam sering ditempel di depan judul media: "20:00～ OBSラジオ…" */
      const jamDepan = /^\s*(\d{1,2})[:：](\d{2})\s*[～~−-]/.exec(judul);
      items.push({
        id: `hkt48-${iso}-${slugTeks(judul) || items.length}`,
        link: '',
        title: judul,
        date: iso,
        startTime: jamDepan ? `${duaDigit(Number(jamDepan[1]))}:${jamDepan[2]}` : '',
        endTime: '',
        type: kategori === '20' ? 'SHOW' : 'EVENT',
        team: '',
        birthday: kategori === '35',
        url: href,
      });
    }
  }
  return urutkan(items);
}

/* --- Adapter per grup -------------------------------------------
   fetch() mengembalikan array item ternormalisasi:
   { id, link, title, date, startTime, endTime, type, team, birthday,
     url } + tz ditempel getOfficialSchedule sesuai grup. */
const SOURCES = {
  jkt48: {
    officialUrl: 'https://jkt48.com/schedule?lang=id',
    tz: 'WIB',
    async fetch({ month, year, lang }) {
      const url = `https://jkt48.com/api/v1/schedules?month=${month}&year=${year}&lang=${lang}`;
      const data = await requestJson(url, { referer: 'https://jkt48.com/schedule' });
      const rows = Array.isArray(data && data.data) ? data.data : [];
      return urutkan(rows
        .filter((item) => item && item.date && (item.title || item.link))
        .map((item) => ({
          id: String(item.reference_code || item.schedule_id || item.link),
          link: typeof item.link === 'string' ? item.link : '',
          title: String(item.title || 'Tanpa judul'),
          date: String(item.date).slice(0, 10),
          startTime: potongJam(item.start_time),
          endTime: potongJam(item.end_time),
          type: ['SHOW', 'EVENT', 'EXCLUSIVE'].includes(item.type) ? item.type : 'EVENT',
          team: typeof item.jkt48_member_type === 'string' ? item.jkt48_member_type : '',
          birthday: item.birthday_member === 'BIRTHDAY',
          url: item.link ? `https://jkt48.com/schedule/${item.link}?lang=${lang}` : this.officialUrl,
        })));
    },
  },

  akb48: {
    officialUrl: 'https://www.akb48.co.jp/theater/schedule/',
    tz: 'JST',
    async fetch({ month, year }) {
      const data = await requestJson('https://www.akb48.co.jp/public/api/schedule/calendar/', {
        method: 'POST',
        form: { month: String(month), year: String(year), category: '1' },
        referer: this.officialUrl,
      });
      const bulanIni = (data && data.data && data.data.thismonth) || {};
      const items = [];
      for (const [kunciHari, daftar] of Object.entries(bulanIni)) {
        const bagian = /^(\d{4})_(\d{1,2})_(\d{1,2})$/.exec(kunciHari);
        if (!bagian || !Array.isArray(daftar)) continue;
        const iso = `${bagian[1]}-${duaDigit(bagian[2])}-${duaDigit(bagian[3])}`;
        for (const it of daftar) {
          const css = String((it && it.css_class) || '');
          /* Hari tutup theater (休館日) bukan agenda. */
          if (!it || !it.title || css === 'scheduleClosed') continue;
          items.push({
            id: `akb48-${iso}-${slugTeks(it.title) || css || items.length}`,
            link: '',
            title: String(it.title),
            date: iso,
            /* "00:00" artinya acara seharian tanpa jam resmi. */
            startTime: potongJam(it.date) === '00:00' ? '' : potongJam(it.date),
            endTime: potongJam(it.end_date) === '00:00' ? '' : potongJam(it.end_date),
            /* scheduleTheater04/05/NotDecided dst = panggung theater. */
            type: css.startsWith('scheduleTheater') ? 'SHOW' : 'EVENT',
            team: css.startsWith('scheduleTeam') ? css.replace('scheduleTeam', '') : '',
            birthday: false,
            url: this.officialUrl,
          });
        }
      }
      return urutkan(items);
    },
  },

  ske48: {
    officialUrl: 'https://ske48.co.jp/schedule/list/',
    tz: 'JST',
    async fetch({ month, year }) {
      const html = await requestText(`https://ske48.co.jp/schedule/list/${year}/${duaDigit(month)}/`, { referer: this.officialUrl });
      return parseFansiteSchedule(html, { tahun: year, bulan: month, baseUrl: 'https://ske48.co.jp' });
    },
  },

  stu48: {
    officialUrl: 'https://sp.stu48.com/schedule/list/',
    tz: 'JST',
    async fetch({ month, year }) {
      const html = await requestText(`https://sp.stu48.com/schedule/list/${year}/${duaDigit(month)}/`, { referer: this.officialUrl });
      return parseFansiteSchedule(html, { tahun: year, bulan: month, baseUrl: 'https://www.stu48.com' });
    },
  },

  hkt48: {
    officialUrl: 'https://www.hkt48.jp/schedule/',
    tz: 'JST',
    async fetch({ month, year }) {
      const html = await requestText(`https://www.hkt48.jp/schedule/${year}/${duaDigit(month)}`, { referer: this.officialUrl });
      return parseHktSchedule(html, { tahun: year, bulan: month });
    },
  },

  ngt48: {
    officialUrl: 'https://ngt48.jp/schedule',
    tz: 'JST',
    /* NGT48 tidak punya theater tetap; situs resminya menautkan Google
       Calendar publik. Dua kalender aktif digabung: Web + イベント. */
    calendarIds: [
      'uruvbla1g4sqpj3d6qn1ai2a0s@group.calendar.google.com', // Web
      'r265gb7ufvmtugtjjpj03nf854@group.calendar.google.com', // イベント
    ],
    async fetch({ month, year }) {
      return ambilKalenderGoogle(this.calendarIds, { tahun: year, bulan: month }, { officialUrl: this.officialUrl, tzPrefix: 'ngt48' });
    },
  },

  nmb48: {
    officialUrl: 'https://www.nmb48.com/schedule/',
    tz: 'JST',
    /* Halaman jadwal resmi NMB48 menempel Google Calendar publik yang
       sama (iframe embed) — ID kalendernya terbaca dari src iframe. */
    calendarIds: [
      'mepcj5hof4vd7mid57quca01v8@group.calendar.google.com',
    ],
    async fetch({ month, year }) {
      return ambilKalenderGoogle(this.calendarIds, { tahun: year, bulan: month }, { officialUrl: this.officialUrl, tzPrefix: 'nmb48' });
    },
  },

  klp48: {
    officialUrl: 'https://klp48.my/page/14',
    tz: 'GMT+8',
    /* Fanclub resmi KLP48 (platform peeeps) menyematkan seluruh jadwal
       sebagai array JS "events" ber-tanggal ISO di halaman SCHEDULE. */
    schedulePageUrl: 'https://klp48.peeeps.jp/page/14',
    async fetch({ month, year }) {
      const html = await requestText(this.schedulePageUrl, { referer: 'https://klp48.my/' });
      return parseKlpEvents(html, { tahun: year, bulan: month });
    },
  },

  tpe48: {
    officialUrl: 'https://www.tpe48.tw/pages/schedule',
    tz: 'GMT+8',
    async fetch({ month, year }) {
      const html = await requestText(this.officialUrl, { referer: 'https://www.tpe48.tw/' });
      /* "var data" juga muncul di pustaka bawaan halaman — kunci dari
         entri datanya sendiri ({ date: '…' }) lalu mundur ke kurung
         pembuka array yang memuatnya. */
      const idxEntri = html.indexOf("{ date: '");
      const awalData = idxEntri >= 0 ? html.lastIndexOf('[', idxEntri) : -1;
      const akhirData = awalData >= 0 ? html.indexOf('];', awalData) : -1;
      if (awalData < 0 || akhirData < 0) throw new Error('Struktur halaman jadwal TPE48 berubah');
      const prefiks = `${year}-${duaDigit(month)}`;
      const items = [];
      const reObjek = /\{([^{}]*)\}/g;
      let objek;
      while ((objek = reObjek.exec(html.slice(awalData, akhirData)))) {
        const bidang = {};
        const reBidang = /(\w+)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
        let pasangan;
        while ((pasangan = reBidang.exec(objek[1]))) bidang[pasangan[1]] = pasangan[2];
        const iso = String(bidang.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !iso.startsWith(prefiks)) continue;
        const judul = buangTag(String(bidang.eventName || '').replace(/\\'/g, "'"));
        if (!judul) continue;
        const kalender = String(bidang.calendar || '');
        const warna = String(bidang.color || '');
        const ulangTahun = /birthday/i.test(kalender);
        const isShow = warna === 'live' || (!ulangTahun && /live/i.test(kalender));
        /* Jam kadang disematkan di judul: "…(19:00-21:00)". */
        const rentangJam = /[（(](\d{1,2}:\d{2})(?:\s*[-–~～]\s*(\d{1,2}:\d{2}))?[)）]/.exec(judul);
        items.push({
          id: `tpe48-${iso}-${slugTeks(judul) || items.length}`,
          link: '',
          title: judul,
          date: iso,
          startTime: rentangJam ? potongJam(rentangJam[1]) : '',
          endTime: rentangJam && rentangJam[2] ? potongJam(rentangJam[2]) : '',
          type: isShow ? 'SHOW' : 'EVENT',
          team: '',
          birthday: ulangTahun,
          url: bidang.href || this.officialUrl,
        });
      }
      return urutkan(items);
    },
  },
};

/* --- Cache memori ---------------------------------------------
   Key: grup|tahun|bulan|bahasa. TTL direset saat gagal menyegarkan
   supaya request berikutnya mencoba lagi, bukan menyajikan kosong. */
const cache = new Map();

function bacaCache(key) {
  const entri = cache.get(key);
  if (!entri) return null;
  if (Date.now() > entri.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entri;
}

function simpanCache(key, payload) {
  /* Jaga ukuran cache: bulan lampau menumpuk tanpa batas kalau
     pengunjung menjelajah mundur berbulan-bulan. */
  if (cache.size > 200) cache.clear();
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
}

/* Titik masuk utama. Melempar Error bila sumber resmi gagal —
   pemanggil (rute API) yang memutuskan bentuk responsnya. */
async function getOfficialSchedule(groupId, { month, year, lang = 'id' } = {}) {
  const source = SOURCES[groupId];
  if (!source) {
    const error = new Error(`Grup "${groupId}" belum punya sumber jadwal terprogram.`);
    error.code = 'GRUP_BELUM_DIDUKUNG';
    throw error;
  }

  const key = `${groupId}|${year}|${month}|${lang}`;
  const entri = bacaCache(key);
  if (entri) {
    return { ...entri.payload, cached: true };
  }

  let terakhir;
  /* Dua percobaan: Cloudflare kadang menjawab 403 untuk request
     pertama lalu lolos pada request berikutnya dengan header sama. */
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const items = await source.fetch({ month, year, lang });
      const payload = {
        group: groupId,
        source: 'official',
        officialUrl: source.officialUrl,
        tz: source.tz || '',
        month,
        year,
        lang,
        fetched_at: new Date().toISOString(),
        cached: false,
        items,
      };
      simpanCache(key, payload);
      return payload;
    } catch (error) {
      terakhir = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  throw terakhir;
}

function grupDidukung() {
  return Object.keys(SOURCES);
}

module.exports = { getOfficialSchedule, grupDidukung };
