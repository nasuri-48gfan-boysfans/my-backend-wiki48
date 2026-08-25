async function adminApi(url, options) {
  const response = await fetch(window.wiki48ApiUrl(url), { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  const body = response.status === 204 ? '' : await response.text();
  let data = null;
  if (body) {
    try { data = JSON.parse(body); } catch (error) { throw new Error('Backend API admin belum terhubung.'); }
  }
  if (!response.ok) throw new Error(data?.error || 'Permintaan admin gagal.');
  return data;
}

function requestCard(item) {
  const countryNames = { ID: uiCardText('optID'), JP: uiCardText('optJP'), TH: uiCardText('optTH'), CN: uiCardText('optCN'), TW: uiCardText('optTW'), MY: uiCardText('optMY'), OTHER: uiCardText('optOther') };
  const levels = { reader: uiCardText('levelReader'), contributor: uiCardText('levelContributor'), editor: uiCardText('levelEditor') };
  const locale = { id: 'id-ID', en: 'en-GB', ja: 'ja-JP', th: 'th-TH', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', ms: 'ms-MY' }[currentUiCode()] || 'id-ID';
  return `<article class="request-card"><div class="request-card-head"><div><span class="request-country">${countryNames[item.country_code] || item.country_code}</span><h2>${escapeAdmin(item.name)}</h2><a href="mailto:${escapeAdmin(item.email)}">${escapeAdmin(item.email)}</a></div><span class="request-status request-status-${item.status}">${item.status}</span></div><dl><div><dt>${escapeAdmin(uiCardText('accessLabel'))}</dt><dd>${levels[item.access_level] || item.access_level}</dd></div><div><dt>${escapeAdmin(uiCardText('submittedLabel'))}</dt><dd>${new Date(item.created_at).toLocaleString(locale)}</dd></div></dl><p class="request-reason">${escapeAdmin(item.reason)}</p>${item.experience ? `<p class="request-experience"><strong>${escapeAdmin(uiCardText('experiencePrefix'))}</strong> ${escapeAdmin(item.experience)}</p>` : ''}<div class="request-actions"><button data-id="${item.id}" data-status="approved" type="button">${escapeAdmin(uiCardText('approveBtn'))}</button><button data-id="${item.id}" data-status="rejected" type="button">${escapeAdmin(uiCardText('rejectBtn'))}</button></div></article>`;
}

function escapeAdmin(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function loadRequests() {
  const list = document.querySelector('#requestList');
  if (!list) return;
  const status = document.querySelector('#requestStatus').value;
  list.innerHTML = `<p class="community-loading">${escapeAdmin(uiCardText('loadingRequests'))}</p>`;
  try {
    const data = await adminApi(`/api/admin/access-requests?status=${status}`);
    list.innerHTML = data.requests.length ? data.requests.map(requestCard).join('') : `<p class="community-loading">${escapeAdmin(uiCardText('noRequestsStatus'))}</p>`;
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
  document.addEventListener('wiki48-language-change', loadRequests);
  loadRequests();
}

/* Tombol "Update Data Member": memicu /api/cron/update-members dengan
   sesi admin (tanpa CRON_SECRET di frontend — itu rahasia server). */
function initUpdateMembers() {
  const button = document.querySelector('#updateMembersBtn');
  const status = document.querySelector('#updateMembersStatus');
  if (!button || !status) return;

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const labelAsli = button.textContent;
    button.disabled = true;
    button.classList.add('is-busy');
    button.textContent = '⟳ Memperbarui…';
    status.className = 'admin-message';
    status.textContent = 'Mengambil data member terbaru dari sumber resmi…';

    try {
      const data = await adminApi('/api/cron/update-members', { method: 'POST' });
      status.classList.add('is-ok');
      const ringkas = [
        `member: ${data.members}`,
        `live: ${data.live}`,
        `supabase: ${data.supabase}`,
        `${data.duration_ms} ms`,
      ].join(' · ');
      status.textContent = `✅ ${data.message} (${ringkas})`;
      if (window.showToast) window.showToast('Data member berhasil diperbarui.', 'ok');
    } catch (error) {
      status.classList.add('is-error');
      status.textContent = error.message.includes('Login admin')
        ? 'Sesi admin habis — muat ulang halaman untuk masuk kembali.'
        : `❌ ${error.message}`;
      if (window.showToast) window.showToast('Gagal memperbarui data member.', 'warn');
    } finally {
      button.disabled = false;
      button.classList.remove('is-busy');
      button.textContent = labelAsli;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => { initAdminLogin(); initAdminPage(); initUpdateMembers(); });
