const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const session = require('cookie-session');
const { Pool } = require('pg');
const { createLiveWorker } = require('./live-worker');

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined,
});
const liveWorker = createLiveWorker({ logger: console });
const liveClients = new Set();
const isProduction = process.env.NODE_ENV === 'production';
const connectSources = ["'self'"];
if (!isProduction) connectSources.push('http://localhost:8787');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' },
});
const liveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan live tracker.' },
});
const communityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan komunitas.' },
});
const accessRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak pengajuan dari jaringan ini. Coba lagi nanti.' },
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login admin.' },
});

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET production wajib diisi dan minimal 32 karakter.');
}
app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : 0);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: connectSources,
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      workerSrc: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '20kb' }));
app.use(session({
  name: 'wiki48_session',
  keys: [process.env.SESSION_SECRET || 'development-only-session-secret'],
  httpOnly: true,
  sameSite: 'strict',
  secure: isProduction,
  maxAge: 1000 * 60 * 60 * 24 * 30,
}));
app.use(express.static(path.join(__dirname, '..')));

function sendLiveEvent(response, snapshot) {
  response.write(`event: live:update\ndata: ${JSON.stringify(snapshot)}\n\n`);
}

liveWorker.events.on('snapshot', (snapshot) => {
  liveClients.forEach((response) => sendLiveEvent(response, snapshot));
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fans (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_questions (
      id BIGSERIAL PRIMARY KEY,
      country_code VARCHAR(8) NOT NULL,
      topic VARCHAR(80) NOT NULL,
      prompt VARCHAR(240) NOT NULL,
      source VARCHAR(10) NOT NULL CHECK (source IN ('bot', 'fan')),
      author_id BIGINT REFERENCES fans(id) ON DELETE SET NULL,
      question_day DATE NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS community_questions_country_day_idx ON community_questions (country_code, question_day DESC)`);
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS community_questions_bot_day_idx ON community_questions (country_code, question_day) WHERE source = 'bot'");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_requests (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(255) NOT NULL,
      country_code VARCHAR(8) NOT NULL,
      access_level VARCHAR(20) NOT NULL CHECK (access_level IN ('reader', 'contributor', 'editor')),
      reason VARCHAR(500) NOT NULL,
      experience VARCHAR(500),
      agreed_rules BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      fan_id BIGINT REFERENCES fans(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS access_requests_status_created_idx ON access_requests (status, created_at DESC)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wiki_admins (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH) {
    await pool.query('INSERT INTO wiki_admins (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash', [cleanEmail(process.env.ADMIN_EMAIL), process.env.ADMIN_PASSWORD_HASH]);
  }
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function publicFan(fan) {
  return { id: fan.id, name: fan.name, email: fan.email, joinedAt: fan.created_at };
}

function requireAuth(request, response, next) {
  if (!request.session.fanId) return response.status(401).json({ error: 'Belum login.' });
  next();
}

function requireReviewToken(request, response, next) {
  const expected = process.env.ACCESS_REVIEW_TOKEN;
  const received = String(request.get('x-access-review-token') || '');
  const expectedBytes = Buffer.from(expected || '', 'utf8');
  const receivedBytes = Buffer.from(received, 'utf8');
  if (!expected || receivedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(receivedBytes, expectedBytes)) {
    return response.status(401).json({ error: 'Token review tidak valid.' });
  }
  next();
}

function requireAdmin(request, response, next) {
  if (!request.session.adminId) return response.status(401).json({ error: 'Login admin diperlukan.' });
  next();
}

const COMMUNITY_COUNTRIES = [
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', groups: ['JKT48'] },
  { code: 'JP', name: 'Jepang', flag: '🇯🇵', groups: ['AKB48', 'SKE48', 'NMB48', 'HKT48', 'NGT48', 'STU48'] },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', groups: ['BNK48', 'CGM48'] },
  { code: 'CN', name: 'Tiongkok', flag: '🇨🇳', groups: ['AKB48 Team SH'] },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼', groups: ['TPE48'] },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', groups: ['KLP48'] },
];

const BOT_QUESTION_TEMPLATES = [
  { topic: 'Musik', prompt: 'Lagu 48 Group apa yang paling menggambarkan suasana harimu?' },
  { topic: 'Member', prompt: 'Member dari negara ini siapa yang ingin kamu rekomendasikan kepada fan baru?' },
  { topic: 'Teater', prompt: 'Hal apa dari theater atau live performance yang paling ingin kamu rasakan langsung?' },
  { topic: 'Fan Story', prompt: 'Momen kecil sebagai fan 48 Group apa yang masih kamu ingat sampai hari ini?' },
];

function questionView(question) {
  return { id: question.id, country: question.country_code, topic: question.topic, prompt: question.prompt, source: question.source, author: question.author_name || (question.source === 'bot' ? 'WIKI48 Bot' : 'Fan WIKI48'), createdAt: question.created_at, day: question.question_day };
}

async function ensureBotQuestions() {
  const day = new Date().toISOString().slice(0, 10);
  for (const country of COMMUNITY_COUNTRIES) {
    const existing = await pool.query("SELECT id FROM community_questions WHERE country_code = $1 AND source = 'bot' AND question_day = $2 LIMIT 1", [country.code, day]);
    if (!existing.rows.length) {
      const template = BOT_QUESTION_TEMPLATES[(new Date(`${day}T00:00:00Z`).getUTCDate() + country.code.charCodeAt(0)) % BOT_QUESTION_TEMPLATES.length];
      await pool.query("INSERT INTO community_questions (country_code, topic, prompt, source, question_day) VALUES ($1, $2, $3, 'bot', $4) ON CONFLICT (country_code, question_day) WHERE source = 'bot' DO NOTHING", [country.code, template.topic, template.prompt, day]);
    }
  }
}

app.post('/api/auth/register', authLimiter, async (request, response) => {
  const name = String(request.body.name || '').trim();
  const email = cleanEmail(request.body.email);
  const password = String(request.body.password || '');
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 4 || password.length > 72) {
    return response.status(400).json({ error: 'Nama, email, dan password minimal 4 karakter wajib diisi.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO fans (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name, email, passwordHash],
    );
    const fan = result.rows[0];
    request.session.fanId = fan.id;
    return response.status(201).json({ user: publicFan(fan) });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'Email sudah terdaftar.' });
    console.error(error);
    return response.status(500).json({ error: 'Gagal membuat akun.' });
  }
});

app.post('/api/auth/login', authLimiter, async (request, response) => {
  const email = cleanEmail(request.body.email);
  const password = String(request.body.password || '');
  if (!email || password.length > 72) return response.status(401).json({ error: 'Email atau password salah.' });
  try {
    const result = await pool.query('SELECT * FROM fans WHERE email = $1', [email]);
    const fan = result.rows[0];
    if (!fan || !(await bcrypt.compare(password, fan.password_hash))) {
      return response.status(401).json({ error: 'Email atau password salah.' });
    }
    request.session.fanId = fan.id;
    return response.json({ user: publicFan(fan) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Database tidak dapat diakses.' });
  }
});

app.post('/api/auth/logout', (request, response) => {
  request.session = null;
  response.status(204).end();
});

app.post('/api/admin/login', adminLoginLimiter, async (request, response) => {
  const email = cleanEmail(request.body.email);
  const password = String(request.body.password || '');
  try {
    const result = await pool.query('SELECT id, email, password_hash FROM wiki_admins WHERE email = $1', [email]);
    const admin = result.rows[0];
    if (!admin || password.length > 72 || !(await bcrypt.compare(password, admin.password_hash))) return response.status(401).json({ error: 'Email atau password admin salah.' });
    request.session.adminId = admin.id;
    return response.json({ admin: { id: admin.id, email: admin.email } });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Login admin tidak tersedia.' });
  }
});

app.post('/api/admin/logout', requireAdmin, (request, response) => {
  request.session = null;
  response.status(204).end();
});

app.post('/api/access-requests', accessRequestLimiter, async (request, response) => {
  const name = String(request.body.name || '').trim();
  const email = cleanEmail(request.body.email);
  const country = String(request.body.country || '').trim().toUpperCase();
  const accessLevel = String(request.body.accessLevel || '').trim().toLowerCase();
  const reason = String(request.body.reason || '').trim();
  const experience = String(request.body.experience || '').trim();
  const agreedRules = request.body.agreedRules === true;
  const countries = ['ID', 'JP', 'TH', 'CN', 'TW', 'MY', 'OTHER'];
  const accessLevels = ['reader', 'contributor', 'editor'];
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !countries.includes(country) || !accessLevels.includes(accessLevel) || reason.length < 20 || reason.length > 500 || experience.length > 500 || !agreedRules) {
    return response.status(400).json({ error: 'Lengkapi data dengan benar dan setujui aturan komunitas.' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO access_requests (name, email, country_code, access_level, reason, experience, agreed_rules, fan_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, status, created_at
    `, [name, email, country, accessLevel, reason, experience || null, agreedRules, request.session.fanId || null]);
    return response.status(201).json({ request: result.rows[0] });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Pengajuan belum bisa disimpan.' });
  }
});

