/* =============================================================
   IDOL & GROUP WIKI HUB — member.js
   Halaman detail satu member: member.html?id=<id>

   Isi berkas ini:
   1. Ambil & validasi id dari URL
   2. Render header profil (foto, nama, badge, tombol)
   3. Render biodata dari member.bio (baris kosong dilewati)
   4. Render rekan satu team
   5. Tombol Oshi Pin (memakai lapisan data di common.js)

   PENTING: common.js harus dimuat lebih dulu (lihat member.html).
   File ini tidak boleh mendeklarasikan ulang nama global milik
   common.js / script.js — cek dengan `node data/tools/audit.js`.
   ============================================================= */

/* -------------------------------------------------------------
   1. AMBIL ID DARI URL
   URLSearchParams dipakai supaya id yang mengandung karakter
   ter-encode tetap terbaca benar. Kalau parameter tidak ada atau
   tidak dikenal, halaman menampilkan pesan — bukan layar kosong.
   ------------------------------------------------------------- */
function idDariURL() {
  try {
    return new URLSearchParams(window.location.search).get('id') || '';
  } catch (err) {
    return '';
  }
}

/* -------------------------------------------------------------
   2. POTONGAN TAMPILAN
   ------------------------------------------------------------- */

/* Nama besar di halaman detail. Aturannya sama dengan card di index:
   aksara asli jadi nama utama, Latin diselipkan kecil di atasnya.
   Ditulis ulang di sini (bukan memanggil nameMarkup() dari script.js)
   karena script.js TIDAK dimuat di halaman ini — memuatnya hanya untuk
   satu fungsi akan menjalankan polling status & render direktori yang
   elemennya tidak ada di sini. */
function judulNamaHTML(member) {
  const native = (member.nameNative || '').trim();
  const latin = (member.nameLatin || member.name || '').trim();
  const lang = native ? langOfNative(native, member.groupId) : '';
  if (!native) {
    return `<h1 class="profile-name"><span class="name-main">${esc(latin)}</span></h1>`;
  }
  return `<h1 class="profile-name">
      <span class="name-latin">${esc(latin)}</span>
      <span class="name-main"${lang ? ` lang="${lang}"` : ''}>${esc(native)}</span>
    </h1>`;
}

/* Satu baris biodata. Mengembalikan '' kalau nilainya kosong, sehingga
   pemanggil bisa menyusun daftar tanpa memeriksa satu-satu — dan tabel
   tidak pernah berisi baris "—". */
function barisBio(label, nilai) {
  const v = String(nilai == null ? '' : nilai).trim();
  if (!v) return '';
  return `<div class="bio-row">
      <dt class="bio-label">${esc(label)}</dt>
      <dd class="bio-value">${esc(v)}</dd>
    </div>`;
}

/* Blok biodata. Usia dan zodiak TIDAK disimpan di data — keduanya
   diturunkan dari birthDate saat render, supaya usia tidak pernah basi
   dan tidak ada dua sumber kebenaran yang bisa berselisih. */
function bioHTML(member) {
  const bio = member.bio;
  if (!bio) {
    return `<div class="bio-empty">
        <p>Biodata ${esc(member.name)} belum diisi.</p>
        <p class="bio-empty-note">
          Isi lewat <code>data/sumber/bio/${esc(member.groupId)}.txt</code>,
          lalu jalankan <code>node data/tools/import-bio.js ${esc(member.groupId)} --write</code>.
        </p>
      </div>`;
  }

  const usia = bio.birthDate ? usiaDari(bio.birthDate) : null;
  const lahir = bio.birthDate
    ? formatTanggalID(bio.birthDate) + (usia != null ? ` (${usia} tahun)` : '')
    : '';

  const rows = [
    barisBio('Nama panggung', bio.nickname),
    barisBio('Angkatan', bio.gen),
    barisBio('Jabatan', bio.role),
    barisBio('Tanggal lahir', lahir),
    barisBio('Zodiak', bio.birthDate ? zodiakDari(bio.birthDate) : ''),
    barisBio('Asal', bio.birthPlace),
    barisBio('Tinggi', bio.height ? `${bio.height} cm` : ''),
    barisBio('Golongan darah', bio.bloodType),
    barisBio('Bergabung', bio.debut ? formatTanggalID(bio.debut) : ''),
  ].filter(Boolean);

  if (rows.length === 0 && !bio.jikoshoukai && !bio.social) {
    return '';
  }

  const tabel = rows.length
    ? `<dl class="bio-list">${rows.join('')}</dl>`
    : '';

  const salam = bio.jikoshoukai
    ? `<blockquote class="bio-quote">${esc(bio.jikoshoukai)}</blockquote>`
    : '';

  /* rel="noopener noreferrer" wajib untuk tautan target="_blank":
     tanpa noopener, halaman tujuan bisa mengakses window.opener. */
  const sosial = (bio.social && bio.social.length)
    ? `<ul class="bio-social">${bio.social.map((s) => `
        <li><a class="social-chip" href="${esc(s.url)}"
               target="_blank" rel="noopener noreferrer">${esc(s.label)}</a></li>`).join('')}</ul>`
    : '';

  return tabel + salam + sosial;
}

