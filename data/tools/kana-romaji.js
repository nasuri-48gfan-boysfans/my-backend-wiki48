#!/usr/bin/env node
/* =============================================================
   kana-romaji.js — DEV ONLY, TIDAK DIMUAT HALAMAN MANA PUN
   -------------------------------------------------------------
   Mengubah bacaan kana (furigana) dari situs resmi 48G Jepang menjadi
   romaji gaya yang dipakai fandom 48G:

     おぐり ゆい   → Oguri Yui
     さとう しおり → Sato Shiori      (vokal panjang おう diringkas jadi o)
     はっとり     → Hattori          (sokuon っ menggandakan konsonan)
     やまだ きょうか → Yamada Kyoka   (youon + vokal panjang)

   ALASAN memakai kana, bukan kanji: bacaan nama Jepang tidak beraturan
   (小栗 bisa Oguri/Koguri), jadi menebak dari kanji tidak aman. Kana →
   romaji deterministik, dan situs resmi selalu menyertakan furigana.

   PAKAI:
     node data/tools/kana-romaji.js --test           # jalankan self-test
     node data/tools/kana-romaji.js "おぐり ゆい"      # konversi satu nama
     node data/tools/kana-romaji.js --file bacaan.txt # satu nama per baris

   Dipakai juga sebagai modul:  require('./kana-romaji.js').romaji(str)
   ============================================================= */

'use strict';

/* ---------------------------------------------------------------
   1. TABEL KANA → ROMAJI
   Digraf (2 kana) harus dicoba sebelum kana tunggal.
   --------------------------------------------------------------- */
/* Penanda sementara untuk ん. Perlu dibedakan dari "n" yang berasal dari
   な/に/ぬ/ね/の, karena hanya ん yang dapat apostrof Hepburn di depan
   vokal (しんいち → Shin'ichi, tapi せいな → Seina). Diganti di beresi(). */
const N_SENTINEL = '\u0001';

const DIGRAF = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho', じゃ: 'ja',  じゅ: 'ju',  じょ: 'jo',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  しぇ: 'she', じぇ: 'je',  ちぇ: 'che', てぃ: 'ti',  でぃ: 'di',
  つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso',
  ふぁ: 'fa',  ふぃ: 'fi',  ふぇ: 'fe',  ふぉ: 'fo',  ふゅ: 'fyu',
  ゔぁ: 'va',  ゔぃ: 'vi',  ゔぇ: 've',  ゔぉ: 'vo',
};

const TUNGGAL = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: N_SENTINEL,
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゔ: 'vu',
};

const VOKAL = 'aiueo';

