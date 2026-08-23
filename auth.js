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
  apiRequest('/api/me')
    .then(({ user }) => {
      name.textContent = user.name;
      email.textContent = user.email;
      nameInput.value = user.name;
      joined.textContent = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(user.joinedAt));
    })
    .catch(() => { window.location.replace('login.html'); });

  profile.querySelector('#profileForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const updatedName = nameInput.value.trim();
    if (!updatedName) return;
    apiRequest('/api/me', { method: 'PATCH', body: JSON.stringify({ name: updatedName }) })
      .then(({ user }) => { name.textContent = user.name; profile.querySelector('#profileSaved').hidden = false; })
      .catch((saveError) => { profile.querySelector('#profileSaved').textContent = saveError.message; profile.querySelector('#profileSaved').hidden = false; });
  });

  profile.querySelector('#logoutButton').addEventListener('click', () => {
    apiRequest('/api/auth/logout', { method: 'POST' }).finally(() => { window.location.href = 'login.html'; });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLoginPage();
  initProfilePage();
});
