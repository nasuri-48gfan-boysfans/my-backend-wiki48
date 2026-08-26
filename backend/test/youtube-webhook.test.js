'use strict';

/* =============================================================
   uji-youtube-webhook — unit test fungsi murni WebSub
   Jalankan: npm run uji:yt
   ============================================================= */

const assert = require('node:assert');
const path = require('node:path');
const { parseAtomFeed, daftarChannel, verifikasiTandaTangan, tokenVerifikasi } = require(path.join(__dirname, '..', 'server', 'youtube-webhook'));

let lulus = 0;
let gagal = 0;

async function uji(nama, fn) {
  try {
    await fn();
    lulus += 1;
    console.log(`  ok   ${nama}`);
  } catch (error) {
    gagal += 1;
    console.log(`  GAGAL ${nama}\n        ${error.message}`);
  }
}

const XML_DUA_VIDEO = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <link rel="hub" href="https://pubsubhubbub.appspot.com"/>
  <entry>
    <id>yt:video AbCdE12345x</id>
    <yt:videoId>AbCdE12345x</yt:videoId>
    <yt:channelId>UCaIbbu5Xg3DpHsn_3Zw2m9w</yt:channelId>
    <title><![CDATA[Judul Video Baru JKT48]]></title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=AbCdE12345x"/>
    <published>2026-08-26T03:00:00+00:00</published>
    <updated>2026-08-26T03:01:00+00:00</updated>
  </entry>
  <entry>
    <id>yt:video Zz987654321</id>
    <yt:videoId>Zz987654321</yt:videoId>
    <yt:channelId>UCVOBJSAK2wqQD9Lm1rE-TdQ</yt:channelId>
    <title>KLP48 - Update Menarik</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=Zz987654321"/>
    <published>2026-08-26T02:00:00+00:00</published>
  </entry>
</feed>`;

(async () => {
  console.log('UJI YOUTUBE WEBHOOK (fungsi murni)\n');

  await uji('parse: dua entri terbaca lengkap', async () => {
    const hasil = parseAtomFeed(XML_DUA_VIDEO);
    assert.strictEqual(hasil.length, 2);
    assert.strictEqual(hasil[0].videoId, 'AbCdE12345x');
    assert.strictEqual(hasil[0].channelId, 'UCaIbbu5Xg3DpHsn_3Zw2m9w');
    assert.strictEqual(hasil[0].title, 'Judul Video Baru JKT48');
    assert.match(hasil[0].url, /watch\?v=AbCdE12345x/);
    assert.strictEqual(hasil[0].published, '2026-08-26T03:00:00+00:00');
    assert.strictEqual(hasil[1].channelId, 'UCVOBJSAK2wqQD9Lm1rE-TdQ');
  });

  await uji('parse: entri tanpa videoId dilewati', async () => {
    const xml = '<feed><entry><title>bukan video</title></entry>'
      + '<entry><yt:videoId>OK123456789</yt:videoId><yt:channelId>UCaIbbu5Xg3DpHsn_3Zw2m9w</yt:channelId></entry></feed>';
    const hasil = parseAtomFeed(xml);
    assert.strictEqual(hasil.length, 1);
    assert.strictEqual(hasil[0].videoId, 'OK123456789');
  });

  await uji('parse: XML kosong/rusak → array kosong tanpa throw', async () => {
    assert.deepStrictEqual(parseAtomFeed(''), []);
    assert.deepStrictEqual(parseAtomFeed('<ini bukan feed'), []);
  });

  await uji('daftarChannel: CSV dibersihkan, handle ditolak', () => {
    const env = { YOUTUBE_CHANNEL_IDS: ' UCaIbbu5Xg3DpHsn_3Zw2m9w , @JKT48 , UCVOBJSAK2wqQD9Lm1rE-TdQ ,, ' };
    assert.deepStrictEqual(daftarChannel(env), ['UCaIbbu5Xg3DpHsn_3Zw2m9w', 'UCVOBJSAK2wqQD9Lm1rE-TdQ']);
  });

  await uji('signature: cocok/salah/kosong-secret', () => {
    const crypto = require('node:crypto');
    const secret = 'rahasia-webhook';
    const body = '<feed/>';
    const benar = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    assert.strictEqual(verifikasiTandaTangan(secret, body, benar), true);
    assert.strictEqual(verifikasiTandaTangan(secret, body, 'sha256=deadbeef'), false);
    assert.strictEqual(verifikasiTandaTangan('', body, undefined), true);
  });

  await uji('tokenVerifikasi: stabil & beda antar channel', () => {
    const s = 'sec';
    assert.strictEqual(tokenVerifikasi('UCaIbbu5Xg3DpHsn_3Zw2m9w', s), tokenVerifikasi('UCaIbbu5Xg3DpHsn_3Zw2m9w', s));
    assert.notStrictEqual(tokenVerifikasi('UCaIbbu5Xg3DpHsn_3Zw2m9w', s), tokenVerifikasi('UCVOBJSAK2wqQD9Lm1rE-TdQ', s));
  });

  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  if (gagal > 0) process.exitCode = 1;
})();
