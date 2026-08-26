function apiUrl(path) { return window.wiki48ApiUrl ? window.wiki48ApiUrl(path) : path; }

async function apiRequest(url, options) {
  const endpoint = apiUrl(url);
  let response;
  try {
    response = await fetch(endpoint, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  } catch (error) {
    throw new Error(`Tidak bisa menghubungi backend: ${endpoint}`);
  }
  const body = response.status === 204 ? '' : await response.text();
  let data = null;
  if (body) {
    try { data = JSON.parse(body); } catch (error) { throw new Error(`Backend error HTTP ${response.status} dari ${response.url}: ${body.slice(0, 160) || 'respons kosong'}`); }
  }
  if (!response.ok) throw new Error(data?.error || 'Terjadi kesalahan.');
  return data;
}

function initLoginPage() {
  const form = document.querySelector('#loginForm');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const error = document.querySelector('#loginError');
    apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      .then(() => { window.location.href = 'profile.html'; })
      .catch((loginError) => { error.textContent = loginError.message; });
  });

  const registerForm = document.querySelector('#registerForm');
  if (!registerForm) return;
  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const error = document.querySelector('#registerError');
    const body = {
      name: registerForm.elements.name.value.trim(),
      email: registerForm.elements.email.value.trim(),
      password: registerForm.elements.password.value,
      birthDate: registerForm.elements.birthDate ? registerForm.elements.birthDate.value : '',
    };
    apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(body) })
      .then(() => { window.location.href = 'profile.html'; })
      .catch((registerError) => { error.textContent = registerError.message; });
  });
}

