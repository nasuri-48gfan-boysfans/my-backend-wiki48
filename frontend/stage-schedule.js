/* =============================================================
   stage-schedule.js — halaman "Jadwal Stage Member"
   -------------------------------------------------------------
   Datanya BUKAN hasil ketikan manual: /api/schedule membaca
   situs resmi tiap grup 48 Group (API resmi jkt48.com, kalender
   theater akb48.co.jp, halaman jadwal ske48/hkt48/stu48, Google
   Calendar resmi ngt48, dan data jadwal tpe48) lalu bentuknya
   dinormalisasi di server. Halaman ini tinggal merender kartu.
   Grup yang belum punya sumber terprogram ditampilkan sebagai
   tautan ke halaman jadwal resminya — bukan data rekayasa.
   ============================================================= */

const STAGE_SCHEDULE_API_URL = window.location.protocol === 'file:'
  ? 'http://localhost:8787/api/schedule'
  : (window.wiki48ApiUrl ? window.wiki48ApiUrl('/api/schedule') : '/api/schedule');

/* Label tim pada API resmi JKT48 → istilah yang dipakai situs ini. */
const LABEL_TIM_JKT48 = {
  JKT48: 'Tim rotasi',
  TRAINEE: 'Trainee',
  PASSION: 'Team Passion',
  LOVE: 'Team Love',
  DREAM: 'Team Dream',
};

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const stageState = {
  groupId: 'jkt48',
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  type: 'ALL',
  rawItems: [],     // semua item bulan terpilih, sebelum filter tipe
  sumberTeks: '',   // teks sumber untuk indikator sinkronisasi
};

/* Grup dengan adapter terprogram di server. Diambil dari
   /api/schedule/meta supaya tidak menduplikasi daftar adapter;
   nilai awal hanya fallback sebelum meta termuat. */
let grupBeradapter = ['jkt48'];

function stageScheduleUrl() {
  const query = new URLSearchParams({ group: stageState.groupId, month: String(stageState.month), year: String(stageState.year) });
  return `${STAGE_SCHEDULE_API_URL}?${query.toString()}`;
}

async function muatJadwal() {
  const response = await fetch(stageScheduleUrl(), { headers: { accept: 'application/json' }, cache: 'no-store' });
  let payload = null;
  try { payload = await response.json(); } catch (error) { /* ditangani lewat cek di bawah */ }
  if (!response.ok || !payload || !Array.isArray(payload.items)) {
    const pesan = payload && payload.error ? payload.error : `HTTP ${response.status}`;
    throw new Error(pesan);
  }
  return payload;
}

/* --- Format tanggal & label ------------------------------------ */
function pecahTanggal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function tanggalPendek(iso) {
  const d = pecahTanggal(iso);
  if (!d) return null;
  return { hari: d.getUTCDate(), bulan: BULAN_ID[d.getUTCMonth()].slice(0, 3), hariNama: HARI_ID[d.getUTCDay()] };
}

function rentangWaktu(item) {
  const zona = item.tz || 'WIB';
  if (item.startTime && item.endTime) return `${item.startTime}–${item.endTime} ${zona}`;
  if (item.startTime) return `${item.startTime} ${zona}`;
  return 'Jam menyusul';
}

function labelTipe(tipe) {
  return tipe === 'SHOW' ? 'Show Theater' : tipe === 'EXCLUSIVE' ? 'Eksklusif' : 'Event';
}

function labelTim(team) {
  return LABEL_TIM_JKT48[team] || team;
}

