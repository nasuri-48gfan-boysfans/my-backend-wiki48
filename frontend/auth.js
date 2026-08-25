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
    const body = { name: registerForm.elements.name.value.trim(), email: registerForm.elements.email.value.trim(), password: registerForm.elements.password.value };
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
      profilePicture = user.profilePicture || '';
      oshiReasons = { ...loadOshiReasons(), ...(user.oshiReasons || {}) };
      if (profilePicture) { avatar.textContent = ''; avatar.style.backgroundImage = `url(${profilePicture})`; }
      renderProfileOshi();
      const locale = { id: 'id-ID', en: 'en-GB', ja: 'ja-JP', th: 'th-TH', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', ms: 'ms-MY' }[currentUiCode()] || 'id-ID';
      joined.textContent = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(user.joinedAt));
    })
    .catch(() => { window.location.replace('login.html'); });

  profile.querySelector('#profileForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const updatedName = nameInput.value.trim();
    if (!updatedName) return;
    apiRequest('/api/me', { method: 'PATCH', body: JSON.stringify({ name: updatedName, profilePicture, oshiReasons }) })
      .then(({ user }) => { name.textContent = user.name; profile.querySelector('#profileSaved').hidden = false; })
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
}

document.addEventListener('DOMContentLoaded', () => {
  initLoginPage();
  initProfilePage();
});
