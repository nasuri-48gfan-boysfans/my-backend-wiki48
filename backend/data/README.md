# Panduan Mengisi Roster Member

Semua data member tinggal ditulis di **`common.js`**, pada blok `ROSTER_*`
(sekitar baris 220). Situs tidak punya build step — simpan filenya, refresh
browser, selesai.

Ada dua cara mengisi: tulis tangan langsung di `common.js`, atau pakai
importer di `data/tools/` kalau kamu punya hasil copy-paste dari wiki/situs
resmi. Importer itu **dev-only** — dijalankan manual di terminal, tidak ada
`<script>` yang memuatnya, jadi situs tetap murni HTML/CSS/JS statis:

```
node data/tools/import-roster.js --debug   # pratinjau bacaan file di data/sumber/
node data/tools/import-roster.js --write   # tulis ke blok ROSTER_* di common.js
node data/tools/audit.js                   # cek id kembar, accent, urutan script
```

Detail alur copy-paste ada di `data/sumber/README.md`.

Per 2026-08-21 semua roster masih **kosong**. Website tetap jalan normal
dalam kondisi kosong: banner status menampilkan "Belum ada yang live",
card grup menampilkan "Roster belum diisi", dan hitungan grup membaca
"12 grup · roster belum diisi".

---

## Satu baris = satu member

```js
const ROSTER_JKT48 = [
  { id: 'jkt48-01', name: 'Nama Member', team: 'Team J', accent: 'pink' },
  { id: 'jkt48-02', name: 'Nama Lain',   team: 'Team J', accent: 'pink' },
];
```

Empat kolom itu sudah cukup. `buildMembers()` mengisi sisanya otomatis:
`group`, `groupId`, `livePlatform`, `img`, dan `accent` (kalau dikosongkan,
ikut warna grup).

### Kolom wajib

| Kolom    | Isi                                                              |
| -------- | ---------------------------------------------------------------- |
| `id`     | Unik di seluruh situs, huruf kecil. Pola: `<slug grup>-<nomor>`. Dipakai sebagai kunci Oshi Pin di localStorage, jadi jangan diubah setelah dipakai. |
| `name`   | Nama panggung. Baris tanpa `name` (atau `name: ''`) **dilewati**, jadi contoh yang dikomentari tidak akan bocor ke halaman. |
| `team`   | Team / Gen / unit, mis. `Team J`, `Team A`, `Gen 12`. Boleh `''` kalau grupnya belum berteam. |
| `accent` | Warna tema card: `pink`, `cyan`, `violet`, atau `amber`. Nilai lain diabaikan CSS-nya dan card jadi abu-abu. |

`id` sebenarnya opsional — kalau dihapus, nomor dibuat otomatis berurutan
(`jkt48-01`, `jkt48-02`, …) mengikuti urutan penulisan. Menulis `id` sendiri
lebih aman karena pin oshi tidak bergeser saat kamu menyisipkan member baru
di tengah daftar.

### Kolom opsional

| Kolom      | Default            | Keterangan                                              |
| ---------- | ------------------ | ------------------------------------------------------- |
| `isLive`   | `false`            | `true` → nama masuk banner "🔴 LIVE NOW", border card berdenyut merah. |
| `liveUrl`  | `''`               | URL streaming. Kalau kosong, tombol "Tonton Live" **disembunyikan** (tidak ada link mati). |
| `isStage`  | `false`            | `true` → nama masuk banner "🎭 PERFORMING TODAY".        |
| `stage`    | `null`             | `{ title: 'Setlist', time: '19:00', venue: 'Theater' }` — tampil di daftar jadwal. |
| `img`      | `img/<id>.jpg`     | Foto rasio 3:4. Kalau file belum ada, otomatis pakai placeholder SVG bawaan. |
| `livePlatform` | ikut grup      | Label platform pada tombol streaming, mis. `SHOWROOM`.   |

