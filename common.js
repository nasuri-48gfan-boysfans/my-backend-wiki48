/* =============================================================
   IDOL & GROUP WIKI HUB — common.js
   Data + utilitas yang dipakai bersama oleh:
   - index.html  (script.js)  → Member Directory & My Oshi
   - groups.html (groups.js)  → Daftar Grup

   PENTING: file ini harus dimuat SEBELUM script.js / groups.js.
   ============================================================= */

/* -------------------------------------------------------------
   1. DATA GRUP
   accent: "pink" | "cyan" | "violet" | "amber"
   slug  : dipakai di URL → members.html?group=<slug>#directory
   category: "domestic" (Jepang) | "kaigai" (luar Jepang)
   site  : URL resmi grup — ditampilkan sebagai tombol di card grup
           dan dipakai generateGroupsGuide() di common.js
   ------------------------------------------------------------- */
const GROUPS = [
  {
    id: 'akb48',
    slug: 'akb48',
    name: 'AKB48',
    accent: 'pink',
    category: 'domestic',
    debut: 2005,
    base: 'Akihabara, Tokyo',
    tagline: 'Idol yang bisa kau temui — sister group pertama di Jepang.',
    site: 'https://www.akb48.co.jp/',
  },
  {
    id: 'ske48',
    slug: 'ske48',
    name: 'SKE48',
    accent: 'cyan',
    category: 'domestic',
    debut: 2008,
    base: 'Sakae, Nagoya',
    tagline: 'Kau bisa bertemu setiap hari di Theater Sakae.',
    site: 'https://ske48.co.jp/',
  },
  {
    id: 'nmb48',
    slug: 'nmb48',
    name: 'NMB48',
    accent: 'cyan',
    category: 'domestic',
    debut: 2010,
    base: 'Namba, Osaka',
    tagline: 'Basis Namba dengan gaya panggung khas Kansai yang enerjik.',
    site: 'http://www.nmb48.com/',
  },
  {
    id: 'hkt48',
    slug: 'hkt48',
    name: 'HKT48',
    accent: 'violet',
    category: 'domestic',
    debut: 2011,
    base: 'Hakata, Fukuoka',
    tagline: 'Grup berbasis Fukuoka dengan energi Kyushu.',
    site: 'https://www.hkt48.jp/',
  },
  {
    id: 'ngt48',
    slug: 'ngt48',
    name: 'NGT48',
    accent: 'amber',
    category: 'domestic',
    debut: 2015,
    base: 'Niigata',
    tagline: 'Grup pertama di Jepang yang tidak memiliki theater tetap.',
    site: 'https://ngt48.jp/',
  },
  {
    id: 'stu48',
    slug: 'stu48',
    name: 'STU48',
    accent: 'pink',
    category: 'domestic',
    debut: 2017,
    base: 'Kapal Setouchi (kru)',
    tagline: 'Berlayar di laut pedalaman Setouchi dengan konsep kapal.',
    site: 'https://sp.stu48.com/',
  },
  {
    id: 'jkt48',
    slug: 'jkt48',
    name: 'JKT48',
    accent: 'pink',
    category: 'kaigai',
    debut: 2011,
    base: 'Jakarta, Indonesia',
    tagline: 'Sister group pertama di luar Jepang, dengan theater harian di Jakarta.',
    site: 'https://jkt48.com/',
  },
  {
    id: 'bnk48',
    slug: 'bnk48',
    name: 'BNK48',
    accent: 'violet',
    category: 'kaigai',
    debut: 2017,
    base: 'Bangkok, Thailand',
    tagline: 'Sister group pertama di Asia Tenggara.',
    site: 'https://www.bnk48.com/',
  },
  {
    id: 'akb48tsh',
    slug: 'akb48-team-sh',
    name: 'AKB48 Team SH',
    accent: 'amber',
    category: 'kaigai',
    debut: 2018,
    base: 'Shanghai, Tiongkok',
    tagline: 'Sister group AKB48 untuk pasar Tiongkok.',
    site: 'https://weibo.com/akb48teamsh',
  },
  {
    id: 'tpe48',
    slug: 'tpe48',
    name: 'TPE48',
    accent: 'cyan',
    category: 'kaigai',
    debut: 2018,
    base: 'Taipei, Taiwan',
    tagline: 'AKB48 Group pertama di Taiwan.',
    site: 'https://www.tpe48.tw/',
  },
  {
    id: 'cgm48',
    slug: 'cgm48',
    name: 'CGM48',
    accent: 'pink',
    category: 'kaigai',
    debut: 2019,
    base: 'Chiang Mai, Thailand',
    tagline: 'Sister group BNK48 yang berbasis di Chiang Mai.',
    site: 'https://cgm48official.com/',
  },
  {
    id: 'klp48',
    slug: 'klp48',
    name: 'KLP48',
    accent: 'violet',
    category: 'kaigai',
    debut: 2024,
    base: 'Kuala Lumpur, Malaysia',
    tagline: 'Sister group terbaru AKB48 Group, berbasis di Kuala Lumpur.',
    site: 'https://klp48.my/',
  },
];

// Urutan tampilan di halaman Groups: Domestik → Kaigai.
// (URUTAN DISPLAY: category dulu, baru urutan pendaftaran di atas.)
const GROUP_ORDER = {
  domestic: 0,
  kaigai: 1,
};

/* Label kategori. Dipakai DUA halaman: heading blok di groups.html dan
   <optgroup> dropdown di members.html. Ditaruh di sini, bukan di masing-masing
   file halaman, supaya kategori yang sama tidak bisa berbunyi berbeda di dua
   tempat.

   title : untuk heading/optgroup yang berdiri sendiri.
   short : untuk tempat yang konteksnya sudah jelas — mis. opsi di dalam
           <optgroup> yang judulnya sudah memuat title, atau judul section.
*/
const KATEGORI_GRUP = {
  domestic: { title: 'Domestik (Jepang)', short: 'Domestik', sub: 'Grup yang berbasis di Jepang' },
  kaigai: { title: 'Kaigai (Luar Jepang)', short: 'Kaigai', sub: 'Sister group internasional' },
};

/* Kunci kategori dalam urutan tampilan. GROUP_ORDER yang menentukan urutannya,
   bukan urutan penulisan objek di atas. */
function kategoriTerurut() {
  return Object.keys(KATEGORI_GRUP).sort((a, b) => GROUP_ORDER[a] - GROUP_ORDER[b]);
}

/* Grup dalam satu kategori, urut seperti GROUPS. */
function grupKategori(kategori) {
  return GROUPS.filter((g) => g.category === kategori);
}

const OFFICIAL_SCHEDULE_URLS = {
  akb48: 'https://www.akb48.co.jp/theater/schedule',
  ske48: 'https://ske48.co.jp/theater/schedule',
  nmb48: 'http://www.nmb48.com/schedule/',
  hkt48: 'https://www.hkt48.jp/schedule/',
  ngt48: 'https://ngt48.jp/schedule/',
  stu48: 'https://sp.stu48.com/schedule/',
  jkt48: 'https://jkt48.com/schedule?lang=id',
  bnk48: 'https://www.bnk48.com/index.php?page=schedule',
  akb48tsh: 'https://weibo.com/akb48teamsh',
  tpe48: 'https://www.tpe48.tw/',
  cgm48: 'https://cgm48official.com/schedule/',
  klp48: 'https://klp48.my/',
};

function officialScheduleUrl(groupId) {
  const group = GROUPS.find((item) => item.id === groupId);
  return OFFICIAL_SCHEDULE_URLS[groupId] || (group ? group.site : '');
}

/* -------------------------------------------------------------
   2. DATA MEMBER
   Roster diisi per grup pada blok ROSTER_* di bawah, lalu digabung
   oleh buildMembers() menjadi array MEMBERS berformat lengkap.

   Skema properti member (hasil akhir setelah buildMembers):
   {
     id: 'jkt48-01',           // Wajib unik, huruf kecil + angka (dipakai oshi pin)
     name: 'Nama Member',      // SELALU Latin — search, urutan A-Z, nama file foto
     nameNative: '生野 莉奈',   // opsional; kalau ada, ini yang jadi nama utama di card
     group: 'JKT48',           // nama grup TAMPIL      — otomatis
     groupId: 'jkt48',         // wajib SAMA dengan id grup di GROUPS — otomatis
     team: 'Team J',           // Team / Gen / nama unit
     isLive: false,            // sedang live streaming sekarang
     isStage: false,           // tampil di stage/theater hari ini
     img: 'img/jkt48-01.jpg',  // foto 3:4 (fallback SVG otomatis bila belum ada)
     liveUrl: '',              // URL streaming; '' → tombol disembunyikan
     livePlatform: 'IDN Live', // label platform pada tombol streaming — otomatis
    stage: null,              // status sekarang: { title, time, venue }
    schedule: [],             // agenda: [{ date, time, title, venue, type, url }]
     bio: null,                // biodata halaman detail dari BIO[id] — otomatis
     accent: 'pink',           // warna tema card: pink|cyan|violet|amber
   }

   SILAKAN DIISI SENDIRI: panduan lengkap + contoh siap tempel ada di
   data/README.md (termasuk daftar URL resmi ke-12 grup).

   CATATAN 2026-08-21: situs resmi & wiki tidak dapat diakses dari
   lingkungan ini, sehingga data member dibiarkan KOSONG supaya tidak
   menyajikan nama yang mungkin salah/kadaluwarsa. Metadata grup
   (nama, debut, basis, URL resmi) sudah akurat.
   ------------------------------------------------------------- */

/* -------------------------------------------------------------
   ROSTER PER GRUP — SILAKAN DIISI

   Cara mengisi (per member cukup 4 kolom wajib):
     { id: 'jkt48-01', name: 'Nama Member', team: 'Team J', accent: 'pink' }

   Kolom opsional (boleh dihilangkan — ada nilai default otomatis):
     isLive     : true kalau sedang live      (default false)
     isStage    : true kalau tampil hari ini  (default false)
     liveUrl    : URL streaming               (default '' → tombol disembunyikan)
     stage      : { title, time, venue }      (default null)
     img        : path foto 3:4               (default 'img/<id>.jpg')

   Properti group, groupId, dan livePlatform diisi OTOMATIS oleh
   buildMembers() di bawah, jadi tidak perlu ditulis ulang tiap baris.

   CATATAN 2026-08-21: roster sengaja dikosongkan. Situs resmi & wiki
   tidak dapat diakses dari lingkungan ini, jadi menuliskan nama dari
   ingatan berisiko menampilkan member yang sudah lulus. Metadata grup
   (nama, tahun debut, kota basis, URL resmi) sudah akurat dan terisi.
   ------------------------------------------------------------- */

/* ---------------- AKB48 ---------------- */
const ROSTER_AKB48 = [
  { id: 'akb48-01', name: 'Chiba Erii',         team: '',  accent: 'pink' },
  { id: 'akb48-03', name: 'Oguri Yui',          team: '',  accent: 'pink' },
  { id: 'akb48-04', name: 'Kuranoo Narumi',     team: '',  accent: 'pink' },
  { id: 'akb48-05', name: 'Shitao Miu',         team: '',  accent: 'pink' },
  { id: 'akb48-06', name: 'Takahshi Ayane',     team: '',  accent: 'pink', img: 'img/Takahashi_Ayane_AKB48_2025.webp' },
  { id: 'akb48-07', name: 'Nagano Serika',      team: '',  accent: 'pink' },
  { id: 'akb48-08', name: 'Hashimoto Haruna',   team: '',  accent: 'pink' },
  { id: 'akb48-09', name: 'Tokunaga Remi',      team: '',  accent: 'pink' },
  { id: 'akb48-10', name: 'Sakagawa Hiyuka',    team: '',  accent: 'pink' },
  { id: 'akb48-11', name: 'Iwatate Saho',       team: '',  accent: 'pink' },
  { id: 'akb48-12', name: 'Fukuoka Seina',      team: '',  accent: 'pink' },
  { id: 'akb48-16', name: 'Nagatomo Ayami',     team: '',  accent: 'pink' },
  { id: 'akb48-17', name: 'Yamauchi Mizuki',    team: '',  accent: 'pink' },
  { id: 'akb48-18', name: 'Ota Yuki',           team: '',  accent: 'pink' },
  { id: 'akb48-19', name: 'Sato Airi',          team: '',  accent: 'pink' },
  { id: 'akb48-20', name: 'Hashimoto Eriko',    team: '',  accent: 'pink' },
  { id: 'akb48-21', name: 'Hatekayama Nozomi',  team: '',  accent: 'pink', img: 'img/Hatakeyama_Nozomi_AKB48_2025.webp' },
  { id: 'akb48-22', name: 'Hirata Yuki',        team: '',  accent: 'pink' },
  { id: 'akb48-23', name: 'Hotei Moka',         team: '',  accent: 'pink' },
  { id: 'akb48-24', name: 'Masai Mayuu',        team: '',  accent: 'pink' },
  { id: 'akb48-25', name: 'Mizushima Miyuu',    team: '',  accent: 'pink' },
  { id: 'akb48-26', name: 'Yamazaki Sora',      team: '',  accent: 'pink' },
  { id: 'akb48-27', name: 'Akiyama',            team: '',  accent: 'pink' },
  { id: 'akb48-28', name: 'Arai Sae',           team: '',  accent: 'pink' },
  { id: 'akb48-29', name: 'Kudo Kasumi',        team: '',  accent: 'pink' },
  { id: 'akb48-31', name: 'Kubo Hinano',        team: '',  accent: 'pink' },
  { id: 'akb48-32', name: 'Sako Yumemi',        team: '',  accent: 'pink' },
  { id: 'akb48-33', name: 'Narita Kohina',      team: '',  accent: 'pink' },
  { id: 'akb48-34', name: 'Yagi Azuki',         team: '',  accent: 'pink' },
  { id: 'akb48-35', name: 'Yamaguchi Yui',      team: '',  accent: 'pink' },
  { id: 'akb48-36', name: 'Ito Momoka',         team: '',  accent: 'pink' },
  { id: 'akb48-37', name: 'Okumoto Kairi',      team: '',  accent: 'pink' },
  { id: 'akb48-38', name: 'Kawamura Yui',       team: '',  accent: 'pink' },
  { id: 'akb48-41', name: 'Oga Saki',           team: '',  accent: 'pink' },
  { id: 'akb48-42', name: 'Kondo Saki',         team: '',  accent: 'pink' },
  { id: 'akb48-43', name: 'Maruyama Hinata',    team: '',  accent: 'pink' },
  { id: 'akb48-44', name: 'Takahashi Mao',      team: '',  accent: 'pink' },
  { id: 'akb48-45', name: 'Tanaka Sayuri',      team: '',  accent: 'pink' },
  { id: 'akb48-46', name: 'Makito Ema',         team: '',  accent: 'pink' },
  { id: 'akb48-47', name: 'Morikawa Yu',        team: '',  accent: 'pink' },
  { id: 'akb48-48', name: 'Watanabe Kiko',      team: '',  accent: 'pink' },
  { id: 'akb48-49', name: 'Yamane Suzuha',      team: '',  accent: 'pink', img: 'img/Yamane_Suzuha_AKB48_2026.webp' },
];

/* ---------------- SKE48 ---------------- */
const ROSTER_SKE48 = [
  { id: 'ske48-01', name: 'Ida Reona',           team: 'Team E',    accent: 'cyan' },
  { id: 'ske48-02', name: 'Kamata Natsuki',      team: 'Team KII',  accent: 'cyan' },
  { id: 'ske48-03', name: 'Kumazaki Haruka',     team: 'Team S',    accent: 'cyan' },
  { id: 'ske48-04', name: 'Aikawa Honoka',       team: 'Team S',    accent: 'cyan' },
  { id: 'ske48-05', name: 'Asai Yuka',           team: 'Gen 7',     accent: 'cyan' },
  { id: 'ske48-06', name: 'Ota Ayaka',           team: 'Team E',    accent: 'cyan' },
  { id: 'ske48-07', name: 'Ishiguro Yuzuki',     team: 'Team S',    accent: 'cyan' },
  { id: 'ske48-08', name: 'Inoue Ruka',          team: 'Team KII',  accent: 'cyan' },
  { id: 'ske48-09', name: 'Kitagawa Yoshino',    team: 'Gen 8',     accent: 'cyan' },
  { id: 'ske48-10', name: 'Kurashima Ami',       team: 'Gen 8',     accent: 'cyan' },
  { id: 'ske48-11', name: 'Sakamoto Marin',      team: 'Gen 8',     accent: 'cyan' },
  { id: 'ske48-12', name: 'Sato Kaho',           team: 'Gen 8',     accent: 'cyan' },
  { id: 'ske48-13', name: 'Nomura Miyo',         team: 'Gen 8',     accent: 'cyan' },
  { id: 'ske48-14', name: 'Akahori Kimie',       team: 'Team E',    accent: 'cyan' },
  { id: 'ske48-15', name: 'Arano Himeka',        team: 'Team KII',  accent: 'cyan' },
  { id: 'ske48-16', name: 'Ikeda Kaede',         team: 'Gen 9',     accent: 'cyan' },
  { id: 'ske48-17', name: 'Iriuchijima Sayaka',  team: 'Team S',    accent: 'cyan' },
  { id: 'ske48-18', name: 'Suzuki Ena',          team: 'Gen 9',     accent: 'cyan' },
  { id: 'ske48-19', name: 'Suzuki Kokona',       team: 'Gen 9',     accent: 'cyan' },
  { id: 'ske48-20', name: 'Nakasaka Miyu',       team: 'Gen 9',     accent: 'cyan' },
  { id: 'ske48-21', name: 'Aoki Rika',           team: 'Team E',    accent: 'cyan' },
  { id: 'ske48-22', name: 'Ito Miki',            team: 'Team KII',  accent: 'cyan' },
  { id: 'ske48-23', name: 'Nishii Mio',          team: 'Gen 10',    accent: 'cyan' },
  { id: 'ske48-24', name: 'Omura Anzu',          team: 'Team E',    accent: 'cyan' },
  { id: 'ske48-25', name: 'Shinohara Kyoka',     team: 'Team KII',  accent: 'cyan' },
  { id: 'ske48-26', name: 'Sugimoto Riina',      team: 'Team S',    accent: 'cyan' },
  { id: 'ske48-27', name: 'Hara Yune',           team: 'Gen 11',    accent: 'cyan' },
  { id: 'ske48-28', name: 'Morimoto Kurumi',     team: 'Gen 11',    accent: 'cyan' },
  { id: 'ske48-29', name: 'Yamamura Sakura',     team: 'Gen 11',    accent: 'cyan' },
  { id: 'ske48-30', name: 'Ito Kokomi',          team: 'Team S',    accent: 'cyan' },
  { id: 'ske48-31', name: 'Okuno Kokoha',        team: 'Team KII',  accent: 'cyan' },
  { id: 'ske48-32', name: 'Kawamura Yua',        team: 'Team E',    accent: 'cyan' },
  { id: 'ske48-33', name: 'Kuramoto Hana',       team: 'Gen 12',    accent: 'cyan' },
  { id: 'ske48-34', name: 'Takamura Saya',       team: 'Gen 12',    accent: 'cyan' },
  { id: 'ske48-35', name: 'Hasegawa Miyabi',     team: 'Gen 12',    accent: 'cyan' },
  { id: 'ske48-36', name: 'Matsukawa Miyu',      team: 'Gen 12',    accent: 'cyan' },
  { id: 'ske48-37', name: 'Minamisawa Coco',     team: 'Gen 12',    accent: 'cyan' },
  { id: 'ske48-38', name: 'Ota Manae',           team: 'Team E',    accent: 'cyan' },
  { id: 'ske48-39', name: 'Kawamura Shoko',      team: 'Gen 13',    accent: 'cyan' },
  { id: 'ske48-40', name: 'Kubota Rei',          team: 'Gen 13',    accent: 'cyan' },
  { id: 'ske48-41', name: 'Kumoi Sana',          team: 'Team KII',  accent: 'cyan' },
  { id: 'ske48-42', name: 'Kuwahara Tsubaki',    team: 'Team S',    accent: 'cyan' },
  { id: 'ske48-43', name: 'Kondo Mikoto',        team: 'Gen 13',    accent: 'cyan' },
  { id: 'ske48-44', name: 'Sakurai Arisa',       team: 'Gen 13',    accent: 'cyan' },
  { id: 'ske48-45', name: 'Sasaki Nozomi',       team: 'Gen 13',    accent: 'cyan' },
  { id: 'ske48-46', name: 'Tachibana Ayame',     team: 'Gen 13',    accent: 'cyan' },
  { id: 'ske48-47', name: 'Tamura Mayu',         team: 'Gen 6',     accent: 'cyan' },
  { id: 'ske48-48', name: 'Hijiri Haruka',       team: 'Gen 13',    accent: 'cyan' },
  { id: 'ske48-49', name: 'Miyamoto Rinka',      team: 'Gen 13',    accent: 'cyan' },
  { id: 'ske48-50', name: 'Yokoi Shiho',         team: 'Gen 13',    accent: 'cyan' },
  { id: 'ske48-51', name: 'Iida Yura',           team: 'Gen 14',    accent: 'cyan' },
  { id: 'ske48-52', name: 'Ikeda Arisa',         team: 'Gen 14',    accent: 'cyan' },
  { id: 'ske48-53', name: 'Takeshita Marika',    team: 'Gen 14',    accent: 'cyan' },
  { id: 'ske48-54', name: 'Nakao Fuka',          team: 'Gen 14',    accent: 'cyan' },
  { id: 'ske48-55', name: 'Yajima Nagi',         team: 'Gen 14',    accent: 'cyan' },
  { id: 'ske48-56', name: 'Matsumoto Chikako',   team: 'Team KII',  accent: 'cyan' },
];

/* ---------------- NMB48 ---------------- */
const ROSTER_NMB48 = [
  { id: 'nmb48-02', name: 'Izumi Ayano',       team: '',  accent: 'cyan' },
  { id: 'nmb48-03', name: 'Shiotsuki Keito',   team: '',  accent: 'cyan' },
  { id: 'nmb48-04', name: 'Mizuta Shiori',     team: '',  accent: 'cyan' },
  { id: 'nmb48-05', name: 'Shinzawa Nao',      team: '',  accent: 'cyan' },
  { id: 'nmb48-06', name: 'Hirayama Mai',      team: '',  accent: 'cyan' },
  { id: 'nmb48-07', name: 'Ike Honoka',        team: '',  accent: 'cyan' },
  { id: 'nmb48-08', name: 'Kuroshima Sakura',  team: '',  accent: 'cyan' },
  { id: 'nmb48-09', name: 'Sakashita Mako',    team: '',  accent: 'cyan' },
  { id: 'nmb48-10', name: 'Sakata Misaki',     team: '',  accent: 'cyan' },
  { id: 'nmb48-12', name: 'Sakurada Ayaka',    team: '',  accent: 'cyan' },
  { id: 'nmb48-13', name: 'Tatsumoto Yayoi',   team: '',  accent: 'cyan' },
  { id: 'nmb48-15', name: 'Fukuna Ami',        team: '',  accent: 'cyan', img: 'img/Fukuno_Ami_NMB48_2026.webp' },
  { id: 'nmb48-16', name: 'Matsuoka Sakura',   team: '',  accent: 'cyan' },
  { id: 'nmb48-17', name: 'Matsumoto Mihina',  team: '',  accent: 'cyan' },
  { id: 'nmb48-18', name: 'Aobara Yuuka',      team: '',  accent: 'cyan', img: 'img/Aobara_Yuka_NMB48_2026.webp' },
  { id: 'nmb48-20', name: 'Ikeda Tenna',       team: '',  accent: 'cyan' },
  { id: 'nmb48-21', name: 'Itagaki Koyori',    team: '',  accent: 'cyan' },
  { id: 'nmb48-22', name: 'Kinugasa Ayami',    team: '',  accent: 'cyan' },
  { id: 'nmb48-23', name: 'Tanaka Misora',     team: '',  accent: 'cyan' },
  { id: 'nmb48-25', name: 'Nishijima Rio',     team: '',  accent: 'cyan' },
  { id: 'nmb48-26', name: 'Nishida Honoka',    team: '',  accent: 'cyan' },
  { id: 'nmb48-27', name: 'Haga Rei',          team: '',  accent: 'cyan' },
  { id: 'nmb48-29', name: 'Miyamoto Ami',      team: '',  accent: 'cyan' },
  { id: 'nmb48-30', name: 'Yoshimi Ayane',     team: '',  accent: 'cyan' },
  { id: 'nmb48-31', name: 'Ishiyama Chihiro',  team: '',  accent: 'cyan' },
  { id: 'nmb48-32', name: 'Uchida Aisha',      team: '',  accent: 'cyan' },
  { id: 'nmb48-33', name: 'Kine Iroha',        team: '',  accent: 'cyan' },
  { id: 'nmb48-34', name: 'Shibuya Asana',     team: '',  accent: 'cyan' },
  { id: 'nmb48-35', name: 'Takahashi Kotone',  team: '',  accent: 'cyan' },
  { id: 'nmb48-36', name: 'Takeda Kyoka',      team: '',  accent: 'cyan' },
  { id: 'nmb48-37', name: 'Tanaka Miria',      team: '',  accent: 'cyan' },
  { id: 'nmb48-38', name: 'Miyahara Konon',    team: '',  accent: 'cyan' },
  { id: 'nmb48-39', name: 'Murai Yuri',        team: '',  accent: 'cyan' },
  { id: 'nmb48-40', name: 'Yamaguchi Mio',     team: '',  accent: 'cyan' },
  { id: 'nmb48-41', name: 'Akamatsu Sora',     team: '',  accent: 'cyan' },
  { id: 'nmb48-42', name: 'Okagoshi Seira',    team: '',  accent: 'cyan' },
  { id: 'nmb48-43', name: 'Sakurai Himari',    team: '',  accent: 'cyan' },
  { id: 'nmb48-44', name: 'Zenke Yurika',      team: '',  accent: 'cyan' },
  { id: 'nmb48-45', name: 'Takahashi Juna',    team: '',  accent: 'cyan' },
  { id: 'nmb48-47', name: 'Tanaka Rei',        team: '',  accent: 'cyan' },
  { id: 'nmb48-48', name: 'Taniguchi Shino',   team: '',  accent: 'cyan' },
  { id: 'nmb48-49', name: 'Nishizumi Misaki',  team: '',  accent: 'cyan' },
  { id: 'nmb48-50', name: 'Fukuhara Kotomi',   team: '',  accent: 'cyan' },
  { id: 'nmb48-51', name: 'Yabuuchi Hinata',   team: '',  accent: 'cyan' },
  { id: 'nmb48-52', name: 'Wada Kotone',       team: '',  accent: 'cyan' },
  { id: 'nmb48-53', name: 'Nakagawa Tomoka',    team: '',  accent: 'cyan', img: 'img/Nakagawa_Tomoka_NMB48_2026.webp' },
  { id: 'nmb48-54', name: 'Mikamo Kurumi',     team: '',  accent: 'cyan', img: 'img/Mikamo_Kurumi_NMB48_2026.webp' },
  { id: 'nmb48-55', name: 'Miyazaki Sae',      team: '',  accent: 'cyan', img: 'img/Miyazaki_Sae_NMB48_2026.webp' },
];

