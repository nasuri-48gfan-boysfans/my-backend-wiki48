/* uji-directory.js — uji logika dropdown kategori+grup di Member Directory.
   DEV-ONLY: jangan pernah dipasang lewat <script src>. Jalankan:

       node data/tools/uji-directory.js

   (dev-only, tidak dipakai situs).
   Memuat common.js + script.js di sandbox vm dengan DOM tiruan seadanya,
   lalu memeriksa invarian yang penting:
   - setiap angka yang tertulis di opsi dropdown = jumlah member yang benar-benar
     lolos filter untuk opsi itu
   - scope bisa digabung dengan pencarian dan filter status
   - deep-link ?group=<slug> memilih grup yang tepat (termasuk slug != id)
   - URL ditulis ulang memakai slug, bukan id
*/
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const DIR = process.argv[2] || path.resolve(__dirname, '..', '..', '..', 'frontend');
let gagal = 0;
const cek = (nama, dapat, harap) => {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (!ok) gagal += 1;
  console.log(`${ok ? 'OK  ' : 'GAGAL'} ${nama}${ok ? '' : `\n        dapat  : ${JSON.stringify(dapat)}\n        harusnya: ${JSON.stringify(harap)}`}`);
};

/* ---------- DOM tiruan ---------- */
function buatElemen(id) {
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    dataset: {},
    _kelas: new Set(),
    classList: {
      toggle(k, on) { if (on) this._o._kelas.add(k); else this._o._kelas.delete(k); },
      add(k) { this._o._kelas.add(k); },
      remove(k) { this._o._kelas.delete(k); },
      contains(k) { return this._o._kelas.has(k); },
    },
    _listener: {},
    addEventListener(ev, fn) { this._listener[ev] = fn; },
    querySelectorAll() { return []; },
    setAttribute() {},
    getAttribute() { return null; },
    appendChild() {},
    remove() {},
    scrollIntoView() {},
  };
}

