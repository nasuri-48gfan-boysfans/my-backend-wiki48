/* =============================================================
   IDOL & GROUP WIKI HUB — script.js
   Logika interaktif halaman index.html:
   1. Drawer navigation  → initDrawer() di common.js (dipakai bersama
                            groups.html; dipanggil dari init() di bawah)
   2. Data member        → MEMBERS di common.js
   3. renderCards(data, containerElement) — renderer card dinamis
   4. Real-time search filter + chip status Live/Stage + dropdown
      kategori/grup (state.scopeFilter, lihat pecahScope())
   5. Real-time Live & Stage tracker → updateStatusBanners() + polling 30s
   6. Oshi Pin System    → oshiList persist di localStorage (maksimal 3)
   7. Deep-link filter grup dari groups.html (?group=<slug>) — mengisi
      dropdown kalau ada, kotak pencarian kalau tidak

   Data & util (MEMBERS, GROUPS, esc, initialOf, photoPlaceholder,
   liveMembers, stageMembers, memberById, initDrawer, setFooterYear)
   berada di common.js — WAJIB dimuat lebih dulu.

   Catatan: array data member bernama MEMBERS (huruf besar) di common.js.
   Semua filter status di bawah lewat helper liveMembers()/stageMembers()
   supaya definisi "live" dan "stage" hanya ada di satu tempat.
   ============================================================= */

/* -------------------------------------------------------------
   1. KONFIG & STATE
   ------------------------------------------------------------- */
const LIVE_POLL_MS = 30000;          // interval polling status (30 detik)
const TOAST_MS = 3400;               // durasi notifikasi melayang
const MAX_TOASTS = 3;                // batas toast bertumpuk

const state = {
  query: '',            // teks pencarian
  statusFilter: 'all',  // 'all' | 'live' | 'stage'
  scopeFilter: 'all',   // 'all' | 'cat:<kategori>' | 'group:<groupId>'
  lastSync: null,       // Date pembaruan status terakhir
};

/* Nilai dropdown kategori/grup diberi awalan supaya self-describing:
   'cat:domestic' tidak bisa tertukar dengan 'group:domestic', dan 'all' tidak
   bisa bentrok dengan grup yang (suatu saat) ber-id "all". Satu-satunya tempat
   nilai itu dibaca adalah fungsi ini. */
function pecahScope(nilai) {
  const s = String(nilai == null ? 'all' : nilai);
  if (s.startsWith('cat:')) return { jenis: 'cat', kunci: s.slice(4) };
  if (s.startsWith('group:')) return { jenis: 'group', kunci: s.slice(6) };
  return { jenis: 'all', kunci: '' };
}

/* Label manusiawi untuk scope yang sedang aktif — dipakai judul section dan
   pesan "tidak ada hasil". */
function labelScope(nilai) {
  const scope = pecahScope(nilai);
  if (scope.jenis === 'group') {
    const group = GROUPS.find((g) => g.id === scope.kunci);
    return group ? group.name : '';
  }
  if (scope.jenis === 'cat') {
    const label = kategoriLabel(scope.kunci);
    return label ? label.short : '';
  }
  return '';
}

/* -------------------------------------------------------------
   2. PERSISTENSI: oshiList ↔ localStorage

   PINDAH KE common.js (bagian 5b) sejak member.html ada: halaman detail
   juga punya tombol pin, dan dua salinan aturan kuota/validasi adalah
   cara tercepat membuat keduanya berbeda diam-diam.

   Dari common.js: OSHI_STORAGE_KEY, OSHI_LIMIT, oshiStore, oshiList,
   loadOshiList(), saveOshiList(), isOshi(), oshiIsFull(), setOshi().
   Yang tetap di sini hanya lapisan DOM-nya (renderOshi, toast, dsb).
   ------------------------------------------------------------- */
let storageWarned = false; // supaya peringatan storage tidak muncul berulang

/* -------------------------------------------------------------
   3. TOAST / NOTIFIKASI
   Dipakai untuk menjelaskan penolakan saat kuota oshi penuh —
   tanpa ini, klik yang tidak berefek terasa seperti bug.
   ------------------------------------------------------------- */
function showToast(message, tone) {
  const stack = $('#toastStack');
  if (!stack) return;

  // Buang toast paling lama kalau sudah menumpuk.
  const existing = stack.querySelectorAll('.toast');
  for (let i = 0; i <= existing.length - MAX_TOASTS; i += 1) {
    if (existing[i]) existing[i].remove();
  }

  const el = document.createElement('div');
  el.className = 'toast toast-' + (tone || 'neutral');
  el.textContent = message; // textContent → aman, tidak butuh esc()
  stack.appendChild(el);

  // Transisi masuk setelah elemen benar-benar ada di layout.
  const reveal = () => el.classList.add('is-visible');
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(reveal);
  } else {
    window.setTimeout(reveal, 16);
  }

  window.setTimeout(() => {
    el.classList.remove('is-visible');
    window.setTimeout(() => el.remove(), 320);
  }, TOAST_MS);
}

