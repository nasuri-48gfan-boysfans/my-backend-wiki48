# Live Tracker

Modul Node.js untuk monitoring status live Showroom, IDN Live, dan YouTube.
Tidak memakai stealth atau bypass Cloudflare. Endpoint unofficial dapat berubah;
parser akan retry lalu mencatat error tanpa mematikan seluruh batch.

## Jalankan

Node.js 18+ diperlukan karena modul memakai `fetch` bawaan.

### Worker production 24/7

Jalankan worker sebagai **service deployment terpisah** dari API, bukan di
komputer lokal. Set root directory service ke `backend/`, gunakan command:

```powershell
npm run worker
```

Worker ini tidak selesai sendiri: ia polling sesuai `LIVE_TRACKER_INTERVAL_MS`,
menulis snapshot ke Redis, dan akan dijalankan ulang oleh platform bila proses
atau mesin service restart. Set health check ke `/healthz` dan salin environment
Redis, kredensial provider, serta webhook Discord ke service worker. API dan
worker wajib memakai Redis Upstash yang sama.

Untuk test satu siklus tanpa menyalakan loop:

```powershell
npm run live:once
```

```powershell
# Buat/refresh mapping room Showroom dari daftar room yang sedang live
node data/live-tracker/cli.js --discover

# Cek status semua mapping
node data/live-tracker/cli.js --check

# Poll setiap 45 detik; interval yang valid 30-60 detik
node data/live-tracker/cli.js --poll

# Lihat mapping lokal
node data/live-tracker/cli.js --members

# Jalankan API untuk frontend
node data/live-tracker/cli.js --serve
```

API:

- `GET /api/members`: mapping lokal.
- `GET /api/discover`: discovery room Showroom dan menyimpan mapping.
- `GET /api/live`: mengembalikan daftar member LIVE dengan `live_url`.

File mapping adalah `data/live-tracker/members.json`:

```json
{
  "id": "jkt48-01",
  "member_name": "Nama Member",
  "showroom_room_id": "12345",
  "showroom_room_url_key": "member_room",
  "idn_username": "member_handle",
  "is_live": false,
  "last_live_at": null
}
```

Rate limit default adalah 3.5 detik antar request per provider. Atur dengan
`LIVE_TRACKER_DELAY_MS=5000`. Interval poll diatur dengan
`LIVE_TRACKER_INTERVAL_MS=60000` (30000-60000). Retry berlaku untuk timeout, HTTP 408/429/5xx,
dan JSON yang berubah. Username IDN diambil dari biodata lokal bila tersedia;
discovery IDN otomatis penuh tidak tersedia secara stabil tanpa endpoint resmi.

Field mapping yang didukung:

```json
{
  "member_name": "Nama Member",
  "showroom_room_id": "12345",
  "idn_username": "member_handle",
  "youtube_video_id": "video-id",
  "youtube_channel_id": "UC..."
}
```

Secret dan proxy gunakan environment variable, jangan commit ke JSON atau source:

```powershell
$env:SHOWROOM_AUTH_TOKEN="..."
$env:IDN_AUTH_TOKEN="..."
$env:YOUTUBE_API_KEY="..."
$env:YOUTUBE_AUTH_TOKEN="..."
$env:HTTPS_PROXY="http://proxy.example:8080"
node data/live-tracker/cli.js --poll
```

YouTube membutuhkan `YOUTUBE_API_KEY`; token bearer hanya diteruskan bila API/proxy
internal memerlukannya. Di Node.js, error fetch jaringan/CORS, timeout, dan HTTP 429
dicatat per member dan di-retry oleh limiter tanpa menghentikan batch.

Contoh pemakaian module:

```js
const { checkLiveStatus, ShowroomAdapter, IdnAdapter } = require('./data/live-tracker');
const live = await checkLiveStatus({
  showroom: new ShowroomAdapter(),
  idn: new IdnAdapter(),
  file: 'data/live-tracker/members.json',
});
```

Input array juga bisa dipakai tanpa file:

```js
const members = [{ id: 'jkt48-01', member_name: 'Nama Member', showroom_room_id: '12345' }];
const live = await checkLiveStatus({ members, showroom: new ShowroomAdapter() });
```
