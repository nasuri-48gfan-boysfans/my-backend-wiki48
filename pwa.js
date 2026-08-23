let deferredInstallPrompt = null;

function createInstallBanner() {
  const banner = document.createElement('aside');
  banner.className = 'pwa-install-banner';
  banner.setAttribute('aria-label', 'Install WIKI48');
  banner.innerHTML = '<span class="pwa-install-icon" aria-hidden="true">48</span><span class="pwa-install-copy"><strong>Install WIKI48</strong><small>Akses lebih cepat dari home screen.</small></span><button class="pwa-install-button" type="button">Install</button><button class="pwa-install-close" type="button" aria-label="Tutup">×</button>';
  document.body.appendChild(banner);

  banner.querySelector('.pwa-install-button').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    banner.remove();
  });
  banner.querySelector('.pwa-install-close').addEventListener('click', () => banner.remove());
  requestAnimationFrame(() => banner.classList.add('is-visible'));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch((error) => console.warn('PWA service worker gagal:', error)));
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (!document.querySelector('.pwa-install-banner')) createInstallBanner();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.querySelector('.pwa-install-banner')?.remove();
});