/* -------------------------------------------------------------
   4. TEMPLATE CARD MEMBER
   Struktur: Gambar 3:4 → Nama → Badge Group & Team → Tombol Heart
   Tambahan Part 3: kelas is-live-now (border neon pulsating) dan
   tombol "Tonton Live" yang hanya muncul bila liveUrl terisi.
   ------------------------------------------------------------- */
/* Nama member. Untuk grup Jepang/Thailand/Tiongkok, nama utama yang
   ditampilkan besar adalah aksara aslinya, dengan romaji/Latin diselipkan
   kecil di atasnya. Kalau `nameNative` kosong (JKT48, KLP48, atau data yang
   belum lengkap), Latin naik jadi nama utama — jadi kartunya tidak pernah
   kosong dan tidak perlu cabang khusus per grup.
   `lang` diisi supaya browser memakai bentuk huruf yang benar; lihat
   langOfNative() di common.js. */
function nameMarkup(member) {
  const native = (member.nameNative || '').trim();
  const latin = (member.nameLatin || member.name || '').trim();
  if (!native) return `<span class="name-main">${esc(latin)}</span>`;
  const lang = langOfNative(native, member.groupId);
  return `<span class="name-latin">${esc(latin)}</span>` +
    `<span class="name-main" ${lang ? `lang="${lang}"` : ''}>${esc(native)}</span>`;
}

function memberCardHTML(member) {
  const isFav = isOshi(member.id);
  const fallback = photoPlaceholder(member.name, member.accent);
  const hasLiveUrl = typeof member.liveUrl === 'string' && member.liveUrl.trim() !== '';

  // Indikator status (live / stage) di atas foto.
  const flags = [];
  if (member.isLive) {
    flags.push(`<span class="card-flag flag-live">
      <span class="live-dot" aria-hidden="true"></span>${esc(uiCardText('live'))}</span>`);
  }
  if (member.isStage) {
    flags.push(`<span class="card-flag flag-stage">
      <span aria-hidden="true">🎤</span>${esc(uiCardText('stage'))}</span>`);
  }

  // Kuota penuh → tombol pin diberi gaya "terkunci", tapi tetap bisa
  // diklik supaya toast bisa menjelaskan alasannya.
  const locked = !isFav && oshiIsFull();
  const favLabel = isFav
    ? `${uiCardText('unpin')} ${member.name} dari oshi`
      : `${uiCardText('pin')} ${member.name} sebagai oshi`;

  const watchBtn = (member.isLive && hasLiveUrl)
    ? `<a class="watch-live" href="${esc(member.liveUrl)}"
           target="_blank" rel="noopener noreferrer"
           aria-label="Tonton live ${esc(member.name)} di ${esc(member.livePlatform || 'platform streaming')}">
         <span class="watch-live-icon" aria-hidden="true">▶</span>
         <span class="watch-live-text">${esc(uiCardText('watchLive'))}</span>
         <span class="watch-live-platform">${esc(member.livePlatform || 'Live')}</span>
       </a>`
    : '';
  const scheduleUrl = officialScheduleUrl(member.groupId);
  const scheduleBtn = scheduleUrl
    ? `<a class="member-schedule-link" href="${esc(scheduleUrl)}" target="_blank" rel="noopener noreferrer"
         aria-label="Buka jadwal resmi ${esc(member.group)} untuk ${esc(member.name)}">
         <span aria-hidden="true">📅</span> ${esc(uiCardText('officialSchedule'))}
       </a>`
    : '';
  const schedulePreview = member.schedule.slice(0, 2).map((event) => {
    const detail = [event.date, event.time, event.title, event.venue].filter(Boolean).join(' · ');
    return `<span class="member-agenda-item"><span aria-hidden="true">📅</span>${esc(detail || uiCardText('agenda'))}</span>`;
  }).join('');

  /* Seluruh permukaan card menjadi tautan ke halaman detail lewat <a>
     kosong yang menutupi card (z-index 1). Alasan memilih pola ini:
     - satu tab stop per card, bukan dua (card + nama);
     - tombol pin dan tombol "Tonton Live" tetap bisa diklik karena
       keduanya ber-z-index 2 di atas lapisan tautan ini;
     - tidak ada <a> membungkus <button>, yang HTML-nya tidak sah.
     `tabindex="0"` di <article> dilepas supaya keyboard tidak berhenti
     dua kali di card yang sama; gaya hover-nya sudah memakai
     :focus-within, jadi tampilannya tidak berubah. */
  const cardLink = `<a class="card-link" href="${esc(memberUrl(member.id))}"
        aria-label="${esc(uiCardText('profile'))} ${esc(member.name)}${member.team ? ` (${esc(member.team)})` : ''}"></a>`;

  return `
    <article class="member-card ${member.isLive ? 'is-live-now' : ''} ${member.isStage ? 'is-on-stage' : ''}"
             data-id="${esc(member.id)}">
      ${cardLink}
      <div class="member-photo" data-accent="${esc(member.accent)}">
        <img
          class="member-img"
          src="${esc(member.img)}"
          data-fallback="${esc(fallback)}"
          alt="Foto ${esc(member.name)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          width="300"
          height="400"
        />
        ${flags.length ? `<div class="card-flags">${flags.join('')}</div>` : ''}
      </div>

      <button
        class="fav-btn ${isFav ? 'is-active' : ''} ${locked ? 'is-locked' : ''}"
        type="button"
        aria-pressed="${isFav}"
        title="${esc(favLabel)}"
        aria-label="${esc(favLabel)}"
      >${isFav ? '💖' : '🤍'}</button>

      <div class="member-info">
        <h3 class="member-name">${nameMarkup(member)}</h3>
        <p class="member-badges">
          <span class="badge badge-group" data-accent="${esc(member.accent)}">${esc(member.group)}</span>
          <span class="badge badge-team">${esc(member.team)}</span>
        </p>
        ${watchBtn}
        ${scheduleBtn}
        ${schedulePreview ? `<div class="member-agenda" aria-label="Agenda ${esc(member.name)}">${schedulePreview}</div>` : ''}
      </div>
    </article>`;
}

