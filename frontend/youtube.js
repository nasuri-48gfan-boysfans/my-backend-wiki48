/* =============================================================
   youtube.js — halaman "Video YouTube Resmi"
   Data dari /api/youtube/videos (hasil webhook WebSub yang
   disimpan backend ke Supabase). Filter per channel dibangun
   dinamis dari data yang ada — bukan daftar manual.
   ============================================================= */

const ytState = { items: [], channel: 'ALL' };

const NAMA_CHANNEL = {
  'UCaIbbu5Xg3DpHsn_3Zw2m9w': 'JKT48',
  'UCadv-UfEyjjwOPcZHc2QvIQ': 'JKT48 TV',
  'UCG-5D9k_fL4FnMeNuraeAtA': 'SKE48',
  'UCnhrIe3jZNmqDEL_zSBXADQ': 'NMB48',
  'UCPQ0GEWwLaam1lTX9P-CgGA': 'HKT48',
  'UCIfuY0NRq1szr_6tzFy23NQ': 'NGT48',
  'UCa8GISK9_hsZ8aEJEL1u1Sg': 'STU48',
  'UClIsaGq7vBEW00ASqwQyzPw': 'BNK48',
  'UC0ca9IoigIsaRJL5nF3p3pw': 'TSH48',
  'UCajEDiZYhD_9NbFA3nqFYjw': 'TPE48',
  'UCxk6_F4aXUG6EkVvjFj0Ryg': 'CGM48',
  'UCVOBJSAK2wqQD9Lm1rE-TdQ': 'KLP48',
  'UCfmrcEdes7yDtEISGPM1T-A': 'AKB48',
};

function tanggalVideo(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function kartuVideo(v) {
  const namaChannel = NAMA_CHANNEL[v.channel_id] || v.channel_id;
  const thumb = `https://i.ytimg.com/vi/${encodeURIComponent(v.video_id)}/mqdefault.jpg`;
  const tgl = tanggalVideo(v.published_at || v.updated_at);
  return `<a class="yt-card" href="${esc(v.video_url)}" target="_blank" rel="noopener noreferrer">
    <span class="yt-thumb-wrap"><img class="yt-thumb" src="${esc(thumb)}" alt="" loading="lazy"
      onerror="this.style.display='none'" /></span>
    <span class="yt-card-body">
      <span class="yt-channel">${esc(namaChannel)}</span>
      <span class="yt-title">${esc(v.title)}</span>
      <span class="yt-meta">${esc(tgl)}</span>
    </span>
  </a>`;
}

async function muatVideoYouTube() {
  const grid = $('#ytGrid');
  const sync = $('#ytSync');
  if (!grid) return;
  grid.innerHTML = '<div class="stage-loading"><span class="live-dot"></span>Mengambil video…</div>';
  try {
    const response = await window.wiki48Fetch('/api/youtube/videos?limit=48');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    ytState.items = Array.isArray(payload.items) ? payload.items : [];

    /* Baris filter channel dari data nyata. */
    const baris = $('#ytChannelRow');
    if (baris) {
      const ids = [...new Set(ytState.items.map((v) => v.channel_id))];
      if (!baris.dataset.dibangun) {
        baris.innerHTML = ['ALL', ...ids].map((id) => `<button class="filter-chip${id === ytState.channel ? ' is-active' : ''}" type="button" data-channel="${esc(id)}">${id === 'ALL' ? 'Semua' : esc(NAMA_CHANNEL[id] || id)}</button>`).join('');
        baris.dataset.dibangun = '1';
        baris.addEventListener('click', (event) => {
          const chip = event.target.closest('[data-channel]');
          if (!chip) return;
          ytState.channel = chip.dataset.channel;
          baris.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
          renderVideo();
        });
      }
    }
    renderVideo();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state"><p class="empty-title">Video tidak bisa dimuat</p><p class="empty-sub">${esc(error.message)}</p></div>`;
    if (sync) sync.textContent = 'Gagal memuat';
  }

  function renderVideo() {
    const sumber = ytState.channel === 'ALL'
      ? ytState.items
      : ytState.items.filter((v) => v.channel_id === ytState.channel);

    if (sync) sync.textContent = `${sumber.length} video`;

    /* Kelompokkan per channel — tiap channel dapat KARTU sendiri
       berisi video terbarunya, diurutkan dari yang terbaru upload. */
    const perChannel = new Map();
    for (const v of sumber) {
      if (!perChannel.has(v.channel_id)) perChannel.set(v.channel_id, []);
      perChannel.get(v.channel_id).push(v);
    }
    const urutan = [...perChannel.entries()].sort((a, b) => {
      const ta = Math.max(...a[1].map((v) => new Date(v.published_at || v.updated_at || 0).getTime()));
      const tb = Math.max(...b[1].map((v) => new Date(v.published_at || v.updated_at || 0).getTime()));
      return tb - ta;
    });

    if (urutan.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p class="empty-title">Belum ada video</p><p class="empty-sub">Webhook belum menerima upload baru untuk filter ini.</p></div>';
      return;
    }

    grid.innerHTML = urutan.map(([channelId, daftar]) => {
      const nama = NAMA_CHANNEL[channelId] || channelId;
      return `<section class="yt-channel-card">
        <header class="yt-channel-head">
          <h2 class="yt-channel-name">${esc(nama)}</h2>
          <span class="yt-channel-count">${daftar.length} video terbaru</span>
        </header>
        <div class="yt-grid yt-grid-inner">
          ${daftar.map(kartuVideo).join('')}
        </div>
      </section>`;
    }).join('');
  }
}

function initHalamanYouTube() {
  setFooterYear();
  initI18n();
  initDrawer();
  muatVideoYouTube();
  const refresh = $('#ytRefresh');
  if (refresh) refresh.addEventListener('click', muatVideoYouTube);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHalamanYouTube);
else initHalamanYouTube();
