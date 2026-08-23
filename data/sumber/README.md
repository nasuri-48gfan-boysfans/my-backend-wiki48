# Tempat Menaruh Hasil Copy dari Wiki

Folder ini isinya **file mentah** hasil copy-paste dari wiki atau situs resmi.
Isinya tidak pernah dibaca oleh website — hanya oleh `data/tools/import-roster.js`
(daftar member) dan `data/tools/import-bio.js` (biodata) saat kamu jalankan
manual. Jadi aman kalau berantakan.

Sudah masuk `common.js`: **ke-12 grup, total 451 member.** Member aktif saja —
alumni tidak dimasukkan. Karena semua id sudah dipakai (foto, biodata, dan
Oshi Pin di localStorage menempel ke id), **jangan jalankan ulang `--write`
dengan urutan file sumber yang berbeda** — lihat peringatan di bawah.

---

## Langkah singkat

1. Buka halaman roster di wiki (lihat daftar URL di bawah).
2. Sorot bagian daftar member-nya saja — dari heading team pertama sampai nama terakhir.
   Jangan ikutkan sidebar, menu, atau bagian "Former Members".
3. Copy, lalu simpan sebagai file teks di folder ini dengan nama **persis slug grupnya**:

   ```
   data/sumber/jkt48.txt
   data/sumber/akb48.txt
   ```

   Alternatif: Ctrl+S di browser lalu simpan sebagai HTML, rename jadi `jkt48.html`.
   Importer bisa baca dua-duanya — HTML akan dibersihkan otomatis.

4. Pratinjau hasil bacanya dulu:

   ```
   node data/tools/import-roster.js --debug
   ```

   Perhatikan hitungan per team yang dicetak. Kalau jumlahnya masuk akal,
   tulis ke `common.js`:

   ```
   node data/tools/import-roster.js --write
   ```

Nama file menentukan grup, jadi jangan diubah polanya. Slug yang dikenali:
`akb48`, `ske48`, `nmb48`, `hkt48`, `ngt48`, `stu48`, `jkt48`, `bnk48`,
`akb48-team-sh`, `tpe48`, `cgm48`, `klp48`.

---

## URL yang biasanya paling bersih

Di AKB48 Wiki (Fandom) ada beberapa jalur ke daftar yang sama. Yang paling
enak di-copy biasanya halaman per team, karena headingnya jelas dan tidak
tercampur alumni:

| Grup  | Halaman yang dicari                                                    |
| ----- | ---------------------------------------------------------------------- |
| AKB48 | Halaman grup `AKB48`, bagian "Current Members" / "Members"             |
| AKB48 | Atau per team: `Team A`, `Team K`, `Team B`, `Team 4`, `Kenkyuusei`     |
| JKT48 | Halaman grup `JKT48`, bagian "Current Members"                         |
| JKT48 | Atau per team: `Team J`, `Team T`, `Team KIII`, `Academy`               |

Kalau kamu copy beberapa team ke **satu file yang sama**, importer tetap benar
asalkan baris heading `Team A` / `Team KIII` / `Academy` ikut ter-copy —
itu yang dipakai untuk menandai team tiap nama di bawahnya.

Alumni tidak difilter otomatis (importer tidak tahu siapa yang sudah lulus).
Kalau bagian "Former Members" ikut ter-copy, nama-nama itu akan masuk juga.
Jadi potong bagian itu sebelum menyimpan.

---

## Format paling aman: tulis sendiri

Kalau hasil copy-paste-nya kacau (tabel wiki kadang jadi satu baris panjang),
susun manual dengan pemisah `|`. Format ini dibaca paling akurat, dan boleh
2 sampai 4 kolom:

```
Nama Latin            | Team
Nama Latin            | Team      | Aksara Asli
Nama Latin            | Team      | Aksara Asli | https://situs-resmi/foto.jpg
```

Contoh nyata:

```
Adzana Shaliha        | Team J
Ikuno Rina            | Team H    | 生野 莉奈
Ishibashi Ibuki       | Team H    | 石橋 颯     | https://www.hkt48.jp/img/ibuki.jpg
```

Aturan tiap kolom:

1. **Nama Latin** — wajib. Ini yang dipakai untuk pencarian, urutan A–Z,
   monogram placeholder, dan nama file foto lokal. Jangan ditukar dengan aksara asli.