/* Kartu kecil untuk rekan satu team. Sengaja bukan memberCardHTML():
   yang itu membawa tombol pin, penanda live, dan tombol tonton — terlalu
   berat untuk daftar sekunder, dan tombol pin ganda di satu halaman
   membuat state-nya harus disinkronkan dua arah. */
function kartuRekanHTML(m) {
  const fallback = photoPlaceholder(m.name, m.accent);
  const native = (m.nameNative || '').trim();
  const lang = native ? langOfNative(native, m.groupId) : '';
  const nama = native
    ? `<span class="mate-latin">${esc(m.name)}</span>
       <span class="mate-name"${lang ? ` lang="${lang}"` : ''}>${esc(native)}</span>`
    : `<span class="mate-name">${esc(m.name)}</span>`;

  return `<li class="mate">
      <a class="mate-link" href="${esc(memberUrl(m.id))}">
        <span class="mate-photo" data-accent="${esc(m.accent)}">
          <img class="member-img" src="${esc(m.img)}" data-fallback="${esc(fallback)}"
               alt="Foto ${esc(m.name)}" loading="lazy" referrerpolicy="no-referrer"
               width="300" height="400" />
        </span>
        <span class="mate-text">${nama}</span>
      </a>
    </li>`;
}

/* -------------------------------------------------------------
   3. HALAMAN "TIDAK DITEMUKAN"
   Muncul kalau ?id kosong, salah tulis, atau menunjuk member yang
   sudah dihapus dari roster. Diberi tautan keluar supaya bukan jalan
   buntu — dan menyebut id-nya supaya salah ketik mudah dilihat.
   ------------------------------------------------------------- */
function renderTidakDitemukan(id) {
  const petunjuk = id
    ? `<p class="page-subtitle">${esc(uiCardText('notFoundIdTpl').replace('{id}', id))}</p>`
    : `<p class="page-subtitle">${uiCardText('notFoundNeedId')}</p>`;

  return `<section class="page-head">
      <div class="container">
        <a class="back-link" href="index.html#directory">← Member Directory</a>
        <h1 class="page-title">${uiCardText('notFoundTitleHtml')}</h1>
        ${petunjuk}
        <p class="profile-actions">
          <a class="btn-primary" href="index.html#directory">Buka Member Directory</a>
          <a class="btn-ghost" href="groups.html">Lihat semua grup</a>
        </p>
      </div>
    </section>`;
}

/* -------------------------------------------------------------
   4. RENDER HALAMAN
   ------------------------------------------------------------- */
