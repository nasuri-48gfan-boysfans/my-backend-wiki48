async function adminApi(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || 'Permintaan admin gagal.');
  return data;
}

function requestCard(item) {
  const countryNames = { ID: 'Indonesia', JP: 'Jepang', TH: 'Thailand', CN: 'Tiongkok', TW: 'Taiwan', MY: 'Malaysia', OTHER: 'Lainnya' };
  const levels = { reader: 'Pembaca', contributor: 'Kontributor', editor: 'Editor' };
  return `<article class="request-card"><div class="request-card-head"><div><span class="request-country">${countryNames[item.country_code] || item.country_code}</span><h2>${escapeAdmin(item.name)}</h2><a href="mailto:${escapeAdmin(item.email)}">${escapeAdmin(item.email)}</a></div><span class="request-status request-status-${item.status}">${item.status}</span></div><dl><div><dt>Akses</dt><dd>${levels[item.access_level] || item.access_level}</dd></div><div><dt>Diajukan</dt><dd>${new Date(item.created_at).toLocaleString('id-ID')}</dd></div></dl><p class="request-reason">${escapeAdmin(item.reason)}</p>${item.experience ? `<p class="request-experience"><strong>Pengalaman:</strong> ${escapeAdmin(item.experience)}</p>` : ''}<div class="request-actions"><button data-id="${item.id}" data-status="approved" type="button">Setujui</button><button data-id="${item.id}" data-status="rejected" type="button">Tolak</button></div></article>`;
}

function escapeAdmin(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function loadRequests() {
  const list = document.querySelector('#requestList');
  if (!list) return;
  const status = document.querySelector('#requestStatus').value;
  list.innerHTML = '<p class="community-loading">Memuat pengajuan...</p>';
  try {
    const data = await adminApi(`/api/admin/access-requests?status=${status}`);
    list.innerHTML = data.requests.length ? data.requests.map(requestCard).join('') : '<p class="community-loading">Tidak ada pengajuan pada status ini.</p>';
  } catch (error) {
    if (error.message.includes('Login admin')) window.location.href = 'admin-login.html';
    list.innerHTML = `<p class="admin-message is-error">${escapeAdmin(error.message)}</p>`;
  }
}

function initAdminLogin() {
  const form = document.querySelector('#adminLoginForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#adminLoginError');
    try {
      await adminApi('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: form.elements.email.value, password: form.elements.password.value }) });
      window.location.href = 'admin.html';
    } catch (loginError) { error.textContent = loginError.message; }
  });
}

function initAdminPage() {
  const list = document.querySelector('#requestList');
  if (!list) return;
  document.querySelector('#requestStatus').addEventListener('change', loadRequests);
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    try {
      await adminApi(`/api/admin/access-requests/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.status }) });
      await loadRequests();
    } catch (error) { document.querySelector('#adminMessage').textContent = error.message; }
  });
  document.querySelector('#adminLogout').addEventListener('click', () => adminApi('/api/admin/logout', { method: 'POST' }).finally(() => { window.location.href = 'admin-login.html'; }));
  loadRequests();
}

document.addEventListener('DOMContentLoaded', () => { initAdminLogin(); initAdminPage(); });