/* ---------------- HKT48 ---------------- */
const ROSTER_HKT48 = [
  { id: 'hkt48-01', name: 'Ikuno Rina',        team: 'Team H',      nameNative: '生野 莉奈',   accent: 'violet' },
  { id: 'hkt48-02', name: 'Ishibashi Ibuki',   team: 'Team H',      nameNative: '石橋 颯',    accent: 'violet' },
  { id: 'hkt48-03', name: 'Ishimatsu Yuina',   team: 'Team H',      nameNative: '石松 結菜',   accent: 'violet' },
  { id: 'hkt48-04', name: 'Ichimura Airi',     team: 'Team H',      nameNative: '市村 愛里',   accent: 'violet' },
  { id: 'hkt48-05', name: 'Kitagawa Hiiro',    team: 'Team H',      nameNative: '北川 陽彩',   accent: 'violet' },
  { id: 'hkt48-06', name: 'Kurihara Sae',      team: 'Team H',      nameNative: '栗原 紗英',   accent: 'violet' },
  { id: 'hkt48-07', name: 'Shibui Mina',       team: 'Team H',      nameNative: '渋井 美奈',   accent: 'violet' },
  { id: 'hkt48-08', name: 'Toyonaga Aki',      team: 'Team H',      nameNative: '豊永 阿紀',   accent: 'violet' },
  { id: 'hkt48-09', name: 'Nakano Minami',     team: 'Team H',      nameNative: '中野 南実',   accent: 'violet' },
  { id: 'hkt48-10', name: 'Fujino Kokoha',     team: 'Team H',      nameNative: '藤野 心葉',   accent: 'violet' },
  { id: 'hkt48-11', name: 'Fuchigami Mai',     team: 'Team H',      nameNative: '渕上 舞',    accent: 'violet' },
  { id: 'hkt48-12', name: 'Matsunaga Yui',     team: 'Team H',      nameNative: '松永 悠良',   accent: 'violet' },
  { id: 'hkt48-13', name: 'Yanase Reia',       team: 'Team H',      nameNative: '梁瀬 鈴雅',   accent: 'violet' },
  { id: 'hkt48-14', name: 'Yamauchi Yuna',     team: 'Team H',      nameNative: '山内 祐奈',   accent: 'violet' },
  { id: 'hkt48-15', name: 'Ryuto Ayane',       team: 'Team H',      nameNative: '龍頭 綺音',   accent: 'violet' },
  { id: 'hkt48-16', name: 'Akiyoshi Yuka',     team: 'Team KIV',    nameNative: '秋吉 優花',   accent: 'violet' },
  { id: 'hkt48-17', name: 'Izawa Miyu',        team: 'Team KIV',    nameNative: '井澤 美優',   accent: 'violet' },
  { id: 'hkt48-18', name: 'Ishii Ayane',       team: 'Team KIV',    nameNative: '石井 彩音',   accent: 'violet' },
  { id: 'hkt48-19', name: 'Ihara Hanna',       team: 'Team KIV',    nameNative: '猪原 絆愛',   accent: 'violet' },
  { id: 'hkt48-20', name: 'Imamura Maria',     team: 'Team KIV',    nameNative: '今村 麻莉愛',  accent: 'violet' },
  { id: 'hkt48-21', name: 'Eura Yuka',         team: 'Team KIV',    nameNative: '江浦 優香',   accent: 'violet' },
  { id: 'hkt48-22', name: 'Eguchi Kokoha',     team: 'Team KIV',    nameNative: '江口 心々華',  accent: 'violet' },
  { id: 'hkt48-23', name: 'Oba Risaki',        team: 'Team KIV',    nameNative: '大庭 凜咲',   accent: 'violet' },
  { id: 'hkt48-24', name: 'Kuriyama Rina',     team: 'Team KIV',    nameNative: '栗山 梨奈',   accent: 'violet' },
  { id: 'hkt48-25', name: 'Takemoto Kurumi',   team: 'Team KIV',    nameNative: '竹本 くるみ',  accent: 'violet' },
  { id: 'hkt48-26', name: 'Tachibana Kokoro',  team: 'Team KIV',    nameNative: '立花 心良',   accent: 'violet' },
  { id: 'hkt48-27', name: 'Tanaka Iori',       team: 'Team KIV',    nameNative: '田中 伊桜莉',  accent: 'violet' },
  { id: 'hkt48-28', name: 'Fukui Karen',       team: 'Team KIV',    nameNative: '福井 可憐',   accent: 'violet' },
  { id: 'hkt48-29', name: 'Morisaki Saaya',    team: 'Team KIV',    nameNative: '森﨑 冴彩',   accent: 'violet' },
  { id: 'hkt48-30', name: 'Yasui Hina',        team: 'Team KIV',    nameNative: '安井 妃奈',   accent: 'violet' },
  { id: 'hkt48-31', name: 'Aoki Hinako',       team: 'Kenkyuusei',  nameNative: '青木 日菜子',  accent: 'violet' },
  { id: 'hkt48-32', name: 'Ishikawa Amiyu',    team: 'Kenkyuusei',  nameNative: '石川 歩実優',  accent: 'violet' },
  { id: 'hkt48-33', name: 'Ijima Riria',       team: 'Kenkyuusei',  nameNative: '猪島 莉玲亜',  accent: 'violet', img: 'img/Ijima_Riria_HKT48_2025_29.webp' },
  { id: 'hkt48-34', name: 'Kure Yuna',         team: 'Kenkyuusei',  nameNative: '呉 優菜',    accent: 'violet' },
  { id: 'hkt48-35', name: 'Tsurukawa Nachi',   team: 'Kenkyuusei',  nameNative: '靏川 那智',   accent: 'violet' },
  { id: 'hkt48-36', name: 'Nagano Rara',       team: 'Kenkyuusei',  nameNative: '長野 らら',   accent: 'violet' },
  { id: 'hkt48-37', name: 'Matsumoto Moka',    team: 'Kenkyuusei',  nameNative: '松本 苺花',   accent: 'violet', img: 'img/Matsumoto_Moka_HKT48_2025_29.webp' },
  { id: 'hkt48-38', name: 'Yamakawa Maria',    team: 'Kenkyuusei',  nameNative: '山川 万里愛',  accent: 'violet' },
  { id: 'hkt48-39', name: 'Yoshida Mei',       team: 'Kenkyuusei',  nameNative: '吉田 めい',   accent: 'violet' },
];

/* ---------------- NGT48 ---------------- */
const ROSTER_NGT48 = [
  { id: 'ngt48-01', name: 'Seiji Reina',       team: 'Gen 1',  nameNative: '清司 麗菜',   accent: 'amber' },
  { id: 'ngt48-02', name: 'Nishigata Marina',  team: 'Gen 2',  nameNative: '西潟 茉莉奈',  accent: 'amber' },
  { id: 'ngt48-03', name: 'Otsuka Nanami',     team: 'Gen 2',  nameNative: '大塚 七海',   accent: 'amber' },
  { id: 'ngt48-04', name: 'Mimura Hino',       team: 'Gen 2',  nameNative: '三村 妃乃',   accent: 'amber' },
  { id: 'ngt48-05', name: 'Sato Kairi',        team: 'Gen 3',  nameNative: '佐藤 海里',   accent: 'amber' },
  { id: 'ngt48-06', name: 'Isobe Rua',         team: 'Gen 3',  nameNative: '磯部 瑠紅',   accent: 'amber' },
  { id: 'ngt48-07', name: 'Kita Hanae',        team: 'Gen 3',  nameNative: '喜多 花恵',   accent: 'amber' },
  { id: 'ngt48-08', name: 'Kitamura Yuha',     team: 'Gen 3',  nameNative: '北村 優羽',   accent: 'amber' },
  { id: 'ngt48-10', name: 'Suizu Natsuki',     team: 'Gen 3',  nameNative: '水津 菜月',   accent: 'amber' },
  { id: 'ngt48-11', name: 'Sugimoto Moe',      team: 'Gen 3',  nameNative: '杉本 萌',    accent: 'amber' },
  { id: 'ngt48-12', name: 'Isozaki Nana',      team: 'Gen 4',  nameNative: '磯崎 菜々',   accent: 'amber' },
  { id: 'ngt48-14', name: 'Kimoto Anna',       team: 'Gen 4',  nameNative: '木本 杏菜',   accent: 'amber' },
  { id: 'ngt48-15', name: 'Sato Hiroka',       team: 'Gen 4',  nameNative: '佐藤 広花',   accent: 'amber' },
  { id: 'ngt48-16', name: 'Shinzawa Aoi',      team: 'Gen 4',  nameNative: '新沢 葵唯',   accent: 'amber' },
  { id: 'ngt48-17', name: 'Takashima Yua',     team: 'Gen 4',  nameNative: '高島 柚愛',   accent: 'amber' },
  { id: 'ngt48-18', name: 'Nishikawa Haruna',  team: 'Gen 4',  nameNative: '西川 晴菜',   accent: 'amber' },
  { id: 'ngt48-19', name: 'Azama Yui',         team: 'Gen 5',  nameNative: '安座間 葵',   accent: 'amber' },
  { id: 'ngt48-20', name: 'Adachi Yume',       team: 'Gen 5',  nameNative: '足立 夢',    accent: 'amber' },
  { id: 'ngt48-21', name: 'Omachi Yuka',       team: 'Gen 5',  nameNative: '大町 瑠華',   accent: 'amber' },
  { id: 'ngt48-22', name: 'Kai Mizuki',        team: 'Gen 5',  nameNative: '甲斐 瑞希',   accent: 'amber' },
  { id: 'ngt48-23', name: 'Kitazawa Mone',     team: 'Gen 5',  nameNative: '北沢 萌音',   accent: 'amber' },
  { id: 'ngt48-24', name: 'Sato Yuuka',        team: 'Gen 5',  nameNative: '佐藤 侑花',   accent: 'amber', img: 'img/Sato_Yuka_NGT48_2026_29.webp' },
  { id: 'ngt48-25', name: 'Suto Rinka',        team: 'Gen 5',  nameNative: '須藤 凛華',   accent: 'amber' },
  { id: 'ngt48-26', name: 'Taniguchi Haruka',  team: 'Gen 5',  nameNative: '谷口 晴香',   accent: 'amber' },
  { id: 'ngt48-27', name: 'Nakata Asami',      team: 'Gen 5',  nameNative: '仲田 朝美',   accent: 'amber' },
  { id: 'ngt48-28', name: 'Minagawa Hiyori',   team: 'Gen 5',  nameNative: '皆川 日和',   accent: 'amber' },
  { id: 'ngt48-29', name: 'Aiki Maaya',        team: 'Gen 6',  nameNative: '綾木 舞彩',   accent: 'amber', img: 'img/Aiki_Maaya_NGT48_2026.webp' },
  { id: 'ngt48-30', name: 'Inomata Sana',      team: 'Gen 6',  nameNative: '猪股 咲奈',   accent: 'amber' },
  { id: 'ngt48-31', name: 'Ohashi Ayano',      team: 'Gen 6',  nameNative: '大橋 彩乃',   accent: 'amber' },
  { id: 'ngt48-32', name: 'Katayama Shuri',    team: 'Gen 6',  nameNative: '片山 珠莉',   accent: 'amber' },
  { id: 'ngt48-33', name: 'Kuga Mirei',        team: 'Gen 6',  nameNative: '久賀 美玲',   accent: 'amber' },
  { id: 'ngt48-34', name: 'Sato Honoka',       team: 'Gen 6',  nameNative: '佐藤 穂花',   accent: 'amber' },
  { id: 'ngt48-35', name: 'Hirai Yuzuha',      team: 'Gen 6',  nameNative: '平井 柚葉',   accent: 'amber' },
  { id: 'ngt48-36', name: 'Hosoya Naho',       team: 'Gen 6',  nameNative: '細谷 菜帆',   accent: 'amber' },
];

/* ---------------- STU48 ---------------- */
const ROSTER_STU48 = [
  { id: 'stu48-01', name: 'Kai Cocoa',         team: 'Gen 1',    nameNative: '甲斐 心愛',   accent: 'pink' },
  { id: 'stu48-02', name: 'Taniguchi Mahina',  team: 'Gen 1',    nameNative: '谷口 茉妃菜',  accent: 'pink' },
  { id: 'stu48-03', name: 'Hyodo Aoi',         team: 'Gen 1',    nameNative: '兵頭 葵',    accent: 'pink' },
  { id: 'stu48-04', name: 'Fukuda Akari',      team: 'Gen 1',    nameNative: '福田 朱里',   accent: 'pink' },
  { id: 'stu48-05', name: 'Shinano Soraha',    team: 'Gen 1',    nameNative: '信濃 宙花',   accent: 'pink' },
  { id: 'stu48-06', name: 'Nakamura Mai',      team: 'Gen 1',    nameNative: '中村 舞',    accent: 'pink' },
  { id: 'stu48-07', name: 'Ikeda Yura',        team: 'Gen 2',    nameNative: '池田 裕楽',   accent: 'pink' },
  { id: 'stu48-08', name: 'Utsumi Rine',       team: 'Gen 2',    nameNative: '内海 里音',   accent: 'pink' },
  { id: 'stu48-09', name: 'Osaki Serika',      team: 'Gen 2',    nameNative: '尾崎 世里花',  accent: 'pink' },
  { id: 'stu48-10', name: 'Kawamata Yuuna',    team: 'Gen 2',    nameNative: '川又 優菜',   accent: 'pink' },
  { id: 'stu48-11', name: 'Kudo Riko',         team: 'Gen 2',    nameNative: '工藤 理子',   accent: 'pink' },
  { id: 'stu48-12', name: 'Sako Himeka',       team: 'Gen 2',    nameNative: '迫 姫華',    accent: 'pink' },
  { id: 'stu48-13', name: 'Takao Sayaka',      team: 'Gen 2',    nameNative: '高雄 覚',    accent: 'pink' },
  { id: 'stu48-14', name: 'Harada Sayaka',     team: 'Gen 2',    nameNative: '原田 清花',   accent: 'pink' },
  { id: 'stu48-15', name: 'Muneyuki Rika',     team: 'Gen 2',    nameNative: '宗雪 里香',   accent: 'pink' },
  { id: 'stu48-16', name: 'Yoshida Sara',      team: 'Gen 2',    nameNative: '吉田 彩良',   accent: 'pink' },
  { id: 'stu48-17', name: 'Watanabe Natsuki',  team: 'Gen 2',    nameNative: '渡辺 菜月',   accent: 'pink' },
  { id: 'stu48-18', name: 'Okada Azumi',       team: 'Gen 2.5',  nameNative: '岡田 あずみ',  accent: 'pink' },
  { id: 'stu48-19', name: 'Okamura Rio',       team: 'Gen 2.5',  nameNative: '岡村 梨央',   accent: 'pink' },
  { id: 'stu48-20', name: 'Kurushima Yuka',    team: 'Gen 2.5',  nameNative: '久留島 優果',  accent: 'pink' },
  { id: 'stu48-21', name: 'Morokuzu Noa',      team: 'Gen 2.5',  nameNative: '諸葛 望愛',   accent: 'pink' },
  { id: 'stu48-22', name: 'Arai Ria',          team: 'Gen 3',    nameNative: '新井 黎華',   accent: 'pink' },
  { id: 'stu48-23', name: 'Ishihara Yuuna',    team: 'Gen 3',    nameNative: '石原 侑奈',   accent: 'pink' },
  { id: 'stu48-24', name: 'Okuda Yuina',       team: 'Gen 3',    nameNative: '奥田 唯菜',   accent: 'pink' },
  { id: 'stu48-25', name: 'Kitazawa Ichigo',   team: 'Gen 3',    nameNative: '北澤 苺',    accent: 'pink' },
  { id: 'stu48-26', name: 'Hamada Hibiki',     team: 'Gen 3',    nameNative: '浜田 響',    accent: 'pink' },
  { id: 'stu48-27', name: 'Morisue Himena',    team: 'Gen 3',    nameNative: '森末 姫奈',   accent: 'pink' },
  { id: 'stu48-28', name: 'Ishimatsu Haruna',  team: 'Gen 4',    nameNative: '石松 陽菜',   accent: 'pink' },
  { id: 'stu48-29', name: 'Inoue Kurea',       team: 'Gen 4',    nameNative: '井上 紅空',   accent: 'pink' },
  { id: 'stu48-30', name: 'Kabutake Mana',     team: 'Gen 4',    nameNative: '甲竹 愛菜',   accent: 'pink' },
  { id: 'stu48-31', name: 'Kihara Hinayo',     team: 'Gen 4',    nameNative: '木原 陽菜乃',  accent: 'pink' },
  { id: 'stu48-32', name: 'Komatsu Nayu',      team: 'Gen 4',    nameNative: '小松 奈優',   accent: 'pink' },
  { id: 'stu48-33', name: 'Sakaki Towana',     team: 'Gen 4',    nameNative: '榊 永遠',    accent: 'pink' },
  { id: 'stu48-34', name: 'Sakazaki Ai',       team: 'Gen 4',    nameNative: '坂崎 愛',    accent: 'pink' },
  { id: 'stu48-35', name: 'Shimada Sayaka',    team: 'Gen 4',    nameNative: '島田 さやか',  accent: 'pink' },
  { id: 'stu48-36', name: 'Sogabe Ako',        team: 'Gen 4',    nameNative: '曾我部 亜古',  accent: 'pink' },
  { id: 'stu48-37', name: 'Takamura Shiori',   team: 'Gen 4',    nameNative: '高村 詩織',   accent: 'pink' },
  { id: 'stu48-38', name: 'Tanaka Nanako',     team: 'Gen 4',    nameNative: '田中 奈々子',  accent: 'pink' },
  { id: 'stu48-39', name: 'Douho Runa',        team: 'Gen 4',    nameNative: '堂本 瑠奈',   accent: 'pink' },
  { id: 'stu48-40', name: 'Nonaka Rio',        team: 'Gen 4',    nameNative: '野中 莉生',   accent: 'pink' },
  { id: 'stu48-41', name: 'Hamada Mii',        team: 'Gen 4',    nameNative: '浜田 未衣',   accent: 'pink' },
  { id: 'stu48-42', name: 'Fujita Amu',        team: 'Gen 4',    nameNative: '藤田 愛夢',   accent: 'pink' },
  { id: 'stu48-43', name: 'Miyoshi Maaya',     team: 'Gen 4',    nameNative: '三好 摩彩',   accent: 'pink' },
  { id: 'stu48-44', name: 'Yagi Yuuna',        team: 'Gen 4',    nameNative: '八木 結愛',   accent: 'pink' },
  { id: 'stu48-45', name: 'Yokoi Yuina',       team: 'Gen 4',    nameNative: '横井 結衣',   accent: 'pink' },
];