/* -------------------------------------------------------------
   5. FALLBACK FOTO
   Kalau file di properti `img` belum ada, ganti ke SVG placeholder.
   (Listener dipasang per-render karena innerHTML mengganti elemen.)

   Ini juga yang menyelamatkan foto hotlink dari situs resmi: URL yang
   404, diblokir hotlink protection, atau gagal karena offline memicu
   event `error` yang sama, jadi kartunya tetap tampil rapi — bukan
   ikon gambar rusak. `referrerpolicy="no-referrer"` di tag <img>
   dipasang supaya path lokal user tidak dikirim ke situs sumber, dan
   sekalian melewati sebagian proteksi hotlink berbasis Referer.
   ------------------------------------------------------------- */
function attachImageFallbacks(container) {
  container.querySelectorAll('.member-img').forEach((img) => {
    img.addEventListener('error', function onErr() {
      this.removeEventListener('error', onErr);
      const fb = this.dataset.fallback;
      if (fb && this.src !== fb) this.src = fb;
      this.classList.add('is-placeholder');
    });
  });
}

/* -------------------------------------------------------------
   6. RENDERER UTAMA
   renderCards(data, containerElement)
   - data             : array member
   - containerElement : elemen tujuan (DOM node atau selector string)
   ------------------------------------------------------------- */