Contoh member yang sedang live sekaligus ada jadwal stage:

```js
{
  id: 'jkt48-05', name: 'Nama Member', team: 'Team J', accent: 'pink',
  isLive: true,
  liveUrl: 'https://www.idn.app/…',
  isStage: true,
  stage: { title: 'Aitakatta', time: '19:00', venue: 'JKT48 Theater' },
},
```

### Stage vs jadwal

`isStage` dan `stage` hanya untuk status penampilan yang sedang berlangsung
sekarang. Agenda mendatang atau riwayat jadwal disimpan terpisah di `schedule`
sebagai array:

```js
schedule: [
  {
    date: '2026-08-25',
    time: '19:00',
    title: 'Seishun Girls',
    venue: 'JKT48 Theater',
    type: 'Stage',
    url: 'https://jkt48.com/schedule?lang=id',
  },
],
```

Halaman `schedule.html` menampilkan isi field ini sebagai agenda terstruktur.
Jika belum diisi, tersedia tautan jadwal resmi grup untuk melihat agenda terbaru.

---

## Foto member

Simpan di folder `img/` dengan nama sama seperti `id`, mis.
`img/jkt48-01.jpg`. Rasio 3:4 (portrait) paling pas dengan layout card.
Selama file belum ada, card memakai placeholder SVG inline — tidak ada
permintaan ke internet, jadi halaman tetap rapi saat offline.

---

## Ke-12 grup dan sumber resminya

Urutan blok `ROSTER_*` di `common.js` sama dengan tabel ini.

### Domestik (Jepang) — platform live default `SHOWROOM`

| Grup   | `groupId` | Contoh team          | Situs resmi                 |
| ------ | --------- | -------------------- | --------------------------- |
| AKB48  | `akb48`   | Team A / K / B / 4   | https://www.akb48.co.jp/    |
| SKE48  | `ske48`   | Team S / KII / E     | https://ske48.co.jp/        |
| NMB48  | `nmb48`   | Team N / M / BII     | http://www.nmb48.com/       |
| HKT48  | `hkt48`   | Team H / KIV / TII   | https://www.hkt48.jp/       |
| NGT48  | `ngt48`   | Team NIII / G        | https://ngt48.jp/           |
| STU48  | `stu48`   | Team STU             | https://sp.stu48.com/       |

### Kaigai (Luar Jepang)

| Grup           | `groupId`   | Contoh team        | Platform live default | Situs resmi                          |
| -------------- | ----------- | ------------------ | --------------------- | ------------------------------------ |
| JKT48          | `jkt48`     | Team J / T / KIII  | IDN Live              | https://jkt48.com/                   |
| BNK48          | `bnk48`     | Team NV / BIII     | iAM / YouTube         | https://www.bnk48.com/               |
| AKB48 Team SH  | `akb48tsh`  | Team SH / HII      | Weibo                 | https://weibo.com/akb48teamsh        |
| TPE48          | `tpe48`     | Team TP            | YouTube               | https://www.tpe48.tw/                |
| CGM48          | `cgm48`     | Team C / CII       | YouTube               | https://cgm48official.com/           |
| KLP48          | `klp48`     | Team KL            | YouTube               | https://klp48.my/                    |

Kalau platform default tidak cocok untuk seorang member, timpa per baris
dengan `livePlatform: '…'`, atau ubah sekali di peta `ROSTERS` (`common.js`)
supaya berlaku untuk seluruh grup itu.

---

## Setelah mengisi, cek tiga hal

Pertama, buka `groups.html` — jumlah member per grup harus muncul di badge
card dan di hitungan tiap kategori. Kedua, klik satu card; Member Directory
di `index.html` harus terfilter ke grup itu lewat `?group=<slug>`. Ketiga,
kalau ada `id` kembar, member yang belakangan akan menimpa pencarian
`memberById()` — pastikan tiap `id` betul-betul unik sebelum menyimpan.