/* ---------------- JKT48 ---------------- */
const ROSTER_JKT48 = [
  { id: 'jkt48-01', name: 'Fiony Alveria Tantri',                team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-02', name: 'Indah Cahya Nabila',                  team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-03', name: 'Aurellia',                            team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-04', name: 'Anindya Ramadhani Purnomo',           team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-05', name: 'Celline Thefannie',                  team: 'Team Love',     accent: 'pink', img: 'img/Celline_Thefani_JKT48_2026_29.webp' },
  { id: 'jkt48-06', name: 'Cynthia Yaputera',                    team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-07', name: 'Grace Octaviani Tunajaya',            team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-08', name: 'Michellle Alexandra Suandi',          team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-09', name: 'Aurhel Alana Tirta',                  team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-10', name: 'Fritzy Rosmerian',                    team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-11', name: 'Hilliary Abigail Mantiri',            team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-12', name: 'Jazzlyn Agatha Thrisha Indra Putri',  team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-13', name: 'Araki Nayla Suji Aurelia',            team: 'Team Love',     accent: 'pink' },
  { id: 'jkt48-14', name: 'Feni Fitriyanti',                     team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-15', name: 'Angelina Christy',                    team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-16', name: 'Jessica Rich Chandra',                team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-17', name: 'Muthe Azzahra Umandana',              team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-18', name: 'Cornelia Shafa Vanisa',               team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-19', name: 'Kathrina Irene Indarto Putri',        team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-20', name: 'Raisha Syifa Wardhana',               team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-21', name: 'Dena Natalia Ang',                    team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-22', name: 'Desy Natalia Ang',                    team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-23', name: 'Abigail Rachel Lie',                  team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-24', name: 'Catherina Valencia Kurniawan',        team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-25', name: 'Michelle Levia Afirin',               team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-26', name: 'Ribka Budiman',                       team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-27', name: 'Victoria Kimberly Lukitama',          team: 'Team Passion',  accent: 'pink' },
  { id: 'jkt48-28', name: 'Gita Sekar Andarini',                 team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-29', name: 'Febriola Sinambela',                  team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-30', name: 'Freyanashifa Jayawardana',            team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-31', name: 'Helisma Mauludzunia Putri Kurnia',    team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-32', name: 'Lulu Azkiya Salsabila',               team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-33', name: 'Marsha Lenathea Lapian',              team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-34', name: 'Gabriella Abigail Mewengkang',        team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-35', name: 'Jesslyn Septiani',                    team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-36', name: 'Greesella Sophina Adhalia',           team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-37', name: 'Adeline Wijaya',                      team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-38', name: 'Nina Tutachia Browning Chapman',      team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-39', name: 'Oline Manuel Chay',                   team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-40', name: 'Shahbilqis Naila Bustomi',            team: 'Team Dream',    accent: 'pink' },
  { id: 'jkt48-41', name: 'Astrella Virgiananda Nugraha',        team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-42', name: 'Aulia Riza Firdausy Effendi',         team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-43', name: 'Bong Aprilli Paskah',                 team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-44', name: 'Hagia Sopia',                         team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-45', name: 'Humaria Ramadhani Salfiandi',         team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-46', name: 'Jacqueline Immanuela Jonathan',       team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-47', name: 'Jemima Evodie Mayra Lijaya',          team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-48', name: 'Mikaela Kusjanto',                    team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-49', name: 'Nur Intan',                           team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-50', name: 'Afera Thalia Putri Eysteinn',         team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-51', name: 'Carissa Dini Asmaranti',              team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-52', name: 'Christabella Bonita Claura Chandra',  team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-53', name: 'Fahira Putri Kirana',                 team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-54', name: 'Fatimah Azzahra',                     team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-55', name: 'Heidi Suyangga',                      team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-56', name: 'Maxine Faye Lee',                     team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-57', name: 'Putry Jazyta',                        team: 'Trainee',       accent: 'pink', img: 'img/Putry_Jazyta_JKT48_2026_29.webp' },
  { id: 'jkt48-58', name: 'Ralyne Van Irwan',                    team: 'Trainee',       accent: 'pink' },
  { id: 'jkt48-59', name: 'Sona Kalyana Purboprasetyani',        team: 'Trainee',       accent: 'pink' },
];

/* ---------------- BNK48 ---------------- */
const ROSTER_BNK48 = [
  { id: 'bnk48-01', name: 'Marine',    team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-02', name: 'Fame',      team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-03', name: 'Hoop',      team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-04', name: 'Janry',     team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-05', name: 'Luksorn',   team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-06', name: 'Mail',      team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-07', name: 'Micha',     team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-08', name: 'Monet',     team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-09', name: 'Patt',      team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-10', name: 'Praew',     team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-11', name: 'Wawa',      team: 'Team BIII',  accent: 'violet' },
  { id: 'bnk48-12', name: 'Emmy',      team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-13', name: 'Arlee',     team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-14', name: 'Berry',     team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-15', name: 'Jew',       team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-16', name: 'L',         team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-17', name: 'Palmmy',    team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-18', name: 'Pancake',   team: 'Team NV',    accent: 'violet', img: 'img/Pancake_BNK48_May_2026.webp' },
  { id: 'bnk48-19', name: 'Proud',     team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-20', name: 'Saonoi',    team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-21', name: 'Sindy',     team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-22', name: 'Yoghurt',   team: 'Team NV',    accent: 'violet' },
  { id: 'bnk48-23', name: 'Galeya',    team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-24', name: 'Khaimook',  team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-25', name: 'Mayji',     team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-26', name: 'Nall',      team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-27', name: 'Nammonn',   team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-28', name: 'Neen',      team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-29', name: 'Niya',      team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-30', name: 'Blythe',    team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-31', name: 'Cartoon',   team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-32', name: 'Grape',     team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-33', name: 'Inkcha',    team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-34', name: 'Khowjow',   team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-35', name: 'Mint',      team: 'Trainee',    accent: 'violet', img: 'img/Mint_BNK48_May_2026.webp' },
  { id: 'bnk48-36', name: 'Mirin',     team: 'Trainee',    accent: 'violet' },
  { id: 'bnk48-37', name: 'Rose',      team: 'Trainee',    accent: 'violet' },
];

/* ---------------- AKB48 Team SH ---------------- */
const ROSTER_AKB48TSH = [
  { id: 'akb48tsh-01', name: 'Ye ZhiEn',        team: 'Gen 1',  accent: 'amber' },
  { id: 'akb48tsh-02', name: 'Zhou NianQi',     team: 'Gen 1',  accent: 'amber' },
  { id: 'akb48tsh-03', name: 'Cheng AnZi',      team: 'Gen 2',  accent: 'amber' },
  { id: 'akb48tsh-04', name: 'Gui ChuChu',      team: 'Gen 2',  accent: 'amber' },
  { id: 'akb48tsh-05', name: 'Qiu DiEr',        team: 'Gen 3',  accent: 'amber' },
  { id: 'akb48tsh-06', name: 'Wang AnNi',       team: 'Gen 3',  accent: 'amber' },
  { id: 'akb48tsh-07', name: 'Zhang JiaZhe',    team: 'Gen 3',  accent: 'amber' },
  { id: 'akb48tsh-08', name: 'Chen JiaYi',      team: 'Gen 4',  accent: 'amber' },
  { id: 'akb48tsh-09', name: 'Wang XiaoYang',   team: 'Gen 4',  accent: 'amber' },
  { id: 'akb48tsh-10', name: 'Wu Fan',          team: 'Gen 4',  accent: 'amber' },
  { id: 'akb48tsh-11', name: 'Zhang YiLin',     team: 'Gen 4',  accent: 'amber' },
  { id: 'akb48tsh-12', name: 'Zhang ShiYu',     team: 'Gen 5',  accent: 'amber' },
  { id: 'akb48tsh-13', name: 'Zheng YuShan',    team: 'Gen 5',  accent: 'amber' },
  { id: 'akb48tsh-14', name: 'Huang ZhenXuan',  team: 'Gen 6',  accent: 'amber' },
  { id: 'akb48tsh-15', name: 'Wei XiaoYa',      team: 'Gen 6',  accent: 'amber' },
];

/* ---------------- TPE48 ---------------- */
const ROSTER_TPE48 = [
  { id: 'tpe48-01', name: 'Chang Shao Tong', team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-02', name: 'Lau Hiu Ching',   team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-03', name: 'Lin Yu Hsin',     team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-04', name: 'Yi Pin',          team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-05', name: 'Chang Yu Ling',   team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-06', name: 'Su Heng Yu',      team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-07', name: 'Chen Zhao Ni',    team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-08', name: 'Chen Yi Ling',    team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-09', name: 'Tang Ching',      team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-10', name: 'Chen Jia Yi',     team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-11', name: 'Liu Zi Fei',      team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-12', name: 'Hu Yung Ching',   team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-13', name: 'Yang Chia Yi',    team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-14', name: 'Yu Zi Lei',       team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-15', name: 'Lu Hsin En',      team: 'Team TIII', accent: 'cyan' },
  { id: 'tpe48-16', name: 'Lin Yi Yun',      team: 'Team P',    accent: 'cyan' },
  { id: 'tpe48-17', name: 'Meng Ting Yun',   team: 'Team P',    accent: 'cyan', img: 'img/Meng_Ting-yun_TPE48_Jan_2026.webp' },
  { id: 'tpe48-18', name: 'Tsai Ya En',      team: 'Team P',    accent: 'cyan' },
  { id: 'tpe48-19', name: 'Huang Yi Lin',    team: 'Team P',    accent: 'cyan' },
  { id: 'tpe48-20', name: 'Chen Ying Zhen',  team: 'Team P',    accent: 'cyan', img: 'img/Chen_Ying-zhen_TPE48_Jan_2026.webp' },
  { id: 'tpe48-21', name: 'Huang Yu Yan',    team: 'Team P',    accent: 'cyan', img: 'img/Huang_Yu-yan_TPE48_Jan_2026.webp' },
  { id: 'tpe48-22', name: 'Chen Tai Ling',   team: 'Team P',    accent: 'cyan', img: 'img/Chen_Tai-ling_TPE48_Jan_2026.webp' },
  { id: 'tpe48-23', name: 'Tsai Chiao Yin',  team: 'Team P',    accent: 'cyan', img: 'img/Tsai_Ciao-yin_TPE48_Jan_2026.webp' },
  { id: 'tpe48-24', name: 'Chen Chiao Yi',   team: 'Team P',    accent: 'cyan', img: 'img/1768838170_cbbf4b20_2026_mem5_0731_chen_sq.avif' },
  { id: 'tpe48-25', name: 'Yang Ya Yun',     team: 'Team P',    accent: 'cyan', img: 'img/Yang_Ya-yun_TPE48_Jan_2026.webp' },
  { id: 'tpe48-26', name: 'Lin Yun Hsi',     team: 'Team P',    accent: 'cyan', img: 'img/Lin_Yu-hsin_TPE48_Jan_2026.webp' },
  { id: 'tpe48-27', name: 'Xu Chun Yuan',    team: 'Team P',    accent: 'cyan', img: 'img/Xu_Chun-yuan_TPE48_Apr_2026.webp' },
  { id: 'tpe48-28', name: 'Chang Hsin Chiao', team: 'Team P',   accent: 'cyan', img: 'img/Chang_Hsin-chiao_TPE48_Apr_2026.webp' },
  { id: 'tpe48-29', name: 'Liu Yan Ning',    team: 'Team P',    accent: 'cyan', img: 'img/Liu_Yan-ning_TPE48_Apr_2026.webp' },
  { id: 'tpe48-30', name: 'Wong Mann Ling',  team: 'Draft',     accent: 'cyan', img: 'img/Wong_Mann-ling_TTP_Nov_2024.webp' },
  { id: 'tpe48-31', name: 'Lin Wei Ting',    team: 'Draft',     accent: 'cyan', img: 'img/Lin_Wei-ting_TTP_Nov_2024.webp' },
  { id: 'tpe48-32', name: 'Chiu Yi Ching',   team: 'Draft',     accent: 'cyan', img: 'img/Chiu_Yi-ching_TTP_Nov_2024.webp' },
  { id: 'tpe48-33', name: 'Peng Yu Ting',    team: 'Draft',     accent: 'cyan', img: 'img/Peng_Yu-ting_TPE48_Jan_2026.webp' },
];

/* ---------------- CGM48 ---------------- */
const ROSTER_CGM48 = [
  { id: 'cgm48-01', name: 'JingJing',     team: 'Team C',  accent: 'pink', img: 'img/Jingjing_CGM48_Jul_2026.webp' },
  { id: 'cgm48-02', name: 'Lookked',      team: 'Team C',  accent: 'pink' },
  { id: 'cgm48-03', name: 'Nana',         team: 'Team C',  accent: 'pink' },
  { id: 'cgm48-04', name: 'Ginna',        team: 'Team C',  accent: 'pink' },
  { id: 'cgm48-05', name: 'Kwan',         team: 'Team C',  accent: 'pink' },
  { id: 'cgm48-06', name: 'LingLing',     team: 'Team C',  accent: 'pink' },
  { id: 'cgm48-07', name: 'Ploen',        team: 'Team C',  accent: 'pink' },
  { id: 'cgm48-08', name: 'Else',         team: 'Team C',  accent: 'pink', img: 'img/Else_CGM48_Jul_2026.webp' },
  { id: 'cgm48-09', name: 'Nisha',        team: 'Team C',  accent: 'pink' },
  { id: 'cgm48-10', name: 'Emma',         team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-11', name: 'Hongyok',      team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-12', name: 'Praifa',       team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-13', name: 'Satangpound',  team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-14', name: 'Shenae',       team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-15', name: 'Valentine',    team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-16', name: 'Chifa',        team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-17', name: 'Lewlew',       team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-18', name: 'Namphet',      team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-19', name: 'Punpon',       team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-20', name: 'Tara',         team: 'Trainee', accent: 'pink' },
  { id: 'cgm48-21', name: 'Prae',         team: 'Team C',  accent: 'pink' },
];

/* ---------------- KLP48 ---------------- */
const ROSTER_KLP48 = [
  { id: 'klp48-01', name: 'Elley Amanda Wong',                     team: '',  accent: 'violet' },
  { id: 'klp48-02', name: 'Ann Drea Tey',                          team: '',  accent: 'violet' },
  { id: 'klp48-03', name: 'Made Devi Ranita Ningtara',             team: '',  accent: 'violet' },
  { id: 'klp48-04', name: 'Shuen Hiu Yao',                         team: '',  accent: 'violet' },
  { id: 'klp48-05', name: 'Tan Zi Tong',                           team: '',  accent: 'violet' },
  { id: 'klp48-06', name: 'Salwa Sunanda',                         team: '',  accent: 'violet' },
  { id: 'klp48-07', name: 'Elvyone Tifanny Ticha Anak Donaldin',   team: '',  accent: 'violet' },
  { id: 'klp48-08', name: 'Foo Yi Shyan',                          team: '',  accent: 'violet' },
  { id: 'klp48-09', name: 'Turysbek Aisha',                        team: '',  accent: 'violet', img: 'img/Aisha_KLP48_Jan_2026.webp' },
  { id: 'klp48-10', name: 'Alice Wong Vei Yew',                    team: '',  accent: 'violet' },
  { id: 'klp48-11', name: 'Cindy Alexandria',                      team: '',  accent: 'violet' },
  { id: 'klp48-12', name: 'Diva Nurhaliza',                        team: '',  accent: 'violet' },
  { id: 'klp48-13', name: 'Sekar Wejayanti Mumtahanah',            team: '',  accent: 'violet' },
  { id: 'klp48-14', name: 'Wee Xi Ting',                           team: '',  accent: 'violet' },
  { id: 'klp48-15', name: 'Jocelyna Marcelly',                     team: '',  accent: 'violet' },
  { id: 'klp48-16', name: 'Kei Annisa Adnan',                      team: '',  accent: 'violet' },
  { id: 'klp48-17', name: 'Maia Fae Chong',                        team: '',  accent: 'violet' },
  { id: 'klp48-18', name: 'Ueda Mashiro',                          team: '',  accent: 'violet' },
  { id: 'klp48-19', name: 'Sharifah Sharleez Binti Syed Affendi',  team: '',  accent: 'violet' },
  { id: 'klp48-20', name: 'Kuak Shu Zhen',                         team: '',  accent: 'violet' },
  { id: 'klp48-21', name: 'Tara Tan',                              team: '',  accent: 'violet' },
];

/* -------------------------------------------------------------
   2b. BIODATA MEMBER (untuk halaman detail member.html)

   Dipisah dari ROSTER_* dengan sengaja. Kalau biodata ditempel ke
   baris roster, satu baris bisa 300+ karakter dan blok roster jadi
   tidak bisa dibaca — padahal blok itu yang paling sering dikoreksi.
   Di sini kuncinya `id` member, jadi keduanya bisa diisi terpisah.

   PERINGATAN: `id` adalah satu-satunya penghubung. Kalau roster
   ditulis ulang dengan urutan berbeda, nomor id bergeser dan biodata
   menempel ke orang lain — tanpa error. Karena itu setiap entri
   WAJIB memuat `name`; buildMembers() membandingkannya dengan nama di
   roster dan menolak biodata yang tidak cocok (lihat cocokBio()).

   Semua field opsional. Yang kosong tidak dirender, jadi mengisi
   sebagian tidak membuat halaman terlihat bolong.

     'jkt48-01': {
       name: 'Fiony Alveria Tantri', // WAJIB — pengaman id bergeser
       nickname: 'Fiony',            // nama panggung / panggilan
       gen: 'Gen 8',                 // angkatan
       role: 'Kapten Team Love',     // jabatan, kalau ada
       birthDate: '2003-06-06',      // ISO YYYY-MM-DD; usia & zodiak otomatis
       birthPlace: 'Jakarta',
       height: 158,                  // cm, angka saja
       bloodType: 'O',
       debut: '2018-09-15',          // tanggal bergabung, ISO
       jikoshoukai: 'Salam perkenalan…',
       social: {                     // isi URL lengkap ATAU username saja
         x: 'fiony_jkt48',
         instagram: 'https://www.instagram.com/…',
       },
     },

   Jangan menebak isinya. Kalau sumber tidak menyebut tinggi badan atau
   golongan darah, biarkan field-nya tidak ada.
   ------------------------------------------------------------- */

/* Platform sosial yang dikenali, beserta label tampil dan pola URL-nya.
   Pola dipakai HANYA kalau nilainya username (bukan URL lengkap) —
   struktur URL platform itu fakta publik, jadi aman dibentuk sendiri;
   yang tidak boleh ditebak adalah username membernya. */
const SOSIAL_META = {
  x:         { label: 'X',         pola: 'https://x.com/{u}' },
  instagram: { label: 'Instagram', pola: 'https://www.instagram.com/{u}/' },
  tiktok:    { label: 'TikTok',    pola: 'https://www.tiktok.com/@{u}' },
  youtube:   { label: 'YouTube',   pola: 'https://www.youtube.com/@{u}' },
  showroom:  { label: 'SHOWROOM',  pola: 'https://www.showroom-live.com/{u}' },
  idn:       { label: 'IDN Live',  pola: 'https://www.idn.app/{u}' },
  weibo:     { label: 'Weibo',     pola: 'https://weibo.com/{u}' },
  facebook:  { label: 'Facebook',  pola: 'https://www.facebook.com/{u}' },
};

const BIO = {
  /* AKB48 — 48 member */
  'akb48-01': {
    name: 'Chiba Erii',
    nickname: 'Erii',
    gen: '2nd Generation Draft Members',
    birthDate: '2003-10-27',
    birthPlace: 'Kanagawa',
    height: 165,
    bloodType: 'A',
  },
  'akb48-02': {
    name: 'Omori Maho',
    nickname: 'Mahopyon',
    gen: '3rd Generation Draft Members',
    birthDate: '1999-12-05',
    birthPlace: 'Ibaraki',
    height: 162,
    bloodType: 'B',
  },
  'akb48-03': {
    name: 'Oguri Yui',
    nickname: 'Yuiyui',
    gen: 'Team 8 / (April, 2014)',
    birthDate: '2001-12-26',
    birthPlace: 'Tokyo',
    height: 163,
    bloodType: 'AB',
  },
  'akb48-04': {
    name: 'Kuranoo Narumi',
    nickname: 'Naru',
    gen: 'Team 8 / (April, 2014)',
    birthDate: '2000-11-08',
    birthPlace: 'Kumamoto',
    height: 152,
    bloodType: 'A',
  },
  'akb48-05': {
    name: 'Shitao Miu',
    nickname: 'Miu',
    gen: 'Team 8 / (April, 2014)',
    birthDate: '2001-04-03',
    birthPlace: 'Yamaguchi',
    height: 162,
    bloodType: 'A',
  },
  'akb48-06': {
    name: 'Takahshi Ayane',
    nickname: 'Yoshimin',
    gen: 'NMB48 9th Generation',
    birthDate: '2007-10-18',
    birthPlace: 'Hyogo',
    height: 158,
    bloodType: 'A',
  },
  'akb48-07': {
    name: 'Nagano Serika',
    nickname: 'Serichan',
    gen: 'Team 8 / (April, 2014)',
    birthDate: '2001-03-27',
    birthPlace: 'Osaka',
    height: 158,
    bloodType: 'O',
  },
  'akb48-08': {
    name: 'Hashimoto Haruna',
    nickname: 'Harupyon',
    gen: 'Team 8 / (April, 2014)',
    birthDate: '2000-05-25',
    birthPlace: 'Toyama',
    height: 150,
    bloodType: 'A',
  },
  'akb48-09': {
    name: 'Tokunaga Remi',
    nickname: 'Remi',
    gen: 'Team 8 / (October, 2019)',
    birthDate: '2006-10-01',
    birthPlace: 'Tottori',
    height: 157,
    bloodType: 'O',
  },
  'akb48-10': {
    name: 'Sakagawa Hiyuka',
    nickname: 'Hiyuka',
    gen: 'Team 8 / (December, 2019)',
    birthDate: '2006-10-07',
    birthPlace: 'Fukui',
    height: 159,
    bloodType: 'O',
  },
  'akb48-11': {
    name: 'Iwatate Saho',
    nickname: 'Sahhoo',
    gen: 'AKB48 13th Generation',
    birthDate: '1994-10-04',
    birthPlace: 'Kanagawa',
    height: 157,
    bloodType: 'B',
  },
  'akb48-12': {
    name: 'Fukuoka Seina',
    nickname: 'Seichan',
    gen: 'AKB48 15th Generation',
    birthDate: '2000-08-01',
    birthPlace: 'Kanagawa',
    height: 155,
  },
  'akb48-13': {
    name: 'Mukaichi Mion',
    nickname: 'Miion',
    gen: 'AKB48 15th Generation',
    birthDate: '1998-01-29',
    birthPlace: 'Saitama',
    height: 150,
    bloodType: 'O',
  },
  'akb48-14': {
    name: 'Suzuki Kurumi',
    nickname: 'Kururun',
    gen: 'AKB48 16th Generation',
    birthDate: '2004-09-02',
    birthPlace: 'Tokyo',
    height: 151,
    bloodType: 'A',
  },
  'akb48-15': {
    name: 'Taguchi Manaka',
    nickname: 'Manaka',
    gen: 'AKB48 16th Generation',
    birthDate: '2003-12-12',
    birthPlace: 'Kanagawa',
    height: 152,
  },
  'akb48-16': {
    name: 'Nagatomo Ayami',
    nickname: 'Ayamin',
    gen: 'AKB48 16th Generation',
    birthDate: '2000-11-02',
    birthPlace: 'Kanagawa',
    height: 161,
    bloodType: 'O',
  },
  'akb48-17': {
    name: 'Yamauchi Mizuki',
    nickname: 'Zukkii/Zucky<ref>[https://youtu.be/8AwaAg4Ht-I?is=Fgcy1jKP0hgHMch5 overture 2.0 - Luckyfes\'26 ver.]</ref>',
    gen: 'AKB48 16th Generation',
    birthDate: '2001-09-20',
    birthPlace: 'Tokyo',
    height: 162,
    bloodType: 'O',
  },
  'akb48-18': {
    name: 'Ota Yuki',
    nickname: 'Yukitan',
    gen: 'AKB48 17th Generation',
    birthDate: '2004-03-27',
    birthPlace: 'Kanagawa',
    height: 157,
    bloodType: 'O',
  },
  'akb48-19': {
    name: 'Sato Airi',
    nickname: 'Aichan',
    gen: 'AKB48 17th Generation',
    birthDate: '2004-06-24',
    birthPlace: 'Chiba',
    height: 156,
    bloodType: 'B',
  },
  'akb48-20': {
    name: 'Hashimoto Eriko',
    nickname: 'Erichan',
    gen: 'AKB48 17th Generation',
    birthDate: '2006-04-16',
    birthPlace: 'Osaka',
    height: 156,
    bloodType: 'B',
  },
  'akb48-21': {
    name: 'Hatekayama Nozomi',
    nickname: 'Nozofisu',
    gen: '1st Generation',
    birthDate: '1987-08-23',
    birthPlace: 'Tokyo',
    height: 156,
    bloodType: 'O',
  },
  'akb48-22': {
    name: 'Hirata Yuki',
    nickname: 'Yukinee',
    gen: 'AKB48 17th Generation',
    birthDate: '2002-09-03',
    birthPlace: 'Saitama',
    height: 157,
    bloodType: 'A',
  },
  'akb48-23': {
    name: 'Hotei Moka',
    nickname: 'Hotechan',
    gen: 'AKB48 17th Generation',
    birthDate: '2004-12-01',
    birthPlace: 'Hyogo',
    height: 151,
    bloodType: 'O',
  },
  'akb48-24': {
    name: 'Masai Mayuu',
    nickname: 'Mayuchan',
    gen: '17th Generation AKB48',
    birthDate: '2005-03-01',
    birthPlace: 'Saitama',
    height: 154,
    bloodType: 'B',
  },
  'akb48-25': {
    name: 'Mizushima Miyuu',
    nickname: 'Mizumin',
    gen: 'AKB48 17th Generation',
    birthDate: '2003-11-12',
    birthPlace: 'Hokkaido',
    height: 157,
    bloodType: 'A',
  },
  'akb48-26': {
    name: 'Yamazaki Sora',
    nickname: 'Sorara',
    gen: 'AKB48 17th Generation',
    birthDate: '2004-05-13',
    birthPlace: 'Tokyo',
    height: 152,
    bloodType: 'B',
  },
  'akb48-27': {
    name: 'Akiyama',
    nickname: 'Yunachan',
    gen: 'AKB48 18th Generation',
    birthPlace: 'Chiba',
    height: 158,
    bloodType: 'A',
  },
  'akb48-28': {
    name: 'Arai Sae',
    nickname: 'Saechan',
    gen: 'AKB48 18th Generation',
    birthPlace: 'Tokyo',
    height: 162,
    bloodType: 'A',
  },
  'akb48-29': {
    name: 'Kudo Kasumi',
    nickname: 'Yua',
    gen: 'Boku ga Mitakatta Aozora 1st Generation',
    birthDate: '2009-08-04',
    birthPlace: 'Hokkaido',
    height: 159,
    bloodType: 'B',
  },
  'akb48-30': {
    name: 'Kasumi',
    nickname: 'Kasumin',
    gen: 'AKB48 18th Generation',
    birthPlace: 'Oita',
    height: 159,
    bloodType: 'O',
  },
  'akb48-31': {
    name: 'Kubo Hinano',
    nickname: 'Chanhina',
    gen: 'AKB48 18th Generation',
    birthPlace: 'Nagano',
    height: 163,
    bloodType: 'A',
  },
  'akb48-32': {
    name: 'Sako Yumemi',
    nickname: 'Yumemin',
    gen: 'AKB48 18th Generation',
    birthPlace: 'Saitama',
    height: 162,
  },
  'akb48-33': {
    name: 'Narita Kohina',
    nickname: 'Kohi',
    gen: 'AKB48 18th Generation',
    birthPlace: 'Hokkaido',
    height: 158,
    bloodType: 'AB',
  },
  'akb48-34': {
    name: 'Yagi Azuki',
    nickname: 'Azu',
    gen: 'AKB48 18th Generation',
    birthPlace: 'Tokyo',
    height: 159,
  },
  'akb48-35': {
    name: 'Yamaguchi Yui',
    nickname: 'Yuichi',
    gen: 'AKB48 18th Generation',
    birthPlace: 'Nagasaki',
    height: 158,
    bloodType: 'A',
  },
  'akb48-36': {
    name: 'Ito Momoka',
    nickname: 'Itomomo',
    gen: 'AKB48 19th Generation',
    birthDate: '2003-12-06',
    birthPlace: 'Saitama',
    height: 157,
    bloodType: 'A',
  },
  'akb48-37': {
    name: 'Okumoto Kairi',
    nickname: 'Kairi',
    gen: 'AKB48 19th Generation',
    birthDate: '2007-01-27',
    birthPlace: 'Tokyo',
    height: 155,
    bloodType: 'O',
  },
  'akb48-38': {
    name: 'Kawamura Yui',
    nickname: 'Kawayui',
    gen: 'AKB48 19th Generation',
    birthDate: '2006-06-18',
    birthPlace: 'Hokkaido',
    height: 155,
    bloodType: 'A',
  },
  'akb48-39': {
    name: 'Shiratori Sari',
    nickname: 'Sarii',
    gen: 'AKB48 19th Generation',
    birthDate: '2010-09-10',
    birthPlace: 'Tokyo',
    height: 160,
    bloodType: 'A',
  },
  'akb48-40': {
    name: 'Hanada Mei',
    nickname: 'Meimei',
    gen: 'AKB48 19th Generation',
    birthDate: '2005-06-05',
    birthPlace: 'Kanagawa',
    height: 152,
    bloodType: 'O',
  },
  'akb48-41': {
    name: 'Oga Saki',
    nickname: 'Saachan',
    gen: 'AKB48 20th Generation',
    birthDate: '2006-05-16',
    birthPlace: 'Fukushima',
    height: 168,
    bloodType: 'B',
  },
  'akb48-42': {
    name: 'Kondo Saki',
    nickname: 'Kosaki',
    gen: 'AKB48 20th Generation',
    birthDate: '2012-02-23',
    birthPlace: 'Aichi',
  },
  'akb48-43': {
    name: 'Maruyama Hinata',
    nickname: 'Maruchan',
    gen: 'AKB48 20th Generation',
    birthDate: '2008-07-11',
    birthPlace: 'Niigata',
    height: 159,
    bloodType: 'A',
  },
  'akb48-44': {
    name: 'Takahashi Mao',
    nickname: 'Maatan',
    gen: 'AKB48 21st Generation',
    birthDate: '2010-06-25',
    birthPlace: 'Hokkaido',
    height: 156,
  },
  'akb48-45': {
    name: 'Tanaka Sayuri',
    nickname: 'Sayurin',
    gen: 'AKB48 21st Generation',
    birthDate: '2008-12-09',
    birthPlace: 'Saitama',
  },
  'akb48-46': {
    name: 'Makito Ema',
    nickname: 'Emachan',
    gen: 'AKB48 21st Generation',
    birthDate: '2007-05-25',
    birthPlace: 'Aichi',
    height: 156,
  },
  'akb48-47': {
    name: 'Morikawa Yu',
    nickname: 'Yuuyu',
    gen: 'AKB48 21st Generation',
    birthDate: '2008-06-24',
    birthPlace: 'Hyogo',
    height: 161,
    bloodType: 'AB',
  },
  'akb48-48': {
    name: 'Watanabe Kiko',
    nickname: 'Kikochan',
    gen: 'AKB48 21st Generation',
    birthDate: '2007-07-12',
    birthPlace: 'Akita',
  },
  'akb48-49': {
    name: 'Yamane Suzuha',
    nickname: 'Zunchan (ずんちゃん)',
    birthDate: '2000-08-11',
    birthPlace: 'Hyogo',
    height: 158,
    bloodType: 'A',
  },

  /* SKE48 — 56 member */
  'ske48-01': {
    name: 'Ida Reona',
    nickname: 'Reona',
    gen: 'SKE48 6th Generation',
    birthDate: '1998-12-03',
    birthPlace: 'Mie',
    height: 165,
    bloodType: 'AB',
  },
  'ske48-02': {
    name: 'Kamata Natsuki',
    nickname: 'Nakki',
    gen: 'SKE48 6th Generation',
    birthDate: '1996-08-29',
    birthPlace: 'Aichi',
    height: 163,
    bloodType: 'O',
  },
  'ske48-03': {
    name: 'Kumazaki Haruka',
    nickname: 'Kumachan',
    gen: 'SKE48 6th Generation',
    birthDate: '1997-08-10',
    birthPlace: 'Aichi',
    height: 160,
    bloodType: 'O',
  },
  'ske48-04': {
    name: 'Aikawa Honoka',
    nickname: 'Honono',
    gen: 'SKE48 7th Generation',
    birthDate: '2003-10-22',
    birthPlace: 'Aichi',
    height: 153,
    bloodType: 'O',
  },
  'ske48-05': {
    name: 'Asai Yuka',
    nickname: 'Yukatan',
    gen: 'SKE48 7th Generation',
    birthDate: '2003-11-10',
    birthPlace: 'Aichi',
    height: 163,
    bloodType: 'O',
  },
  'ske48-06': {
    name: 'Ota Ayaka',
    nickname: 'Ayamero',
    gen: 'SKE48 7th Generation',
    birthDate: '2000-08-17',
    birthPlace: 'Gifu',
    height: 153,
    bloodType: 'B',
  },
  'ske48-07': {
    name: 'Ishiguro Yuzuki',
    nickname: 'Yuzupo',
    gen: 'SKE48 8th Generation',
    birthDate: '2003-10-11',
    birthPlace: 'Aichi',
    height: 162,
    bloodType: 'AB',
  },
  'ske48-08': {
    name: 'Inoue Ruka',
    nickname: 'Ruuchan',
    gen: 'SKE48 8th Generation',
    birthDate: '2001-06-12',
    birthPlace: 'Kumamoto',
    height: 155,
    bloodType: 'O',
  },
  'ske48-09': {
    name: 'Kitagawa Yoshino',
    nickname: 'Yokonyan',
    gen: 'SKE48 8th Generation',
    birthDate: '2001-01-24',
    birthPlace: 'Osaka',
    height: 158,
    bloodType: 'O',
  },
  'ske48-10': {
    name: 'Kurashima Ami',
    nickname: 'Amichan',
    gen: 'SKE48 8th Generation',
    birthDate: '2005-06-28',
    birthPlace: 'Kanagawa',
    height: 153,
    bloodType: 'B',
  },
  'ske48-11': {
    name: 'Sakamoto Marin',
    nickname: 'Marin',
    gen: 'SKE48 8th Generation',
    birthDate: '2002-02-02',
    birthPlace: 'Aichi',
    height: 161,
    bloodType: 'B',
  },
  'ske48-12': {
    name: 'Sato Kaho',
    nickname: 'Satokaho',
    gen: 'SKE48 8th Generation',
    birthDate: '1997-05-16',
    birthPlace: 'Aichi',
    height: 160,
    bloodType: 'A',
  },
  'ske48-13': {
    name: 'Nomura Miyo',
    nickname: 'Miyomaru',
    gen: 'SKE48 8th Generation',
    birthDate: '2003-02-01',
    birthPlace: 'Aichi',
    height: 168,
    bloodType: 'A',
  },
  'ske48-14': {
    name: 'Akahori Kimie',
    nickname: 'Kimi',
    gen: 'SKE48 9th Generation',
    birthDate: '2002-01-21',
    birthPlace: 'Shizuoka',
    height: 157,
    bloodType: 'A',
  },
  'ske48-15': {
    name: 'Arano Himeka',
    nickname: 'Himetan',
    gen: 'SKE48 9th Generation',
    birthDate: '2002-01-09',
    birthPlace: 'Kanagawa',
    height: 168,
    bloodType: 'O',
  },
  'ske48-16': {
    name: 'Ikeda Kaede',
    nickname: 'Kaenyan',
    gen: 'SKE48 9th Generation',
    birthDate: '2000-07-05',
    birthPlace: 'Nagasaki',
    height: 155,
    bloodType: 'O',
  },
  'ske48-17': {
    name: 'Iriuchijima Sayaka',
    nickname: 'Saya',
    gen: 'SKE48 9th Generation',
    birthDate: '1999-05-13',
    birthPlace: 'Kanagawa',
    height: 154,
    bloodType: 'O',
  },
  'ske48-18': {
    name: 'Suzuki Ena',
    nickname: 'Enamaru',
    gen: 'SKE48 9th Generation',
    birthDate: '2004-01-09',
    birthPlace: 'Aichi',
    height: 158,
    bloodType: 'A',
  },
  'ske48-19': {
    name: 'Suzuki Kokona',
    nickname: 'Kokona',
    gen: 'SKE48 9th Generation',
    birthDate: '2003-12-28',
    birthPlace: 'Gifu',
    height: 156,
    bloodType: 'A',
  },
  'ske48-20': {
    name: 'Nakasaka Miyu',
    nickname: 'Nakachan',
    gen: 'SKE48 9th Generation',
    birthDate: '2005-06-11',
    birthPlace: 'Aichi',
    height: 159,
    bloodType: 'O',
  },
  'ske48-21': {
    name: 'Aoki Rika',
    nickname: 'Rian',
    gen: 'SKE48 10th Generation',
    birthDate: '1999-09-02',
    birthPlace: 'Osaka',
    height: 165,
    bloodType: 'A',
  },
  'ske48-22': {
    name: 'Ito Miki',
    nickname: 'Miki',
    gen: 'SKE48 10th Generation',
    birthDate: '2002-08-11',
    birthPlace: 'Aichi',
    height: 164,
    bloodType: 'A',
  },
  'ske48-23': {
    name: 'Nishii Mio',
    nickname: 'Mio',
    gen: 'SKE48 10th Generation',
    birthDate: '2001-03-16',
    birthPlace: 'Osaka',
    height: 154,
  },
  'ske48-24': {
    name: 'Omura Anzu',
    nickname: 'AzuAzu',
    gen: 'SKE48 11th Generation',
    birthDate: '2005-09-20',
    birthPlace: 'Aichi',
    height: 155,
    bloodType: 'O',
  },
  'ske48-25': {
    name: 'Shinohara Kyoka',
    nickname: 'Kyoppy',
    gen: 'SKE48 11th Generation',
    birthDate: '2004-06-03',
    birthPlace: 'Hyogo',
    height: 155,
    bloodType: 'O',
  },
  'ske48-26': {
    name: 'Sugimoto Riina',
    nickname: 'Riichan',
    gen: 'SKE48 11th Generation',
    birthDate: '2008-09-20',
    birthPlace: 'Aichi',
    height: 156,
    bloodType: 'A',
  },
  'ske48-27': {
    name: 'Hara Yune',
    nickname: 'Yuune',
    gen: 'SKE48 11th Generation',
    birthDate: '2001-11-23',
    birthPlace: 'Fukuoka',
    height: 152,
    bloodType: 'O',
  },
  'ske48-28': {
    name: 'Morimoto Kurumi',
    nickname: 'Kurumin',
    gen: 'SKE48 11th Generation',
    birthDate: '2007-09-03',
    birthPlace: 'Nara',
    height: 162,
    bloodType: 'B',
  },
  'ske48-29': {
    name: 'Yamamura Sakura',
    nickname: 'Sakkuu',
    gen: 'SKE48 11th Generation',
    birthDate: '2006-09-20',
    birthPlace: 'Aichi',
    height: 155,
    bloodType: 'A',
  },
  'ske48-30': {
    name: 'Ito Kokomi',
    nickname: 'Kokomin',
    gen: 'SKE48 12th Generation',
    birthDate: '2008-12-08',
    birthPlace: 'Nagano',
    height: 158,
    bloodType: 'A',
  },
  'ske48-31': {
    name: 'Okuno Kokoha',
    nickname: 'Kokoha',
    gen: 'SKE48 12th Generation',
    birthDate: '2005-02-20',
    birthPlace: 'Hiroshima',
    height: 168,
    bloodType: 'A',
  },
  'ske48-32': {
    name: 'Kawamura Yua',
    nickname: 'Yuanyan',
    gen: 'SKE48 12th Generation',
    birthDate: '2006-01-31',
    birthPlace: 'Aichi',
    height: 152,
    bloodType: 'A',
  },
  'ske48-33': {
    name: 'Kuramoto Hana',
    nickname: 'Hananan',
    gen: 'SKE48 12th Generation',
    birthDate: '2004-09-13',
    birthPlace: 'Gifu',
    height: 156,
    bloodType: 'A',
  },
  'ske48-34': {
    name: 'Takamura Saya',
    nickname: 'Saya',
    gen: 'SKE48 12th Generation',
    birthDate: '2004-07-04',
    birthPlace: 'Kanagawa',
    height: 153,
    bloodType: 'O',
  },
  'ske48-35': {
    name: 'Hasegawa Miyabi',
    nickname: 'Miichan',
    gen: 'SKE48 12th Generation',
    birthDate: '2010-11-20',
    birthPlace: 'Aichi',
    height: 152,
    bloodType: 'A',
  },
  'ske48-36': {
    name: 'Matsukawa Miyu',
    nickname: 'Miyu',
    gen: 'SKE48 12th Generation',
    birthDate: '2008-04-15',
    birthPlace: 'Aichi',
    height: 160,
  },
  'ske48-37': {
    name: 'Minamisawa Coco',
    nickname: 'Cocchan',
    gen: 'SKE48 12th Generation',
    birthDate: '2007-10-26',
    birthPlace: 'Nagano',
    height: 165,
    bloodType: 'A',
  },
  'ske48-38': {
    name: 'Ota Manae',
    nickname: 'Manae',
    gen: 'SKE48 13th Generation',
    birthDate: '2007-12-16',
    birthPlace: 'Hyogo',
    height: 164,
    bloodType: 'B',
  },
  'ske48-39': {
    name: 'Kawamura Shoko',
    nickname: 'Shoko',
    gen: 'SKE48 13th Generation',
    birthDate: '2007-09-15',
    birthPlace: 'Gifu',
    height: 162,
    bloodType: 'B',
  },
  'ske48-40': {
    name: 'Kubota Rei',
    nickname: 'Rei',
    gen: 'SKE48 13th Generation',
    birthDate: '2009-11-23',
    birthPlace: 'Aichi',
    height: 155,
    bloodType: 'A',
  },
  'ske48-41': {
    name: 'Kumoi Sana',
    nickname: 'Sanachan',
    gen: 'SKE48 13th Generation',
    birthDate: '2005-11-27',
    birthPlace: 'Aichi',
    height: 157,
    bloodType: 'B',
  },
  'ske48-42': {
    name: 'Kuwahara Tsubaki',
    nickname: 'Tsuuchan',
    gen: 'SKE48 13th Generation',
    birthDate: '2006-02-25',
    birthPlace: 'Saga',
    height: 167,
    bloodType: 'A',
  },
  'ske48-43': {
    name: 'Kondo Mikoto',
    nickname: 'Miiko',
    gen: 'SKE48 13th Generation',
    birthDate: '2003-11-25',
    birthPlace: 'Tottori',
    height: 160,
    bloodType: 'A',
  },
  'ske48-44': {
    name: 'Sakurai Arisa',
    nickname: 'Risanya',
    gen: 'SKE48 13th Generation',
    birthDate: '2003-11-07',
    birthPlace: 'Tokyo',
    height: 159,
    bloodType: 'A',
  },
  'ske48-45': {
    name: 'Sasaki Nozomi',
    nickname: 'Nontan',
    gen: 'SKE48 13th Generation',
    birthDate: '2010-10-19',
    birthPlace: 'Aichi',
    height: 160,
    bloodType: 'O',
  },
  'ske48-46': {
    name: 'Tachibana Ayame',
    nickname: 'Amechan',
    gen: 'SKE48 13th Generation',
    birthDate: '2009-06-24',
    birthPlace: 'Tokyo',
    height: 154,
    bloodType: 'B',
  },
  'ske48-47': {
    name: 'Tamura Mayu',
    nickname: 'Mayutan',
    gen: 'Nogizaka46 4th Generation',
    birthDate: '1999-01-12',
    birthPlace: 'Saitama',
    height: 158,
    bloodType: 'A',
  },
  'ske48-48': {
    name: 'Hijiri Haruka',
    nickname: 'Haruru',
    gen: 'SKE48 13th Generation',
    birthDate: '2007-02-04',
    birthPlace: 'Tokyo',
    height: 162,
  },
  'ske48-49': {
    name: 'Miyamoto Rinka',
    nickname: 'Rinka',
    gen: 'SKE48 13th Generation',
    birthDate: '2007-09-10',
    birthPlace: 'Kumamoto',
    height: 157,
    bloodType: 'O',
  },
  'ske48-50': {
    name: 'Yokoi Shiho',
    nickname: 'Shiitan',
    gen: 'SKE48 13th Generation',
    birthDate: '2011-11-08',
    birthPlace: 'Aichi',
    height: 145,
    bloodType: 'B',
  },
  'ske48-51': {
    name: 'Iida Yura',
    nickname: 'Yurayura',
    gen: 'SKE48 14th Generation',
    birthDate: '2012-07-04',
    birthPlace: 'Aichi',
    height: 156,
    bloodType: 'A',
  },
  'ske48-52': {
    name: 'Ikeda Arisa',
    nickname: 'Aritan',
    gen: 'SKE48 14th Generation',
    birthDate: '2011-08-25',
    birthPlace: 'Aichi',
    height: 164,
    bloodType: 'B',
  },
  'ske48-53': {
    name: 'Takeshita Marika',
    nickname: 'Maripi',
    gen: 'SKE48 14th Generation',
    birthDate: '2005-12-17',
    birthPlace: 'Osaka',
    height: 166,
    bloodType: 'A',
  },
  'ske48-54': {
    name: 'Nakao Fuka',
    nickname: 'Fukachan',
    gen: 'SKE48 14th Generation',
    birthDate: '2007-01-17',
    birthPlace: 'Aichi',
    height: 155,
    bloodType: 'O',
  },
  'ske48-55': {
    name: 'Yajima Nagi',
    nickname: 'Nagichi',
    gen: 'SKE48 14th Generation',
    birthDate: '2008-09-09',
    birthPlace: 'Aichi',
    height: 151,
    bloodType: 'O',
  },
  'ske48-56': {
    name: 'Matsumoto Chikako',
    nickname: 'Chikako',
    gen: '1st Generation Draft Members',
    birthDate: '1999-11-19',
    birthPlace: 'Osaka',
    height: 160,
    bloodType: 'O',
  },

  /* NMB48 — 50 member */
  'nmb48-01': {
    name: 'Abe Wakana',
    nickname: 'Wakapon',
    gen: 'NMB48 3rd Draft Generation',
    birthDate: '2001-07-18',
    birthPlace: 'Osaka',
    height: 159,
    bloodType: 'O',
  },
  'nmb48-02': {
    name: 'Izumi Ayano',
    nickname: 'Aanon',
    gen: '3rd Generation Draft Members',
    birthDate: '2004-11-22',
    birthPlace: 'Kyoto',
    height: 165,
    bloodType: 'AB',
  },
  'nmb48-03': {
    name: 'Shiotsuki Keito',
    nickname: 'Keito',
    gen: '3rd Generation Draft Members',
    birthDate: '2005-12-15',
    birthPlace: 'Osaka',
    height: 160,
    bloodType: 'A',
  },
  'nmb48-04': {
    name: 'Mizuta Shiori',
    nickname: 'Shiori',
    gen: 'NMB48 5th Generation',
    birthDate: '1998-12-21',
    birthPlace: 'Ehime',
    height: 155,
    bloodType: 'B',
  },
  'nmb48-05': {
    name: 'Shinzawa Nao',
    nickname: 'ShinShin',
    gen: 'NMB48 6th Generation',
    birthDate: '1998-08-02',
    birthPlace: 'Hyogo',
    height: 156,
    bloodType: 'B',
  },
  'nmb48-06': {
    name: 'Hirayama Mai',
    nickname: 'Maitii',
    gen: 'NMB48 7th Generation',
    birthDate: '2002-11-16',
    birthPlace: 'Osaka',
    height: 164,
    bloodType: 'A',
  },
  'nmb48-07': {
    name: 'Ike Honoka',
    nickname: 'Hono',
    gen: 'NMB48 8th Generation',
    birthDate: '2003-12-16',
    birthPlace: 'Nara',
    height: 158,
    bloodType: 'O',
  },
  'nmb48-08': {
    name: 'Kuroshima Sakura',
    nickname: 'Sakuchan',
    gen: 'NMB48 8th Generation',
    birthDate: '2009-04-07',
    birthPlace: 'Osaka',
    height: 150,
    bloodType: 'A',
  },
  'nmb48-09': {
    name: 'Sakashita Mako',
    nickname: 'Makochi',
    gen: 'NMB48 8th Generation',
    birthDate: '2005-08-02',
    birthPlace: 'Osaka',
    height: 160,
  },
  'nmb48-10': {
    name: 'Sakata Misaki',
    nickname: 'Sakatan',
    gen: 'NMB48 8th Generation',
    birthDate: '2005-11-08',
    birthPlace: 'Osaka',
    height: 156,
    bloodType: 'B',
  },
  'nmb48-11': {
    name: 'Sakamoto Risa',
    nickname: 'Risa',
    gen: 'NMB48 8th Generation',
    birthDate: '2008-12-24',
    birthPlace: 'Hyogo',
    height: 154,
  },
  'nmb48-12': {
    name: 'Sakurada Ayaka',
    nickname: 'Ayapyon',
    gen: 'NMB48 8th Generation',
    birthDate: '2002-03-25',
    birthPlace: 'Okayama',
    height: 158,
    bloodType: 'A',
  },
  'nmb48-13': {
    name: 'Tatsumoto Yayoi',
    nickname: 'Yayoi',
    gen: 'NMB48 8th Generation',
    birthDate: '2005-03-02',
    birthPlace: 'Hyogo',
    height: 164,
    bloodType: 'O',
  },
  'nmb48-14': {
    name: 'Tanaka Yukino',
    nickname: 'Yukino',
    gen: 'NMB48 8th Generation',
    birthDate: '2007-11-16',
    birthPlace: 'Osaka',
    height: 153,
    bloodType: 'O',
  },
  'nmb48-15': {
    name: 'Fukuna Ami',
    nickname: 'Amii (あみー)',
    birthDate: '2005-05-24',
    birthPlace: 'Osaka',
    height: 160,
    bloodType: 'O',
  },
  'nmb48-16': {
    name: 'Matsuoka Sakura',
    nickname: 'Sakura',
    gen: 'NMB48 8th Generation',
    birthDate: '2003-06-24',
    birthPlace: 'Osaka',
    height: 152,
  },
  'nmb48-17': {
    name: 'Matsumoto Mihina',
    nickname: 'Mihhii',
    gen: 'NMB48 8th Generation',
    birthDate: '2008-05-22',
    birthPlace: 'Osaka',
    height: 151,
    bloodType: 'A',
  },
  'nmb48-18': {
    name: 'Aobara Yuuka',
    nickname: 'Yukatan (ゆかたん)',
    birthDate: '2007-07-12',
    birthPlace: 'Osaka',
    height: 158,
    bloodType: 'A',
  },
  'nmb48-19': {
    name: 'Aobara Waka',
    nickname: 'Wakatan',
    gen: 'NMB48 9th Generation',
    birthDate: '2004-01-06',
    birthPlace: 'Osaka',
    height: 158,
    bloodType: 'A',
  },
  'nmb48-20': {
    name: 'Ikeda Tenna',
    nickname: 'Tenna',
    gen: 'NMB48 9th Generation',
    birthDate: '2005-10-05',
    birthPlace: 'Hyogo',
    height: 161,
    bloodType: 'AB',
  },
  'nmb48-21': {
    name: 'Itagaki Koyori',
    nickname: 'Koyorin',
    gen: 'NMB48 9th Generation',
    birthDate: '2005-05-23',
    birthPlace: 'Mie',
    height: 159,
    bloodType: 'AB',
  },
  'nmb48-22': {
    name: 'Kinugasa Ayami',
    nickname: 'Ayami',
    gen: 'NMB48 9th Generation',
    birthDate: '2010-11-03',
    birthPlace: 'Osaka',
    height: 150,
    bloodType: 'O',
  },
  'nmb48-23': {
    name: 'Tanaka Misora',
    nickname: 'Misora',
    gen: 'NMB48 9th Generation',
    birthDate: '2004-08-24',
    birthPlace: 'Kyoto',
    height: 150,
    bloodType: 'O',
  },
  'nmb48-24': {
    name: 'Nishi Yuma',
    nickname: 'Nishiyuma',
    gen: 'NMB48 9th Generation',
    birthDate: '2006-03-25',
    birthPlace: 'Chiba',
    height: 160,
  },
  'nmb48-25': {
    name: 'Nishijima Rio',
    nickname: 'Riopi',
    gen: 'NMB48 9th Generation',
    birthDate: '2004-11-08',
    birthPlace: 'Shizuoka',
    height: 164,
    bloodType: 'O',
  },
  'nmb48-26': {
    name: 'Nishida Honoka',
    nickname: 'Honopii',
    gen: 'NMB48 9th Generation',
    birthDate: '2005-03-10',
    birthPlace: 'Nara',
    height: 157,
    bloodType: 'A',
  },
  'nmb48-27': {
    name: 'Haga Rei',
    nickname: 'Reipon',
    gen: 'NMB48 9th Generation',
    birthDate: '2006-03-29',
    birthPlace: 'Hyogo',
    height: 153,
  },
  'nmb48-28': {
    name: 'Funahashi Reina',
    nickname: 'Renya',
    gen: 'NMB48 9th Generation',
    birthDate: '2008-04-01',
    birthPlace: 'Osaka',
    height: 154,
    bloodType: 'O',
  },
  'nmb48-29': {
    name: 'Miyamoto Ami',
    nickname: 'Amitan',
    gen: 'NMB48 9th Generation',
    birthDate: '2010-07-01',
    birthPlace: 'Hyogo',
    height: 140,
    bloodType: 'AB',
  },
  'nmb48-30': {
    name: 'Yoshimi Ayane',
    nickname: 'Yoshimin',
    gen: 'NMB48 9th Generation',
    birthDate: '2007-10-18',
    birthPlace: 'Hyogo',
    height: 158,
    bloodType: 'A',
  },
  'nmb48-31': {
    name: 'Ishiyama Chihiro',
    nickname: 'Chihirun',
    gen: 'NMB48 10th Generation',
    birthDate: '2008-05-24',
    birthPlace: 'Hyogo',
    height: 165,
    bloodType: 'O',
  },
  'nmb48-32': {
    name: 'Uchida Aisha',
    nickname: 'Aishan',
    gen: 'NMB48 10th Generation',
    birthDate: '2004-06-12',
    birthPlace: 'Osaka',
    height: 155,
    bloodType: 'O',
  },
  'nmb48-33': {
    name: 'Kine Iroha',
    nickname: 'Irohan',
    gen: 'NMB48 10th Generation',
    birthDate: '2010-10-25',
    birthPlace: 'Osaka',
    height: 160,
    bloodType: 'A',
  },
  'nmb48-34': {
    name: 'Shibuya Asana',
    nickname: 'Asanya',
    gen: 'NMB48 10th Generation',
    birthDate: '2006-10-27',
    birthPlace: 'Miyagi',
    height: 161,
    bloodType: 'B',
  },
  'nmb48-35': {
    name: 'Takahashi Kotone',
    nickname: 'Kotocchi',
    gen: 'NMB48 10th Generation',
    birthDate: '2003-04-20',
    birthPlace: 'Osaka',
    height: 164,
    bloodType: 'AB',
  },
  'nmb48-36': {
    name: 'Takeda Kyoka',
    nickname: 'Kyooka',
    gen: 'NMB48 10th Generation',
    birthDate: '2012-09-13',
    birthPlace: 'Osaka',
    height: 150,
    bloodType: 'O',
  },
  'nmb48-37': {
    name: 'Tanaka Miria',
    nickname: 'Miichan',
    gen: 'NMB48 10th Generation',
    birthDate: '2010-12-09',
    birthPlace: 'Nara',
    height: 154,
    bloodType: 'O',
  },
  'nmb48-38': {
    name: 'Miyahara Konon',
    nickname: 'Kononon',
    gen: 'NMB48 10th Generation',
    birthDate: '2010-04-19',
    birthPlace: 'Osaka',
    height: 150,
    bloodType: 'AB',
  },
  'nmb48-39': {
    name: 'Murai Yuri',
    nickname: 'Yuurin',
    gen: 'NMB48 10th Generation',
    birthDate: '2005-03-05',
    birthPlace: 'Mie',
    height: 152,
    bloodType: 'B',
  },
  'nmb48-40': {
    name: 'Yamaguchi Mio',
    nickname: 'Miochan',
    gen: 'NMB48 10th Generation',
    birthDate: '2007-09-27',
    birthPlace: 'Osaka',
    height: 161,
    bloodType: 'B',
  },
  'nmb48-41': {
    name: 'Akamatsu Sora',
    nickname: 'Sorarin',
    gen: 'NMB48 11th Generation',
    birthDate: '2010-04-15',
    birthPlace: 'Osaka',
    height: 161,
  },
  'nmb48-42': {
    name: 'Okagoshi Seira',
    nickname: 'Seechan',
    gen: 'NMB48 11th Generation',
    birthDate: '2006-11-10',
    birthPlace: 'Osaka',
    height: 160,
    bloodType: 'A',
  },
  'nmb48-43': {
    name: 'Sakurai Himari',
    nickname: 'Himari',
    gen: 'NMB48 11th Generation',
    birthDate: '2008-08-02',
    birthPlace: 'Osaka',
    height: 154,
    bloodType: 'O',
  },
  'nmb48-44': {
    name: 'Zenke Yurika',
    nickname: 'Zenchan',
    gen: 'NMB48 11th Generation',
    birthDate: '2004-12-09',
    birthPlace: 'Hyogo',
    height: 159,
    bloodType: 'O',
  },
  'nmb48-45': {
    name: 'Takahashi Juna',
    nickname: 'Mauchan',
    gen: '1st Generation NGT48',
    birthDate: '2001-06-03',
    birthPlace: 'Niigata',
    height: 160,
    bloodType: 'A',
  },
  'nmb48-46': {
    name: 'Juna',
    nickname: 'Jucchan',
    gen: 'NGT48 4th Generation',
    birthDate: '2006-04-20',
    birthPlace: 'Toyama',
    bloodType: 'O',
  },
  'nmb48-47': {
    name: 'Tanaka Rei',
    nickname: 'ReiRei',
    gen: 'NMB48 11th Generation',
    birthDate: '2006-11-01',
    birthPlace: 'Tokyo',
    height: 155,
    bloodType: 'O',
  },
  'nmb48-48': {
    name: 'Taniguchi Shino',
    nickname: 'Shinochan',
    gen: 'NMB48 11th Generation',
    birthDate: '2000-11-15',
    birthPlace: 'Kanagawa',
    height: 155,
    bloodType: 'A',
  },
  'nmb48-49': {
    name: 'Nishizumi Misaki',
    nickname: 'Miinyan',
    gen: 'NMB48 11th Generation',
    birthDate: '2012-11-27',
    birthPlace: 'Hyogo',
    height: 159,
    bloodType: 'A',
  },
  'nmb48-50': {
    name: 'Fukuhara Kotomi',
    nickname: 'Kotomin',
    gen: 'NMB48 11th Generation',
    birthDate: '2005-09-26',
    birthPlace: 'Osaka',
    height: 149,
    bloodType: 'O',
  },
  'nmb48-51': {
    name: 'Yabuuchi Hinata',
    nickname: 'Hiinya',
    gen: 'NMB48 11th Generation',
    birthDate: '2008-05-20',
    birthPlace: 'Osaka',
    height: 151,
    bloodType: 'A',
  },
  'nmb48-52': {
    name: 'Wada Kotone',
    nickname: 'Kottii',
    gen: 'NMB48 11th Generation',
    birthDate: '2008-09-29',
    birthPlace: 'Osaka',
    height: 157,
    bloodType: 'B',
  },
  'nmb48-53': {
    name: 'Nakagawa Tomoka',
    nickname: 'Tomocha (ともちゃ)',
    birthDate: '2006-01-02',
    birthPlace: 'Wakayama',
    height: 160,
    bloodType: 'B',
  },
  'nmb48-54': {
    name: 'Mikamo Kurumi',
    nickname: 'Kurumi (くるみ)',
    birthDate: '2001-10-31',
    birthPlace: 'Tokyo',
    height: 161,
    bloodType: 'O',
  },
  'nmb48-55': {
    name: 'Miyazaki Sae',
    nickname: 'Saepon (さえぽん)',
    birthDate: '2010-12-29',
    birthPlace: 'Mie',
    height: 152,
  },

  /* HKT48 — 36 member */
  'hkt48-01': {
    name: 'Ikuno Rina',
    nickname: 'Ikunochan',
    gen: 'HKT48 6th Generation',
    birthDate: '2010-08-03',
    birthPlace: 'Fukuoka',
    height: 155,
    bloodType: 'AB',
  },
  'hkt48-02': {
    name: 'Ishibashi Ibuki',
    nickname: 'Ibuki',
    gen: 'HKT48 5th Generation',
    birthDate: '2005-07-22',
    birthPlace: 'Fukuoka',
    height: 153,
    bloodType: 'A',
  },
  'hkt48-03': {
    name: 'Ishimatsu Yuina',
    nickname: 'Yuichan',
    gen: 'HKT48 6th Generation',
    birthDate: '2012-01-28',
    birthPlace: 'Fukuoka',
    height: 147,
    bloodType: 'A',
  },
  'hkt48-04': {
    name: 'Ichimura Airi',
    nickname: 'Aichii',
    gen: 'HKT48 5th Generation',
    birthDate: '2001-02-13',
    birthPlace: 'Kanagawa',
    height: 156,
  },
  'hkt48-05': {
    name: 'Kitagawa Hiiro',
    nickname: 'Hiiro',
    gen: 'HKT48 6th Generation',
    birthDate: '2004-01-23',
    birthPlace: 'Fukuoka',
    height: 161,
    bloodType: 'O',
  },
  'hkt48-06': {
    name: 'Kurihara Sae',
    nickname: 'Saechan',
    gen: 'HKT48 3rd Generation',
    birthDate: '1996-06-20',
    birthPlace: 'Fukuoka',
    height: 164,
    bloodType: 'O',
  },
  'hkt48-07': {
    name: 'Shibui Mina',
    nickname: 'Shibuichan',
    gen: 'HKT48 6th Generation',
    birthDate: '2009-03-23',
    birthPlace: 'Tokyo',
    height: 156,
    bloodType: 'O',
  },
  'hkt48-08': {
    name: 'Toyonaga Aki',
    nickname: 'Akichan',
    gen: 'HKT48 4th Generation',
    birthDate: '1999-10-25',
    birthPlace: 'Fukuoka',
    height: 158,
    bloodType: 'B',
  },
  'hkt48-09': {
    name: 'Nakano Minami',
    nickname: 'Miina',
    gen: 'HKT48 7th Generation',
    birthDate: '2008-12-29',
    birthPlace: 'Fukuoka',
    height: 160,
    bloodType: 'B',
  },
  'hkt48-10': {
    name: 'Fujino Kokoha',
    nickname: 'Kokoha',
    gen: 'HKT48 6th Generation',
    birthDate: '2008-05-25',
    birthPlace: 'Fukuoka',
    height: 161,
    bloodType: 'O',
  },
  'hkt48-11': {
    name: 'Fuchigami Mai',
    nickname: 'Maichan',
    gen: 'HKT48 2nd Generation',
    birthDate: '1996-09-21',
    birthPlace: 'Fukuoka',
    height: 157,
    bloodType: 'A',
  },
  'hkt48-12': {
    name: 'Matsunaga Yui',
    nickname: 'Yui (ゆい) / Yuipan (ゆいパン)',
    birthDate: '2009-11-13',
    birthPlace: 'Fukuoka, Japan',
    height: 151,
    bloodType: 'O',
  },
  'hkt48-13': {
    name: 'Yanase Reia',
    nickname: 'Reia',
    gen: 'HKT48 6th Generation',
    birthDate: '2006-06-29',
    birthPlace: 'Kanagawa',
    height: 170,
    bloodType: 'B',
  },
  'hkt48-14': {
    name: 'Yamauchi Yuna',
    nickname: 'Yuuna',
    gen: 'HKT48 3rd Generation',
    birthDate: '1999-07-06',
    birthPlace: 'Fukuoka',
    height: 157,
    bloodType: 'A',
  },
  'hkt48-15': {
    name: 'Ryuto Ayane',
    nickname: 'Ayachan',
    gen: 'HKT48 7th Generation',
    birthDate: '2010-06-30',
    birthPlace: 'Nagasaki',
    height: 152,
    bloodType: 'B',
  },
  'hkt48-16': {
    name: 'Akiyoshi Yuka',
    nickname: 'Yukachan',
    gen: 'HKT48 2nd Generation',
    birthDate: '2000-10-24',
    birthPlace: 'Fukuoka',
    height: 158,
    bloodType: 'B',
  },
  'hkt48-17': {
    name: 'Izawa Miyu',
    nickname: 'Zawachan',
    gen: 'HKT48 6th Generation',
    birthDate: '2006-08-14',
    birthPlace: 'Fukuoka',
    height: 161,
    bloodType: 'B',
  },
  'hkt48-18': {
    name: 'Ishii Ayane',
    nickname: 'Aatan',
    gen: 'HKT48 7th Generation',
    birthDate: '2006-11-27',
    birthPlace: 'Fukuoka',
    height: 153,
    bloodType: 'O',
  },
  'hkt48-19': {
    name: 'Ihara Hanna',
    nickname: 'Hanchan',
    gen: 'HKT48 6th Generation',
    birthDate: '2011-02-27',
    birthPlace: 'Oita',
    height: 148,
    bloodType: 'B',
  },
  'hkt48-20': {
    name: 'Imamura Maria',
    nickname: 'Maasan',
    gen: '2nd Generation Draft Member',
    birthDate: '2003-09-14',
    birthPlace: 'Gunma',
    height: 157,
  },
  'hkt48-21': {
    name: 'Eura Yuka',
    nickname: 'Yuka',
    gen: 'HKT48 7th Generation',
    birthDate: '2011-05-03',
    birthPlace: 'Fukuoka',
    height: 154,
  },
  'hkt48-22': {
    name: 'Eguchi Kokoha',
    nickname: 'Koko',
    gen: 'HKT48 6th Generation',
    birthDate: '2007-04-24',
    birthPlace: 'Nagasaki',
    height: 149,
    bloodType: 'B',
  },
  'hkt48-23': {
    name: 'Oba Risaki',
    nickname: 'Risaki',
    gen: 'HKT48 6th Generation',
    birthDate: '2005-04-23',
    birthPlace: 'Fukuoka',
    height: 154,
  },
  'hkt48-24': {
    name: 'Kuriyama Rina',
    nickname: 'Rina',
    gen: 'HKT48 5th Generation',
    birthDate: '2000-12-30',
    birthPlace: 'Oita',
    height: 157,
    bloodType: 'A',
  },
  'hkt48-25': {
    name: 'Takemoto Kurumi',
    nickname: 'Kurutan',
    gen: 'HKT48 5th Generation',
    birthDate: '2004-02-22',
    birthPlace: 'Tokyo',
    height: 148,
    bloodType: 'A',
  },
  'hkt48-26': {
    name: 'Tachibana Kokoro',
    nickname: 'Kokoppe',
    gen: 'HKT48 6th Generation',
    birthDate: '2009-06-24',
    birthPlace: 'Fukuoka',
    height: 157,
    bloodType: 'A',
  },
  'hkt48-27': {
    name: 'Tanaka Iori',
    nickname: 'Iiko',
    gen: 'HKT48 5th Generation',
    birthDate: '2002-08-31',
    birthPlace: 'Kumamoto',
    height: 151,
    bloodType: 'B',
  },
  'hkt48-28': {
    name: 'Fukui Karen',
    nickname: 'Karenren',
    gen: 'HKT48 6th Generation',
    birthDate: '2006-12-04',
    birthPlace: 'Nagasaki',
    height: 153,
    bloodType: 'O',
  },
  'hkt48-29': {
    name: 'Morisaki Saaya',
    nickname: 'Saachan',
    gen: 'HKT48 6th Generation',
    birthDate: '2005-01-16',
    birthPlace: 'Kumamoto',
    height: 162,
    bloodType: 'A',
  },
  'hkt48-30': {
    name: 'Yasui Hina',
    nickname: 'Hinatan',
    gen: 'HKT48 6th Generation',
    birthDate: '2011-02-09',
    birthPlace: 'Fukuoka',
    height: 142,
    bloodType: 'A',
  },
  'hkt48-31': {
    name: 'Aoki Hinako',
    nickname: 'Hina',
    gen: 'HKT48 7th Generation',
    birthDate: '2008-07-16',
    birthPlace: 'Chiba',
    height: 160,
    bloodType: 'O',
  },
  'hkt48-32': {
    name: 'Ishikawa Amiyu',
    nickname: 'Amiyun',
    gen: 'HKT48 7th Generation',
    birthDate: '2011-12-15',
    birthPlace: 'Fukuoka',
    height: 153,
    bloodType: 'A',
  },
  'hkt48-33': {
    name: 'Ijima Riria',
    nickname: 'Riiritan (りーりたん)',
    birthDate: '2011-05-07',
    birthPlace: 'Nagasaki, Japan',
    height: 152,
    bloodType: 'B',
  },
  'hkt48-34': {
    name: 'Kure Yuna',
    nickname: 'Yuuchan',
    gen: 'HKT48 7th Generation',
    birthDate: '2012-02-13',
    birthPlace: 'Fukuoka',
    height: 148,
    bloodType: 'B',
  },
  'hkt48-35': {
    name: 'Tsurukawa Nachi',
    nickname: 'Nacchi',
    gen: 'HKT48 7th Generation',
    birthDate: '2010-12-07',
    birthPlace: 'Fukuoka',
    height: 155,
    bloodType: 'A',
  },
  'hkt48-36': {
    name: 'Nagano Rara',
    nickname: 'Rarapa',
    gen: 'HKT48 7th Generation',
    birthDate: '2010-11-06',
    birthPlace: 'Nagasaki',
    height: 156,
    bloodType: 'O',
  },
  'hkt48-37': {
    name: 'Matsumoto Moka',
    nickname: 'Mokapi (もかぴ)',
    birthDate: '2008-11-22',
    birthPlace: 'Kumamoto, Japan',
    height: 166,
    bloodType: 'A',
  },
  'hkt48-38': {
    name: 'Yamakawa Maria',
    nickname: 'Maritan',
    gen: 'HKT48 7th Generation',
    birthDate: '2005-10-25',
    birthPlace: 'Fukuoka',
    height: 158,
    bloodType: 'A',
  },
  'hkt48-39': {
    name: 'Yoshida Mei',
    nickname: 'Meimei',
    gen: 'HKT48 7th Generation',
    birthDate: '2009-05-07',
    birthPlace: 'Yamaguchi',
    height: 151,
    bloodType: 'B',
  },

  /* NGT48 — 34 member */
  'ngt48-01': {
    name: 'Seiji Reina',
    nickname: 'Reinya',
    gen: 'Baito AKB / 1st Generation NGT48',
    birthDate: '2001-04-19',
    birthPlace: 'Saitama',
    height: 151,
    bloodType: 'O',
  },
  'ngt48-02': {
    name: 'Nishigata Marina',
    nickname: 'Gatanee',
    gen: 'Baito AKB / 2nd Generation Draft Members',
    birthDate: '1995-10-16',
    birthPlace: 'Tokyo',
    height: 158,
    bloodType: 'O',
  },
  'ngt48-03': {
    name: 'Otsuka Nanami',
    nickname: 'Nanamin',
    gen: '2nd Generation',
    birthDate: '2000-11-07',
    birthPlace: 'Niigata',
    bloodType: 'A',
  },
  'ngt48-04': {
    name: 'Mimura Hino',
    nickname: 'Hinochan',
    birthDate: '2002-06-15',
    birthPlace: 'Saitama',
    height: 158,
    bloodType: 'O',
  },
  'ngt48-05': {
    name: 'Sato Kairi',
    nickname: 'Kairi',
    gen: '3rd Generation Draft Members',
    birthDate: '2000-08-05',
    birthPlace: 'Niigata',
    height: 160,
    bloodType: 'A',
  },
  'ngt48-06': {
    name: 'Isobe Rua',
    nickname: 'Beruchan',
    gen: '3rd Generation',
    birthDate: '2007-05-07',
    birthPlace: 'Niigata',
    height: 160,
    bloodType: 'A',
  },
  'ngt48-07': {
    name: 'Kita Hanae',
    nickname: 'Hanae',
    gen: '3rd Generation',
    birthDate: '2003-09-09',
    birthPlace: 'Kanagawa',
    height: 158,
    bloodType: 'O',
  },
  'ngt48-08': {
    name: 'Kitamura Yuha',
    nickname: 'Yuuha',
    gen: '3rd Generation',
    birthDate: '2004-09-22',
    birthPlace: 'Niigata',
    height: 154,
    bloodType: 'B',
  },
  'ngt48-09': {
    name: 'Kimoto Yuna',
    nickname: 'Motoyuna',
    gen: '3rd Generation',
    birthDate: '2003-06-17',
    birthPlace: 'Niigata',
    height: 160,
    bloodType: 'A',
  },
  'ngt48-10': {
    name: 'Suizu Natsuki',
    nickname: 'Natsurin',
    gen: '3rd Generation',
    birthDate: '2004-04-27',
    birthPlace: 'Chiba',
    height: 153,
    bloodType: 'B',
  },
  'ngt48-11': {
    name: 'Sugimoto Moe',
    nickname: 'Mocchan',
    gen: '3rd Generation',
    birthDate: '2005-07-17',
    birthPlace: 'Nagano',
    height: 166,
    bloodType: 'O',
  },
  'ngt48-12': {
    name: 'Isozaki Nana',
    nickname: 'Nanachan',
    gen: 'NGT48 4th Generation',
    birthDate: '2006-07-12',
    birthPlace: 'Kanagawa',
    bloodType: 'A',
  },
  'ngt48-13': {
    name: 'Okumura Momoka',
    nickname: 'Momomaru',
    gen: 'NGT48 4th Generation',
    birthDate: '2003-08-28',
    birthPlace: 'Hyogo',
    bloodType: 'O',
  },
  'ngt48-14': {
    name: 'Kimoto Anna',
    nickname: 'Anna',
    gen: 'NGT48 4th Generation',
    birthDate: '2007-10-16',
    birthPlace: 'Niigata',
    bloodType: 'AB',
  },
  'ngt48-15': {
    name: 'Sato Hiroka',
    nickname: 'Hirokappi',
    gen: 'NGT48 4th Generation',
    birthDate: '2007-08-08',
    birthPlace: 'Niigata',
    height: 154,
    bloodType: 'O',
  },
  'ngt48-16': {
    name: 'Shinzawa Aoi',
    nickname: 'Aochan',
    gen: 'NGT48 4th Generation',
    birthDate: '2008-07-24',
    birthPlace: 'Niigata',
    bloodType: 'O',
  },
  'ngt48-17': {
    name: 'Takashima Yua',
    nickname: 'Yutan',
    gen: 'NGT48 4th Generation',
    birthDate: '2010-01-21',
    birthPlace: 'Niigata',
    bloodType: 'O',
  },
  'ngt48-18': {
    name: 'Nishikawa Haruna',
    nickname: 'Haruchan',
    gen: 'NGT48 4th Generation',
    birthDate: '2003-05-17',
    birthPlace: 'Osaka',
    bloodType: 'A',
  },
  'ngt48-19': {
    name: 'Azama Yui',
    nickname: 'Azamacchi',
    gen: 'NGT48 5th Generation',
    birthPlace: 'Hyogo',
    bloodType: 'B',
  },
  'ngt48-20': {
    name: 'Adachi Yume',
    nickname: 'Yume',
    gen: 'NGT48 5th Generation',
    birthPlace: 'Niigata',
    bloodType: 'O',
  },
  'ngt48-21': {
    name: 'Omachi Yuka',
    nickname: 'Machiyuka',
    gen: 'NGT48 5th Generation',
    birthPlace: 'Nagano',
    bloodType: 'O',
  },
  'ngt48-22': {
    name: 'Kai Mizuki',
    nickname: 'Zukichan',
    gen: 'NGT48 5th Generation',
    birthPlace: 'Ibaraki',
    bloodType: 'A',
  },
  'ngt48-23': {
    name: 'Kitazawa Mone',
    nickname: 'Monene',
    gen: 'NGT48 5th Generation',
    birthPlace: 'Nagano',
  },
  'ngt48-25': {
    name: 'Suto Rinka',
    nickname: 'Rintii',
    gen: 'NGT48 5th Generation',
    birthPlace: 'Gunma',
    bloodType: 'B',
  },
  'ngt48-26': {
    name: 'Taniguchi Haruka',
    nickname: 'Harutan',
    gen: 'NGT48 5th Generation',
    birthPlace: 'Toyama',
    bloodType: 'AB',
  },
  'ngt48-27': {
    name: 'Nakata Asami',
    nickname: 'Asamin',
    gen: 'NGT48 5th Generation',
    birthPlace: 'Nagano',
    bloodType: 'A',
  },
  'ngt48-28': {
    name: 'Minagawa Hiyori',
    nickname: 'Piyotan',
    gen: 'NGT48 5th Generation',
    birthPlace: 'Niigata',
    bloodType: 'A',
  },
  'ngt48-30': {
    name: 'Inomata Sana',
    nickname: 'Sanana',
    gen: 'NGT48 6th Generation',
    birthPlace: 'Niigata',
    bloodType: 'O',
  },
  'ngt48-31': {
    name: 'Ohashi Ayano',
    nickname: 'Ayanon',
    gen: 'NGT48 6th Generation',
    birthPlace: 'Niigata',
    bloodType: 'A',
  },
  'ngt48-32': {
    name: 'Katayama Shuri',
    nickname: 'Shurichan',
    gen: 'NGT48 6th Generation',
    birthPlace: 'Niigata',
    bloodType: 'O',
  },
  'ngt48-33': {
    name: 'Kuga Mirei',
    nickname: 'Niina',
    gen: 'NGT48 6th Generation',
    birthPlace: 'Niigata',
    bloodType: 'A',
  },
  'ngt48-34': {
    name: 'Sato Honoka',
    nickname: 'Honoka',
    gen: 'NGT48 6th Generation',
    birthPlace: 'Niigata',
    bloodType: 'B',
  },
  'ngt48-35': {
    name: 'Hirai Yuzuha',
    nickname: 'Hiracchan',
    gen: 'NGT48 6th Generation',
    birthPlace: 'Niigata',
    bloodType: 'O',
  },
  'ngt48-36': {
    name: 'Hosoya Naho',
    nickname: 'Nahorin',
    gen: 'NGT48 6th Generation',
    birthPlace: 'Kanagawa',
    bloodType: 'A',
  },

  /* STU48 — 45 member */
  'stu48-01': {
    name: 'Kai Cocoa',
    nickname: 'Cocoa',
    gen: 'STU48 1st Generation',
    birthDate: '2003-11-28',
    birthPlace: 'Hiroshima',
    height: 154,
    bloodType: 'B',
  },
  'stu48-02': {
    name: 'Taniguchi Mahina',
    nickname: 'Mahi',
    gen: '1st Generation',
    birthDate: '2000-02-03',
    birthPlace: 'Tokushima',
    height: 161,
    bloodType: 'A',
  },
  'stu48-03': {
    name: 'Hyodo Aoi',
    nickname: 'Aoi',
    gen: '1st Generation',
    birthDate: '2001-01-18',
    birthPlace: 'Ehime',
    height: 162,
    bloodType: 'A',
  },
  'stu48-04': {
    name: 'Fukuda Akari',
    nickname: 'Fukuchan',
    gen: '1st Generation',
    birthDate: '1999-03-29',
    birthPlace: 'Kagawa',
    height: 164,
    bloodType: 'O',
  },
  'stu48-05': {
    name: 'Shinano Soraha',
    nickname: 'Soraha',
    gen: '3rd Generation Draft Members',
    birthDate: '2003-08-09',
    birthPlace: 'Hyogo',
    height: 163,
    bloodType: 'A',
  },
  'stu48-06': {
    name: 'Nakamura Mai',
    nickname: 'MaiQ',
    gen: '3rd Generation Draft Members',
    birthDate: '1999-04-04',
    birthPlace: 'Ehime',
    height: 163,
    bloodType: 'O',
  },
  'stu48-07': {
    name: 'Ikeda Yura',
    nickname: 'Ikedachan',
    gen: '2nd Generation',
    birthDate: '2004-02-08',
    birthPlace: 'Hiroshima',
    height: 152,
    bloodType: 'AB',
  },
  'stu48-08': {
    name: 'Utsumi Rine',
    nickname: 'Rinetan',
    gen: '2nd Generation',
    birthDate: '2002-11-05',
    birthPlace: 'Okayama',
    height: 153,
    bloodType: 'O',
  },
  'stu48-09': {
    name: 'Osaki Serika',
    nickname: 'Paseri',
    gen: '2nd Generation',
    birthDate: '1997-11-16',
    birthPlace: 'Nagasaki',
    height: 161,
    bloodType: 'O',
  },
  'stu48-10': {
    name: 'Kawamata Yuuna',
    nickname: 'Yuna',
    gen: '2nd Generation',
    birthDate: '2003-12-10',
    birthPlace: 'Hiroshima',
    height: 162,
    bloodType: 'A',
  },
  'stu48-11': {
    name: 'Kudo Riko',
    nickname: 'Rikochi',
    gen: '2nd Generation',
    birthDate: '2002-03-29',
    birthPlace: 'Yamaguchi',
    height: 156,
  },
  'stu48-12': {
    name: 'Sako Himeka',
    nickname: 'Himetan',
    gen: '2nd Generation',
    birthDate: '2007-03-14',
    birthPlace: 'Hiroshima',
    height: 161,
    bloodType: 'O',
  },
  'stu48-13': {
    name: 'Takao Sayaka',
    nickname: 'Saayan',
    gen: '2nd Generation',
    birthDate: '1998-12-04',
    birthPlace: 'Fukuoka',
    height: 153,
    bloodType: 'B',
  },
  'stu48-14': {
    name: 'Harada Sayaka',
    nickname: 'Sayakarin',
    gen: '2nd Generation',
    birthDate: '2001-06-19',
    birthPlace: 'Fukuoka',
    height: 163,
    bloodType: 'O',
  },
  'stu48-15': {
    name: 'Muneyuki Rika',
    nickname: 'Rika',
    gen: '2nd Generation',
    birthDate: '2000-06-15',
    birthPlace: 'Ehime',
    height: 167,
    bloodType: 'O',
  },
  'stu48-16': {
    name: 'Yoshida Sara',
    nickname: 'Sara',
    gen: '2nd Generation',
    birthDate: '2002-02-19',
    birthPlace: 'Fukuoka',
    height: 163,
    bloodType: 'B',
  },
  'stu48-17': {
    name: 'Watanabe Natsuki',
    nickname: 'Nacchan',
    gen: '2nd Generation',
    birthDate: '2000-12-12',
    birthPlace: 'Yamaguchi',
    height: 156,
    bloodType: 'O',
  },
  'stu48-18': {
    name: 'Okada Azumi',
    nickname: 'Azumi',
    gen: 'New Wave Project',
    birthDate: '2003-01-20',
    birthPlace: 'Hiroshima',
    height: 148,
    bloodType: 'A',
  },
  'stu48-19': {
    name: 'Okamura Rio',
    nickname: 'Riotsun',
    gen: 'STU48 2.5th Generation',
    birthDate: '2008-10-08',
    birthPlace: 'Hiroshima',
    height: 161,
    bloodType: 'A',
  },
  'stu48-20': {
    name: 'Kurushima Yuka',
    nickname: 'Yuuka',
    gen: 'New Wave Project',
    birthDate: '2005-09-24',
    birthPlace: 'Hiroshima',
    height: 150,
    bloodType: 'A',
  },
  'stu48-21': {
    name: 'Morokuzu Noa',
    nickname: 'Noapi',
    gen: 'STU48 2.5th Generation',
    birthDate: '2009-11-11',
    birthPlace: 'Hiroshima',
    height: 156,
  },
  'stu48-22': {
    name: 'Arai Ria',
    nickname: 'Ria',
    gen: 'STU48 3rd Generation',
    birthDate: '2008-10-05',
    birthPlace: 'Hiroshima',
  },
  'stu48-23': {
    name: 'Ishihara Yuuna',
    nickname: 'Yuuna',
    gen: 'STU48 3rd Generation',
    birthDate: '2004-08-07',
    birthPlace: 'Okayama',
  },
  'stu48-24': {
    name: 'Okuda Yuina',
    nickname: 'Yuina',
    gen: 'STU48 3rd Generation',
    birthDate: '2006-07-07',
    birthPlace: 'Gifu',
  },
  'stu48-25': {
    name: 'Kitazawa Ichigo',
    nickname: 'Ichigo',
    gen: 'STU48 3rd Generation',
    birthDate: '2004-12-27',
    birthPlace: 'Yamanashi',
  },
  'stu48-26': {
    name: 'Hamada Hibiki',
    nickname: 'Hiichan',
    gen: 'STU48 3rd Generation',
    birthDate: '2003-01-23',
    birthPlace: 'Nagasaki',
  },
  'stu48-27': {
    name: 'Morisue Himena',
    nickname: 'Hiitan',
    gen: 'STU48 3rd Generation',
    birthDate: '2002-06-20',
    birthPlace: 'Okayama',
  },
  'stu48-28': {
    name: 'Ishimatsu Haruna',
    nickname: 'Haruchan',
    gen: 'STU48 4th Generation',
    birthPlace: 'Fukuoka',
    bloodType: 'A',
  },
  'stu48-29': {
    name: 'Inoue Kurea',
    nickname: 'Kuu',
    gen: 'STU48 4th Generation',
    birthPlace: 'Hiroshima',
    bloodType: 'A',
  },
  'stu48-30': {
    name: 'Kabutake Mana',
    nickname: 'Kabuchan',
    gen: 'STU48 4th Generation',
    birthPlace: 'Okayama',
    bloodType: 'A',
  },
  'stu48-31': {
    name: 'Kihara Hinayo',
    nickname: 'Hinapii',
    gen: 'STU48 4th Generation',
    birthPlace: 'Hiroshima',
    bloodType: 'O',
  },
  'stu48-32': {
    name: 'Komatsu Nayu',
    nickname: 'Nayuyu',
    gen: 'STU48 4th Generation',
    birthPlace: 'Fukuoka',
    bloodType: 'A',
  },
  'stu48-33': {
    name: 'Sakaki Towana',
    nickname: 'Wawa',
    gen: 'STU48 4th Generation',
    birthPlace: 'Hiroshima',
    bloodType: 'O',
  },
  'stu48-34': {
    name: 'Sakazaki Ai',
    nickname: 'Sakaai',
    gen: 'STU48 4th Generation',
    birthPlace: 'Fukuoka',
    bloodType: 'O',
  },
  'stu48-35': {
    name: 'Shimada Sayaka',
    nickname: 'Sayatan',
    gen: 'STU48 4th Generation',
    birthDate: '2007-06-02',
    birthPlace: 'Hyogo',
    bloodType: 'AB',
  },
  'stu48-36': {
    name: 'Sogabe Ako',
    nickname: 'Ako',
    gen: 'STU48 4th Generation',
    birthPlace: 'Ehime',
    bloodType: 'A',
  },
  'stu48-37': {
    name: 'Takamura Shiori',
    nickname: 'Shiorin',
    gen: 'STU48 4th Generation',
    birthPlace: 'Saitama',
    bloodType: 'A',
  },
  'stu48-38': {
    name: 'Tanaka Nanako',
    nickname: 'Nanachan',
    gen: 'STU48 4th Generation',
    birthDate: '2006-01-27',
    birthPlace: 'Osaka',
    bloodType: 'A',
  },
  'stu48-39': {
    name: 'Douho Runa',
    nickname: 'Runachi',
    gen: 'STU48 4th Generation',
    birthPlace: 'Hiroshima',
    bloodType: 'O',
  },
  'stu48-40': {
    name: 'Nonaka Rio',
    nickname: 'Riochii',
    gen: 'STU48 4th Generation',
    birthDate: '2012-10-26',
    birthPlace: 'Hiroshima',
    bloodType: 'A',
  },
  'stu48-41': {
    name: 'Hamada Mii',
    nickname: 'Miinya',
    gen: 'STU48 4th Generation',
    birthDate: '2008-06-19',
    birthPlace: 'Ehime',
    bloodType: 'A',
  },
  'stu48-42': {
    name: 'Fujita Amu',
    nickname: 'Amunya',
    gen: 'STU48 4th Generation',
    birthDate: '2010-08-23',
    birthPlace: 'Kagawa',
    bloodType: 'A',
  },
  'stu48-43': {
    name: 'Miyoshi Maaya',
    nickname: 'Maanya',
    gen: 'STU48 4th Generation',
    birthDate: '2011-04-17',
    birthPlace: 'Hiroshima',
    bloodType: 'AB',
  },
  'stu48-44': {
    name: 'Yagi Yuuna',
    nickname: 'Unachii',
    gen: 'STU48 4th Generation',
    birthDate: '2008-02-11',
    birthPlace: 'Hyogo',
    bloodType: 'O',
  },
  'stu48-45': {
    name: 'Yokoi Yuina',
    nickname: 'Yokoyui',
    gen: 'STU48 4th Generation',
    birthDate: '2007-09-27',
    birthPlace: 'Shizuoka',
    bloodType: 'B',
  },

  /* JKT48 — 56 member */
  'jkt48-01': {
    name: 'Fiony Alveria Tantri',
    nickname: 'Fiony',
    gen: '8th Generation',
    birthDate: '2002-02-04',
    birthPlace: 'Jakarta',
    height: 164,
    bloodType: 'O',
  },
  'jkt48-02': {
    name: 'Indah Cahya Nabila',
    nickname: 'Indah',
    gen: '9th Generation',
    birthDate: '2001-03-20',
    birthPlace: 'Jambi',
    height: 169,
    bloodType: 'A',
  },
  'jkt48-03': {
    name: 'Aurellia',
    nickname: 'Lia',
    gen: 'JKT48 10th Generation',
    birthDate: '2002-10-29',
    birthPlace: 'Jakarta',
    height: 157,
    bloodType: 'O',
  },
  'jkt48-04': {
    name: 'Anindya Ramadhani Purnomo',
    nickname: 'Anindya',
    gen: '11th Generation',
    birthDate: '2005-10-18',
    birthPlace: 'West Java',
    height: 153,
    bloodType: 'O',
  },
  'jkt48-05': {
    name: 'Celline Thefannie',
    nickname: 'Elin (エリン)',
    birthDate: '2007-04-09',
    birthPlace: 'Tangerang, Banten, Indonesia',
    height: 164,
    bloodType: 'O',
  },
  'jkt48-06': {
    name: 'Cynthia Yaputera',
    nickname: 'Cynthia',
    gen: '11th Generation',
    birthDate: '2003-11-22',
    birthPlace: 'Jakarta',
    height: 160,
    bloodType: 'O',
  },
  'jkt48-07': {
    name: 'Grace Octaviani Tunajaya',
    nickname: 'Gracie',
    gen: '11th Generation',
    birthDate: '2007-10-18',
    birthPlace: 'Banten',
    height: 166,
    bloodType: 'B',
  },
  'jkt48-08': {
    name: 'Michellle Alexandra Suandi',
    nickname: 'Michie',
    gen: 'JKT48 11th Generation',
    birthDate: '2009-04-22',
    birthPlace: 'Jakarta',
    height: 162,
    bloodType: 'O',
  },
  'jkt48-09': {
    name: 'Aurhel Alana Tirta',
    nickname: 'Lana',
    gen: 'JKT48 12th Generation',
    birthDate: '2006-09-14',
    birthPlace: 'Jakarta',
    height: 162,
  },
  'jkt48-10': {
    name: 'Fritzy Rosmerian',
    nickname: 'Fritzy',
    gen: 'JKT48 12th Generation',
    birthDate: '2008-07-28',
    birthPlace: 'Jakarta',
    height: 155,
    bloodType: 'A',
  },
  'jkt48-11': {
    name: 'Hilliary Abigail Mantiri',
    nickname: 'Lily',
    gen: 'JKT48 12th Generation',
    birthDate: '2007-10-19',
    birthPlace: 'New Hampshire',
    height: 163,
    bloodType: 'O',
  },
  'jkt48-12': {
    name: 'Jazzlyn Agatha Thrisha Indra Putri',
    nickname: 'Trisha',
    gen: 'JKT48 12th Generation',
    birthDate: '2011-02-16',
    birthPlace: 'Jakarta',
    height: 161,
    bloodType: 'O',
  },
  'jkt48-13': {
    name: 'Araki Nayla Suji Aurelia',
    nickname: 'Nayla',
    gen: 'JKT48 12th Generation',
    birthDate: '2007-06-18',
    birthPlace: 'Kumamoto',
    height: 163,
    bloodType: 'AB',
  },
  'jkt48-14': {
    name: 'Feni Fitriyanti',
    nickname: 'Feni',
    gen: 'JKT48 3rd Generation',
    birthDate: '1999-01-16',
    birthPlace: 'West Java',
    height: 163,
    bloodType: 'O',
  },
  'jkt48-15': {
    name: 'Angelina Christy',
    nickname: 'Christy',
    gen: '7th Generation',
    birthDate: '2005-12-05',
    birthPlace: 'Jakarta',
    height: 166,
    bloodType: 'O',
  },
  'jkt48-16': {
    name: 'Jessica Rich Chandra',
    nickname: 'Jessi',
    gen: '7th Generation',
    birthDate: '2005-09-23',
    birthPlace: 'Jakarta',
    height: 165,
    bloodType: 'O',
  },
  'jkt48-17': {
    name: 'Muthe Azzahra Umandana',
    nickname: 'Muthe',
    gen: '7th Generation',
    birthDate: '2004-07-12',
    birthPlace: 'Jakarta',
    height: 165,
    bloodType: 'B',
  },
  'jkt48-18': {
    name: 'Cornelia Shafa Vanisa',
    nickname: 'Oniel',
    gen: '8th Generation',
    birthDate: '2002-07-26',
    birthPlace: 'Banten',
    height: 165,
    bloodType: 'O',
  },
  'jkt48-19': {
    name: 'Kathrina Irene Indarto Putri',
    nickname: 'Kathrina',
    gen: '9th Generation',
    birthDate: '2006-07-26',
    birthPlace: 'West Java',
    height: 166,
    bloodType: 'A',
  },
  'jkt48-20': {
    name: 'Raisha Syifa Wardhana',
    nickname: 'Raisha',
    gen: 'JKT48 10th Generation',
    birthDate: '2007-11-11',
    birthPlace: 'Banten',
    height: 169,
    bloodType: 'AB',
  },
  'jkt48-21': {
    name: 'Dena Natalia Ang',
    nickname: 'Danella',
    gen: '11th Generation',
    birthDate: '2005-12-16',
    birthPlace: 'West Java',
    height: 163,
    bloodType: 'O',
  },
  'jkt48-22': {
    name: 'Desy Natalia Ang',
    nickname: 'Daisy',
    gen: '11th Generation',
    birthDate: '2005-12-16',
    birthPlace: 'West Java',
    height: 165,
    bloodType: 'O',
  },
  'jkt48-23': {
    name: 'Abigail Rachel Lie',
    nickname: 'Aralie',
    gen: 'JKT48 12th Generation',
    birthPlace: 'Jakarta',
    height: 164,
    bloodType: 'B',
  },
  'jkt48-24': {
    name: 'Catherina Valencia Kurniawan',
    nickname: 'Erine',
    gen: 'JKT48 12th Generation',
    birthPlace: 'West Java',
    height: 162,
    bloodType: 'B',
  },
  'jkt48-25': {
    name: 'Michelle Levia Afirin',
    nickname: 'Levi',
    gen: 'JKT48 12th Generation',
    birthDate: '2009-01-24',
    birthPlace: 'Banten',
    height: 169,
    bloodType: 'O',
  },
  'jkt48-26': {
    name: 'Ribka Budiman',
    nickname: 'Ribka',
    gen: 'JKT48 12th Generation',
    birthPlace: 'West Java',
    height: 162,
    bloodType: 'O',
  },
  'jkt48-27': {
    name: 'Victoria Kimberly Lukitama',
    nickname: 'Kimmy',
    gen: 'JKT48 12th Generation',
    birthDate: '2010-03-08',
    birthPlace: 'Jakarta',
    height: 162,
    bloodType: 'AB',
  },
  'jkt48-28': {
    name: 'Gita Sekar Andarini',
    nickname: 'Gita',
    gen: '6th Generation',
    birthDate: '2001-06-30',
    birthPlace: 'Jakarta',
    height: 165,
    bloodType: 'O',
  },
  'jkt48-29': {
    name: 'Febriola Sinambela',
    nickname: 'Olla',
    gen: '7th Generation',
    birthDate: '2005-02-26',
    birthPlace: 'Jakarta',
    height: 157,
    bloodType: 'B',
  },
  'jkt48-30': {
    name: 'Freyanashifa Jayawardana',
    nickname: 'Freya',
    gen: '7th Generation',
    birthDate: '2006-02-13',
    birthPlace: 'Jakarta',
    height: 161,
    bloodType: 'B',
  },
  'jkt48-31': {
    name: 'Helisma Mauludzunia Putri Kurnia',
    nickname: 'Eli',
    gen: '7th Generation',
    birthDate: '2000-06-15',
    birthPlace: 'West Java',
    height: 167,
    bloodType: 'O',
  },
  'jkt48-32': {
    name: 'Lulu Azkiya Salsabila',
    nickname: 'Lulu',
    gen: '8th Generation',
    birthDate: '2002-10-23',
    birthPlace: 'Banten',
    height: 160,
    bloodType: 'B',
  },
  'jkt48-33': {
    name: 'Marsha Lenathea Lapian',
    nickname: 'Marsha',
    gen: '9th Generation',
    birthDate: '2006-01-09',
    birthPlace: 'Jakarta',
    height: 163,
    bloodType: 'O',
  },
  'jkt48-35': {
    name: 'Jesslyn Septiani',
    nickname: 'Lyn',
    gen: 'JKT48 10th Generation',
    birthDate: '2001-09-13',
    birthPlace: 'Jakarta',
    height: 155,
    bloodType: 'O',
  },
  'jkt48-34': {
    name: 'Gabriella Abigail Mewengkang',
    nickname: 'Ella (エラ)',
    birthDate: '2006-08-07',
    birthPlace: 'Jakarta, Indonesia',
    height: 161,
    bloodType: 'B',
  },
  'jkt48-36': {
    name: 'Greesella Sophina Adhalia',
    nickname: 'Greesel',
    gen: '11th Generation',
    birthDate: '2006-01-10',
    birthPlace: 'West Java',
    height: 167,
    bloodType: 'O',
  },
  'jkt48-37': {
    name: 'Adeline Wijaya',
    nickname: 'Delynn',
    gen: 'JKT48 12th Generation',
    birthPlace: 'Jakarta',
    height: 167,
    bloodType: 'B',
  },
  'jkt48-38': {
    name: 'Nina Tutachia Browning Chapman',
    nickname: 'Nachia',
    gen: 'JKT48 12th Generation',
    birthDate: '2009-10-16',
    birthPlace: 'Bali',
    height: 164,
    bloodType: 'O',
  },
  'jkt48-39': {
    name: 'Oline Manuel Chay',
    nickname: 'Oline',
    gen: 'JKT48 12th Generation',
    birthDate: '2007-11-03',
    birthPlace: 'Jakarta',
    height: 170,
    bloodType: 'B',
  },
  'jkt48-40': {
    name: 'Shahbilqis Naila Bustomi',
    nickname: 'Nala',
    gen: 'JKT48 12th Generation',
    birthDate: '2008-09-01',
    birthPlace: 'Jakarta',
    height: 160,
    bloodType: 'B',
  },
  'jkt48-41': {
    name: 'Astrella Virgiananda Nugraha',
    nickname: 'Virgi',
    gen: '13th Generation',
    birthDate: '2010-08-06',
    height: 164,
    bloodType: 'AB',
  },
  'jkt48-42': {
    name: 'Aulia Riza Firdausy Effendi',
    nickname: 'Auwia',
    gen: '13th Generation',
    birthDate: '2007-07-14',
    height: 166,
    bloodType: 'O',
  },
  'jkt48-43': {
    name: 'Bong Aprilli Paskah',
    nickname: 'Rilly',
    gen: '13th Generation',
    birthDate: '2010-04-01',
    height: 166,
    bloodType: 'A',
  },
  'jkt48-44': {
    name: 'Hagia Sopia',
    nickname: 'Giaa',
    gen: '13th Generation',
    birthDate: '2008-07-01',
    height: 165,
    bloodType: 'O',
  },
  'jkt48-45': {
    name: 'Humaria Ramadhani Salfiandi',
    nickname: 'Maira',
    gen: '13th Generation',
    birthDate: '2011-08-13',
    height: 159,
    bloodType: 'A',
  },
  'jkt48-46': {
    name: 'Jacqueline Immanuela Jonathan',
    nickname: 'Ekin',
    gen: '13th Generation',
    birthDate: '2009-07-09',
    height: 161,
    bloodType: 'B',
  },
  'jkt48-47': {
    name: 'Jemima Evodie Mayra Lijaya',
    nickname: 'Jemima',
    gen: '13th Generation',
    birthDate: '2009-11-09',
    height: 165,
    bloodType: 'O',
  },
  'jkt48-48': {
    name: 'Mikaela Kusjanto',
    nickname: 'Mikaela',
    gen: '13th Generation',
    birthDate: '2007-12-15',
    height: 166,
    bloodType: 'O',
  },
  'jkt48-49': {
    name: 'Nur Intan',
    nickname: 'Intan',
    gen: '13th Generation',
    birthDate: '2006-02-24',
    birthPlace: 'West Java',
    height: 157,
    bloodType: 'B',
  },
  'jkt48-50': {
    name: 'Afera Thalia Putri Eysteinn',
    nickname: 'Fera',
    gen: '14th Generation',
    birthDate: '2012-10-20',
    birthPlace: 'Jakarta',
    height: 160,
    bloodType: 'O',
  },
  'jkt48-51': {
    name: 'Carissa Dini Asmaranti',
    nickname: 'Carissa',
    gen: '14th Generation',
    birthDate: '2012-02-02',
    birthPlace: 'West Java',
    height: 154,
    bloodType: 'A',
  },
  'jkt48-52': {
    name: 'Christabella Bonita Claura Chandra',
    nickname: 'Bella',
    gen: '14th Generation',
    birthDate: '2011-03-02',
    height: 161,
    bloodType: 'A',
  },
  'jkt48-53': {
    name: 'Fahira Putri Kirana',
    nickname: 'Fahira',
    gen: '14th Generation',
    birthDate: '2012-08-13',
    height: 152,
    bloodType: 'O',
  },
  'jkt48-54': {
    name: 'Fatimah Azzahra',
    nickname: 'Rara',
    gen: '14th Generation',
    birthDate: '2010-08-30',
    height: 170,
    bloodType: 'AB',
  },
  'jkt48-55': {
    name: 'Heidi Suyangga',
    nickname: 'Heidi',
    gen: '14th Generation',
    birthDate: '2008-08-27',
    height: 164,
    bloodType: 'O',
  },
  'jkt48-56': {
    name: 'Maxine Faye Lee',
    nickname: 'Maxine',
    gen: '14th Generation',
    birthDate: '2011-12-02',
    height: 164,
    bloodType: 'B',
  },
  'jkt48-57': {
    name: 'Putry Jazyta',
    nickname: 'Jazzy (ジャジー)',
    birthDate: '2011-03-12',
    birthPlace: 'Bogor, West Java, Indonesia',
    height: 159,
    bloodType: 'A',
  },
  'jkt48-58': {
    name: 'Ralyne Van Irwan',
    nickname: 'Ralyne',
    gen: '14th Generation',
    birthDate: '2011-10-15',
    height: 152,
    bloodType: 'AB',
  },
  'jkt48-59': {
    name: 'Sona Kalyana Purboprasetyani',
    nickname: 'Sona',
    gen: '14th Generation',
    birthDate: '2011-12-01',
    height: 154,
    bloodType: 'O',
  },

  /* BNK48 — 4 member */
  'bnk48-09': {
    name: 'Patt',
    nickname: 'Patt',
    gen: '4th Generation}}',
    birthDate: '2008-06-17',
    birthPlace: 'Bangkok',
    height: 172,
    bloodType: 'A',
  },
  'bnk48-10': {
    name: 'Praew',
    nickname: 'Praew',
    gen: '6th Generation}}',
    birthDate: '2008-05-23',
    birthPlace: 'Bangkok',
    height: 160,
    bloodType: 'A',
  },
  'bnk48-26': {
    name: 'Nall',
    nickname: 'Nall',
    gen: '5th Generation',
    birthDate: '2001-08-25',
    birthPlace: 'Chiang Mai',
    height: 160,
    bloodType: 'O',
  },
  'bnk48-29': {
    name: 'Niya',
    nickname: '呀呀',
    gen: 'CKG48 4th Generation',
    birthDate: '2004-03-25',
    birthPlace: 'Xinjiang',
    height: 170,
    bloodType: 'O',
  },
  'bnk48-01': {
    name: 'Marine',
    nickname: 'Marine',
    birthDate: '2006-04-29',
    birthPlace: 'N/A',
    height: 169,
    bloodType: 'A',
  },
  'bnk48-02': {
    name: 'Fame',
    nickname: 'Fame',
    birthDate: '2004-10-15',
    birthPlace: 'Bangkok',
    height: 167.5,
    bloodType: 'O',
  },
  'bnk48-03': {
    name: 'Hoop',
    nickname: 'Hoop',
    birthDate: '2002-09-18',
    birthPlace: 'Chonburi',
    height: 158,
    bloodType: 'B',
  },
  'bnk48-04': {
    name: 'Janry',
    nickname: 'Janry',
    birthDate: '2008-01-03',
    birthPlace: 'Bangkok',
    height: 163,
    bloodType: 'O',
  },
  'bnk48-05': {
    name: 'Luksorn',
    nickname: 'Luksorn',
    birthDate: '2005-06-27',
    birthPlace: 'Nonthaburi',
    height: 162,
    bloodType: 'A',
  },
  'bnk48-06': {
    name: 'Mail',
    nickname: 'Mail',
    birthDate: '2010-07-17',
    birthPlace: 'Bangkok',
    height: 160,
    bloodType: 'O',
  },
  'bnk48-07': {
    name: 'Micha',
    nickname: 'Micha',
    birthDate: '2007-06-12',
    birthPlace: 'N/A',
    height: 173,
    bloodType: 'A',
  },
  'bnk48-08': {
    name: 'Monet',
    nickname: 'Monet',
    birthDate: '2008-08-04',
    birthPlace: 'Bangkok',
    height: 163,
    bloodType: 'O',
  },
  'bnk48-11': {
    name: 'Wawa',
    nickname: 'Wawa',
    birthDate: '2009-08-11',
    birthPlace: 'Bangkok',
    height: 157,
    bloodType: 'O',
  },
  'bnk48-12': {
    name: 'Emmy',
    nickname: 'Emmy',
    birthDate: '2007-09-13',
    birthPlace: 'N/A',
    height: 167,
    bloodType: 'B',
  },
  'bnk48-13': {
    name: 'Arlee',
    nickname: 'Arlee',
    birthDate: '2004-03-26',
    birthPlace: 'Nakhon Ratchasima',
    height: 160,
    bloodType: 'B',
  },
  'bnk48-14': {
    name: 'Berry',
    nickname: 'Berry',
    birthDate: '2005-07-23',
    birthPlace: 'N/A',
    height: 157,
    bloodType: 'O',
  },
  'bnk48-15': {
    name: 'Jew',
    nickname: 'Jew',
    birthDate: '2003-11-28',
    birthPlace: 'Samut Prakan',
    height: 158,
    bloodType: 'O',
  },
  'bnk48-16': {
    name: 'L',
    nickname: 'L',
    birthDate: '2003-02-13',
    birthPlace: 'N/A',
    height: 158,
    bloodType: 'B',
  },
  'bnk48-17': {
    name: 'Palmmy',
    nickname: 'Palmmy',
    birthDate: '2003-10-28',
    birthPlace: 'N/A',
    height: 169,
    bloodType: 'A',
  },
  'bnk48-18': {
    name: 'Pancake',
    nickname: 'Pancake',
    birthDate: '2007-02-06',
    birthPlace: 'Bangkok',
    height: 163,
    bloodType: 'O',
  },
  'bnk48-19': {
    name: 'Proud',
    nickname: 'Proud',
    birthDate: '2002-11-14',
    birthPlace: 'Pathum Thani',
    height: 155,
    bloodType: 'O',
  },
  'bnk48-20': {
    name: 'Saonoi',
    nickname: 'Saonoi',
    birthDate: '2005-11-09',
    birthPlace: 'Bangkok',
    height: 161,
    bloodType: 'O',
  },
  'bnk48-21': {
    name: 'Sindy',
    nickname: 'Sindy',
    birthDate: '2009-04-03',
    birthPlace: 'N/A',
    height: 160,
    bloodType: 'AB',
  },
  'bnk48-22': {
    name: 'Yoghurt',
    nickname: 'Yoghurt',
    birthDate: '2004-11-10',
    birthPlace: 'Bangkok',
    height: 169,
    bloodType: 'O',
  },
  'bnk48-23': {
    name: 'Galeya',
    nickname: 'Galeya',
    birthDate: '2008-12-24',
    birthPlace: 'Bangkok',
    height: 160,
    bloodType: 'A',
  },
  'bnk48-24': {
    name: 'Khaimook',
    nickname: 'Khaimook',
    birthDate: '2004-01-05',
    birthPlace: 'Bangkok',
    height: 159,
    bloodType: 'B',
  },
  'bnk48-25': {
    name: 'Mayji',
    nickname: 'Mayji',
    birthDate: '2005-05-05',
    birthPlace: 'Bangkok',
    height: 164,
    bloodType: 'O',
  },
  'bnk48-27': {
    name: 'Nammonn',
    nickname: 'Nammonn',
    birthDate: '2003-08-10',
    birthPlace: 'Bangkok',
    height: 168,
    bloodType: 'O',
  },
  'bnk48-28': {
    name: 'Neen',
    nickname: 'Neen',
    birthDate: '2002-04-14',
    birthPlace: 'Bangkok',
    height: 160,
    bloodType: 'A',
  },
  'bnk48-30': {
    name: 'Blythe',
    nickname: 'Blythe',
    birthDate: '2010-07-22',
    birthPlace: 'Bangkok',
    height: 164,
    bloodType: 'B',
  },
  'bnk48-31': {
    name: 'Cartoon',
    nickname: 'Cartoon',
    birthDate: '2009-08-26',
    birthPlace: 'Sisaket',
    height: 163,
    bloodType: 'AB',
  },
  'bnk48-32': {
    name: 'Grape',
    nickname: 'Grape',
    birthDate: '2011-04-08',
    birthPlace: 'Pathum Thani',
    height: 165,
    bloodType: 'A',
  },
  'bnk48-33': {
    name: 'Inkcha',
    nickname: 'Inkcha',
    birthDate: '2007-07-31',
    birthPlace: 'Bangkok',
    height: 160,
    bloodType: 'B',
  },
  'bnk48-34': {
    name: 'Khowjow',
    nickname: 'Khowjow',
    birthDate: '2007-02-23',
    birthPlace: 'Bangkok',
    height: 165,
    bloodType: 'O',
  },
  'bnk48-35': {
    name: 'Mint',
    nickname: 'Mint',
    birthDate: '2010-02-04',
    birthPlace: 'Bangkok',
    height: 160,
    bloodType: 'A',
  },
  'bnk48-36': {
    name: 'Mirin',
    nickname: 'Mirin',
    birthDate: '2010-05-28',
    birthPlace: 'Pathum Thani',
    height: 163,
    bloodType: 'O',
  },
  'bnk48-37': {
    name: 'Rose',
    nickname: 'Rose',
    birthDate: '2007-11-01',
    birthPlace: 'Nakhon Pathom',
    height: 167,
    bloodType: 'B',
  },

  /* AKB48 Team SH — 15 member */
  'akb48tsh-01': {
    name: 'Ye ZhiEn',
    nickname: '知恩',
    gen: 'TSH48 1st Generation',
    birthDate: '1999-10-13',
    birthPlace: 'Guangdong',
    height: 156,
    bloodType: 'O',
  },
  'akb48tsh-02': {
    name: 'Zhou NianQi',
    nickname: '77',
    gen: 'TSH48 1st Generation',
    birthDate: '2002-08-24',
    birthPlace: 'Jiangxi',
    height: 167,
    bloodType: 'O',
  },
  'akb48tsh-03': {
    name: 'Cheng AnZi',
    nickname: '小魔头',
    gen: 'TSH48 2nd Generation',
    birthDate: '2002-03-12',
    birthPlace: 'Hubei',
  },
  'akb48tsh-04': {
    name: 'Gui ChuChu',
    nickname: '楚楚',
    gen: 'TSH48 2nd Generation',
    birthDate: '1999-03-10',
    birthPlace: 'Hunan',
    height: 162,
    bloodType: 'O',
  },
  'akb48tsh-05': {
    name: 'Qiu DiEr',
    nickname: 'YēZi',
    gen: 'TSH48 3rd Generation',
    birthDate: '2000-01-27',
    birthPlace: 'Zhejiang',
    height: 160,
    bloodType: 'B',
  },
  'akb48tsh-06': {
    name: 'Wang AnNi',
    nickname: 'ĀnNī',
    gen: 'TSH48 3rd Generation',
    birthDate: '2000-02-19',
    birthPlace: 'Zhejiang',
    height: 160,
  },
  'akb48tsh-07': {
    name: 'Zhang JiaZhe',
    nickname: 'ZhéZhé',
    gen: 'TSH48 3rd Generation',
    birthDate: '1998-03-08',
    birthPlace: 'Jiangsu',
    height: 202,
    bloodType: 'O',
  },
  'akb48tsh-08': {
    name: 'Chen JiaYi',
    nickname: 'JiaYi',
    gen: '1st Generation Draft Members',
    birthDate: '1996-05-23',
    birthPlace: 'Guangxi',
    height: 158,
    bloodType: 'B',
  },
  'akb48tsh-09': {
    name: 'Wang XiaoYang',
    nickname: 'XiǎoYang',
    gen: 'TSH48 4th Generation',
    birthDate: '2000-05-14',
    birthPlace: 'Beijing',
    height: 202,
  },
  'akb48tsh-10': {
    name: 'Wu Fan',
    nickname: 'FánFán',
    gen: '1st Generation Draft Members',
    birthDate: '2004-06-26',
    birthPlace: 'Shanghai',
    height: 171,
    bloodType: 'B',
  },
  'akb48tsh-11': {
    name: 'Zhang YiLin',
    nickname: 'Momorin',
    gen: '1st Generation Draft Members',
    birthDate: '2005-09-12',
    birthPlace: 'Beijing',
    height: 202,
    bloodType: 'O',
  },
  'akb48tsh-12': {
    name: 'Zhang ShiYu',
    nickname: '诗诗',
    gen: 'TSH48 5th Generation',
    birthDate: '2002-08-29',
    birthPlace: 'Shanghai',
    height: 163,
  },
  'akb48tsh-13': {
    name: 'Zheng YuShan',
    nickname: 'ShanShan',
    gen: 'TSH48 5th Generation',
    birthDate: '2006-06-20',
    birthPlace: 'Liaoning',
    bloodType: 'O',
  },
  'akb48tsh-14': {
    name: 'Huang ZhenXuan',
    nickname: 'さらたん',
    gen: 'TSH48 6th Generation',
    birthDate: '1999-01-15',
    birthPlace: 'Fujian',
  },
  'akb48tsh-15': {
    name: 'Wei XiaoYa',
    nickname: '小仓',
    gen: 'TSH48 6th Generation',
    birthDate: '2001-03-18',
    birthPlace: 'Guangxi',
  },

  /* TPE48 — 24 member */
  'tpe48-01': {
    name: 'Chang Shao Tong',
    nickname: 'Xiao Tong / Tong Tong / Hitomi',
    gen: 'TPE48 3rd Generation',
    birthDate: '2008-02-28',
    height: 165,
    bloodType: 'O',
  },
  'tpe48-02': {
    name: 'Lau Hiu Ching',
    nickname: 'Koharu (小晴)',
    gen: 'TPE48 1st Generation',
    birthDate: '2000-08-02',
    height: 158,
    bloodType: 'O',
  },
  'tpe48-03': {
    name: 'Lin Yu Hsin',
    nickname: '01 / Reichi',
    gen: 'TPE48 1st Generation',
    birthDate: '2002-01-14',
    height: 163,
    bloodType: 'O',
  },
  'tpe48-04': {
    name: 'Yi Pin',
    nickname: 'Yi Pin',
    gen: 'TPE48 4th Generation',
    birthDate: '2003-04-26',
    height: 166,
    bloodType: 'O',
  },
  'tpe48-05': {
    name: 'Chang Yu Ling',
    nickname: 'Natsumi',
    gen: 'TPE48 1st Generation',
    birthDate: '2003-07-11',
    height: 153,
    bloodType: 'AB',
  },
  'tpe48-06': {
    name: 'Su Heng Yu',
    nickname: 'Xiao Yu / Su Su',
    gen: 'TPE48 3rd Generation',
    birthDate: '2010-12-26',
    height: 166,
    bloodType: 'B',
  },
  'tpe48-07': {
    name: 'Chen Zhao Ni',
    nickname: 'Zao Ni / Nini',
    gen: 'TPE48 4th Generation',
    birthDate: '2005-09-06',
    height: 167,
    bloodType: 'B',
  },
  'tpe48-08': {
    name: 'Chen Yi Ling',
    nickname: 'Nana',
    gen: 'TPE48 4th Generation',
    birthDate: '2005-10-19',
    height: 157,
    bloodType: 'A',
  },
  'tpe48-09': {
    name: 'Tang Ching',
    nickname: 'Shizuko',
    gen: 'TPE48 5th Generation',
    birthDate: '2002-03-29',
    height: 168,
    bloodType: 'A',
  },
  'tpe48-10': {
    name: 'Chen Jia Yi',
    nickname: '+1',
    gen: 'TPE48 5th Generation',
    birthDate: '2004-12-25',
    height: 163,
    bloodType: 'B',
  },
  'tpe48-11': {
    name: 'Liu Zi Fei',
    nickname: 'Fei Fei',
    gen: 'TPE48 5th Generation',
    birthDate: '2009-05-04',
    height: 164,
    bloodType: 'O',
  },
  'tpe48-12': {
    name: 'Hu Yung Ching',
    nickname: 'Kurumi',
    gen: 'TPE48 6th Generation',
    birthDate: '2003-04-21',
    height: 168,
    bloodType: 'AB',
  },
  'tpe48-13': {
    name: 'Yang Chia Yi',
    nickname: 'Le Le',
    gen: 'TPE48 6th Generation',
    birthDate: '2004-01-01',
    height: 166,
    bloodType: 'B',
  },
  'tpe48-14': {
    name: 'Yu Zi Lei',
    nickname: 'Lei Lei',
    gen: 'TPE48 6th Generation',
    birthDate: '2008-06-21',
    height: 160,
    bloodType: 'A',
  },
  'tpe48-15': {
    name: 'Lu Hsin En',
    nickname: 'Yuan Yuan',
    gen: 'TPE48 6th Generation',
    birthDate: '2011-01-01',
    height: 163.5,
    bloodType: 'AB',
  },
  'tpe48-16': {
    name: 'Lin Yi Yun',
    nickname: 'Yiyun / Eki',
    gen: 'TPE48 1st Generation',
    birthDate: '2000-11-21',
    height: 163,
    bloodType: 'B',
  },
  'tpe48-17': {
    name: 'Meng Ting Yun',
    nickname: 'Mo Yu / Myu',
    gen: 'TPE48 4th Generation',
    birthDate: '2002-11-28',
    height: 166,
    bloodType: 'O',
  },
  'tpe48-18': {
    name: 'Tsai Ya En',
    nickname: 'Soba / Mian Mian / Lao Ban',
    gen: 'TPE48 1st Generation',
    birthDate: '2000-10-21',
    height: 160,
    bloodType: 'A',
  },
  'tpe48-19': {
    name: 'Huang Yi Lin',
    nickname: '10',
    gen: 'TPE48 3rd Generation',
    birthDate: '2002-04-24',
    height: 156,
    bloodType: 'B',
  },
  'tpe48-20': {
    name: 'Chen Ying Zhen',
    nickname: 'Zhen Zhen',
    gen: 'TPE48 4th Generation',
    birthDate: '2004-01-02',
    height: 164,
    bloodType: 'A',
  },
  'tpe48-21': {
    name: 'Huang Yu Yan',
    nickname: 'Yan Zi',
    gen: 'TPE48 3rd Generation',
    birthDate: '2006-06-08',
    height: 155,
    bloodType: 'B',
  },
  'tpe48-22': {
    name: 'Chen Tai Ling',
    nickname: 'Taeka',
    gen: 'TPE48 5th Generation',
    birthDate: '2004-06-22',
    height: 159,
    bloodType: 'A',
  },
  'tpe48-23': {
    name: 'Tsai Chiao Yin',
    nickname: 'Miyu',
    gen: 'TPE48 5th Generation',
    birthDate: '2005-05-13',
    height: 158,
    bloodType: 'B',
  },
  'tpe48-24': {
    name: 'Chen Chiao Yi',
    nickname: 'Ice',
    gen: 'TPE48 5th Generation',
    birthDate: '2005-07-31',
    height: 169,
    bloodType: 'AB',
  },
  'tpe48-25': {
    name: 'Yang Ya Yun',
    nickname: 'YY',
    gen: 'TPE48 5th Generation',
    birthDate: '2007-04-07',
    height: 166.5,
  },
  'tpe48-26': {
    name: 'Lin Yun Hsi',
    nickname: 'Xi Xi',
    gen: 'TPE48 6th Generation',
    birthDate: '2003-04-18',
    height: 164,
    bloodType: 'A',
  },
  'tpe48-27': {
    name: 'Xu Chun Yuan',
    nickname: 'Tuan Zi',
    gen: 'TPE48 6th Generation',
    birthDate: '2004-03-16',
    height: 163,
    bloodType: 'A',
  },
  'tpe48-28': {
    name: 'Chang Hsin Chiao',
    nickname: 'Yumena',
    gen: 'TPE48 6th Generation',
    birthDate: '2008-11-23',
    height: 168,
    bloodType: 'A',
  },
  'tpe48-29': {
    name: 'Liu Yan Ning',
    nickname: 'Ning Ning',
    gen: 'TPE48 6th Generation',
    birthDate: '2011-12-16',
    height: 163,
    bloodType: 'A',
  },
  'tpe48-30': {
    name: 'Wong Mann Ling',
    nickname: 'Melody / Aya',
    gen: 'TPE48 4th Generation',
    birthDate: '2006-12-23',
    height: 170,
    bloodType: 'O',
  },
  'tpe48-31': {
    name: 'Lin Wei Ting',
    nickname: 'Xiao Jin',
    gen: 'TPE48 5th Generation',
    birthDate: '2002-10-19',
    height: 162,
    bloodType: 'O',
  },
  'tpe48-32': {
    name: 'Chiu Yi Ching',
    nickname: 'Yumi',
    gen: 'TPE48 5th Generation',
    birthDate: '2005-10-23',
    height: 165,
    bloodType: 'O',
  },
  'tpe48-33': {
    name: 'Peng Yu Ting',
    nickname: 'Peng Peng',
    gen: 'TPE48 5th Generation',
    birthDate: '2004-09-24',
    height: 156,
    bloodType: 'O',
  },

  /* CGM48 — 21 member */
  'cgm48-01': {
    name: 'JingJing',
    nickname: 'JingJing',
    birthDate: '2002-01-30',
    height: 162,
    bloodType: 'B',
    social: {
      facebook: 'cgm48official.jingjing',
      instagram: 'jingjing.cgm48official',
      tiktok: 'jingjing.cgm48official',
    },
  },
  'cgm48-02': {
    name: 'Lookked',
    nickname: 'Lookked',
    birthDate: '2000-07-06',
    height: 161,
    bloodType: 'B',
    social: {
      facebook: 'cgm48official.lookked',
      instagram: 'lookked.cgm48official',
    },
  },
  'cgm48-03': {
    name: 'Nana',
    nickname: 'Nana',
    birthDate: '2003-02-27',
    height: 168,
    bloodType: 'O',
    social: {
      facebook: 'cgm48official.nana',
      instagram: 'nana.cgm48official',
    },
  },
  'cgm48-04': {
    name: 'Ginna',
    nickname: 'Ginna',
    birthDate: '2006-12-10',
    height: 167,
    bloodType: 'A',
    social: {
      facebook: 'cgm48official.ginna',
      instagram: 'ginna.cgm48official',
    },
  },
  'cgm48-05': {
    name: 'Kwan',
    nickname: 'Kwan',
    birthDate: '2008-03-04',
    birthPlace: 'Nakhon Ratchasima',
    height: 158,
    bloodType: 'B',
    social: { facebook: 'kwan.cgm48official', instagram: 'kwan.cgm48office' },
  },
  'cgm48-06': {
    name: 'LingLing',
    nickname: 'LingLing',
    birthDate: '2002-07-20',
    birthPlace: 'Chonburi',
    height: 163,
    bloodType: 'A',
    social: { facebook: 'lingling.cgm48official', instagram: 'lingling.cgm48official' },
  },
  'cgm48-07': {
    name: 'Ploen',
    nickname: 'Ploen',
    birthDate: '2008-02-26',
    birthPlace: 'Chiang Mai',
    height: 155,
    bloodType: 'O',
    social: { facebook: 'ploen.cgm48official', instagram: 'ploen.cgm48official' },
  },
  'cgm48-08': {
    name: 'Else',
    nickname: 'Else',
    birthDate: '2003-08-12',
    birthPlace: 'Bangkok',
    height: 160,
    bloodType: 'B',
    social: { facebook: 'else.cgm48official', instagram: 'else.cgm48official' },
  },
  'cgm48-09': {
    name: 'Nisha',
    nickname: 'Nisha',
    birthDate: '2009-09-04',
    birthPlace: 'Phra Nakhon Si Ayutthaya',
    height: 160,
    bloodType: 'A',
    social: { facebook: 'nisha.cgm48official', instagram: 'nisha.cgm48office' },
  },
  'cgm48-10': {
    name: 'Emma',
    nickname: 'Emma',
    birthDate: '2004-02-12',
    height: 168,
    bloodType: 'O',
    social: { facebook: 'cgm48official.emma', instagram: 'cgm48official.emma', tiktok: 'emma.cgm48official' },
  },
  'cgm48-11': {
    name: 'Hongyok',
    nickname: 'Hongyok',
    birthDate: '2004-01-27',
    birthPlace: 'Rayong',
    height: 162,
    bloodType: 'B',
    social: { facebook: 'hongyok.cgm48official', instagram: 'hongyok.cgm48official' },
  },
  'cgm48-12': {
    name: 'Praifa',
    nickname: 'Praifa',
    birthDate: '2012-01-04',
    birthPlace: 'Chiang Mai',
    height: 150,
    bloodType: 'O',
    social: { facebook: 'praifa.cgm48official', instagram: 'praifa.cgm48official' },
  },
  'cgm48-13': {
    name: 'Satangpound',
    nickname: 'Satangpound',
    birthDate: '2007-10-26',
    birthPlace: 'Lampang',
    height: 155,
    bloodType: 'O',
    social: { facebook: 'satangpound.cgm48official', instagram: 'satangpound.cgm48official' },
  },
  'cgm48-14': {
    name: 'Shenae',
    nickname: 'Shenae',
    birthDate: '2006-11-07',
    birthPlace: 'Nakhon Sawan',
    height: 163,
    bloodType: 'B',
    social: { facebook: 'shenae.cgm48official', instagram: 'shenae.cgm48official' },
  },
  'cgm48-15': {
    name: 'Valentine',
    nickname: 'Valentine',
    birthDate: '2008-02-14',
    birthPlace: 'Chiang Mai',
    height: 155,
    bloodType: 'B',
    social: { facebook: 'valentine.cgm48official', instagram: 'valentine.cgm48office' },
  },
  'cgm48-16': {
    name: 'Chifa',
    nickname: 'Chifa',
    birthDate: '2008-10-17',
    birthPlace: 'Songkhla',
    height: 166,
    bloodType: 'A',
    social: { facebook: 'chifa.cgm48official', instagram: 'chifa.cgm48official' },
  },
  'cgm48-17': {
    name: 'Lewlew',
    nickname: 'Lewlew',
    birthDate: '2006-12-24',
    birthPlace: 'Phitsanulok',
    height: 166,
    bloodType: 'O',
    social: { facebook: 'lewlew.cgm48official', instagram: 'lewlew.cgm48official' },
  },
  'cgm48-18': {
    name: 'Namphet',
    nickname: 'Namphet',
    birthDate: '2008-02-24',
    birthPlace: 'Chiang Mai',
    height: 168,
    bloodType: 'B',
    social: { facebook: 'namphet.cgm48official', instagram: 'namphet.cgm48office' },
  },
  'cgm48-19': {
    name: 'Punpon',
    nickname: 'Punpon',
    birthDate: '2009-01-12',
    birthPlace: 'Samut Sakhon',
    height: 157,
    bloodType: 'B',
    social: { facebook: 'punpon.cgm48official', instagram: 'punpon.cgm48office' },
  },
  'cgm48-20': {
    name: 'Tara',
    nickname: 'Tara',
    birthDate: '2013-06-05',
    birthPlace: 'Chiang Mai',
    height: 151,
    bloodType: 'B',
    social: { facebook: 'tara.cgm48official', instagram: 'tara.cgm48office' },
  },
  'cgm48-21': {
    name: 'Prae',
    nickname: 'Prae',
    birthDate: '2005-01-03',
    birthPlace: 'Phetchabun',
    height: 158,
    bloodType: 'O',
    social: { facebook: 'prae.cgm48official', instagram: 'prae.cgm48official' },
  },

  /* KLP48 — 20 member */
  'klp48-01': {
    name: 'Elley Amanda Wong',
    nickname: 'Amanda',
    gen: 'KLP48 1st Generation',
    birthDate: '2007-02-13',
    birthPlace: 'Kuala Lumpur',
    height: 161,
  },
  'klp48-02': {
    name: 'Ann Drea Tey',
    nickname: 'Ann Drea',
    gen: 'KLP48 1st Generation',
    birthDate: '2008-08-06',
    birthPlace: 'Selangor',
    height: 157,
  },
  'klp48-03': {
    name: 'Made Devi Ranita Ningtara',
    nickname: 'Devi',
    gen: 'JKT48 4th Generation / KLP48 1st Generation',
    birthDate: '2000-11-18',
    birthPlace: 'Bali',
    height: 163,
    bloodType: 'B',
  },
  'klp48-04': {
    name: 'Shuen Hiu Yao',
    nickname: 'Hillary',
    gen: 'KLP48 1st Generation',
    birthDate: '2008-11-22',
    birthPlace: 'Hong Kong',
    height: 159,
  },
  'klp48-05': {
    name: 'Tan Zi Tong',
    nickname: 'Khalies',
    gen: 'KLP48 1st Generation',
    birthDate: '2008-08-27',
    birthPlace: 'Kuala Lumpur',
    height: 166,
  },
  'klp48-06': {
    name: 'Salwa Sunanda',
    nickname: 'Salwa',
    gen: 'KLP48 1st Generation',
    birthDate: '2007-07-17',
    birthPlace: 'Kuala Lumpur',
    height: 152,
  },
  'klp48-07': {
    name: 'Elvyone Tifanny Ticha Anak Donaldin',
    nickname: 'Tiffany',
    gen: 'KLP48 1st Generation',
    birthDate: '2009-09-23',
    birthPlace: 'Sarawak',
    height: 155,
  },
  'klp48-08': {
    name: 'Foo Yi Shyan',
    nickname: 'Yi Shyan',
    gen: 'KLP48 1st Generation',
    birthDate: '2004-06-28',
    birthPlace: 'Perak',
    height: 165,
  },
  'klp48-09': {
    name: 'Turysbek Aisha',
    nickname: 'Aisha',
    birthDate: '2008-05-25',
    birthPlace: 'Almaty, Kazakhstan',
    height: 167,
  },
  'klp48-10': {
    name: 'Alice Wong Vei Yew',
    nickname: 'Alice',
    gen: 'KLP48 2nd Generation',
    birthDate: '2004-04-30',
    birthPlace: 'Selangor',
    height: 163,
  },
  'klp48-11': {
    name: 'Cindy Alexandria',
    nickname: 'Cindy',
    gen: 'KLP48 2nd Generation',
    birthDate: '2008-05-17',
    birthPlace: 'Jakarta',
    height: 154,
  },
  'klp48-12': {
    name: 'Diva Nurhaliza',
    nickname: 'Diva',
    gen: 'KLP48 2nd Generation',
    birthDate: '2004-05-11',
    height: 155,
  },
  'klp48-13': {
    name: 'Sekar Wejayanti Mumtahanah',
    nickname: 'Hana',
    gen: 'KLP48 2nd Generation',
    birthDate: '2004-02-24',
    height: 158,
  },
  'klp48-14': {
    name: 'Wee Xi Ting',
    nickname: 'Isabel',
    gen: 'KLP48 2nd Generation',
    birthDate: '2008-09-11',
    birthPlace: 'Kuala Lumpur',
    height: 161,
  },
  'klp48-15': {
    name: 'Jocelyna Marcelly',
    nickname: 'Joo',
    gen: 'KLP48 2nd Generation',
    birthDate: '2005-11-27',
    birthPlace: 'Sabah',
    height: 155,
  },
  'klp48-16': {
    name: 'Kei Annisa Adnan',
    nickname: 'Kei',
    gen: 'KLP48 2nd Generation',
    birthDate: '2009-04-16',
    birthPlace: 'Selangor',
    height: 155,
  },
  'klp48-17': {
    name: 'Maia Fae Chong',
    nickname: 'Maia',
    gen: 'KLP48 2nd Generation',
    birthDate: '2010-10-06',
    birthPlace: 'Selangor',
    height: 154,
  },
  'klp48-18': {
    name: 'Ueda Mashiro',
    nickname: 'Mashiro',
    gen: 'KLP48 2nd Generation',
    birthDate: '2003-01-29',
    birthPlace: 'Nara',
    height: 162,
  },
  'klp48-19': {
    name: 'Sharifah Sharleez Binti Syed Affendi',
    nickname: 'Sharleez',
    gen: 'KLP48 2nd Generation',
    birthDate: '2009-02-19',
    birthPlace: 'Kuala Lumpur',
    height: 163,
  },
  'klp48-20': {
    name: 'Kuak Shu Zhen',
    nickname: 'Shu Zhen',
    gen: 'KLP48 2nd Generation',
    birthDate: '2001-08-20',
    birthPlace: 'Perak',
    height: 153,
  },
  'klp48-21': {
    name: 'Tara Tan',
    nickname: 'Tara',
    gen: 'KLP48 2nd Generation',
    birthDate: '2010-08-02',
    birthPlace: 'Selangor',
    height: 162,
  },
};

/* Peta roster + platform streaming default per grup. */
const ROSTERS = [
  { groupId: 'akb48',    platform: 'SHOWROOM',       list: ROSTER_AKB48 },
  { groupId: 'ske48',    platform: 'SHOWROOM',       list: ROSTER_SKE48 },
  { groupId: 'nmb48',    platform: 'SHOWROOM',       list: ROSTER_NMB48 },
  { groupId: 'hkt48',    platform: 'SHOWROOM',       list: ROSTER_HKT48 },
  { groupId: 'ngt48',    platform: 'SHOWROOM',       list: ROSTER_NGT48 },
  { groupId: 'stu48',    platform: 'SHOWROOM',       list: ROSTER_STU48 },
  { groupId: 'jkt48',    platform: 'IDN Live',       list: ROSTER_JKT48 },
  { groupId: 'bnk48',    platform: 'iAM / YouTube',  list: ROSTER_BNK48 },
  { groupId: 'akb48tsh', platform: 'Weibo',          list: ROSTER_AKB48TSH },
  { groupId: 'tpe48',    platform: 'YouTube',        list: ROSTER_TPE48 },
  { groupId: 'cgm48',    platform: 'iAM / YouTube',  list: ROSTER_CGM48 },
  { groupId: 'klp48',    platform: 'YouTube',        list: ROSTER_KLP48 },
];

/* Nama dibandingkan longgar: beda kapital dan spasi ganda sering muncul
   saat menempel dari sumber, dan itu bukan alasan menolak biodata. Yang
   ditolak adalah nama yang benar-benar berbeda orang. */
function cocokNama(a, b) {
  const rapi = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return rapi(a) !== '' && rapi(a) === rapi(b);
}

/* Satu entri sosial media → { key, label, url }. Nilai boleh URL lengkap
   (dipakai apa adanya) atau username (dirangkai lewat SOSIAL_META).
   Selain http/https ditolak supaya `javascript:` tidak pernah jadi href. */
function normalisasiSosial(raw) {
  if (!raw || typeof raw !== 'object') return [];
  return Object.keys(raw)
    .map((key) => {
      const nilai = String(raw[key] || '').trim().replace(/^@/, '');
      if (!nilai) return null;
      const meta = SOSIAL_META[key];
      const url = /^https?:\/\//i.test(nilai)
        ? nilai
        : (meta ? meta.pola.replace('{u}', encodeURIComponent(nilai)) : '');
      if (!/^https?:\/\//i.test(url)) return null;
      return { key, label: meta ? meta.label : key, url };
    })
    .filter(Boolean);
}

/* Biodata satu member, sudah dibersihkan. null kalau tidak ada entri atau
   entrinya tidak lolos pemeriksaan nama. Field kosong DIHAPUS, bukan diisi
   string kosong — halaman detail memakai keberadaan field untuk memutuskan
   baris mana yang dirender. */
function bioUntuk(id, namaRoster) {
  const raw = BIO[id];
  if (!raw || typeof raw !== 'object') return null;

  if (!cocokNama(raw.name, namaRoster)) {
    /* Sengaja berisik: kalau id bergeser, biodata akan menempel ke orang
       lain dan halaman tetap tampil "benar" — bug yang paling sulit
       terlihat. Lebih baik biodatanya hilang dan tercatat di console. */
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`BIO['${id}'] diabaikan — name "${raw.name || ''}" tidak cocok dengan roster "${namaRoster}".`);
    }
    return null;
  }

  const teks = (v) => {
    const s = String(v == null ? '' : v).trim();
    return s === '' ? undefined : s;
  };
  const angka = (v) => {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  /* Divalidasi lewat pecahISO(), bukan cuma pola regex: "1998-02-30" cocok
     polanya tapi bukan tanggal yang ada. Kalau hanya regex, field-nya
     tersimpan lalu gagal diformat di halaman — kosong tanpa penjelasan. */
  const tanggal = (v) => {
    const s = teks(v);
    if (!s) return undefined;
    if (pecahISO(s)) return s;
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`BIO['${id}']: tanggal "${s}" bukan tanggal ISO yang sah (YYYY-MM-DD) — diabaikan.`);
    }
    return undefined;
  };

  const bio = {
    nickname: teks(raw.nickname),
    gen: teks(raw.gen),
    role: teks(raw.role),
    birthDate: tanggal(raw.birthDate),
    birthPlace: teks(raw.birthPlace),
    height: angka(raw.height),
    bloodType: teks(raw.bloodType),
    debut: tanggal(raw.debut),
    jikoshoukai: teks(raw.jikoshoukai),
    social: normalisasiSosial(raw.social),
  };

  Object.keys(bio).forEach((k) => {
    if (bio[k] === undefined) delete bio[k];
  });
  if (bio.social.length === 0) delete bio.social;

  return Object.keys(bio).length ? bio : null;
}

/* Gabungkan semua roster jadi satu array MEMBERS berformat lengkap.
   Baris roster yang tidak punya `name` diabaikan, sehingga contoh yang
   masih dikomentari atau baris setengah jadi tidak merusak halaman. */
function buildMembers() {
  const out = [];
  ROSTERS.forEach((r) => {
    const group = GROUPS.find((g) => g.id === r.groupId);
    if (!group || !Array.isArray(r.list)) return;

    let seq = 0; // hanya naik untuk baris valid → nomor id tidak bolong
    r.list.forEach((m) => {
      if (!m || typeof m.name !== 'string' || m.name.trim() === '') return;
      seq += 1;
      const id = m.id || `${r.groupId}-${String(seq).padStart(2, '0')}`;
      out.push({
        id,
        name: m.name.trim(),
        nameLatin: typeof m.nameLatin === 'string' && m.nameLatin.trim() ? m.nameLatin.trim() : m.name.trim(),
        /* Aksara asli (kanji/kana, Thai, Hanzi). Opsional — kalau kosong,
           kartu menampilkan `name` saja. `name` tetap versi Latin karena
           dipakai untuk search, urutan A-Z, monogram, dan nama file foto. */
        nameNative: typeof m.nameNative === 'string' ? m.nameNative.trim() : '',
        group: group.name,
        groupId: group.id,
        team: m.team || '',
        isLive: m.isLive === true,
        isStage: m.isStage === true,
        img: m.img || `img/${id}.jpg`,
        liveUrl: typeof m.liveUrl === 'string' ? m.liveUrl : '',
        livePlatform: m.livePlatform || r.platform,
        stage: m.stage || null,
        schedule: Array.isArray(m.schedule) ? m.schedule : [],
        relatedMemberIds: m.relatedMemberIds || [],
        /* Biodata halaman detail. null kalau belum diisi — halaman detail
           menampilkan pemberitahuan "biodata belum lengkap", bukan tabel
           berisi tanda hubung. */
        bio: bioUntuk(id, m.name.trim()),
        accent: m.accent || group.accent,
      });
    });
  });
  return out;
}

const MEMBERS = buildMembers();

/* -------------------------------------------------------------
   3. UTIL UMUM
   ------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Escape teks agar aman dimasukkan ke innerHTML.
function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Inisial dari nama orang: "Aira Prameswari" → "A"
function initialOf(name) {
  return (String(name).trim()[0] || '?').toUpperCase();
}

// Monogram: "JKT48" → "JK", "Team N" → "TN"
function monogramOf(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
}

/* Atribut lang untuk nama beraksara asli. Penting bukan cuma soal
   aksesibilitas: browser memilih font CJK berdasarkan lang, dan sejumlah
   karakter Han digambar berbeda di Jepang vs Tiongkok (mis. 直, 骨). Tanpa
   lang yang benar, nama Jepang bisa dirender pakai bentuk huruf Tionghoa.
   Han dipakai bersama tiga bahasa, jadi bahasanya ditentukan grup — tidak
   bisa dideteksi dari stringnya saja. Kana dan Thai baru bisa dari string. */
const GRUP_HANZI = { tpe48: 'zh-Hant', akb48tsh: 'zh-Hans' };

function langOfNative(text, groupId) {
  const s = String(text || '');
  if (!s) return '';
  if (/[฀-๿]/.test(s)) return 'th';
  if (/[぀-ヿ]/.test(s)) return 'ja';           // hiragana/katakana
  if (/[一-鿿㐀-䶿]/.test(s)) return GRUP_HANZI[groupId] || 'ja';
  if (/[가-힯]/.test(s)) return 'ko';
  return '';
}

/* -------------------------------------------------------------
   3b. TANGGAL & TURUNANNYA (dipakai halaman detail member)
   Semua tanggal disimpan ISO "YYYY-MM-DD" supaya bisa diurutkan dan
   tidak ambigu; tampilannya baru dibentuk di sini.
   ------------------------------------------------------------- */
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/* Dipecah manual, bukan new Date(iso): string "1998-02-30" tetap diterima
   Date dan digeser jadi 2 Maret — data salah lolos tanpa terlihat. */
function pecahISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return null;
  const th = +m[1], bl = +m[2], tg = +m[3];
  if (bl < 1 || bl > 12 || tg < 1 || tg > 31) return null;
  const d = new Date(Date.UTC(th, bl - 1, tg));
  if (d.getUTCFullYear() !== th || d.getUTCMonth() !== bl - 1 || d.getUTCDate() !== tg) {
    return null; // mis. 31 Februari
  }
  return { th, bl, tg };
}