function renderMember(member) {
  const fallback = photoPlaceholder(member.name, member.accent);
  const group = GROUPS.find((g) => g.id === member.groupId) || null;
  const rekan = teamMatesOf(member.id);

  const flags = [];
  if (member.isLive) {
    flags.push('<span class="card-flag flag-live"><span class="live-dot" aria-hidden="true"></span>LIVE</span>');
  }
  if (member.isStage) {
    flags.push('<span class="card-flag flag-stage"><span aria-hidden="true">🎤</span>Stage</span>');
  }

  const hasLiveUrl = typeof member.liveUrl === 'string' && member.liveUrl.trim() !== '';
  const tombolLive = (member.isLive && hasLiveUrl)
    ? `<a class="btn-primary" href="${esc(member.liveUrl)}" target="_blank" rel="noopener noreferrer">
         ▶ Tonton Live · ${esc(member.livePlatform || 'Live')}
       </a>`
    : '';

  const tombolGrup = group
    ? `<a class="btn-ghost" href="members.html?group=${encodeURIComponent(group.slug)}#directory">
         Semua member ${esc(group.name)}
       </a>`
    : '';

  const situs = group && group.site
    ? `<a class="btn-ghost" href="${esc(group.site)}" target="_blank" rel="noopener noreferrer">
         Situs resmi ${esc(group.name)}
       </a>`
    : '';
  const jadwal = group && officialScheduleUrl(group.id)
    ? `<a class="btn-ghost" href="${esc(officialScheduleUrl(group.id))}" target="_blank" rel="noopener noreferrer">
         Jadwal resmi ${esc(group.name)}
       </a>`
    : '';

  const judulRekan = member.team
    ? `Rekan ${esc(member.team)}`
    : `Member lain di ${esc(member.group)}`;
  const agenda = member.schedule || [];

  return `
    <section class="page-head">
      <div class="container">
        <a class="back-link" href="index.html#directory">← Member Directory</a>
      </div>
    </section>

    <section class="section profile-section">
      <div class="container profile-grid">
        <div class="profile-photo-wrap">
          <div class="profile-photo" data-accent="${esc(member.accent)}">
            <img class="member-img" src="${esc(member.img)}"
                 data-fallback="${esc(fallback)}"
                 alt="Foto ${esc(member.name)}"
                 referrerpolicy="no-referrer" width="300" height="400" />
            ${flags.length ? `<div class="card-flags">${flags.join('')}</div>` : ''}
          </div>
        </div>

        <div class="profile-main">
          ${judulNamaHTML(member)}

          <p class="member-badges">
            <span class="badge badge-group" data-accent="${esc(member.accent)}">${esc(member.group)}</span>
            ${member.team ? `<span class="badge badge-team">${esc(member.team)}</span>` : ''}
          </p>

          <p class="profile-actions">
            <button class="btn-oshi" id="oshiToggle" type="button" data-id="${esc(member.id)}"></button>
            ${tombolLive}
            ${tombolGrup}
            ${situs}
            ${jadwal}
          </p>

          <div class="profile-bio">
            <h2 class="profile-subtitle">Biodata</h2>
            ${bioHTML(member)}
          </div>
          <div class="profile-schedule">
            <h2 class="profile-subtitle">Jadwal</h2>
            ${agenda.length ? `<ul class="member-agenda-list">${agenda.map((event) => `<li>${esc([event.date, event.time, event.title, event.venue].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : `<p class="schedule-empty">${esc(uiCardText('agendaLocalEmpty'))}</p>`}
            ${jadwal}
          </div>
        </div>
      </div>
    </section>

    ${rekan.length ? `
    <section class="section mates-section">
      <div class="container">
        <div class="section-head">
          <h2 class="section-title">${judulRekan}</h2>
          <span class="section-count">${rekan.length} member</span>
        </div>
        <ul class="mate-grid">${rekan.map(kartuRekanHTML).join('')}</ul>
      </div>
    </section>` : ''}
  `;
}

/* Fallback foto — sama seperti di script.js: URL hotlink yang 404 atau
   diblokir memicu event `error`, lalu diganti placeholder SVG inline.
   (Dipasang setelah render karena innerHTML mengganti elemennya.) */
function pasangFallbackFoto(root) {
  root.querySelectorAll('.member-img').forEach((img) => {
    img.addEventListener('error', function onErr() {
      this.removeEventListener('error', onErr);
      const fb = this.dataset.fallback;
      if (fb && this.src !== fb) this.src = fb;
      this.classList.add('is-placeholder');
    });
  });
}

/* -------------------------------------------------------------
   5. TOMBOL OSHI PIN
   Tanpa toast (tidak ada #toastStack di halaman ini), jadi penolakan
   kuota penuh dijelaskan lewat teks tombol + aria-live agar pembaca
   layar juga mendengarnya. Data & aturan kuotanya tetap dari common.js.
   ------------------------------------------------------------- */
function syncTombolOshi(id, pesan) {
  const btn = $('#oshiToggle');
  if (!btn) return;
  const member = memberById(id);
  if (!member) return;

  const aktif = isOshi(id);
  const penuh = false;

  btn.classList.toggle('is-active', aktif);
  btn.classList.toggle('is-locked', penuh);
  btn.setAttribute('aria-pressed', String(aktif));
  btn.innerHTML = aktif
    ? '<span aria-hidden="true">💖</span> Lepas dari My Oshi'
    : '<span aria-hidden="true">🤍</span> Tambah ke My Oshi';
  btn.setAttribute('title', aktif ? `Lepas ${member.name} dari My Oshi` : `Tambah ${member.name} ke My Oshi`);

  const info = $('#oshiInfo');
  if (info) {
    info.textContent = pesan || `${oshiList.length} My Oshi tersimpan.`;
    info.classList.toggle('is-warn', Boolean(pesan) && penuh);
  }
}

function initTombolOshi(id) {
  const btn = $('#oshiToggle');
  if (!btn) return;

  // Baris info di bawah tombol: pengganti toast di halaman ini.
  const info = document.createElement('p');
  info.className = 'oshi-info';
  info.id = 'oshiInfo';
  info.setAttribute('role', 'status');
  btn.parentNode.insertAdjacentElement('afterend', info);

  btn.addEventListener('click', () => {
    const member = memberById(id);
    if (!isOshi(id)) {
      const reason = window.prompt(`Kenapa kamu ingin menambahkan ${member.name} sebagai My Oshi?`);
      if (reason === null) return;
      if (reason.trim().length < 3) {
        syncTombolOshi(id, 'Tulis alasan singkat, minimal 3 karakter.');
        return;
      }
      const reasons = loadOshiReasons();
      reasons[id] = reason.trim().slice(0, 240);
      saveOshiReasons(reasons);
    }
    const hasil = setOshi(id);
    let pesan = '';

    if (hasil === 'added') {
      pesan = `${member.name} ditambahkan ke My Oshi (${oshiList.length}).`;
    } else if (hasil === 'removed') {
      const reasons = loadOshiReasons();
      delete reasons[id];
      saveOshiReasons(reasons);
      pesan = `${member.name} dilepas dari My Oshi.`;
    }

    if (hasil === 'added' || hasil === 'removed') {
      if (!saveOshiList()) {
        pesan += ' Penyimpanan lokal diblokir browser — pilihan hanya bertahan selama tab terbuka.';
      }
    }
    syncTombolOshi(id, pesan);
  });

  syncTombolOshi(id);
}

/* -------------------------------------------------------------
   6. INIT
   Namanya initMemberPage(), bukan init(): semua file JS di proyek ini
   berbagi satu scope global dan audit.js memeriksa nama kembar antar
   file. script.js sudah memakai init(), groups.js memakai
   initGroupsPage() — pola yang sama diteruskan di sini.
   ------------------------------------------------------------- */
function initMemberPage() {
  initDrawer();
  setFooterYear();
  initI18n();

  const root = $('#memberRoot');
  if (!root) return;

  const id = idDariURL();
  const member = id ? memberById(id) : null;

  if (!member) {
    const renderKosong = () => {
      root.innerHTML = renderTidakDitemukan(id);
      document.title = 'Member tidak ditemukan — Idol & Group Wiki Hub';
    };
    renderKosong();
    document.addEventListener('wiki48-language-change', renderKosong);
    return;
  }

  root.innerHTML = renderMember(member);
  pasangFallbackFoto(root);
  initTombolOshi(member.id);

  /* Judul tab memakai nama aksara asli kalau ada, karena itu yang juga
     tampil besar di halaman — supaya tab dan halaman tidak "beda orang".
     Nama Latin tetap disertakan agar tab tetap terbaca saat font CJK
     tidak tersedia. */
  const native = (member.nameNative || '').trim();
  document.title = (native ? `${native} (${member.name})` : member.name) +
    ` — ${member.group} · Idol & Group Wiki Hub`;
}

document.addEventListener('DOMContentLoaded', initMemberPage);