function renderCards(data, containerElement, emptyState) {
  const container = typeof containerElement === 'string'
    ? $(containerElement)
    : containerElement;
  if (!container) return 0;

  if (!Array.isArray(data) || data.length === 0) {
    const s = emptyState || {
      icon: '🔍',
      title: 'Tidak ada hasil',
      sub: 'Coba kata kunci atau filter lain.',
    };
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">${esc(s.icon)}</span>
        <p class="empty-title">${esc(s.title)}</p>
        <p class="empty-sub">${esc(s.sub)}</p>
      </div>`;
    return 0;
  }

  container.innerHTML = data.map(memberCardHTML).join('');
  attachImageFallbacks(container);
  return data.length;
}

/* -------------------------------------------------------------
   7. FILTER: gabungan query search + chip status
   ------------------------------------------------------------- */
function filteredMembers() {
  const q = state.query.trim().toLowerCase();
  const scope = pecahScope(state.scopeFilter);

  const filtered = MEMBERS.filter((m) => {
    // Filter kategori/grup (dropdown). Pencarian grup hanya perlu dilakukan
    // kalau scope-nya kategori — filter per grup cukup membandingkan groupId.
    if (scope.jenis === 'group' && m.groupId !== scope.kunci) return false;
    if (scope.jenis === 'cat') {
      const group = GROUPS.find((item) => item.id === m.groupId);
      if (!group || group.category !== scope.kunci) return false;
    }

    // Filter status (chip).
    if (state.statusFilter === 'live' && !m.isLive) return false;
    if (state.statusFilter === 'stage' && !m.isStage) return false;

    // Filter teks: nama Latin, aksara asli, grup, atau team.
    // Aksara asli ikut dicari supaya user yang mengetik "生野" atau menempel
    // nama dari situs Jepang tetap menemukan orangnya.
    if (!q) return true;
    return m.name.toLowerCase().includes(q)
        || (m.nameNative && m.nameNative.toLowerCase().includes(q))
        || m.group.toLowerCase().includes(q)
        || m.team.toLowerCase().includes(q);
  });

  return prioritizePinnedLive(filtered);
}

/* -------------------------------------------------------------
   8. RENDER: MEMBER DIRECTORY
   ------------------------------------------------------------- */
function renderDirectory() {
  const list = filteredMembers();
  const q = state.query.trim();
  const scopeLabel = labelScope(state.scopeFilter);
  const container = $('#memberGrid');
  if (container) {
    if (!list.length) {
      // Sebutkan penyebabnya: dengan dua filter aktif, pesan generik membuat
      // user mengira datanya hilang, bukan tersaring.
      const sebab = [];
      if (q) sebab.push(`cocok dengan “${q}”`);
      if (scopeLabel) sebab.push(`di ${scopeLabel}`);
      if (state.statusFilter === 'live') sebab.push('yang sedang live');
      if (state.statusFilter === 'stage') sebab.push('yang sedang stage');
      const sub = sebab.length
        ? `Tidak ada member ${sebab.join(' ')}.`
        : 'Tidak ada member pada filter ini.';
      container.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🔍</span><p class="empty-title">Tidak ada hasil</p><p class="empty-sub">${esc(sub)}</p></div>`;
    } else {
      const sections = GROUPS.map((group) => {
        const members = list.filter((member) => member.groupId === group.id);
        if (!members.length) return '';
        return `<section class="member-group" aria-labelledby="member-group-${esc(group.id)}">
          <div class="section-head member-group-head">
            <h3 class="section-title" id="member-group-${esc(group.id)}">${esc(group.name)}</h3>
            <span class="section-count">${members.length} member</span>
          </div>
          <div class="member-grid">${members.map(memberCardHTML).join('')}</div>
        </section>`;
      }).join('');
      container.innerHTML = sections;
      attachImageFallbacks(container);
    }
  }

  const count = $('#memberCount');
  if (count) {
    const isFiltered = q || state.statusFilter !== 'all' || pecahScope(state.scopeFilter).jenis !== 'all';
    count.textContent = isFiltered
      ? `${list.length} dari ${MEMBERS.length} member`
      : `${MEMBERS.length} member`;
  }

  // Judul section ikut scope — "Semua member" jadi bohong begitu user memilih
  // satu grup, dan hitungan di sebelahnya tidak cukup menjelaskan.
  const title = $('#directoryTitle');
  if (title) title.textContent = scopeLabel ? `Member ${scopeLabel}` : 'Semua member';

  // Tandai dropdown saat daftar sedang dipersempit (lihat .scope-select.is-active).
  const sel = $('#categorySelect');
  if (sel) sel.classList.toggle('is-active', pecahScope(state.scopeFilter).jenis !== 'all');

  renderActiveFilter();
}

/* -------------------------------------------------------------
   9. OSHI PIN SYSTEM
   ------------------------------------------------------------- */

/* Render ulang section "My Oshi Quick-View" dari oshiList.
   Urutan mengikuti urutan pin user, bukan urutan array MEMBERS. */
function renderOshi() {
  const favs = oshiList.map(memberById).filter(Boolean);

  renderCards(favs, '#oshiContainer', {
    icon: '⭐',
    title: 'Belum ada oshi',
    sub: `Tekan 🤍 pada member favoritmu untuk quick-view di sini (maksimal ${OSHI_LIMIT}).`,
  });

  const counter = $('#oshiCounter');
  if (counter) {
    counter.textContent = `${favs.length} dipin`;
    counter.classList.remove('is-full');
  }
}

/* toggleOshi(memberId)
   - sudah ada di oshiList  → hapus (un-pin)
   - belum ada & kuota ada  → tambahkan
   - belum ada & kuota penuh→ tolak + toast (tidak menimpa pilihan user)
   Perubahan datanya dikerjakan setOshi() di common.js; di sini hanya
   pesan + render ulang, supaya halaman detail memakai aturan yang sama.
   Return: true kalau oshiList berubah. */
function toggleOshi(memberId) {
  const member = memberById(memberId);
  if (!member) return false;

  const hasil = setOshi(memberId);

  if (hasil === 'removed') {
    showToast(`${member.name} dilepas dari oshi.`, 'neutral');
  } else if (hasil === 'full') {
    showToast(
      `Maksimal ${OSHI_LIMIT} oshi. Lepas salah satu dulu untuk menambah ${member.name}.`,
      'warn',
    );
    return false;
  } else if (hasil === 'added') {
    showToast(`${member.name} dipin sebagai oshi (${oshiList.length}).`, 'ok');
  } else {
    return false;
  }

  if (!saveOshiList() && !storageWarned) {
    storageWarned = true;
    showToast('Browser ini memblokir penyimpanan lokal — pin hanya bertahan selama tab terbuka.', 'warn');
  }

  renderDirectory();
  renderOshi();
  return true;
}

// Nama lama dari Part 2 — dipertahankan sebagai alias tipis.
function toggleFavorite(id) {
  return toggleOshi(id);
}