function buatKonteks(opsi) {
  const punya = new Set(opsi.elemen);
  const cache = new Map();
  const ambil = (sel) => {
    const id = String(sel).replace(/^#/, '');
    if (!punya.has(id)) return null;
    if (!cache.has(id)) {
      const el = buatElemen(id);
      el.classList._o = el;
      cache.set(id, el);
    }
    return cache.get(id);
  };

  const lokasi = { href: opsi.href, pathname: '/members.html', search: '', hash: '' };
  const u = new URL(opsi.href);
  lokasi.pathname = u.pathname;
  lokasi.search = u.search;
  lokasi.hash = u.hash;

  const dicatat = [];
  const win = {
    location: lokasi,
    history: { replaceState: (a, b, url) => dicatat.push(url) },
    setTimeout: () => 0,
    addEventListener: () => {},
    localStorage: {
      _d: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; },
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };

  const doc = {
    readyState: 'loading',   // supaya init() tidak jalan otomatis
    documentElement: buatElemen('html'),
    body: buatElemen('body'),
    addEventListener: () => {},
    getElementById: (id) => ambil(id),
    querySelector: (sel) => ambil(sel),
    querySelectorAll: () => [],
    createElement: (tag) => buatElemen(tag),
  };

  const ctx = {
    window: win,
    document: doc,
    localStorage: win.localStorage,
    navigator: { userAgent: 'node' },
    URL,
    URLSearchParams,
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    Date,
    Math,
    JSON,
    Intl,
    _urlDitulis: dicatat,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  for (const f of ['common.js', 'script.js']) {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  }
  // `const state` di script.js hidup di lexical scope, bukan jadi properti
  // global sandbox — ambil rujukannya lewat evaluasi.
  ctx._state = vm.runInContext('state', ctx);
  return ctx;
}

/* ---------- 1. Angka di opsi harus benar ---------- */
const ctx = buatKonteks({ href: 'https://x/members.html', elemen: ['categorySelect', 'memberGrid', 'memberCount', 'directoryTitle', 'activeFilter'] });
const html = ctx.opsiScopeHTML();

const opsiValue = [...html.matchAll(/<option value="([^"]+)">([^<]*)<\/option>/g)].map((m) => ({ value: m[1], label: m[2] }));
const optgroups = [...html.matchAll(/<optgroup label="([^"]+)">/g)].map((m) => m[1]);

cek('jumlah opsi = 1 (semua) + 2 kategori + 12 grup', opsiValue.length, 15);
cek('label optgroup dari KATEGORI_GRUP', optgroups, ['Domestik (Jepang)', 'Kaigai (Luar Jepang)']);
cek('opsi pertama = all', opsiValue[0].value, 'all');
cek('urutan kategori: domestic dulu', opsiValue[1].value, 'cat:domestic');
cek('slug != id dipakai id di value', opsiValue.some((o) => o.value === 'group:akb48tsh'), true);
cek('tidak ada value memakai slug akb48-team-sh', opsiValue.some((o) => o.value.includes('akb48-team-sh')), false);

/* Invarian utama: angka di label = jumlah hasil filter untuk opsi itu. */
let bedaAngka = [];
for (const o of opsiValue) {
  const angka = /·\s*(\d+) member/.exec(o.label);
  ctx._state.query = '';
  ctx._state.statusFilter = 'all';
  ctx._state.scopeFilter = o.value;
  const nyata = ctx.filteredMembers().length;
  if (!angka) {
    if (nyata !== 0) bedaAngka.push(`${o.value}: label "${o.label}" tanpa angka padahal ada ${nyata} member`);
  } else if (Number(angka[1]) !== nyata) {
    bedaAngka.push(`${o.value}: label ${angka[1]} vs hasil filter ${nyata}`);
  }
}
cek('angka tiap opsi = hasil filter sesungguhnya', bedaAngka, []);

/* ---------- 2. Hitungan spesifik ---------- */
const hitung = (scope, q, status) => {
  ctx._state.scopeFilter = scope;
  ctx._state.query = q || '';
  ctx._state.statusFilter = status || 'all';
  return ctx.filteredMembers().length;
};
cek('all = 451', hitung('all'), 451);
cek('cat:domestic = 48+56+52+39+36+45', hitung('cat:domestic'), 276);
cek('cat:kaigai = 59+37+15+20+23+21', hitung('cat:kaigai'), 175);
cek('domestic + kaigai = total', hitung('cat:domestic') + hitung('cat:kaigai'), 451);
cek('group:hkt48 = 39', hitung('group:hkt48'), 39);
cek('group:akb48tsh = 15', hitung('group:akb48tsh'), 15);
cek('scope grup + pencarian menyaring lagi', hitung('group:hkt48', 'zzz') , 0);
cek('scope tidak dikenal dianggap all', hitung('group:tidak-ada'), 0);
cek('nilai kosong/aneh jatuh ke all', hitung('sembarang'), 451);

/* Inilah alasan deep-link tidak lagi memakai kotak pencarian:
   "AKB48" sebagai teks juga menjaring member AKB48 Team SH. */
const lewatTeks = hitung('all', 'AKB48');
cek('query "AKB48" menjaring lintas grup (48 + 15)', lewatTeks, 63);
cek('scope group:akb48 hanya 48', hitung('group:akb48'), 48);

/* ---------- 3. Deep-link ---------- */
const a = buatKonteks({ href: 'https://x/members.html?group=akb48-team-sh#directory', elemen: ['categorySelect', 'memberGrid', 'memberCount', 'directoryTitle', 'activeFilter', 'searchInput'] });
a.applyGroupFromURL();
cek('halaman dengan dropdown: scope terisi id grup', a._state.scopeFilter, 'group:akb48tsh');
cek('halaman dengan dropdown: kotak pencarian TIDAK diisi', a._state.query, '');

const b = buatKonteks({ href: 'https://x/index.html?group=akb48-team-sh#directory', elemen: ['memberGrid', 'memberCount', 'activeFilter', 'searchInput'] });
b.applyGroupFromURL();
cek('halaman tanpa dropdown: jalur lama tetap jalan', [b._state.scopeFilter, b._state.query], ['all', 'AKB48 Team SH']);

const c = buatKonteks({ href: 'https://x/members.html?group=ngawur', elemen: ['categorySelect'] });
c.applyGroupFromURL();
cek('slug tidak dikenal diabaikan', c._state.scopeFilter, 'all');

/* ---------- 4. initCategorySelect + sinkron URL ---------- */
const d = buatKonteks({ href: 'https://x/members.html?group=hkt48#directory', elemen: ['categorySelect', 'memberGrid', 'memberCount', 'directoryTitle', 'activeFilter'] });
d.applyGroupFromURL();
d.initCategorySelect();
const sel = d.document.querySelector('#categorySelect');
cek('select ikut memilih grup dari URL', sel.value, 'group:hkt48');
cek('opsi ditulis ke select', sel.innerHTML.includes('<optgroup'), true);

sel.value = 'cat:kaigai';
sel._listener.change();
cek('ganti pilihan mengubah state', d._state.scopeFilter, 'cat:kaigai');
cek('URL membuang ?group= saat scope kategori', d._urlDitulis.at(-1), '/members.html#directory');

sel.value = 'group:akb48tsh';
sel._listener.change();
cek('URL memakai slug, bukan id', d._urlDitulis.at(-1), '/members.html?group=akb48-team-sh#directory');

sel.value = 'all';
sel._listener.change();
cek('URL bersih saat semua kategori', d._urlDitulis.at(-1), '/members.html#directory');

/* Judul section & penanda visual ikut scope. */
const judul = d.document.querySelector('#directoryTitle');
d._state.scopeFilter = 'group:hkt48';
d.renderDirectory();
cek('judul section ikut grup', judul.textContent, 'Member HKT48');
cek('select ditandai is-active', sel.classList.contains('is-active'), true);
d._state.scopeFilter = 'cat:domestic';
d.renderDirectory();
cek('judul section ikut kategori', judul.textContent, 'Member Domestik');
d._state.scopeFilter = 'all';
d.renderDirectory();
cek('judul kembali netral', judul.textContent, 'Semua member');
cek('penanda is-active dilepas', sel.classList.contains('is-active'), false);
cek('hitungan tanpa filter apa pun', d.document.querySelector('#memberCount').textContent, '451 member');
d._state.scopeFilter = 'group:hkt48';
d.renderDirectory();
cek('hitungan saat discope', d.document.querySelector('#memberCount').textContent, '39 dari 451 member');

/* Pesan kosong menyebut penyebabnya. */
d._state.scopeFilter = 'group:hkt48';
d._state.query = 'zzz';
d.renderDirectory();
const kosong = d.document.querySelector('#memberGrid').innerHTML;
cek('pesan kosong menyebut query + grup', /cocok dengan .*zzz.* di HKT48/.test(kosong), true);

/* ---------- 5. Nilai scope yang tidak ada di daftar opsi ----------
   Browser mengosongkan select.value kalau nilainya tidak cocok dengan satu pun
   <option>. Tiru perilaku itu untuk menguji cabang pemulihan di
   initCategorySelect(): kontrol tidak boleh tampil kosong. */
const e = buatKonteks({ href: 'https://x/members.html', elemen: ['categorySelect', 'memberGrid', 'memberCount', 'directoryTitle', 'activeFilter'] });
const selE = e.document.querySelector('#categorySelect');
let simpanan = '';
Object.defineProperty(selE, 'value', {
  get() { return simpanan; },
  set(v) {
    const daftar = [...String(selE.innerHTML).matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    simpanan = daftar.includes(v) ? v : '';   // seperti browser sungguhan
  },
});
e._state.scopeFilter = 'group:grup-yang-sudah-dihapus';
e.initCategorySelect();
cek('scope tak dikenal dipulihkan ke all', [e._state.scopeFilter, selE.value], ['all', 'all']);


console.log(gagal ? `\n${gagal} uji GAGAL` : '\nSemua uji lolos.');
process.exit(gagal ? 1 : 0);