app.get('/api/admin/access-requests', requireAdmin, async (request, response) => {
  const status = String(request.query.status || 'pending');
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return response.status(400).json({ error: 'Status review tidak valid.' });
  try {
    const result = await pool.query(`
      SELECT id, name, email, country_code, access_level, reason, experience, status, created_at, reviewed_at
      FROM access_requests
      ${status === 'all' ? '' : 'WHERE status = $1'}
      ORDER BY created_at DESC
      LIMIT 100
    `, status === 'all' ? [] : [status]);
    return response.json({ requests: result.rows });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengambil pengajuan.' });
  }
});

app.patch('/api/admin/access-requests/:id', requireAdmin, async (request, response) => {
  const status = String(request.body.status || '').trim().toLowerCase();
  if (!['pending', 'approved', 'rejected'].includes(status)) return response.status(400).json({ error: 'Status review tidak valid.' });
  try {
    const result = await pool.query('UPDATE access_requests SET status = $1, reviewed_at = CASE WHEN $1 = \'pending\' THEN NULL ELSE NOW() END WHERE id = $2 RETURNING id, status, reviewed_at', [status, request.params.id]);
    if (!result.rows[0]) return response.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    return response.json({ request: result.rows[0] });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal memperbarui status pengajuan.' });
  }
});