function handleFavClick(e) {
  const btn = e.target.closest('.fav-btn');
  if (!btn) return;
  const card = btn.closest('.member-card');
  if (!card) return;
  toggleOshi(card.dataset.id);
}

/* -------------------------------------------------------------
   10. REAL-TIME LIVE & STAGE TRACKER
   ------------------------------------------------------------- */

// "Aira, Reva & Yuina" — lebih enak dibaca daripada koma semua.
function joinNames(arr) {
  const names = arr.map((m) => m.name);
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

function badgeHTML(text, kind) {
  return `<span class="status-badge status-badge-${kind}">${esc(text)}</span>`;
}

/* Tombol streaming — hanya untuk member live yang liveUrl-nya terisi,
   jadi tidak pernah ada link mati di banner. */
function liveLinksHTML(list) {
  const withUrl = list.filter((m) => typeof m.liveUrl === 'string' && m.liveUrl.trim() !== '');
  if (withUrl.length === 0) return '';

  return withUrl.map((m) => `
    <a class="live-link" href="${esc(m.liveUrl)}" target="_blank" rel="noopener noreferrer"
       aria-label="Tonton live ${esc(m.name)} di ${esc(m.livePlatform || 'platform streaming')}">
      <span class="live-link-icon" aria-hidden="true">▶</span>
      <span class="live-link-name">${esc(m.name)}</span>
      <span class="live-link-platform">${esc(m.livePlatform || 'Live')}</span>
    </a>`).join('');
}

/* Rincian jadwal panggung/theater hari ini. */
function stageScheduleHTML(list) {
  if (list.length === 0) return '';

  return list.map((m) => {
    const s = m.stage;
    const detail = s
      ? [s.title, s.time, s.venue].filter(Boolean).join(' · ')
      : 'Detail jadwal menyusul';
    return `
      <li class="stage-item">
        <span class="stage-item-name">${esc(m.name)}</span>
        <span class="stage-item-detail">${esc(detail)}</span>
      </li>`;
  }).join('');
}

/* Tandai card member yang sedang live / stage tanpa menulis ulang grid.
   Dipakai oleh polling supaya scroll & fokus user tidak ter-reset. */
function syncMemberCardStates() {
  const liveIds = new Set(liveMembers().map((m) => m.id));
  const stageIds = new Set(stageMembers().map((m) => m.id));

  document.querySelectorAll('.member-card[data-id]').forEach((card) => {
    const id = card.dataset.id;
    card.classList.toggle('is-live-now', liveIds.has(id));
    card.classList.toggle('is-on-stage', stageIds.has(id));
  });
}

/* updateStatusBanners()
   Sumber tampilan Banner "Status Hari Ini":
   - member isLive  → badge "🔴 LIVE NOW"      + nama + link streaming
   - member isStage → badge "🎭 PERFORMING TODAY" + nama + setlist/jam/theater
   Juga menyalakan border neon pulsating pada card member yang live. */
function updateStatusBanners() {
  const live = prioritizePinnedLive(liveMembers());
  const stage = stageMembers();

  /* --- Kartu LIVE --- */
  const liveCard = $('#liveStatusCard');
  const liveBadge = $('#liveBadgeSlot');
  const liveLinks = $('#liveLinks');
  const livePill = $('#liveCountPill');

  if (livePill) livePill.textContent = live.length;
  if (liveBadge) {
    liveBadge.innerHTML = live.length ? badgeHTML('🔴 LIVE NOW', 'live') : '';
    liveBadge.hidden = live.length === 0;
  }
  if (liveCard) {
    const value = liveCard.querySelector('.status-value');
    if (value) {
      value.textContent = live.length ? joinNames(live) : 'Belum ada yang live';
    }
    liveCard.classList.toggle('is-placeholder', live.length === 0);
    liveCard.classList.toggle('is-active-live', live.length > 0);
  }
  if (liveLinks) liveLinks.innerHTML = liveLinksHTML(live);

  /* --- Kartu STAGE --- */
  const stageCard = $('#stageStatusCard');
  const stageBadge = $('#stageBadgeSlot');
  const stageList = $('#stageSchedule');
  const stagePill = $('#stageCountPill');

  if (stagePill) stagePill.textContent = stage.length;
  if (stageBadge) {
    stageBadge.innerHTML = stage.length ? badgeHTML('🎭 PERFORMING TODAY', 'stage') : '';
    stageBadge.hidden = stage.length === 0;
  }
  if (stageCard) {
    const value = stageCard.querySelector('.status-value');
    if (value) {
      value.textContent = stage.length ? joinNames(stage) : 'Belum ada jadwal stage';
    }
    stageCard.classList.toggle('is-placeholder', stage.length === 0);
    stageCard.classList.toggle('is-active-stage', stage.length > 0);
  }
  if (stageList) stageList.innerHTML = stageScheduleHTML(stage);

  /* --- Angka pada chip filter Directory --- */
  const liveChip = $('.chip-count[data-count="live"]');
  const stageChip = $('.chip-count[data-count="stage"]');
  if (liveChip) liveChip.textContent = live.length;
  if (stageChip) stageChip.textContent = stage.length;

  /* --- Indikator sinkronisasi --- */
  const syncText = $('#syncText');
  const syncInd = $('#syncIndicator');
  if (syncText) syncText.textContent = `${live.length} live · ${stage.length} stage`;
  if (syncInd) syncInd.classList.add('is-ready');

  syncMemberCardStates();

  return { live: live.length, stage: stage.length };
}

// Alias nama lama dari Part 2.
function renderStatus() {
  return updateStatusBanners();
}

function timeLabel(date) {
  try {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }
}

/* Sidik jari status — dipakai untuk mendeteksi perubahan roster live/stage
   sehingga grid hanya ditulis ulang saat benar-benar ada perubahan. */
function statusSignature() {
  return liveMembers().map((m) => m.id).join(',')
    + '|' + stageMembers().map((m) => m.id).join(',');
}

let lastStatusSignature = '';
let livePollTimer = 0;
let liveEventSource = null;

function startLiveEvents() {
  if (!window.EventSource || liveEventSource) return;
  liveEventSource = new EventSource(LIVE_TRACKER_EVENTS_URL);
  liveEventSource.addEventListener('live:update', (event) => {
    try {
      const snapshot = JSON.parse(event.data);
      applyLiveSnapshot(snapshot.live);
      const changed = statusSignature() !== lastStatusSignature;
      lastStatusSignature = statusSignature();
      updateStatusBanners();
      if (changed) { renderDirectory(); renderOshi(); }
      state.lastSync = new Date(snapshot.checked_at || Date.now());
      const stamp = $('#statusUpdated');
      if (stamp) stamp.textContent = `Diperbarui ${timeLabel(state.lastSync)} · real-time`;
    } catch (error) {
      if (window.console && console.warn) console.warn(`Live SSE tidak valid: ${error.message}`);
    }
  });
  liveEventSource.onerror = () => { liveEventSource.close(); liveEventSource = null; };
}

/* SEAM API: saat data live diambil dari server, ganti isi fungsi ini
   dengan fetch(...).then(...) yang memperbarui properti isLive/isStage/
   liveUrl pada MEMBERS, lalu panggil applyStatusSnapshot(). Sisa
   pipeline (banner, badge, card, chip) tidak perlu diubah. */
async function fetchStatusSnapshot() {
  try {
    await fetchLiveTrackerSnapshot();
  } catch (error) {
    // Website tetap dapat dibuka ketika backend tracker belum dijalankan.
    if (window.console && console.warn) console.warn(error.message);
  }
  return { live: liveMembers(), stage: stageMembers() };
}

async function refreshStatus(options) {
  const opts = options || {};
  await fetchStatusSnapshot();

  const signature = statusSignature();
  const changed = signature !== lastStatusSignature;
  lastStatusSignature = signature;

  updateStatusBanners();

  /* Roster live/stage berubah → tulis ulang grid supaya tombol
     "Tonton Live" dan flag card ikut menyesuaikan. Kalau tidak berubah,
     grid dibiarkan utuh agar scroll/fokus user tidak hilang. */
  if (changed && !opts.firstRun) {
    renderDirectory();
    renderOshi();
  }

  state.lastSync = new Date();
  const stamp = $('#statusUpdated');
  if (stamp) {
    stamp.textContent = `Diperbarui ${timeLabel(state.lastSync)} · otomatis tiap ${Math.round(LIVE_POLL_MS / 1000)} detik`;
  }

  if (opts.announce && changed && !opts.firstRun) {
    showToast('Status live & stage diperbarui.', 'ok');
  }

  return changed;
}

function startLiveTracker() {
  // Tandai kondisi awal supaya tick pertama tidak menulis ulang grid.
  refreshStatus({ firstRun: true });
  startLiveEvents();

  const tick = () => refreshStatus();

  const start = () => {
    if (livePollTimer) return;
    livePollTimer = window.setInterval(tick, LIVE_POLL_MS);
  };
  const stop = () => {
    if (!livePollTimer) return;
    window.clearInterval(livePollTimer);
    livePollTimer = 0;
  };

  start();

  // Hemat kerja saat tab tidak terlihat; segarkan begitu user kembali.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
      if (liveEventSource) { liveEventSource.close(); liveEventSource = null; }
    } else {
      refreshStatus();
      startLiveEvents();
      start();
    }
  });
}