2. **Team** — nama team apa adanya. Boleh `-` kalau memang tidak punya team.
3. **Aksara Asli** — kanji/kana, Thai, atau Hanzi. Ini yang tampil sebagai nama
   utama di kartu, dengan nama Latin diselipkan kecil di atasnya.
4. **URL Foto** — boleh URL `https://` dari situs resmi grupnya (di-hotlink apa
   adanya) atau path lokal `img/xxx.jpg`. Kalau fotonya gagal dimuat — 404,
   hotlink diblokir, atau sedang offline — kartu otomatis jatuh ke placeholder,
   jadi URL yang salah tidak merusak tampilan.

Tanda `-` berarti **sengaja dikosongkan**, bukan lupa diisi. Kolom yang tidak
ada sama sekali (mis. hanya menulis 2 kolom) juga dianggap kosong.

Baris yang dimulai `#` diabaikan, begitu juga `#` di ujung baris — jadi bisa
dipakai untuk judul bagian dan catatan:

```
# ---- Team Love ----
Fiony Alveria Tantri  | Team Love
Aurellia              | Team Love   # cek: satu kata saja?
```

### Membuat berkas berformat ini dari paste mentah

Tidak perlu menyusun tangan dari nol. `buat-review.js` membaca paste mentah,
lalu menuliskannya ulang sebagai berkas berkolom yang rata dan siap dikoreksi:

```
node data/tools/buat-review.js jkt48
```

Jumlah kolomnya menyesuaikan isi: kalau tidak ada satu pun aksara asli atau URL
foto, kolom itu tidak ikut dicetak supaya tidak penuh tanda `-`.

---

## Dua jenis file di folder ini

| Lokasi                        | Isi                                                         |
| ----------------------------- | ----------------------------------------------------------- |
| `data/sumber/<slug>.txt`      | Daftar **bersih siap koreksi** — ini yang dibaca importer.   |
| `data/sumber/asli/<slug>-paste.txt` | Paste **mentah apa adanya**, disimpan untuk jejak sumber. |
| `data/sumber/bio/<groupId>.txt`     | Biodata per member — dibaca `import-bio.js`, bukan importer roster. |

Subfolder `asli/` dan `bio/` tidak pernah dibaca importer roster (hanya file di
level atas yang dipindai), jadi aman untuk menyimpan versi asli tanpa risiko
ikut terbaca dua kali.

Alur yang dipakai: paste mentah masuk ke `asli/`, importer membacanya sekali,
hasilnya ditulis ulang jadi `<slug>.txt` berformat `Nama | Team`. Setelah itu
**koreksi dilakukan di `<slug>.txt`**, bukan di paste mentahnya.

---

## Yang dilaporkan importer tapi TIDAK diperbaiki otomatis

Importer tidak pernah menebak atau membetulkan nama orang. Yang bisa dilakukannya
hanya menandai baris yang mencurigakan supaya kamu periksa:

- **Nama satu kata** — sering tanda nama depan/belakang terpotong koma di paste,
  mis. `... YAMAZAKI SORA,AKIYAMA, ARAI SAE,KUDO,KASUMI ...`
- **Nama berpenanda `★ ☆ ※ † ‡`** — penandanya dibuang dari nama (tidak boleh
  masuk `common.js`), tapi dihitung dan dilaporkan, karena artinya hanya diketahui
  situs sumbernya.

Salah ketik di dalam nama (huruf ganda, dua nama tersambung) tidak bisa dideteksi
mesin — itu harus dibaca mata.

---

## Apa yang diisi otomatis

Importer roster mengisi paling banyak enam kolom: `id`, `name`, `team`, `accent`,
lalu `nameNative` dan `img` kalau kolom 3/4 ada di file sumber. Sisanya
(`group`, `groupId`, `livePlatform`, `bio`, dan `img` bawaan) dihitung
`buildMembers()` di `common.js` saat halaman dibuka. Detail tiap kolom ada di
`data/README.md`.

`id` dibuat berurutan mengikuti urutan nama di file sumber — `jkt48-01`,
`jkt48-02`, dan seterusnya. Karena `id` dipakai sebagai kunci Oshi Pin di
localStorage, nama file foto (`img/jkt48-01.jpg`), **dan kunci penghubung ke
biodata**, **jangan jalankan ulang `--write` dengan urutan file sumber yang
berbeda** setelah kamu mulai menaruh foto atau mengisi biodata. Kalau perlu
menambah member baru belakangan, tambahkan barisnya di akhir blok `ROSTER_*`
secara manual supaya nomor yang sudah ada tidak bergeser.

