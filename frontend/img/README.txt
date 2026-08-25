FOLDER FOTO MEMBER
==================

Taruh foto member di folder ini. Selama file belum ada, card otomatis
menampilkan placeholder SVG (inisial + warna aksen) — jadi tampilan
tidak pernah rusak/broken image.

Nama file harus cocok dengan properti `img` di common.js:

  img/jk-01-aira.jpg     → Aira Prameswari   (JKT48, Team J)
  img/jk-02-nayla.jpg    → Nayla Zahira      (JKT48, Team J)
  img/jk-03-kalea.jpg    → Kalea Ardhana     (JKT48, Team KIII)
  img/jk-04-reva.jpg     → Reva Anindya      (JKT48, Gen 10)
  img/jk-05-sasha.jpg    → Sasha Maheswari   (JKT48, Gen 11)
  img/nb-01-rina.jpg     → Rina Hoshino      (NMB48, Team N)
  img/nb-02-kaho.jpg     → Kaho Tsukishima   (NMB48, Team N)
  img/nb-03-mei.jpg      → Mei Sakurada      (NMB48, Team M)
  img/nb-04-yuina.jpg    → Yuina Kirishima   (NMB48, Team BII)

SPESIFIKASI FOTO
- Rasio 3:4 (potrait). Contoh ukuran: 600x800 atau 900x1200 px.
- Foto dipasang dengan object-fit: cover, jadi rasio lain akan
  terpotong di bagian atas/bawah — bukan gepeng.
- Format .jpg atau .webp. Kalau pakai ekstensi lain, sesuaikan
  properti `img` di common.js.

MENGGANTI NAMA MEMBER
Nama member di common.js masih placeholder fiktif. Kalau mau memakai
roster asli, ubah `name` (dan `img` bila perlu) di array MEMBERS.