function formatTanggalID(iso) {
  const p = pecahISO(iso);
  return p ? `${p.tg} ${BULAN_ID[p.bl - 1]} ${p.th}` : '';
}

function usiaDari(iso, hariIni = new Date()) {
  const p = pecahISO(iso);
  if (!p) return null;
  let usia = hariIni.getFullYear() - p.th;
  const belumUlangTahun =
    hariIni.getMonth() + 1 < p.bl ||
    (hariIni.getMonth() + 1 === p.bl && hariIni.getDate() < p.tg);
  if (belumUlangTahun) usia -= 1;
  return usia >= 0 && usia < 130 ? usia : null;
}

/* Batas tanggal zodiak (tanggal MULAI tiap tanda). Capricorn melewati
   pergantian tahun, jadi dicek terakhir sebagai fallback. */
const ZODIAK = [
  [1, 20, 'Aquarius'], [2, 19, 'Pisces'], [3, 21, 'Aries'], [4, 20, 'Taurus'],
  [5, 21, 'Gemini'], [6, 21, 'Cancer'], [7, 23, 'Leo'], [8, 23, 'Virgo'],
  [9, 23, 'Libra'], [10, 23, 'Scorpio'], [11, 22, 'Sagittarius'], [12, 22, 'Capricorn'],
];