function initRefreshButton() {
  const btn = $('#refreshStatus');
  if (!btn) return;

  btn.addEventListener('click', () => {
    btn.classList.add('is-busy');
    btn.disabled = true;

    const changed = refreshStatus({ announce: true });
    if (!changed) showToast('Status sudah paling baru.', 'neutral');

    window.setTimeout(() => {
      btn.classList.remove('is-busy');
      btn.disabled = false;
    }, 600);
  });
}

function initHomeExtras() {
  const birthdayList = $('#birthdayList');
  if (birthdayList && typeof MEMBERS !== 'undefined') {
    const month = new Date().getMonth() + 1;
    const birthdays = MEMBERS.filter((member) => {
      const date = member.bio && member.bio.birthDate;
      return date && Number(String(date).slice(5, 7)) === month;
    }).sort((a, b) => String(a.bio.birthDate).slice(8).localeCompare(String(b.bio.birthDate).slice(8))).slice(0, 4);
    if (birthdays.length) {
      birthdayList.innerHTML = birthdays.map((member) => `
        <a class="birthday-item" href="${esc(memberUrl(member.id))}">
          <span class="birthday-avatar"><img src="${esc(member.img)}" alt="${esc(member.name)}" /></span>
          <span><strong>${esc(member.name)}</strong><small>${esc(formatTanggalID(member.bio.birthDate))}</small></span>
        </a>`).join('');
      attachImageFallbacks(birthdayList);
    }
  }

  const poll = document.querySelector('.poll-form');
  const result = document.querySelector('.poll-result');
  if (poll && result) {
    poll.addEventListener('submit', (event) => {
      event.preventDefault();
      const choice = poll.querySelector('input[name="song"]:checked');
      result.textContent = choice ? 'Vote recorded! Thanks for sharing the love.' : 'Pick a song first, superstar.';
      if (choice) {
        try { localStorage.setItem('wiki48-poll-song', choice.value); } catch (error) { /* storage optional */ }
      }
    });
  }
}