app.get('/api/community/countries', communityLimiter, (request, response) => {
  response.json({ countries: COMMUNITY_COUNTRIES });
});

app.get('/api/community/questions', communityLimiter, async (request, response) => {
  const country = String(request.query.country || 'ID').toUpperCase();
  if (!COMMUNITY_COUNTRIES.some((item) => item.code === country)) return response.status(400).json({ error: 'Negara tidak tersedia.' });
  try {
    await ensureBotQuestions();
    const result = await pool.query(`
      SELECT q.*, f.name AS author_name
      FROM community_questions q
      LEFT JOIN fans f ON f.id = q.author_id
      WHERE q.country_code = $1 AND q.status = 'published'
      ORDER BY q.question_day DESC, q.created_at DESC
      LIMIT 20
    `, [country]);
    return response.json({ country, questions: result.rows.map(questionView) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengambil pertanyaan komunitas.' });
  }
});

app.post('/api/community/questions', communityLimiter, requireAuth, async (request, response) => {
  const country = String(request.body.country || '').toUpperCase();
  const topic = String(request.body.topic || '').trim();
  const prompt = String(request.body.prompt || '').trim();
  if (!COMMUNITY_COUNTRIES.some((item) => item.code === country) || topic.length < 2 || topic.length > 80 || prompt.length < 10 || prompt.length > 240) {
    return response.status(400).json({ error: 'Pilih negara dan topik. Pertanyaan harus 10 sampai 240 karakter.' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO community_questions (country_code, topic, prompt, source, author_id, question_day)
      VALUES ($1, $2, $3, 'fan', $4, CURRENT_DATE)
      RETURNING *
    `, [country, topic, prompt, request.session.fanId]);
    return response.status(201).json({ question: questionView(result.rows[0]) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal membuat pertanyaan.' });
  }
});

app.get('/api/me', requireAuth, async (request, response) => {
  try {
    const result = await pool.query('SELECT id, name, email, created_at FROM fans WHERE id = $1', [request.session.fanId]);
    if (!result.rows[0]) return response.status(401).json({ error: 'Sesi tidak valid.' });
    return response.json({ user: publicFan(result.rows[0]) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal mengambil profil.' });
  }
});

app.get('/api/live/events', liveLimiter, async (request, response) => {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  response.write(': connected\n\n');
  liveClients.add(response);
  sendLiveEvent(response, await liveWorker.cache.getSnapshot());
  request.on('close', () => liveClients.delete(response));
});

app.get('/api/live', liveLimiter, async (request, response) => {
  response.json(await liveWorker.cache.getSnapshot());
});

app.patch('/api/me', requireAuth, async (request, response) => {
  const name = String(request.body.name || '').trim();
  if (name.length < 2 || name.length > 80) return response.status(400).json({ error: 'Nama harus terdiri dari 2 sampai 80 karakter.' });
  try {
    const result = await pool.query(
      'UPDATE fans SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, created_at',
      [name, request.session.fanId],
    );
    return response.json({ user: publicFan(result.rows[0]) });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Gagal menyimpan profil.' });
  }
});

async function start() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diatur. Salin .env.example menjadi .env.');
  await ensureSchema();
  app.listen(port, () => console.log(`WIKI48 community server: http://localhost:${port}`));
  liveWorker.start().catch((error) => console.error(`[LIVE WORKER] ${error.message}`));
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