function zodiakDari(iso) {
  const p = pecahISO(iso);
  if (!p) return '';
  let hasil = 'Capricorn'; // sebelum 20 Januari
  ZODIAK.forEach(([bl, tg, nama]) => {
    if (p.bl > bl || (p.bl === bl && p.tg >= tg)) hasil = nama;
  });
  return hasil;
}

/* -------------------------------------------------------------
   4. PLACEHOLDER FOTO (SVG inline, rasio 3:4)
   Dipakai otomatis kalau file di properti `img` belum ada.
   Tidak butuh koneksi internet.
   ------------------------------------------------------------- */
const ACCENT_COLORS = {
  pink:   ['#F472B6', '#7c2d5a'],
  cyan:   ['#22D3EE', '#155e6b'],
  violet: ['#A78BFA', '#4c357d'],
  amber:  ['#FBBF24', '#7c5a10'],
};

function photoPlaceholder(name, accent = 'pink') {
  const [from, to] = ACCENT_COLORS[accent] || ACCENT_COLORS.pink;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
</linearGradient></defs>
<rect width="300" height="400" fill="url(#g)"/>
<text x="150" y="215" text-anchor="middle" fill="rgba(255,255,255,0.92)"
 font-family="system-ui,sans-serif" font-size="120" font-weight="800">${initialOf(name)}</text>
</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\n/g, ''));
}

