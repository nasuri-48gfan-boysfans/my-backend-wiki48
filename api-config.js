/* Set this to the public Express URL when frontend and backend use different domains. */
window.WIKI48_API_BASE = '';

window.wiki48ApiUrl = function wiki48ApiUrl(path) {
  return `${window.WIKI48_API_BASE.replace(/\/$/, '')}${path}`;
};

/* Saat halaman dibuka dari selain server API (file://, VS Code Live Server,
   dsb.) path relatif /api/* pasti gagal. Sediakan daftar kandidat alamat
   API supaya client bisa mencari server yang hidup sendiri. Di hosting
   produksi same-origin selalu benar, jadi daftar ini tidak dibuat. */
(function apiKandidat() {
  const proto = window.location.protocol;
  const host = window.location.hostname;
  const diFile = proto === 'file:';
  const diLocalHttp = /^https?:$/.test(proto) && /^(localhost|127\.0\.0\.1)$/.test(host);
  if (!diFile && !diLocalHttp) return;
  const daftar = [];
  if (diLocalHttp) daftar.push('');
  ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8787'].forEach((url) => {
    if (!daftar.includes(url)) daftar.push(url);
  });
  window.WIKI48_API_CANDIDATES = daftar;
})();
