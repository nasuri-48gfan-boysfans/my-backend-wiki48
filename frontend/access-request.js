async function submitAccessRequest(payload) {
  const response = await fetch(window.wiki48ApiUrl('/api/access-requests'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  let data;
  try { data = JSON.parse(body); } catch (error) { throw new Error('Backend API belum terhubung. Form ini harus dijalankan dari server Express.'); }
  if (!response.ok) throw new Error(data.error || 'Pengajuan gagal dikirim.');
  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#accessRequestForm');
  const result = document.querySelector('#accessRequestResult');
  const year = document.querySelector('#year');
  if (year) year.textContent = new Date().getFullYear();
  if (!form || !result) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    result.className = 'access-request-status';
    result.textContent = uiCardText('sendingRequest');
    const formData = new FormData(form);
    try {
      await submitAccessRequest({
        name: formData.get('name'),
        email: formData.get('email'),
        country: formData.get('country'),
        accessLevel: formData.get('accessLevel'),
        reason: formData.get('reason'),
        experience: formData.get('experience'),
        agreedRules: formData.get('agreedRules') === 'on',
      });
      form.reset();
      result.className = 'access-request-status is-success';
      result.textContent = uiCardText('requestReceived');
    } catch (error) {
      result.className = 'access-request-status is-error';
      result.textContent = error.message;
    }
  });
});