/* Katakana → hiragana. Situs resmi kadang menulis bacaan pakai katakana. */
function keHiragana(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/* ---------------------------------------------------------------
   2. KONVERSI SATU KATA
   --------------------------------------------------------------- */
function kataKeRomaji(kata) {
  const s = keHiragana(kata);
  let out = '';
  let i = 0;

  while (i < s.length) {
    const c = s[i];
    const dua = s.slice(i, i + 2);

    // Sokuon っ → gandakan konsonan pertama suku berikutnya.
    if (c === 'っ' || c === 'ッ') {
      const sisa = kataKeRomaji(s.slice(i + 1));
      if (!sisa) { i += 1; continue; }
      // Hepburn: っち→tchi, bukan cchi.
      const gandakan = sisa.startsWith('ch') ? 't' : sisa[0];
      return out + gandakan + sisa;
    }

    // Chouonpu ー → panjangkan vokal sebelumnya (nanti diringkas lagi).
    if (c === 'ー' || c === '－' || c === '-') {
      if (out && VOKAL.includes(out[out.length - 1])) out += out[out.length - 1];
      i += 1;
      continue;
    }

    if (DIGRAF[dua]) { out += DIGRAF[dua]; i += 2; continue; }
    if (TUNGGAL[c])  { out += TUNGGAL[c];  i += 1; continue; }

    out += c; // huruf non-kana dibiarkan (angka, huruf Latin)
    i += 1;
  }

  return out;
}

/* ---------------------------------------------------------------
   3. PEMBERESAN GAYA 48G
   --------------------------------------------------------------- */
function beresi(r) {
  let s = r;

  // ん (penanda) sebelum vokal atau y → n' (Hepburn): しんいち → Shin'ichi.
  // Karena ん ditandai sejak konversi, "n" dari な/に/ぬ/ね/の tidak pernah
  // ikut kena — せいな tetap Seina, bukan Sein'a.
  s = s.replace(new RegExp(N_SENTINEL + '(?=[aiueoy])', 'g'), "n'");
  s = s.split(N_SENTINEL).join('n');

  // Vokal panjang diringkas — konvensi fandom 48G:
  //   さとう → Sato (bukan Satou/Satō), ゆう → Yu, おおた → Ota
  // "ei" dan "ii" DIPERTAHANKAN (けい → Kei, にい → Nii) karena fandom
  // menulisnya utuh.
  s = s.replace(/ou/g, 'o').replace(/oo/g, 'o').replace(/uu/g, 'u');

  return s;
}

function kapital(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/* API utama: satu string bisa berisi beberapa kata (nama keluarga + nama).
   Urutan tidak diubah — situs Jepang menulis 姓 lalu 名, dan fandom 48G
   juga memakai urutan itu dalam romaji ("Oguri Yui"). */
function romaji(input) {
  return String(input)
    .replace(/[　\s]+/g, ' ')   // spasi ideografis → spasi biasa
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((kata) => kapital(beresi(kataKeRomaji(kata))))
    .join(' ');
}

/* ---------------------------------------------------------------
   4. SELF-TEST
   Kasus diambil dari pola nama yang lazim di 48G. Jalankan ulang tiap
   kali tabel diubah.
   --------------------------------------------------------------- */
const KASUS = [
  // [input kana, romaji yang diharapkan, kenapa diuji]
  ['おぐり ゆい',     'Oguri Yui',      'dasar, dua kata'],
  ['よこやま ゆい',   'Yokoyama Yui',   'dasar'],
  ['さとう しおり',   'Sato Shiori',    'おう diringkas → o'],
  ['おおた なお',     'Ota Nao',        'おお diringkas → o'],
  ['やまだ きょうか', 'Yamada Kyoka',   'youon きょ + vokal panjang'],
  ['はっとり ゆめ',   'Hattori Yume',   'sokuon menggandakan konsonan'],
  ['いっちゃん',      'Itchan',         'sokuon + ち → tch, bukan cch'],
  ['しろま みる',     'Shiroma Miru',   'し → shi'],
  ['つかもと ちよ',   'Tsukamoto Chiyo', 'つ → tsu, ち → chi'],
  ['ふくおか せいな', 'Fukuoka Seina',  'ふ → fu, ei dipertahankan'],
  ['じゅり',          'Juri',           'digraf じゅ'],
  ['しんいち',        "Shin'ichi",      "ん sebelum vokal → n'"],
  ['なら みき',       'Nara Miki',      "na jangan jadi n'a"],
  ['オグリ ユイ',     'Oguri Yui',      'input katakana'],
  ['けいこ',          'Keiko',          'ei tidak diringkas'],
  ['にいがた',        'Niigata',        'ii tidak diringkas'],
  ['ゆう',            'Yu',             'うう… → u'],
  ['むらやま　ゆいり', 'Murayama Yuiri', 'spasi ideografis U+3000'],
];

function test() {
  let gagal = 0;
  KASUS.forEach(([input, harap, kenapa]) => {
    const hasil = romaji(input);
    const ok = hasil === harap;
    if (!ok) gagal += 1;
    console.log(`${ok ? 'ok  ' : 'GAGAL'}  ${input.padEnd(16)} → ${hasil.padEnd(16)} ${ok ? '' : `(harap: ${harap})`}  ${kenapa}`);
  });
  console.log(`\n${KASUS.length - gagal}/${KASUS.length} lulus.`);
  if (gagal) process.exit(1);
}

/* ---------------------------------------------------------------
   5. CLI
   --------------------------------------------------------------- */
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--test')) {
    test();
  } else if (args[0] === '--file') {
    const fs = require('fs');
    fs.readFileSync(args[1], 'utf8').split(/\r?\n/).filter(Boolean)
      .forEach((l) => console.log(`${l}\t${romaji(l)}`));
  } else if (args.length) {
    console.log(romaji(args.join(' ')));
  } else {
    console.log('Pakai: node data/tools/kana-romaji.js --test | "<kana>" | --file <path>');
  }
}

module.exports = { romaji, kataKeRomaji };