/* -------------------------------------------------------------
   11. EVENT: REAL-TIME SEARCH
   Input di Hero Section → filter tanpa reload halaman.
   ------------------------------------------------------------- */
function initSearch() {
  const form = $('#searchForm');
  const input = $('#searchInput');
  if (!input) return;

  input.addEventListener('input', () => {
    state.query = input.value;
    renderDirectory();
  });

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      state.query = input.value;
      renderDirectory();
      const target = document.getElementById('directory');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  }
}

/* -------------------------------------------------------------
   12. EVENT: CHIP FILTER STATUS (Semua / Live / Stage)
   ------------------------------------------------------------- */
function initStatusChips() {
  const row = $('#filterRow');
  if (!row) return;

  row.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;

    state.statusFilter = chip.dataset.filter || 'all';

    row.querySelectorAll('.filter-chip').forEach((c) => {
      const active = c === chip;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-pressed', String(active));
    });

    renderDirectory();
  });
}

/* -------------------------------------------------------------
   12b. DROPDOWN KATEGORI + GRUP

   Dibangun dari GROUPS supaya jumlah member per opsi tidak pernah basi —
   angka yang ditulis tangan di HTML akan salah begitu roster berubah.

   Dipakai <select> asli, bukan listbox kustom: ukuran target sentuh, navigasi
   keyboard, type-ahead, dan pembacaan screen reader sudah benar dari sana.
   Catatan penting: label <optgroup> TIDAK bisa dipilih, jadi filter
   "seluruh kategori" harus punya opsinya sendiri di dalam grup itu.
   ------------------------------------------------------------- */
function opsiScopeHTML() {
  const opsi = [`<option value="all">Semua kategori · ${MEMBERS.length} member</option>`];

  kategoriTerurut().forEach((key) => {
    const label = kategoriLabel(key);
    const daftar = grupKategori(key);
    if (!daftar.length) return;

    const total = daftar.reduce((n, g) => n + membersOfGroup(g.id).length, 0);
    const isi = [
      // Judul <optgroup> di bawah sudah memuat nama panjangnya, jadi di sini
      // cukup versi pendek supaya tidak terbaca dua kali.
      `<option value="cat:${esc(key)}">${esc(uiCardText('all'))} ${esc(label.short)} · ${total} ${esc(uiCardText('member'))}</option>`,
    ];

    daftar.forEach((g) => {
      const jumlah = membersOfGroup(g.id).length;
      // Grup yang rosternya belum diisi tetap ditampilkan, tapi ditandai —
      // menyembunyikannya membuat user mengira grupnya tidak ada.
      const ket = jumlah ? `${jumlah} ${uiCardText('member')}` : uiCardText('rosterEmpty');
      isi.push(`<option value="group:${esc(g.id)}">${esc(g.name)} · ${ket}</option>`);
    });

    opsi.push(`<optgroup label="${esc(label.title)}">${isi.join('')}</optgroup>`);
  });

  return opsi.join('');
}

