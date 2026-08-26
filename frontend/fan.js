/* =============================================================
   fan.js — halaman profil publik seorang fans (fan.html?id=<code>)
   -------------------------------------------------------------
   Menampilkan biodata + kartu oshi milik fans lain, dan tombol
   pertemanan sesuai status relasi viewer:
     guest       → ajakan masuk
     none        → + Tambah Teman
     pending_out → ⏳ menunggu persetujuan
     pending_in  → ✓ Terima Permintaan
     friends     → ✓ Teman (+ tombol hapus)
   apiRequest() dipinjam dari auth.js (sudah dimuat sebelum file ini).
   ============================================================= */

const kodeTarget = new URLSearchParams(window.location.search).get('id') || '';

function formatTanggal(iso, opsi = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const d = new Date(String(iso || '').length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', { ...opsi, timeZone: 'UTC' }).format(d);
  } catch {
    return String(iso).slice(0, 10);
  }
}

function kartuOshiFan(member, alasan) {
  const fotoGagal = typeof photoPlaceholder === 'function' ? photoPlaceholder(member.name, member.accent) : '';
  return `
    <article class="profile-oshi-card">
      <img src="${member.img}" alt="Foto ${esc(member.name)}" loading="lazy" onerror="this.src='${fotoGagal}'" />
      <div><strong>${esc(member.name)}</strong><small>${esc(member.group)}</small>
      ${alasan ? `<p>“${esc(alasan)}”</p>` : '<p>My Oshi</p>'}</div>
    </article>`;
}

function tombolAksi(status) {
  const wrap = document.querySelector('#friendActionWrap');
  if (!wrap) return;
  if (!kodeTarget) return;
  if (status === null) {
    wrap.innerHTML = `<a class="auth-submit fan-friend-btn" href="login.html"><span>Masuk untuk menambah teman</span> <span aria-hidden="true">→</span></a>`;
    return;
  }
  const peta = {
    none: '<button class="auth-submit fan-friend-btn" type="button" data-aksi="add">＋ Tambah Teman</button>',
    pending_out: '<button class="auth-submit fan-friend-btn" type="button" disabled>⏳ Menunggu persetujuan</button>',
    pending_in: '<button class="auth-submit fan-friend-btn is-primary" type="button" data-aksi="accept">✓ Terima Permintaan</button>',
    friends: '<span class="fan-friend-badge">♥ Teman kamu</span><button class="friend-btn fan-unfriend" type="button" data-aksi="remove">Hapus pertemanan</button>',
  };
  wrap.innerHTML = peta[status] || '';

  wrap.querySelectorAll('[data-aksi]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const aksi = btn.dataset.aksi;
        if (aksi === 'add') await apiRequest(`/api/fans/${encodeURIComponent(kodeTarget)}/friend`, { method: 'POST' });
        else if (aksi === 'accept') await apiRequest(`/api/fans/${encodeURIComponent(kodeTarget)}/friend/accept`, { method: 'POST' });
        else await apiRequest(`/api/fans/${encodeURIComponent(kodeTarget)}/friend`, { method: 'DELETE' });
        muatProfil();
      } catch (error) {
        btn.disabled = false;
      }
    });
  });
}

async function muatProfil() {
  const judul = document.querySelector('#fanTitle');
  const meta = document.querySelector('#fanMeta');
  const oshiBox = document.querySelector('#fanOshi');
  const errorBox = document.querySelector('#fanError');
  if (!kodeTarget) {
    judul.textContent = 'Fans tidak ditemukan';
    if (errorBox) { errorBox.hidden = false; errorBox.textContent = 'URL harus memuat ?id=<kode fans>.'; }
    return;
  }
  try {
    const data = await apiRequest(`/api/fans/${encodeURIComponent(kodeTarget)}`);
    const fan = data.fan;
    document.title = `${fan.name} - Profil Fans WIKI48`;
    judul.textContent = fan.name;
    const bagian = [`Bergabung ${formatTanggal(fan.joinedAt, { month: 'long', year: 'numeric' })}`];
    if (fan.birthDate) bagian.push(`🎂 ${formatTanggal(fan.birthDate)}`);
    if (fan.kota) bagian.push(`📍 ${fan.kota}`);
    if (fan.grupFavorit) bagian.push(`🎤 ${fan.grupFavorit}`);
    meta.textContent = bagian.join(' · ');
    const badge = document.querySelector('#fanBadge');
    if (badge) {
      const petaLencana = { reader: '✅ Pembaca Terverifikasi', contributor: '🛠️ Kontributor', editor: '🛡️ Editor Wiki' };
      if (fan.akses && petaLencana[fan.akses]) { badge.textContent = petaLencana[fan.akses]; badge.hidden = false; }
      else badge.hidden = true;
    }

    const avatar = document.querySelector('#fanAvatar');
    if (avatar && typeof terapkanAvatar === 'function') terapkanAvatar(avatar, fan);

    if (data.isSelf) tombolAksi(null), (document.querySelector('#friendActionWrap').innerHTML = '<a class="profile-link" href="profile.html">Ini profilmu — kelola di sini →</a>');

    const daftar = (fan.oshiMembers || []).map((id) => ({ id, member: typeof memberById === 'function' ? memberById(id) : null })).filter((x) => x.member);
    oshiBox.innerHTML = daftar.length
      ? daftar.map((x) => kartuOshiFan(x.member, (fan.oshiReasons || {})[x.id])).join('')
      : '<p class="profile-oshi-empty">Belum memilih oshi — mungkin masih jatuh cinta pada semua member. 💘</p>';

    if (data.isSelf) {
      document.querySelector('#friendActionWrap').innerHTML = '<a class="profile-link" href="profile.html">Ini profilmu — kelola di sini →</a>';
    } else {
      tombolAksi(data.friendship);
    }
  } catch (error) {
    judul.textContent = 'Profil tidak bisa dimuat';
    if (errorBox) { errorBox.hidden = false; errorBox.textContent = error.message; }
    oshiBox.innerHTML = '';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', muatProfil);
else muatProfil();
