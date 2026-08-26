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
    ? `Hapus ${member.name} dari My Oshi`
      : `Tambahkan ${member.name} ke My Oshi`;

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
      title: uiCardText('noResultTitle'),
      sub: uiCardText('noMemberFilter'),
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
      // Filter aktif sudah dijelaskan chip "active filter" di atas grid,
      // jadi pesan kosong cukup satu kalimat generik yang mudah diterjemahkan.
      container.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true">🔍</span><p class="empty-title">${esc(uiCardText('noResultTitle'))}</p><p class="empty-sub">${esc(uiCardText('noMemberFilter'))}</p></div>`;
    } else {
      const sections = GROUPS.map((group) => {
        const members = list.filter((member) => member.groupId === group.id);
        if (!members.length) return '';
        return `<section class="member-group" aria-labelledby="member-group-${esc(group.id)}">
          <div class="section-head member-group-head">
            <h3 class="section-title" id="member-group-${esc(group.id)}">${esc(group.name)}</h3>
            <span class="section-count">${uiCardText('countTpl').replace('{n}', members.length)}</span>
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
      ? uiCardText('countFromTpl').replace('{a}', list.length).replace('{b}', MEMBERS.length)
      : uiCardText('countTpl').replace('{n}', MEMBERS.length);
  }

  // Judul section ikut scope — "Semua member" jadi bohong begitu user memilih
  // satu grup, dan hitungan di sebelahnya tidak cukup menjelaskan.
  const title = $('#directoryTitle');
  if (title) title.textContent = scopeLabel
    ? uiCardText('dirScopedTpl').replace('{scope}', scopeLabel)
    : uiCardText('allMembers');

  // Tandai dropdown saat daftar sedang dipersempit (lihat .scope-select.is-active).
  const sel = $('#categorySelect');
  if (sel) sel.classList.toggle('is-active', pecahScope(state.scopeFilter).jenis !== 'all');

  renderActiveFilter();
}

/* -------------------------------------------------------------
   8b. RENDER: TABEL MEMBER PER GRUP (Gen | Nama Member)
   Panel di kanan grid kartu. Satu baris = satu generasi;
   nama member ditulis dengan timnya dalam kurung,
   contoh: Fiony Alveria Tantri (Love).
   ------------------------------------------------------------- */
const TIM_AWALAN = /^team\s/i;

function grupPakaiTim(daftar) {
  return daftar.some((m) => TIM_AWALAN.test(String(m.team || '')));
}

/* Label tim pendek untuk kurung setelah nama:
   "Team Love" → "(Love)", "Trainee"/"Draft" apa adanya.
   Member grup bertim tanpa nilai tim = trainee/kenkyuusei
   (nilai seperti "Gen 7" pada roster SKE48 itu angkatan kks). */
function labelTimPendek(member) {
  const t = String(member.team || '').trim();
  if (TIM_AWALAN.test(t)) return t.replace(TIM_AWALAN, '');
  if (/^(trainee|kenkyuusei|draft)/i.test(t)) return t;
  return 'Kenkyuusei';
}

/* Teks gen mentah dibersihkan dari artefak wiki ("}}", "/ (April, 2014)"). */
function teksGenMentah(member) {
  return String((member.bio && member.bio.gen) || '')
    .replace(/}}+/g, '')
    .replace(/\s*\/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Kunci & label generasi. "JKT48 11th Generation" dan "11th Generation"
   digabung jadi satu baris "Gen 11". Angka yang awalannya cocok dengan
   nama grup dipilih lebih dulu (mis. "JKT48 4th / KLP48 1st" di KLP48).
   Label non-standar (Team 8, Draft, New Wave…) tampil apa adanya. */
function infoGen(member, namaGrup) {
  const mentah = teksGenMentah(member);
  if (!mentah) return { urut: Number.POSITIVE_INFINITY, kunci: 'zz', label: '—' };

  const kataGrup = String(namaGrup || '').toLowerCase().split(/\s+/);
  const kecil = mentah.toLowerCase();
  /* Ordinal dicocokkan TANPA menelan prefiks: regex lama membiarkan
     "[a-z0-9]+" menghisah "1" dari "12th" sehingga "JKT48 12th" terbaca
     "Gen 2". Di sini angka dicari mandiri, lalu awalannya diambil dari
     kata tepat di depannya untuk dicocokkan dengan nama grup. */
  const re = /(\d+(?:\.\d+)?)\s*(?:st|nd|rd|th)\s*-?\s*gen(?:eration)?/g;
  let m;
  let terpilih = null;
  while ((m = re.exec(kecil))) {
    /* "abc12th" (digit menempel huruf tanpa spasi) bukan ordinal sah. */
    const charSebelum = m.index > 0 ? kecil[m.index - 1] : '';
    if (charSebelum && /[a-z0-9]/.test(charSebelum)) continue;
    const kataAkhir = kecil.slice(0, m.index).trim().split(/[^a-z0-9.]+/).pop() || '';
    const kandidat = { num: parseFloat(m[1]), awalan: kataAkhir };
    if (!terpilih) terpilih = kandidat;
    if (kandidat.awalan && kataGrup.includes(kandidat.awalan)) {
      terpilih = kandidat;
      break;
    }
  }
  if (terpilih) {
    const nomor = String(terpilih.num).replace(/\.0$/, '');
    return { urut: terpilih.num, kunci: `gen:${nomor}`, label: `Gen ${nomor}` };
  }
  return {
    urut: 10000,
    kunci: `raw:${mentah.toLowerCase()}`,
    label: mentah.length > 34 ? `${mentah.slice(0, 33)}…` : mentah,
  };
}

function renderMemberTables() {
  const container = $('#memberTableList');
  if (!container) return;

  container.innerHTML = GROUPS.map((group, index) => {
    const members = MEMBERS.filter((m) => m.groupId === group.id);
    if (!members.length) return '';

    const withTim = grupPakaiTim(members);
    /* Kelompokkan member per generasi, lalu urutkan: Gen kecil → besar,
       label non-standar sesudahnya, yang tanpa data paling bawah. */
    const barisMap = new Map();
    members.forEach((m) => {
      const info = infoGen(m, group.name);
      if (!barisMap.has(info.kunci)) barisMap.set(info.kunci, { urut: info.urut, label: info.label, anggota: [] });
      barisMap.get(info.kunci).anggota.push({ m, tim: withTim ? labelTimPendek(m) : '' });
    });
    const baris = [...barisMap.values()]
      .sort((a, b) => a.urut - b.urut || a.label.localeCompare(b.label))
      .map((b) => ({ ...b, anggota: b.anggota.slice().sort((x, y) => x.m.name.localeCompare(y.m.name)) }));

    const isiBaris = baris.map((b) => `
      <tr>
        <td class="td-gen">${esc(b.label)}</td>
        <td class="td-names">${b.anggota.map(({ m, tim }) => `<span class="name-item"><a href="${esc(memberUrl(m.id))}">${esc(m.name)}${tim ? ` <span class="tim-tag">(${esc(tim)})</span>` : ''}</a></span>`).join(' ')}</td>
      </tr>`).join('');

    return `<details class="group-table-block"${index === 0 ? ' open' : ''}>
      <summary><span>${esc(group.name)}</span><span class="group-table-count">${members.length} member</span></summary>
      <div class="member-table-wrap"><table class="member-table">
        <thead><tr><th scope="col">Gen</th><th scope="col">Nama Member</th></tr></thead>
        <tbody>${isiBaris}</tbody>
      </table></div>
    </details>`;
  }).join('');
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
    title: uiCardText('emptyOshiTitle'),
    sub: uiCardText('emptyOshiSubTpl').replace('{n}', OSHI_LIMIT),
  });

  const counter = $('#oshiCounter');
  if (counter) {
    counter.textContent = uiCardText('pinnedCountTpl').replace('{n}', favs.length);
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

  if (!isOshi(memberId)) {
    const reason = window.prompt(uiCardText('oshiPromptTpl').replace('{name}', member.name));
    if (reason === null) return false;
    if (reason.trim().length < 3) {
      showToast(uiCardText('toastReasonMin'), 'warn');
      return false;
    }
    const reasons = loadOshiReasons();
    reasons[memberId] = reason.trim().slice(0, 240);
    saveOshiReasons(reasons);
  }

  const hasil = setOshi(memberId);

  if (hasil === 'removed') {
    const reasons = loadOshiReasons();
    delete reasons[memberId];
    saveOshiReasons(reasons);
    showToast(uiCardText('toastOshiRemovedTpl').replace('{name}', member.name), 'neutral');
  } else if (hasil === 'full') {
    showToast(
      uiCardText('toastOshiFullTpl').replace('{n}', OSHI_LIMIT).replace('{name}', member.name),
      'warn',
    );
    return false;
  } else if (hasil === 'added') {
    showToast(uiCardText('toastOshiAddedTpl').replace('{name}', member.name).replace('{n}', oshiList.length), 'ok');
  } else {
    return false;
  }

  if (!saveOshiList() && !storageWarned) {
    storageWarned = true;
    showToast(uiCardText('toastStorageWarn'), 'warn');
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
function liveLinksHTML(list, tamuList = []) {
  const withUrl = list.filter((m) => typeof m.liveUrl === 'string' && m.liveUrl.trim() !== '');
  const barisMember = withUrl.map((m) => `
    <a class="live-link" href="${esc(m.liveUrl)}" target="_blank" rel="noopener noreferrer"
       aria-label="Tonton live ${esc(m.name)} di ${esc(m.livePlatform || 'platform streaming')}">
      <span class="live-link-icon" aria-hidden="true">▶</span>
      <span class="live-link-name">${esc(m.name)}</span>
      <span class="live-link-platform">${esc(m.livePlatform || 'Live')}</span>
    </a>`);

  /* Live tamu: siaran dinamis tanpa padanan roster (judul kanji dsb.).
     streamUrl/live_url dipakai apa adanya; tanpa URL → tidak dirender
     supaya tidak ada link mati. */
  const barisTamu = tamuList
    .filter((t) => typeof (t.streamUrl || t.live_url) === 'string' && String(t.streamUrl || t.live_url).trim() !== '')
    .map((t) => {
      const url = t.streamUrl || t.live_url;
      const nama = t.memberName || t.member_name || 'Sedang live';
      const platform = String(t.platform || '').toLowerCase() === 'idn' ? 'IDN Live'
        : String(t.platform || '').toLowerCase() === 'showroom' ? 'SHOWROOM' : 'Live';
      return `
    <a class="live-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"
       aria-label="Tonton live ${esc(nama)} di ${esc(platform)}">
      <span class="live-link-icon" aria-hidden="true">▶</span>
      <span class="live-link-name">${esc(nama)}</span>
      <span class="live-link-platform">${esc(platform)}</span>
    </a>`;
    });

  const semua = [...barisMember, ...barisTamu];
  if (semua.length === 0) return '';
  return semua.join('');
}

/* Rincian jadwal panggung/theater hari ini. */
function stageScheduleHTML(list) {
  if (list.length === 0) return '';

  return list.map((m) => {
    const s = m.stage;
    const detail = s
      ? [s.title, s.time, s.venue].filter(Boolean).join(' · ')
      : uiCardText('stageDetailTbd');
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
  /* LIVE TAMU — siaran dari snapshot yang tak terikat data member
     (room dinamis Showroom/IDN). Tetap WAJIB tampil: kalau dibuang,
     pengunjung melihat "tidak ada yang live" padahal backend membaca
     siaran tersebut. */
  const tamu = typeof liveTamu === 'function' ? liveTamu() : [];
  const totalHidup = live.length + tamu.length;
  /* Keputusan "apa yang layak dikatakan" diambil di common.js
     (liveTrackerCardState) supaya bisa diuji tanpa browser. Di sini
     tinggal menempelkannya ke DOM. */
  const keadaanLive = liveTrackerCardState(liveTrackerHealth, totalHidup);

  /* --- Kartu LIVE --- */
  const liveCard = $('#liveStatusCard');
  const liveBadge = $('#liveBadgeSlot');
  const liveLinks = $('#liveLinks');
  const livePill = $('#liveCountPill');

  /* Saat tracker tidak bisa dipercaya, angkanya diganti "?" — menulis "0"
     di situ sama dengan menyatakan tidak ada yang live, padahal yang
     terjadi adalah kita tidak tahu. */
  if (livePill) livePill.textContent = keadaanLive.nada === 'peringatan' && totalHidup === 0 ? '?' : totalHidup;
  if (liveBadge) {
    liveBadge.innerHTML = totalHidup ? badgeHTML(uiCardText('labelLive'), 'live') : '';
    liveBadge.hidden = totalHidup === 0;
  }
  if (liveCard) {
    const value = liveCard.querySelector('.status-value');
    if (value) {
      const namaTampil = [
        ...live.map((m) => ({ name: m.name })),
        ...tamu.map((t) => ({ name: t.memberName || t.member_name || 'Sedang live' })),
      ];
      value.textContent = keadaanLive.tampilkanNama && totalHidup
        ? (keadaanLive.kode === 'live' ? joinNames(namaTampil) : `${joinNames(namaTampil)} — ${uiCardText(keadaanLive.kunci)}`)
        : uiCardText(keadaanLive.kunci);
    }
    liveCard.classList.toggle('is-placeholder', keadaanLive.kode === 'kosong');
    liveCard.classList.toggle('is-active-live', keadaanLive.kode === 'live');
    liveCard.classList.toggle('is-unknown', keadaanLive.nada === 'peringatan');
    liveCard.dataset.liveState = keadaanLive.kode;
  }
  if (liveLinks) liveLinks.innerHTML = liveLinksHTML(live, tamu);

  /* --- Kartu STAGE --- */
  const stageCard = $('#stageStatusCard');
  const stageBadge = $('#stageBadgeSlot');
  const stageList = $('#stageSchedule');
  const stagePill = $('#stageCountPill');

  if (stagePill) stagePill.textContent = stage.length;
  if (stageBadge) {
    stageBadge.innerHTML = stage.length ? badgeHTML(uiCardText('labelStage'), 'stage') : '';
    stageBadge.hidden = stage.length === 0;
  }
  if (stageCard) {
    const value = stageCard.querySelector('.status-value');
    if (value) {
      value.textContent = stage.length ? joinNames(stage) : uiCardText('noStageSchedule');
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
  if (syncText) syncText.textContent = uiCardText('syncSummaryTpl').replace('{a}', live.length).replace('{b}', stage.length);
  if (syncInd) syncInd.classList.add('is-ready');

  syncMemberCardStates();

  return { live: live.length, stage: stage.length };
}

// Alias nama lama dari Part 2.
function renderStatus() {
  return updateStatusBanners();
}

/* timeLabel() dihapus: pemformatan jam sekarang ada di liveTrackerStampText()
   (common.js) supaya cap waktu di beranda dan halaman jadwal tidak bisa
   berbeda format. Tidak ada lagi yang memanggilnya. */

/* Sidik jari status — dipakai untuk mendeteksi perubahan roster live/stage
   sehingga grid hanya ditulis ulang saat benar-benar ada perubahan. */
function statusSignature() {
  return liveMembers().map((m) => m.id).join(',')
    + '|' + stageMembers().map((m) => m.id).join(',');
}

let lastStatusSignature = '';
let livePollTimer = 0;
let liveEventSource = null;
let liveSseRetry = 0;
let liveSseTimer = 0;

/* =============================================================
   NOTIFIKASI "MULAI LIVE" DI WEB
   Diff kumpulan id live antar siklus polling/SSE: id baru yang
   muncul = ada yang baru mulai siaran → toast. Set pertama TIDAK
   memicu notifikasi (halaman baru dibuka, bukan kejadian baru).
   ============================================================= */
let liveIdSebelumnya = null;

function kumpulkanLiveSekarang() {
  const peta = new Map();
  liveMembers().forEach((m) => { if (m.id) peta.set(m.id, m.name); });
  liveTamu().forEach((t) => {
    const id = t.id || `${t.platform}:${t.streamUrl || t.live_url}`;
    if (id) peta.set(String(id), t.memberName || t.member_name || 'Sedang live');
  });
  return peta;
}

function deteksiMulaiLive({ diam = false } = {}) {
  const sekarang = kumpulkanLiveSekarang();
  let namaBaru = [];
  if (liveIdSebelumnya !== null && !diam) {
    sekarang.forEach((nama, id) => {
      if (!liveIdSebelumnya.has(id)) namaBaru.push(nama);
    });
  }
  liveIdSebelumnya = sekarang;
  if (namaBaru.length === 0) return;
  const tampil = namaBaru.slice(0, 3).join(', ')
    + (namaBaru.length > 3 ? ` & ${namaBaru.length - 3} lainnya` : '');
  showToast(`🔴 ${tampil} mulai live!`, 'ok');
}

/* SSE hanya berguna kalau server memang mendukungnya. Di Vercel
   /api/live/events menjawab 501 (Upstash REST tidak punya pub/sub, jadi
   tidak ada yang bisa didorong), dan payload /api/live mengabarkan itu
   lewat tracker.sse. Tanpa pengecekan ini, setiap kali tab kembali
   terlihat browser membuka koneksi yang sudah pasti ditolak. */
function startLiveEvents() {
  if (!window.EventSource || liveEventSource) return;
  if (liveTrackerHealth.sse === false) return;
  if (liveSseTimer) return;

  liveEventSource = new EventSource(liveEndpoint('/api/live/events'));
  liveEventSource.addEventListener('live:update', (event) => {
    try {
      const snapshot = JSON.parse(event.data);
      liveSseRetry = 0;                 // sambungan sehat → hitungan mundur direset
      catatKesehatanLive(snapshot);
      applyLiveSnapshot(snapshot.live);
      window.WIKI48_LIVE_TAMU = Array.isArray(snapshot.live)
        ? snapshot.live.filter((e) => /^(showroom-|idn-)/.test(String(e.id || '')))
        : [];
      const changed = statusSignature() !== lastStatusSignature;
      lastStatusSignature = statusSignature();
      updateStatusBanners();
      deteksiMulaiLive();
      if (changed) { renderDirectory(); renderOshi(); }
      state.lastSync = new Date(snapshot.checked_at || Date.now());
      const stamp = $('#statusUpdated');
      if (stamp) stamp.textContent = liveTrackerStampText(liveTrackerHealth, { realtime: true });
    } catch (error) {
      if (window.console && console.warn) console.warn(`Live SSE tidak valid: ${error.message}`);
    }
  });

  /* Koneksi putus itu normal (tab tidur, proxy, deploy ulang). Yang tidak
     normal adalah mencoba lagi secepat mungkin tanpa henti: itu membebani
     server justru saat server sedang bermasalah. Jadi jedanya digandakan,
     dibatasi 30 detik, dan polling tetap jalan sebagai jaring pengaman. */
  liveEventSource.onerror = () => {
    if (liveEventSource) { liveEventSource.close(); liveEventSource = null; }
    if (liveSseRetry >= 5 || liveTrackerHealth.sse === false) return;
    const jeda = Math.min(30000, 2000 * (2 ** liveSseRetry));
    liveSseRetry += 1;
    liveSseTimer = window.setTimeout(() => { liveSseTimer = 0; startLiveEvents(); }, jeda);
  };
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
  deteksiMulaiLive({ diam: Boolean(opts.firstRun) });

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
    stamp.textContent = liveTrackerStampText(liveTrackerHealth, { intervalMs: LIVE_POLL_MS });
  }

  if (opts.announce && changed && !opts.firstRun) {
    showToast(uiCardText('toastStatusRefreshed'), 'ok');
  }

  return changed;
}

async function startLiveTracker() {
  // Tandai kondisi awal supaya tick pertama tidak menulis ulang grid.
  /* Ditunggu (await) sebelum SSE dinyalakan: balasan pertama itu yang
     mengabarkan apakah server mendukung SSE. Kalau tidak ditunggu, kita
     selalu membuka satu koneksi yang di Vercel pasti ditolak.

     Dibungkus try/catch karena sekarang ada `await` di sini: satu
     kesalahan pada render pertama tidak boleh membuat timer polling
     gagal dipasang — halaman akan berhenti mencoba selamanya. */
  try {
    await refreshStatus({ firstRun: true });
  } catch (error) {
    if (window.console && console.warn) console.warn(`Render status pertama gagal: ${error.message}`);
  }
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
      if (liveSseTimer) { window.clearTimeout(liveSseTimer); liveSseTimer = 0; }
      if (liveEventSource) { liveEventSource.close(); liveEventSource = null; }
    } else {
      liveSseRetry = 0;      // kembali ke tab = niat baru, bukan lanjutan kegagalan lama
      refreshStatus();
      startLiveEvents();
      start();
    }
  });
}

function initRefreshButton() {
  const btn = $('#refreshStatus');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.classList.add('is-busy');
    btn.disabled = true;

    const changed = await refreshStatus({ announce: true });
    if (!changed) showToast(uiCardText('toastStatusFresh'), 'neutral');

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
  const opsi = [`<option value="all">${esc(uiCardText('allCategories'))} · ${MEMBERS.length}</option>`];

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
    <span class="active-filter-label">${esc(uiCardText('activeFilterLabel'))}</span>
    <span class="active-filter-value">${esc(q)}</span>
    <button class="active-filter-clear" type="button" id="clearFilter"
            aria-label="${esc(uiCardText('clearFilterAriaTpl').replace('{q}', q))}">✕</button>`;
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
  renderMemberTables();  // tabel Gen | Nama | Team per grup (members.html)
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
    updateStatusBanners();
    renderOshi();
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