function kunciHariIni() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/* --- Kartu ------------------------------------------------------ */
function kartuJadwal(item, grupAccent) {
  const tgl = tanggalPendek(item.date);
  const lewat = String(item.date || '') < kunciHariIni();
  const badge = `is-${String(item.type || '').toLowerCase()}`;
  const meta = [labelTim(item.team), rentangWaktu(item)].filter(Boolean).join(' · ');
  const judul = item.url
    ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>`
    : esc(item.title);
  return `<article class="stage-card accent-${grupAccent}${lewat ? ' is-past' : ''}">
    <div class="stage-card-top">
      <span class="stage-type-badge ${badge}">${esc(labelTipe(item.type))}</span>
      <span class="stage-date-chip"${tgl ? '' : ' hidden'}><b>${tgl ? tgl.hari : ''}</b> <span>${tgl ? tgl.bulan : ''}</span><i>${tgl ? tgl.hariNama : ''}</i></span>
    </div>
    <h3 class="stage-title">${judul}</h3>
    <p class="stage-meta">${esc(meta)}</p>
    ${item.birthday ? '<p class="stage-flag-birthday">🎂 Show ulang tahun member</p>' : ''}
  </article>`;
}

function panelKosongFilter() {
  return `<div class="empty-state"><p class="empty-title">Belum ada agenda bertipe ini</p><p class="empty-sub">Coba filter “Semua”, atau geser ke bulan lain.</p></div>`;
}

function panelGagal(pesan) {
  return `<div class="empty-state"><p class="empty-title">Jadwal resmi tidak bisa diambil</p><p class="empty-sub">${esc(pesan)} — coba tombol Perbarui, atau buka langsung situs resminya.</p></div>
  <div class="official-schedule-grid">${GROUPS.map((group) => `<a class="official-schedule-card" href="${esc(officialScheduleUrl(group.id))}" target="_blank" rel="noopener noreferrer"><strong>${esc(group.name)}</strong><span>Jadwal resmi →</span></a>`).join('')}</div>`;
}

/* Grup tanpa sumber terprogram: tawarkan tautan resmi, jangan data karangan. */
function panelGrupBelumDidukung(group) {
  const lain = GROUPS.filter((g) => g.id !== group.id);
  return `<div class="empty-state"><p class="empty-title">Jadwal otomatis untuk ${esc(group.name)} belum tersedia</p><p class="empty-sub">Situs resminya belum punya API publik yang stabil, jadi kami menautkan langsung ke sumber resminya daripada menampilkan data yang bisa kedaluwarsa.</p></div>
  <div class="official-schedule-grid">
    <a class="official-schedule-card is-primary" href="${esc(officialScheduleUrl(group.id))}" target="_blank" rel="noopener noreferrer"><strong>Buka ${esc(group.name)}</strong><span>Jadwal resmi →</span></a>
    ${lain.slice(0, 5).map((g) => `<a class="official-schedule-card" href="${esc(officialScheduleUrl(g.id))}" target="_blank" rel="noopener noreferrer"><strong>${esc(g.name)}</strong><span>Jadwal resmi →</span></a>`).join('')}
  </div>`;
}

/* --- Render ----------------------------------------------------- */
let sedangMemuat = false;

async function renderStageSchedule() {
  if (sedangMemuat) return;
  sedangMemuat = true;
  const tombolRefresh = $('#stageRefresh');
  if (tombolRefresh) tombolRefresh.classList.add('is-busy');
  $('#monthLabel').textContent = `${BULAN_ID[stageState.month - 1]} ${stageState.year}`;
  $('#stageCardGrid').innerHTML = '<div class="stage-loading"><span class="live-dot"></span>Mengambil jadwal dari situs resmi…</div>';

  try {
    const payload = await muatJadwal();
    stageState.rawItems = payload.items;
    const jamAmbil = (() => {
      const d = payload.fetched_at ? new Date(payload.fetched_at) : null;
      if (!d || Number.isNaN(d.getTime())) return null;
      try { return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
      catch (error) { return null; }
    })();
    stageState.sumberTeks = jamAmbil
      ? `dibaca ${jamAmbil} · ${(payload.officialUrl || '').replace(/^https?:\/\//, '')}`
      : (payload.officialUrl || '').replace(/^https?:\/\//, '');
    renderKartu();
  } catch (error) {
    if (window.console && console.warn) console.warn(`[jadwal-stage] ${error.message}`);
    const group = GROUPS.find((g) => g.id === stageState.groupId);
    $('#stageCount').textContent = '—';
    if (/belum punya sumber/i.test(error.message) && group) {
      $('#stageSync').textContent = `Menampilkan tautan resmi ${group.name}`;
      $('#stageCardGrid').innerHTML = panelGrupBelumDidukung(group);
    } else {
      $('#stageSync').textContent = 'Sumber resmi tidak terjangkau';
      $('#stageCardGrid').innerHTML = panelGagal(error.message);
    }
  } finally {
    sedangMemuat = false;
    if (tombolRefresh) tombolRefresh.classList.remove('is-busy');
  }
}

/* Filter tipe dijalankan LOKAL dari rawItems — toggle chip tidak boleh
   memicu permintaan baru ke sumber resmi setiap kali disentuh. */
function renderKartu() {
  const group = GROUPS.find((g) => g.id === stageState.groupId);
  const daftar = stageState.type === 'ALL'
    ? stageState.rawItems
    : stageState.rawItems.filter((item) => item.type === stageState.type);
  $('#stageCount').textContent = `${daftar.length} agenda`;
  $('#stageSync').textContent = `${daftar.length} agenda · ${stageState.sumberTeks}`;
  $('#stageCardGrid').innerHTML = daftar.length
    ? daftar.map((item) => kartuJadwal(item, group ? group.accent : 'pink')).join('')
    : panelKosongFilter();
}

function geserBulan(langkah) {
  let bulan = stageState.month + langkah;
  let tahun = stageState.year;
  if (bulan < 1) { bulan = 12; tahun -= 1; }
  if (bulan > 12) { bulan = 1; tahun += 1; }
  stageState.month = bulan;
  stageState.year = tahun;
  renderStageSchedule();
}

function tandaiChipGrup() {
  $$('#stageGroupRow .filter-chip').forEach((chip) => {
    const didukung = grupBeradapter.includes(chip.dataset.group);
    chip.title = didukung ? 'Jadwal otomatis dari situs resmi' : '';
    const titik = chip.querySelector('.chip-live-dot');
    if (didukung && !titik) chip.insertAdjacentHTML('afterbegin', '<span class="chip-live-dot"></span>');
    else if (!didukung && titik) titik.remove();
  });
}

/* Daftar grup ber-adapter dari server — satu sumber kebenaran, tidak
   disalin manual di frontend. Gagal jaringan? Fallback tetap jalan. */
async function muatMetaAdapter() {
  try {
    const url = window.wiki48ApiUrl ? window.wiki48ApiUrl('/api/schedule/meta') : '/api/schedule/meta';
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return;
    const payload = await response.json();
    if (Array.isArray(payload.supported) && payload.supported.length) {
      grupBeradapter = payload.supported;
      tandaiChipGrup();
    }
  } catch (error) {
    /* Chip tetap memakai fallback; jangan ganggu render halaman. */
  }
}

function initStageSchedulePage() {
  setFooterYear();
  initI18n();
  initDrawer();

  /* Chip grup: grup dengan sumber terprogram ditandai titik hidup. */
  const baris = $('#stageGroupRow');
  baris.innerHTML = GROUPS.map((group) => `<button class="filter-chip${group.id === stageState.groupId ? ' is-active' : ''}" type="button" data-group="${esc(group.id)}">${esc(group.name)}</button>`).join('');
  baris.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-group]');
    if (!chip || chip.dataset.group === stageState.groupId) return;
    stageState.groupId = chip.dataset.group;
    $$('#stageGroupRow .filter-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    renderStageSchedule();
  });
  tandaiChipGrup();
  muatMetaAdapter();

  $('#stageTypeRow').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-type]');
    if (!chip || chip.dataset.type === stageState.type) return;
    stageState.type = chip.dataset.type;
    $$('#stageTypeRow .filter-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    renderKartu();
  });

  $('#monthPrev').addEventListener('click', () => geserBulan(-1));
  $('#monthNext').addEventListener('click', () => geserBulan(1));
  $('#stageRefresh').addEventListener('click', renderStageSchedule);

  renderStageSchedule();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStageSchedulePage);
else initStageSchedulePage();