/* -------------------------------------------------------------
   5. QUERY DATA
   ------------------------------------------------------------- */
function membersOfGroup(groupId) {
  return MEMBERS.filter((m) => m.groupId === groupId);
}

/* Sumber tunggal untuk status hari ini.
   updateStatusBanners() di script.js memakai dua fungsi ini supaya definisi
   "live" / "stage" tidak tersebar di beberapa tempat. Saat nanti diganti
   data dari API, cukup ubah isi dua fungsi ini. */
function liveMembers() {
  return MEMBERS.filter((m) => m.isLive === true);
}

const LIVE_TRACKER_API_URL = window.location.protocol === 'file:' ? 'http://localhost:8787/api/live' : (window.wiki48ApiUrl ? window.wiki48ApiUrl('/api/live') : '/api/live');
const LIVE_TRACKER_EVENTS_URL = window.location.protocol === 'file:' ? 'http://localhost:8787/api/live/events' : (window.wiki48ApiUrl ? window.wiki48ApiUrl('/api/live/events') : '/api/live/events');

function applyLiveSnapshot(results) {
  const liveById = new Map((Array.isArray(results) ? results : []).map((item) => [item.id, item]));
  MEMBERS.forEach((member) => {
    const live = liveById.get(member.id);
    member.isLive = Boolean(live);
    if (live) {
      if (live.live_url) member.liveUrl = live.live_url;
      if (live.platform) {
        member.livePlatform = live.platform === 'showroom' ? 'SHOWROOM'
          : live.platform === 'youtube' ? 'YouTube' : 'IDN Live';
      }
    }
  });
}

