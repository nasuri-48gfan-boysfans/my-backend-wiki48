/* =============================================================
   premium.js — halaman langganan WIKI48 Premium
   Alur: pilih paket → transfer/QRIS → tempel link bukti → kirim
   → admin ACC → server menambah premium_until (otomatis kedaluwarsa).
   apiRequest() dipinjam dari auth.js.
   ============================================================= */

let planTerpilih = 'bulan';

function rupiah(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

async function muatInfoPremium() {
  try {
    const info = await apiRequest('/api/premium/info');
    const hb = document.querySelector('#hargaBulan');
    const ht = document.querySelector('#hargaTahun');
    if (hb) hb.textContent = rupiah(info.harga.bulan);
    if (ht) ht.textContent = rupiah(info.harga.tahun);
    const instruksi = document.querySelector('#premiumInstruksi');
    if (instruksi) instruksi.textContent = info.instruksi;
    const qris = document.querySelector('#premiumQris');
    if (qris && info.qrisUrl) { qris.src = info.qrisUrl; qris.hidden = false; }
  } catch { /* biarkan teks default */ }
}

async function muatStatusPremium() {
  const form = document.querySelector('#premiumForm');
  const cta = document.querySelector('#premiumLoginCta');
  const box = document.querySelector('#premiumStateBox');
  if (!form || !cta || !box) return;
  try {
    const data = await apiRequest('/api/premium/status');
    form.hidden = false;
    if (data.premiumUntil) {
      box.hidden = false;
      box.classList.add('is-aktif');
      box.innerHTML = `💎 Premium aktif sampai <strong>${new Date(data.premiumUntil).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. Terima kasih!`;
    } else if (data.pending) {
      box.hidden = false;
      box.innerHTML = `⏳ Pengajuan <strong>${data.pending.plan}</strong> (${rupiah(data.pending.amount)}) sedang diperiksa admin.`;
    } else {
      box.hidden = true;
    }
  } catch {
    /* belum login */
    form.hidden = true;
    cta.hidden = false;
    box.hidden = true;
  }
}

function initPremiumPage() {
  const form = document.querySelector('#premiumForm');
  if (!form) return;

  document.querySelectorAll('[data-pilih]').forEach((btn) => {
    btn.addEventListener('click', () => {
      planTerpilih = btn.dataset.pilih;
      document.querySelectorAll('.price-card').forEach((c) => c.classList.toggle('is-picked', c.querySelector('[data-pilih]')?.dataset.pilih === planTerpilih));
      window.scrollTo({ top: document.querySelector('#payTitle')?.offsetTop || 0, behavior: 'smooth' });
    });
  });

  muatInfoPremium();
  muatStatusPremium();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = document.querySelector('#premiumMsg');
    const tombol = form.querySelector('.auth-submit');
    tombol.disabled = true;
    msg.hidden = false;
    msg.className = 'profile-saved';
    msg.textContent = 'Mengirim pengajuan…';
    try {
      await apiRequest('/api/premium/request', { method: 'POST', body: JSON.stringify({ plan: planTerpilih, bukti: document.querySelector('#premBukti').value.trim() }) });
      msg.textContent = '✅ Pengajuan terkirim! Admin akan memeriksa maksimal 1×24 jam.';
      await muatStatusPremium();
    } catch (error) {
      msg.className = 'auth-error';
      msg.textContent = error.message;
      tombol.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPremiumPage();
});