function initProfilePage() {
  const profile = document.querySelector('#profilePage');
  if (!profile) return;
  const name = profile.querySelector('[data-profile-name]');
  const email = profile.querySelector('[data-profile-email]');
  const joined = profile.querySelector('[data-profile-joined]');
  const nameInput = profile.querySelector('#profileName');
  const birthInput = profile.querySelector('#profileBirth');
  const bioInput = profile.querySelector('#profileBio');
  const kotaInput = profile.querySelector('#profileKota');
  const grupInput = profile.querySelector('#profileGrup');
  const fotoUrlInput = profile.querySelector('#avatarFotoUrl');
  const avatar = profile.querySelector('#profileAvatar');
  const pictureInput = profile.querySelector('#profilePicture');
  let profilePicture = '';
  let oshiReasons = {};
  const renderProfileOshi = () => {
    const container = profile.querySelector('#profileOshi');
    if (!container) return;
    const members = (typeof MEMBERS === 'undefined' ? [] : MEMBERS).filter((member) => oshiList.includes(member.id));
    container.innerHTML = members.length ? members.map((member) => `
      <article class="profile-oshi-card"><img src="${member.img}" alt="Foto ${member.name}" loading="lazy" onerror="this.src='${photoPlaceholder(member.name, member.accent)}'" /><div><strong>${member.name}</strong><small>${member.group}</small><p>${oshiReasons[member.id] || 'My Oshi'}</p></div></article>`).join('') : `<p class="profile-oshi-empty">${esc(uiCardText('emptyOshiTitle'))}.</p>`;
  };
  apiRequest('/api/me')
    .then(({ user }) => {
      name.textContent = user.name;
      email.textContent = user.email;
      nameInput.value = user.name;
      kodeSaya = user.id;
      if (birthInput && user.birthDate) birthInput.value = user.birthDate;
      if (bioInput) bioInput.value = user.bio || '';
      if (kotaInput) kotaInput.value = user.kota || '';
      if (grupInput) grupInput.value = user.grupFavorit || '';
      profilePicture = user.profilePicture || '';
      if (fotoUrlInput && /^https:\/\//.test(profilePicture)) fotoUrlInput.value = profilePicture;
      /* Avatar tersimpan di akun → pratinjau & panel ikut. */
      if (user.avatarDesain && typeof setAvatarState === 'function') {
        setAvatarState(user.avatarDesain);
      } else if (typeof terapkanAvatar === 'function') {
        terapkanAvatar(profile.querySelector('#avatarPreview'), { photo: profilePicture });
      }
      oshiReasons = { ...loadOshiReasons(), ...(user.oshiReasons || {}) };
      /* Oshi versi server lebih diutamakan bila ada — sinkron balik ke
         perangkat ini supaya kartu oshi tampil walau ganti browser. */
      if (Array.isArray(user.oshiMembers) && user.oshiMembers.length) {
        /* Buang id yang sudah tidak ada di roster sebelum dipakai. */
        const valid = user.oshiMembers.filter((id) => typeof memberById === 'function' && memberById(id));
        if (valid.length) { oshiList = valid.slice(0, 3); saveOshiList(); }
      }
      if (profilePicture) { avatar.textContent = ''; avatar.style.backgroundImage = `url(${profilePicture})`; }
      renderProfileOshi();
      renderTemanSection(profile);
      const locale = { id: 'id-ID', en: 'en-GB', ja: 'ja-JP', th: 'th-TH', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', ms: 'ms-MY' }[currentUiCode()] || 'id-ID';
      joined.textContent = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(user.joinedAt));
    })
    .catch(() => { window.location.replace('login.html'); });

  profile.querySelector('#profileForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const updatedName = nameInput.value.trim();
    if (!updatedName) return;
    /* Foto final: URL yang ditempel menang atas upload/existing. */
    const fotoFinal = (fotoUrlInput && fotoUrlInput.value.trim()) || profilePicture;
    apiRequest('/api/me', { method: 'PATCH', body: JSON.stringify({
      name: updatedName,
      birthDate: birthInput ? birthInput.value : '',
      bio: bioInput ? bioInput.value : '',
      kota: kotaInput ? kotaInput.value : '',
      grupFavorit: grupInput ? grupInput.value : '',
      profilePicture: fotoFinal,
      oshiReasons,
      oshiMembers: oshiList.slice(0, 3),
      avatarDesain: typeof getAvatarState === 'function' ? getAvatarState() : null,
    }) })
      .then(({ user }) => {
        name.textContent = user.name;
        profilePicture = user.profilePicture || '';
        profile.querySelector('#profileSaved').hidden = false;
        if (typeof sinkronAvatarHeader === 'function') sinkronAvatarHeader();
        renderTemanSection(profile);
      })
      .catch((saveError) => { profile.querySelector('#profileSaved').textContent = saveError.message; profile.querySelector('#profileSaved').hidden = false; });
  });

  pictureInput?.addEventListener('change', () => {
    const file = pictureInput.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1_800_000 || /nude|naked|nsfw|xxx|porn|sex/i.test(file.name)) {
      pictureInput.value = '';
      profile.querySelector('#profileSaved').textContent = uiCardText('photoRejected');
      profile.querySelector('#profileSaved').hidden = false;
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { profilePicture = String(reader.result); avatar.textContent = ''; avatar.style.backgroundImage = `url(${profilePicture})`; };
    reader.readAsDataURL(file);
  });

  profile.querySelector('#logoutButton').addEventListener('click', () => {
    apiRequest('/api/auth/logout', { method: 'POST' }).finally(() => { window.location.href = 'login.html'; });
  });

  initAvatarBuilder(profile);

  /* Satu listener delegasi untuk semua tombol sosial (terima/tolak/
     tambah/hapus) — section teman sering dirender ulang. */
  profile.addEventListener('click', async (event) => {
    const terima = event.target.closest('[data-terima]');
    const tolak = event.target.closest('[data-tolak]');
    const tambah = event.target.closest('[data-tambah]');
    const hapus = event.target.closest('[data-hapus]');
    const tombol = terima || tolak || tambah || hapus;
    if (!tombol) return;
    tombol.disabled = true;
    try {
      if (terima) await apiRequest(`/api/fans/${terima.dataset.terima}/friend/accept`, { method: 'POST' });
      else if (tolak || hapus) await apiRequest(`/api/fans/${(tolak || hapus).dataset.tolak || (hapus && hapus.dataset.hapus)}/friend`, { method: 'DELETE' });
      else await apiRequest(`/api/fans/${tambah.dataset.tambah}/friend`, { method: 'POST' });
      renderTemanSection(profile);
    } catch (error) {
      tombol.disabled = false;
    }
  });
}