async function fetchLiveTrackerSnapshot() {
  const response = await fetch(LIVE_TRACKER_API_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Live tracker HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.live)) throw new Error('Respons live tracker tidak valid');
  applyLiveSnapshot(data.live);
  return data.live;
}

function prioritizePinnedLive(list) {
  return list.slice().sort((a, b) => {
    const aPriority = a.isLive && isOshi(a.id) ? 0 : 1;
    const bPriority = b.isLive && isOshi(b.id) ? 0 : 1;
    return aPriority - bPriority;
  });
}

function stageMembers() {
  return MEMBERS.filter((m) => m.isStage === true);
}

// Hanya member live yang punya URL streaming valid (untuk tombol "Tonton Live").
function liveMembersWithUrl() {
  return liveMembers().filter((m) => typeof m.liveUrl === 'string' && m.liveUrl.trim() !== '');
}

function groupBySlug(slug) {
  return GROUPS.find((g) => g.slug === slug) || null;
}

function memberById(id) {
  return MEMBERS.find((m) => m.id === id) || null;
}

// Member terkait (mis. untuk halaman detail nanti).
function relatedMembers(id) {
  const m = memberById(id);
  if (!m) return [];
  return (m.relatedMemberIds || []).map(memberById).filter(Boolean);
}

/* Rekan satu team untuk halaman detail. `relatedMemberIds` dipakai lebih
   dulu kalau diisi manual; kalau tidak, daftarnya dihitung dari grup+team
   yang sama supaya bagian ini tidak pernah kosong hanya karena belum ada
   yang mengisi relasi satu per satu. Member tanpa team jatuh ke rekan
   satu grup — lebih berguna daripada tidak ada apa-apa. */