Pengaman untuk kasus terburuk: setiap entri biodata menyimpan ulang `name`
member-nya. Kalau nomor id sampai bergeser, `common.js` melihat nama yang tidak
cocok, membuang biodatanya, dan menulis peringatan di console — jadi biodata
tidak pernah diam-diam menempel ke orang lain.

---

## Biodata member — `data/sumber/bio/`

Ini yang mengisi halaman detail `member.html?id=<id>`. Terpisah dari roster
karena isinya per orang, bukan per daftar.

Alurnya empat langkah:

```
node data/tools/import-bio.js                     # lihat status semua grup
node data/tools/import-bio.js jkt48 --template    # buat kerangka isian
node data/tools/import-bio.js jkt48               # pratinjau hasil baca
node data/tools/import-bio.js jkt48 --write       # tulis ke common.js
```

Langkah `--template` menuliskan `data/sumber/bio/<groupId>.txt` berisi satu blok
per member dengan semua kunci **kosong** — nama dan id-nya sudah terisi supaya
kamu tidak perlu mengetik ulang. Berkas yang sudah ada tidak akan ditimpa kecuali
kamu menambahkan `--paksa`.

Bentuk satu bloknya:

```
# --- hkt48-01  ·  Team H  ·  生野 莉奈
Ikuno Rina
panggilan: Rinacchi
angkatan: Gen 2
jabatan: Kapten Team H
lahir: 15 November 1998
asal: Fukuoka
tinggi: 155
darah: A
gabung: 2011-07-02
salam: Salam perkenalan…
x: username_tanpa_at
instagram: https://www.instagram.com/…
```

Yang perlu diperhatikan:

- **Baris pertama tiap blok adalah nama** — harus sama dengan nama di roster.
  Boleh juga diganti id-nya (`hkt48-01`) kalau ada dua member bernama sama.
  Jangan tambahkan apa pun di baris itu selain catatan setelah spasi + `#`.
- **Blok dipisah baris kosong.** Kalau lupa, tool menebaknya sebagai nama baru
  dan memberitahu — tapi lebih baik dipisah benar.
- **Kunci yang kosong dilewati**, jadi mengisi sebagian tidak membuat halaman
  bolong. Baris berisi `-` juga dianggap sengaja dikosongkan.
- **Nama kunci fleksibel**: `panggilan`/`nickname`, `lahir`/`tanggal lahir`/
  `birthday`, `asal`/`tempat lahir`, `darah`/`golongan darah`, `gabung`/`debut`,
  `salam`/`jikoshoukai`, dan seterusnya. Kunci yang tidak dikenali dilaporkan,
  bukan dibuang diam-diam.
- **Tanggal** paling aman ditulis `2003-06-06`. Bentuk `15 November 1998` dan
  `November 15, 1998` juga dibaca. Bentuk `05/06/2003` dibaca sebagai
  hari/bulan dan **dilaporkan** supaya kamu bisa memeriksa yang tanggalnya ≤ 12.
  Tanggal yang tidak ada di kalender (mis. `1998-02-30`) ditolak, bukan disimpan.
- **Usia dan zodiak tidak diisi manual** — keduanya dihitung dari `lahir` saat
  halaman dirender, supaya usianya tidak pernah basi.
- **Tinggi** cukup angka; `1.55 m` dan `155cm` juga dimengerti. Di luar 120–210 cm
  ditolak sebagai salah ketik.
- **Sosial** cukup username tanpa `@`, URL-nya dirangkai `common.js`. URL lengkap
  juga boleh. Platform yang dikenali: `x`, `instagram`, `tiktok`, `youtube`,
  `showroom`, `idn`, `weibo`, `facebook`.

Menulis satu grup tidak menghapus biodata grup lain — blok `BIO` dibaca dulu dari
`common.js`, digabung, lalu ditulis ulang seluruhnya dan diurutkan menurut id.

Sama seperti importer roster, tool ini **tidak pernah menebak isi**. Kalau situs
resminya tidak menyebut tinggi badan atau golongan darah, biarkan kosong.