/* =============================================================
   SECTION TEMAN & FANS — hidupkan komunitas di halaman profil
   Tiga daftar: permintaan masuk, teman, dan fans lain yang bisa
   dijelajahi. Semua tombol berjalan lewat delegasi di atas.
   ============================================================= */
let kodeSaya = '';

function avatarFanHtml(foto, nama) {
  return foto
    ? `<img class="friend-avatar" src="${esc(foto)}" alt="" loading="lazy" />`
    : `<span class="friend-avatar friend-avatar-empty" aria-hidden="true">🐰</span>`;
}

async function renderTemanSection(profile) {
  const list = profile.querySelector('#friendList');
  const requests = profile.querySelector('#friendRequests');
  const discover = profile.querySelector('#fanDiscover');
  if (!list || !requests || !discover) return;

  try {
    const data = await apiRequest('/api/friends');
    requests.innerHTML = data.incoming.length
      ? data.incoming.map((f) => `
        <div class="friend-row">
          ${avatarFanHtml(f.photo, f.name)}
          <div class="friend-main"><strong>${esc(f.name)}</strong><small>ingin berteman denganmu</small></div>
          <button class="friend-btn is-primary" type="button" data-terima="${esc(f.code)}">Terima</button>
          <button class="friend-btn" type="button" data-tolak="${esc(f.code)}">Tolak</button>
        </div>`).join('')
      : '<p class="friends-empty">Belum ada permintaan pertemanan.</p>';

    list.innerHTML = data.friends.length
      ? data.friends.map((f) => `
        <div class="friend-row">
          ${avatarFanHtml(f.photo, f.name)}
          <a class="friend-main" href="fan.html?id=${esc(f.code)}"><strong>${esc(f.name)}</strong><small>Lihat profil →</small></a>
          <button class="friend-btn" type="button" data-hapus="${esc(f.code)}" title="Hapus teman">✕</button>
        </div>`).join('')
      : '<p class="friends-empty">Belum punya teman. Temukan fans lain di bawah! ✦</p>';

    const semua = await apiRequest('/api/fans?limit=12');
    const lain = semua.fans.filter((f) => f.code !== kodeSaya);
    discover.innerHTML = lain.length
      ? lain.map((f) => `
        <a class="fan-chip" href="fan.html?id=${esc(f.code)}">
          ${avatarFanHtml(f.photo, f.name)}
          <span class="fan-chip-name">${esc(f.name)}</span>
          <button class="friend-btn is-primary" type="button" data-tambah="${esc(f.code)}">＋ Tambah</button>
        </a>`).join('')
      : '<p class="friends-empty">Jadi fans berikutnya yang bergabung!</p>';
  } catch {
    list.innerHTML = '<p class="friends-empty">Gagal memuat data teman.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initLoginPage();
  initProfilePage();
});

/* =============================================================
   AVATAR BUILDER — pilih 🎨 desain (emoji + gradasi) atau
   🖼️ foto (upload di hero / URL Showroom). Pilihan ikut disimpan
   ke akun lewat PATCH /api/me (field avatarDesain).
   ============================================================= */
const AVATAR_EMOJI = ['🐰', '🐱', '🦊', '🐼', '🐯', '🐻', '🐷', '🐸', '🐧', '🐤', '🦄', '🐢', '🐙', '🦋', '🌸', '🌻', '🍓', '🍰', '🍭', '⭐', '💖', '🎀', '✨', '🌙'];
let avatarState = { mode: 'desain', e: '🐰', g: 'pink' };