function teamMatesOf(id, batas = 12) {
  const m = memberById(id);
  if (!m) return [];

  const manual = relatedMembers(id).filter((x) => x.id !== id);
  if (manual.length) return manual.slice(0, batas);

  return MEMBERS
    .filter((x) => x.id !== id && x.groupId === m.groupId && (m.team ? x.team === m.team : true))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, batas);
}

// URL halaman detail. Satu tempat saja, supaya formatnya tidak bercabang.
function memberUrl(id) {
  return `member.html?id=${encodeURIComponent(id)}`;
}

/* Member per grup, diurutkan nama (memakai fungsi tersendiri supaya
   daftar grup/team stabil meski MEMBERS dipindah ke file data/). */
function sortedMembersOfGroup(groupId) {
  return membersOfGroup(groupId).slice().sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------------------------------------
   5b. OSHI PIN — PERSISTENSI (localStorage)

   Dipindah ke common.js karena sekarang dipakai dua halaman:
   index.html (grid + panel My Oshi) dan member.html (tombol pin di
   halaman detail). Kalau kodenya diduplikasi, dua halaman bisa punya
   batas kuota atau aturan validasi yang berbeda tanpa terlihat.

   Yang ADA di sini hanya lapisan data. Bagian DOM — render panel,
   toast penolakan, sinkronisasi tombol — tetap di script.js/member.js
   karena bentuk halamannya berbeda.

   localStorage tidak selalu tersedia: browser bisa melempar
   SecurityError pada protokol file:// atau di mode privat. Semua akses
   dibungkus try/catch supaya halaman tetap berfungsi (pin hanya jadi
   tidak permanen) alih-alih mati total.
   ------------------------------------------------------------- */
const OSHI_STORAGE_KEY = 'oshiList'; // key localStorage sesuai spesifikasi
const OSHI_LIMIT = Infinity;         // pin tidak dibatasi jumlahnya

const oshiStore = (function detectStorage() {
  try {
    const probe = '__oshi_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch (err) {
    return null; // storage diblokir → mode sesi saja
  }
})();

/* Baca & bersihkan data tersimpan.
   Validasi penting: id yang sudah tidak ada di MEMBERS (mis. roster
   diperbarui) harus dibuang, kalau tidak render akan menghasilkan
   lubang kosong dan hitungan kuota jadi salah. */
function loadOshiList() {
  if (!oshiStore) return [];

  let raw = null;
  try {
    raw = oshiStore.getItem(OSHI_STORAGE_KEY);
  } catch (err) {
    return [];
  }
  if (!raw) return [];

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Data korup / format versi lama → buang, jangan sampai halaman mati.
    try { oshiStore.removeItem(OSHI_STORAGE_KEY); } catch (e) { /* diabaikan */ }
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set();
  return parsed
    .filter((id) => {
      if (typeof id !== 'string') return false;
      if (seen.has(id)) return false;      // buang duplikat
      if (!memberById(id)) return false;   // buang id yang sudah tidak ada
      seen.add(id);
      return true;
    })
    ;                                     // semua pin valid dipertahankan
}

// Array oshi — urutannya = urutan pin oleh user (dipakai saat render).
let oshiList = loadOshiList();

function saveOshiList() {
  if (!oshiStore) return false;
  try {
    oshiStore.setItem(OSHI_STORAGE_KEY, JSON.stringify(oshiList));
    return true;
  } catch (err) {
    return false; // mis. kuota penuh
  }
}

function isOshi(id) {
  return oshiList.indexOf(id) !== -1;
}

function oshiIsFull() {
  return false;
}

/* Pasang/lepas pin tanpa menyentuh DOM. Mengembalikan hasilnya supaya
   pemanggil bisa memilih pesan sendiri:
     'added' | 'removed' | 'full' | 'unknown'
   Halaman yang berbeda menampilkan penolakan dengan cara berbeda, jadi
   keputusan tampilannya sengaja tidak dibuat di sini. */
function setOshi(id) {
  if (!memberById(id)) return 'unknown';
  const idx = oshiList.indexOf(id);
  if (idx !== -1) {
    oshiList.splice(idx, 1);
    return 'removed';
  }
  if (oshiIsFull()) return 'full';
  oshiList.push(id);
  return 'added';
}

/* -------------------------------------------------------------
   6. DRAWER MENU (slide-in) — dipakai di semua halaman
   Ditempatkan di common.js (bukan script.js) supaya groups.html
   memakai logika yang sama tanpa duplikasi listener.
   ------------------------------------------------------------- */
function initDrawer() {
  const toggle = $('#menuToggle');
  const drawer = $('#drawer');
  const overlay = $('#drawerOverlay');
  const closeBtn = $('#menuClose');
  if (!toggle || !drawer || !overlay) return;

  function openDrawer() {
    overlay.hidden = false;
    void overlay.offsetWidth; // reflow → transisi mulus
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    window.setTimeout(() => {
      if (!overlay.classList.contains('is-open')) overlay.hidden = true;
    }, 350);
  }

  toggle.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });
  drawer.querySelectorAll('.drawer-nav a').forEach((a) => {
    a.addEventListener('click', closeDrawer);
  });
}

/* -------------------------------------------------------------
   7. TAHUN DI FOOTER
   ------------------------------------------------------------- */
function setFooterYear() {
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/* -------------------------------------------------------------
   8. UI LANGUAGE
   Names and roster data stay untouched; only interface copy changes.
   ------------------------------------------------------------- */
const UI_LANGUAGES = [
  ['id', 'Indonesia'], ['en', 'English'], ['ja', '日本語'], ['th', 'ไทย'],
  ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['ms', 'Bahasa Melayu'],
];
const UI_COPY = {
  id: { home: 'Beranda', members: 'Direktori Member', groups: 'Info Grup', gallery: 'Galeri Media', schedule: 'Jadwal', community: 'Komunitas', updates: 'Pembaruan Wiki', search: 'Cari di Wiki...', menu: 'Menu', back: '← Beranda', official: 'Resmi' },
  en: { home: 'Home', members: 'Member Directory', groups: 'Group Info', gallery: 'Media Gallery', schedule: 'Schedule', community: 'Community', updates: 'Wiki Updates', search: 'Search Wiki...', menu: 'Menu', back: '← Home', official: 'Official' },
  ja: { home: 'ホーム', members: 'メンバーディレクトリ', groups: 'グループ情報', gallery: 'メディア', schedule: 'スケジュール', community: 'コミュニティ', updates: 'Wiki更新', search: 'Wikiを検索...', menu: 'メニュー', back: '← ホーム', official: '公式' },
  th: { home: 'หน้าแรก', members: 'สมาชิก', groups: 'ข้อมูลกลุ่ม', gallery: 'แกลเลอรี', schedule: 'ตารางเวลา', community: 'ชุมชน', updates: 'อัปเดต Wiki', search: 'ค้นหา Wiki...', menu: 'เมนู', back: '← หน้าแรก', official: 'ทางการ' },
  'zh-CN': { home: '首页', members: '成员目录', groups: '组合信息', gallery: '媒体画廊', schedule: '日程', community: '社区', updates: 'Wiki更新', search: '搜索 Wiki...', menu: '菜单', back: '← 首页', official: '官方' },
  'zh-TW': { home: '首頁', members: '成員目錄', groups: '團體資訊', gallery: '媒體圖庫', schedule: '行程', community: '社群', updates: 'Wiki更新', search: '搜尋 Wiki...', menu: '選單', back: '← 首頁', official: '官方' },
  ms: { home: 'Laman Utama', members: 'Direktori Ahli', groups: 'Info Kumpulan', gallery: 'Galeri Media', schedule: 'Jadual', community: 'Komuniti', updates: 'Kemas Kini Wiki', search: 'Cari Wiki...', menu: 'Menu', back: '← Laman Utama', official: 'Rasmi' },
};

const UI_CARD_COPY = {
  id: { debut: 'Debut', base: 'Basis', viewMembers: 'Lihat member', officialSite: 'Situs resmi', member: 'member', rosterEmpty: 'Roster belum diisi', articleMeta: ['JKT48 · PEMBARUAN WIKI', 'AKB48 · PANDUAN MEMBER', 'BUDAYA LIVE · PILIHAN'], articleTitles: ['JKT48 New Single: Kisah di balik kilaunya', 'Kenali wajah baru Gen 18', 'Live stream yang wajib kamu bookmark bulan ini'], articleDates: ['5 menit baca · 20 Agu 2026', '8 menit baca · 18 Agu 2026', '6 menit baca · 15 Agu 2026'] },
  en: { debut: 'Debut', base: 'Base', viewMembers: 'View members', officialSite: 'Official site', member: 'members', rosterEmpty: 'Roster not filled', articleMeta: ['JKT48 · WIKI UPDATE', 'AKB48 · MEMBER GUIDE', 'LIVE CULTURE · PICKS'], articleTitles: ['JKT48 New Single: The story behind the sparkle', 'Meet the bright new faces of 18th Gen', 'Top live streams to bookmark this month'], articleDates: ['5 min read · Aug 20, 2026', '8 min read · Aug 18, 2026', '6 min read · Aug 15, 2026'] },
  ja: { debut: 'デビュー', base: '拠点', viewMembers: 'メンバーを見る', officialSite: '公式サイト', member: '人', rosterEmpty: '名簿は準備中', articleMeta: ['JKT48 · Wiki更新', 'AKB48 · メンバーガイド', 'ライブ文化 · おすすめ'], articleTitles: ['JKT48新曲：輝きの物語', '18期生の新しい顔ぶれ', '今月チェックしたい配信ライブ'], articleDates: ['5分で読める · 2026年8月20日', '8分で読める · 2026年8月18日', '6分で読める · 2026年8月15日'] },
  th: { debut: 'เปิดตัว', base: 'ฐานที่ตั้ง', viewMembers: 'ดูสมาชิก', officialSite: 'เว็บไซต์ทางการ', member: 'สมาชิก', rosterEmpty: 'กำลังเตรียมรายชื่อ', articleMeta: ['JKT48 · อัปเดต Wiki', 'AKB48 · คู่มือสมาชิก', 'วัฒนธรรมไลฟ์ · แนะนำ'], articleTitles: ['ซิงเกิลใหม่ JKT48: เรื่องราวแห่งประกาย', 'พบกับสมาชิกใหม่รุ่นที่ 18', 'ไลฟ์สตรีมที่ควรติดตามเดือนนี้'], articleDates: ['อ่าน 5 นาที · 20 ส.ค. 2026', 'อ่าน 8 นาที · 18 ส.ค. 2026', 'อ่าน 6 นาที · 15 ส.ค. 2026'] },
  'zh-CN': { debut: '出道', base: '所在地', viewMembers: '查看成员', officialSite: '官方网站', member: '名成员', rosterEmpty: '成员名单准备中', articleMeta: ['JKT48 · Wiki更新', 'AKB48 · 成员指南', '直播文化 · 推荐'], articleTitles: ['JKT48新单曲：闪耀背后的故事', '认识18期生的新面孔', '本月值得收藏的直播'], articleDates: ['阅读5分钟 · 2026年8月20日', '阅读8分钟 · 2026年8月18日', '阅读6分钟 · 2026年8月15日'] },
  'zh-TW': { debut: '出道', base: '所在地', viewMembers: '查看成員', officialSite: '官方網站', member: '名成員', rosterEmpty: '成員名單準備中', articleMeta: ['JKT48 · Wiki更新', 'AKB48 · 成員指南', '直播文化 · 推薦'], articleTitles: ['JKT48新單曲：閃耀背後的故事', '認識18期生的新面孔', '本月值得收藏的直播'], articleDates: ['閱讀5分鐘 · 2026年8月20日', '閱讀8分鐘 · 2026年8月18日', '閱讀6分鐘 · 2026年8月15日'] },
  ms: { debut: 'Debut', base: 'Berpangkalan', viewMembers: 'Lihat ahli', officialSite: 'Laman rasmi', member: 'ahli', rosterEmpty: 'Senarai ahli belum diisi', articleMeta: ['JKT48 · KEMAS KINI WIKI', 'AKB48 · PANDUAN AHLI', 'BUDAYA LIVE · PILIHAN'], articleTitles: ['Single baharu JKT48: Kisah di sebalik sinarnya', 'Kenali wajah baharu Generasi 18', 'Live stream yang patut disimpan bulan ini'], articleDates: ['5 minit bacaan · 20 Ogos 2026', '8 minit bacaan · 18 Ogos 2026', '6 minit bacaan · 15 Ogos 2026'] },
};
const UI_CATEGORY_COPY = {
  id: { domestic: { title: 'Domestik (Jepang)', short: 'Domestik', sub: 'Grup yang berbasis di Jepang' }, kaigai: { title: 'Kaigai (Luar Jepang)', short: 'Kaigai', sub: 'Sister group internasional' } },
  en: { domestic: { title: 'Domestic (Japan)', short: 'Domestic', sub: 'Groups based in Japan' }, kaigai: { title: 'International', short: 'International', sub: 'Sister groups around the world' } },
  ja: { domestic: { title: '国内（日本）', short: '国内', sub: '日本を拠点とするグループ' }, kaigai: { title: '海外', short: '海外', sub: '世界各地の姉妹グループ' } },
  th: { domestic: { title: 'ในประเทศ (ญี่ปุ่น)', short: 'ในประเทศ', sub: 'กลุ่มที่ตั้งอยู่ในญี่ปุ่น' }, kaigai: { title: 'ต่างประเทศ', short: 'ต่างประเทศ', sub: 'กลุ่มพี่น้องจากทั่วโลก' } },
  'zh-CN': { domestic: { title: '日本国内', short: '国内', sub: '以日本为基地的组合' }, kaigai: { title: '海外', short: '海外', sub: '来自世界各地的姐妹组合' } },
  'zh-TW': { domestic: { title: '日本國內', short: '國內', sub: '以日本為基地的團體' }, kaigai: { title: '海外', short: '海外', sub: '來自世界各地的姊妹團體' } },
  ms: { domestic: { title: 'Domestik (Jepun)', short: 'Domestik', sub: 'Kumpulan yang berpangkalan di Jepun' }, kaigai: { title: 'Antarabangsa', short: 'Antarabangsa', sub: 'Kumpulan saudari dari seluruh dunia' } },
};

function currentUiCode() {
  const code = document.documentElement.lang || 'id';
  return UI_CARD_COPY[code] ? code : 'en';
}

function uiCardText(key) {
  const labels = {
    live: { id: 'LIVE', en: 'LIVE', ja: '配信中', th: 'กำลังไลฟ์', 'zh-CN': '直播中', 'zh-TW': '直播中', ms: 'LIVE' },
    stage: { id: 'Stage', en: 'Stage', ja: 'ステージ', th: 'ขึ้นเวที', 'zh-CN': '舞台', 'zh-TW': '舞台', ms: 'Pentasan' },
    watchLive: { id: 'Tonton Live', en: 'Watch live', ja: 'ライブを見る', th: 'ดูไลฟ์', 'zh-CN': '观看直播', 'zh-TW': '觀看直播', ms: 'Tonton Live' },
    officialSchedule: { id: 'Jadwal resmi', en: 'Official schedule', ja: '公式スケジュール', th: 'ตารางงานทางการ', 'zh-CN': '官方日程', 'zh-TW': '官方行程', ms: 'Jadual rasmi' },
    agenda: { id: 'Agenda resmi', en: 'Official agenda', ja: '公式予定', th: 'กำหนดการทางการ', 'zh-CN': '官方安排', 'zh-TW': '官方安排', ms: 'Agenda rasmi' },
    profile: { id: 'Lihat profil', en: 'View profile', ja: 'プロフィールを見る', th: 'ดูโปรไฟล์', 'zh-CN': '查看资料', 'zh-TW': '查看資料', ms: 'Lihat profil' },
    pin: { id: 'Pin', en: 'Pin', ja: 'ピン留め', th: 'ปักหมุด', 'zh-CN': '收藏', 'zh-TW': '收藏', ms: 'Pin' },
    unpin: { id: 'Lepas', en: 'Unpin', ja: 'ピンを外す', th: 'เลิกปักหมุด', 'zh-CN': '取消收藏', 'zh-TW': '取消收藏', ms: 'Nyahpin' },
  };
  if (labels[key]) return labels[key][currentUiCode()];
  if (key === 'all') {
    return { id: 'Semua', en: 'All', ja: 'すべて', th: 'ทั้งหมด', 'zh-CN': '全部', 'zh-TW': '全部', ms: 'Semua' }[currentUiCode()];
  }
  if (key === 'groups') {
    return { id: 'grup', en: 'groups', ja: 'グループ', th: 'กลุ่ม', 'zh-CN': '个组合', 'zh-TW': '個團體', ms: 'kumpulan' }[currentUiCode()];
  }
  return (UI_CARD_COPY[currentUiCode()] || UI_CARD_COPY.en)[key];
}

function kategoriLabel(key) {
  const code = currentUiCode();
  return (UI_CATEGORY_COPY[code] || UI_CATEGORY_COPY.en)[key] || KATEGORI_GRUP[key];
}

function applyCardTranslations() {
  const copy = UI_CARD_COPY[currentUiCode()] || UI_CARD_COPY.en;
  document.querySelectorAll('.article-card').forEach((card, index) => {
    if (copy.articleMeta[index]) card.querySelector('.article-meta').textContent = copy.articleMeta[index];
    if (copy.articleTitles[index]) card.querySelector('h3').textContent = copy.articleTitles[index];
    if (copy.articleDates[index]) card.querySelector('p').innerHTML = `${copy.articleDates[index].replace(' · ', ' <b>•</b> ')}`;
  });
  document.querySelectorAll('.group-card .group-meta dt').forEach((item, index) => { item.textContent = index % 2 ? copy.base : copy.debut; });
  document.querySelectorAll('.group-card .group-cta').forEach((item) => { item.childNodes[0].textContent = `${copy.viewMembers} `; });
  document.querySelectorAll('.group-site-text').forEach((item) => { item.textContent = copy.officialSite; });
}

function initI18n() {
  const header = $('.header-inner');
  if (!header) return;
  let select = $('.language-select');
  if (!select) {
    select = document.createElement('select');
    select.className = 'language-select';
    select.setAttribute('aria-label', 'Select language');
    select.innerHTML = UI_LANGUAGES.map(([code, label]) => `<option value="${code}">${label}</option>`).join('');
    const actions = $('.header-actions', header);
    (actions || header).appendChild(select);
  }
  const saved = localStorage.getItem('wiki48-language') || document.documentElement.lang || 'id';
  select.value = UI_COPY[saved] ? saved : 'en';
  function apply(code) {
    const copy = UI_COPY[code] || UI_COPY.en;
    document.documentElement.lang = code;
    document.querySelectorAll('.desktop-nav .nav-item').forEach((item, index) => {
      const key = ['home', 'members', 'groups', 'gallery', 'community', 'updates'][index];
      const icon = item.querySelector('span');
      item.textContent = '';
      if (icon) item.appendChild(icon);
      item.append(` ${copy[key]}`);
    });
    document.querySelectorAll('.drawer-nav a').forEach((item) => {
      const href = item.getAttribute('href') || '';
      const key = href.includes('members') ? 'members'
        : href.includes('groups') ? 'groups'
          : href.includes('schedule') ? 'schedule'
            : href.includes('news') ? 'updates'
              : href.includes('community') ? 'community' : 'home';
      const icon = item.textContent.trim().split(' ')[0];
      item.textContent = `${icon} ${copy[key]}`;
    });
    document.querySelectorAll('.header-search input, #searchInput, #groupSearchInput').forEach((input) => { input.placeholder = copy.search; });
    const menu = $('.drawer-title'); if (menu) menu.textContent = copy.menu;
    document.querySelectorAll('.back-link').forEach((link) => { if (/Beranda|Home|ホーム|หน้าแรก|首页|首頁|Laman Utama/.test(link.textContent)) link.textContent = copy.back; });
    applyCardTranslations();
    document.dispatchEvent(new CustomEvent('wiki48-language-change', { detail: { code } }));
    try { localStorage.setItem('wiki48-language', code); } catch (error) { /* storage is optional */ }
  }
  select.addEventListener('change', () => apply(select.value));
  apply(select.value);
}
