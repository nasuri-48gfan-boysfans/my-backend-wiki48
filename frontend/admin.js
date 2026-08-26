async function adminApi(url, options) {
  const response = await fetch(window.wiki48ApiUrl(url), { credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...options });
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

/* ---------- PREMIUM: verifikasi bukti transfer & ACC ---------- */
function premiumCard(item) {
  const locale = { id: 'id-ID' }[currentUiCode()] || 'id-ID';
  const sisa = item.premium_until ? new Date(item.premium_until) > new Date() : false;
  return `<article class="request-card"><div class="request-card-head"><div><span class="request-country">${item.plan === 'tahun' ? 'TAHUN' : 'BULAN'} · ${rupiahAdmin(item.amount)}</span><h2>${escapeAdmin(item.name)}</h2><a href="fan.html?id=${escapeAdmin(item.public_code)}">${escapeAdmin(item.public_code)}</a></div><span class="request-status request-status-${item.status}">${item.status}</span></div><dl><div><dt>Bukti</dt><dd>${item.bukti ? `<a href="${escapeAdmin(item.bukti)}" target="_blank" rel="noopener">buka bukti transfer ↗</a>` : 'tidak dilampirkan'}</dd></div><div><dt>Diajukan</dt><dd>${new Date(item.created_at).toLocaleString(locale)}</dd></div><div><dt>Premium s.d.</dt><dd>${item.premium_until ? `${new Date(item.premium_until).toLocaleDateString(locale)}${sisa ? ' (aktif)' : ' (kedaluwarsa)'}` : 'belum pernah'}</dd></div></dl>${item.status === 'pending' ? `<div class="request-actions"><button data-prem-id="${item.id}" data-decide="approve" type="button">✓ ACC Premium</button><button data-prem-id="${item.id}" data-decide="reject" type="button">Tolak</button></div>` : ''}</article>`;
}

function rupiahAdmin(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

async function loadPremium() {
  const list = document.querySelector('#premiumList');
  if (!list) return;
  try {
    const data = await adminApi('/api/admin/premium-requests?status=all');
    list.innerHTML = data.requests.length ? data.requests.map(premiumCard).join('') : '<p class="community-loading">Belum ada pengajuan premium.</p>';
  } catch (error) {
    list.innerHTML = `<p class="admin-message is-error">${escapeAdmin(error.message)}</p>`;
  }
}

function initPremiumAdmin() {
  const list = document.querySelector('#premiumList');
  if (!list) return;
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-prem-id]');
    if (!button) return;
    button.disabled = true;
    try {
      await adminApi(`/api/admin/premium-requests/${button.dataset.premId}/decide`, { method: 'POST', body: JSON.stringify({ keputusan: button.dataset.decide }) });
      if (window.showToast) window.showToast(button.dataset.decide === 'approve' ? 'Premium diaktifkan!' : 'Pengajuan ditolak.', button.dataset.decide === 'approve' ? 'ok' : 'warn');
      await loadPremium();
    } catch (error) {
      document.querySelector('#adminMessage').textContent = error.message;
      button.disabled = false;
    }
  });
  loadPremium();
}

document.addEventListener('DOMContentLoaded', () => { initAdminLogin(); initAdminPage(); initUpdateMembers(); initPremiumAdmin(); });