function perbaruiPreviewAvatar(profile) {
  const preview = profile.querySelector('#avatarPreview');
  if (!preview) return;
  const pakaiFoto = avatarState.mode === 'foto' && ((profile.querySelector('#avatarFotoUrl') || {}).value || '').trim();
  if (pakaiFoto) {
    preview.style.backgroundImage = `url(${pakaiFoto})`;
    preview.textContent = '';
    return;
  }
  if (typeof terapkanAvatar === 'function') terapkanAvatar(preview, { avatarDesain: avatarState });
}

function setAvatarState(desain) {
  if (!desain) return;
  avatarState = {
    mode: desain.mode === 'foto' ? 'foto' : 'desain',
    e: desain.e || '🐰',
    g: desain.g || 'pink',
  };
  const profile = document.querySelector('#profilePage');
  if (!profile) return;
  profile.querySelectorAll('input[name="avatarMode"]').forEach((radio) => { radio.checked = radio.value === avatarState.mode; });
  profile.querySelectorAll('#avatarEmojiGrid [data-emoji]').forEach((b) => b.classList.toggle('is-active', b.dataset.emoji === avatarState.e));
  profile.querySelectorAll('#avatarGradientGrid [data-g]').forEach((b) => b.classList.toggle('is-active', b.dataset.g === avatarState.g));
  profile.querySelector('#avatarPanelDesain').hidden = avatarState.mode !== 'desain';
  profile.querySelector('#avatarPanelFoto').hidden = avatarState.mode !== 'foto';
  perbaruiPreviewAvatar(profile);
}

function getAvatarState() {
  return { ...avatarState };
}

function initAvatarBuilder(profile) {
  const emojiGrid = profile.querySelector('#avatarEmojiGrid');
  const gradientGrid = profile.querySelector('#avatarGradientGrid');
  if (!emojiGrid || !gradientGrid) return;

  emojiGrid.innerHTML = AVATAR_EMOJI.map((e) => `<button type="button" class="avatar-emoji${e === avatarState.e ? ' is-active' : ''}" data-emoji="${e}">${e}</button>`).join('');
  gradientGrid.innerHTML = Object.keys(typeof AVATAR_GRADIEN === 'object' ? AVATAR_GRADIEN : {}).map((kunci) => `<button type="button" class="avatar-gradient${kunci === avatarState.g ? ' is-active' : ''}" data-g="${kunci}" style="background-image:${AVATAR_GRADIEN[kunci]}" aria-label="${kunci}"></button>`).join('');

  emojiGrid.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-emoji]');
    if (!btn) return;
    avatarState.e = btn.dataset.emoji;
    avatarState.mode = 'desain';
    setAvatarState(avatarState);
  });
  gradientGrid.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-g]');
    if (!btn) return;
    avatarState.g = btn.dataset.g;
    avatarState.mode = 'desain';
    setAvatarState(avatarState);
  });

  profile.querySelectorAll('input[name="avatarMode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      avatarState.mode = radio.checked ? radio.value : avatarState.mode;
      profile.querySelectorAll('.avatar-mode').forEach((label) => label.classList.toggle('is-active', label.querySelector('input').checked));
      profile.querySelector('#avatarPanelDesain').hidden = avatarState.mode !== 'desain';
      profile.querySelector('#avatarPanelFoto').hidden = avatarState.mode !== 'foto';
      perbaruiPreviewAvatar(profile);
    });
  });

  const urlInput = profile.querySelector('#avatarFotoUrl');
  urlInput?.addEventListener('input', () => perbaruiPreviewAvatar(profile));

  /* Upload file dari hero ikut memindahkan mode ke foto otomatis. */
  const pictureInput = profile.querySelector('#profilePicture');
  pictureInput?.addEventListener('change', () => {
    if (!pictureInput.files?.length) return;
    avatarState.mode = 'foto';
    profile.querySelectorAll('input[name="avatarMode"]').forEach((r) => { r.checked = r.value === 'foto'; });
    profile.querySelectorAll('.avatar-mode').forEach((label) => label.classList.toggle('is-active', label.querySelector('input').checked));
    profile.querySelector('#avatarPanelDesain').hidden = true;
    profile.querySelector('#avatarPanelFoto').hidden = false;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLoginPage();
  initProfilePage();
});