function initCategorySelect() {
  const sel = $('#categorySelect');
  if (!sel) return;

  sel.innerHTML = opsiScopeHTML();

  /* Selaraskan kontrol dengan state — applyGroupFromURL() sudah bisa
     mengubahnya sebelum fungsi ini jalan. Kalau nilainya tidak ada di daftar
     opsi (mis. grup dihapus), browser mengosongkan select; kembalikan ke
     'all' supaya kontrol tidak tampil kosong. */
  sel.value = state.scopeFilter;
  if (!sel.value) {
    state.scopeFilter = 'all';
    sel.value = 'all';
  }

  sel.addEventListener('change', () => {
    state.scopeFilter = sel.value || 'all';
    syncScopeURL();
    renderDirectory();
  });
}

/* -------------------------------------------------------------
   13. DEEP-LINK FILTER GRUP  (dari groups.html / member.html)
   Format URL: members.html?group=<slug>#directory
   ------------------------------------------------------------- */
function renderActiveFilter() {
  const box = $('#activeFilter');
  if (!box) return;

  const q = state.query.trim();
  if (!q) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  box.hidden = false;
  box.innerHTML = `
    <span class="active-filter-label">Filter aktif</span>
    <span class="active-filter-value">${esc(q)}</span>
    <button class="active-filter-clear" type="button" id="clearFilter"
            aria-label="Hapus filter ${esc(q)}">✕</button>`;
}

function clearFilter() {
  state.query = '';
  const input = $('#searchInput');
  if (input) input.value = '';

  // URL disamakan lagi dengan scope dropdown yang masih aktif — bukan dikosongkan
  // total, karena pilihan grup di dropdown tidak ikut dihapus tombol ini.
  syncScopeURL();

  renderDirectory();
}

/* Tulis ulang query string supaya URL selalu mewakili apa yang tampil:
   satu grup → ?group=<slug>, selain itu param-nya dibuang. Tanpa ini, reload
   setelah user mengubah dropdown akan mengembalikan grup dari URL lama. */
function syncScopeURL() {
  if (!window.history.replaceState) return;

  const scope = pecahScope(state.scopeFilter);
  const group = scope.jenis === 'group'
    ? GROUPS.find((g) => g.id === scope.kunci)
    : null;

  const url = new URL(window.location.href);
  if (group) url.searchParams.set('group', group.slug);
  else url.searchParams.delete('group');

  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

function applyGroupFromURL() {
  const slug = new URLSearchParams(window.location.search).get('group');
  if (!slug) return;

  const group = groupBySlug(slug);
  if (!group) return;

  /* Kalau halamannya punya dropdown, deep-link mengisi dropdown-nya — bukan
     kotak pencarian. Nama grup sebagai teks pencarian menjaring terlalu banyak:
     "AKB48" juga cocok dengan member AKB48 Team SH karena nama grup mereka
     memuat kata itu. Halaman tanpa dropdown tetap memakai jalur lama supaya
     deep-link lama tidak mati. */
  if ($('#categorySelect')) {
    state.scopeFilter = `group:${group.id}`;
  } else {
    state.query = group.name;
    const input = $('#searchInput');
    if (input) input.value = group.name;
  }

  window.setTimeout(() => {
    const target = document.getElementById('directory');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

/* -------------------------------------------------------------
   14. INIT
   ------------------------------------------------------------- */
function init() {
  setFooterYear();
  initI18n();
  initDrawer();          // logika drawer (common.js)

  applyGroupFromURL();   // baca ?group= sebelum render pertama

  updateStatusBanners();
  renderDirectory();
  renderOshi();          // dari oshiList yang sudah dibaca dari localStorage
  applyCardTranslations();

  initSearch();
  initStatusChips();
  initCategorySelect();
  document.addEventListener('wiki48-language-change', () => {
    const categorySelect = $('#categorySelect');
    if (categorySelect) {
      categorySelect.innerHTML = opsiScopeHTML();
      categorySelect.value = state.scopeFilter;
    }
    renderDirectory();
    applyCardTranslations();
  });
  initRefreshButton();
  initHomeExtras();

  // Klik tombol heart di kedua grid (event delegation).
  const grid = $('#memberGrid');
  const oshi = $('#oshiContainer');
  if (grid) grid.addEventListener('click', handleFavClick);
  if (oshi) oshi.addEventListener('click', handleFavClick);

  // Tombol ✕ pada pill filter aktif (delegation — elemen dirender ulang).
  const filterBox = $('#activeFilter');
  if (filterBox) {
    filterBox.addEventListener('click', (e) => {
      if (e.target.closest('#clearFilter')) clearFilter();
    });
  }

  /* Sinkron antar tab: kalau user mengubah oshi di tab lain,
     tab ini ikut menyesuaikan tanpa perlu reload. */
  window.addEventListener('storage', (e) => {
    if (e.key !== OSHI_STORAGE_KEY) return;
    oshiList = loadOshiList();
    renderDirectory();
    renderOshi();
  });

  startLiveTracker();    // polling status tiap 30 detik
}

// Jalankan setelah DOM siap.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
