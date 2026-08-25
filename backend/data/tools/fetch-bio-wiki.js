#!/usr/bin/env node
/* Fetches supported profile fields from AKB48 Wiki infoboxes.
   This is dev-only: it writes source text, then import-bio.js validates it. */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..', 'frontend');
const COMMON_JS = path.join(ROOT, 'common.js');
const BIO_DIR = path.join(ROOT, 'data', 'sumber', 'bio');
const API = 'https://akb48.fandom.com/api.php';
const ALLOW_UNCERTAIN = process.argv.includes('--allow-uncertain');

const PROFILE_ALIASES = {
  'Takahshi Ayane': 'Takahashi Ayane',
  'Hatekayama Nozomi': 'Hatakeyama Nozomi',
  'Celline Thefanie': 'Celline Thefani',
};

const MEMBER_LIST_PAGES = {
  akb48: 'AKB48_Members', ske48: 'SKE48_Members', nmb48: 'NMB48_Members',
  hkt48: 'HKT48_Members', ngt48: 'NGT48_Members', stu48: 'STU48_Members',
  jkt48: 'JKT48_Members', bnk48: 'BNK48_Members', akb48tsh: 'TSH48_Members',
  tpe48: 'TPE48_Members', cgm48: 'CGM48_Members', klp48: 'KLP48_Members',
};
const memberListCache = new Map();

function loadData() {
  const stub = new Proxy({}, { get: (target, key) => typeof key === 'string' ? () => null : '', set: () => true });
  const sandbox = {
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => stub, addEventListener: () => {}, documentElement: stub, body: stub },
    window: { addEventListener: () => {}, location: { search: '', hash: '' } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console: { warn: () => {}, log: () => {}, error: () => {} }, encodeURIComponent, URLSearchParams,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(fs.readFileSync(COMMON_JS, 'utf8'), { filename: 'common.js' }).runInContext(sandbox);
  return vm.runInContext('({ GROUPS, MEMBERS })', sandbox);
}

const clean = (value) => String(value || '')
  .replace(/<br\s*\/?>/gi, ' / ')
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  .replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\{\{[^{}]*\|([^{}]*)\}\}/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function rawField(wikitext, name) {
  const match = wikitext.match(new RegExp(`^\\|\\s*${name}\\s*=\\s*(.*)$`, 'im'));
  return match ? match[1].trim() : '';
}

function field(wikitext, name) {
  const value = rawField(wikitext, name);
  if (!value || /^\|\s*(?:zodiac|age|active|team|group)\s*=/i.test(value)) return '';
  return clean(value);
}

function firstName(value) {
  return clean(value).split(' / ')[0].trim();
}

function dateFrom(value) {
  const match = value.match(/(?:Birth date and age|birth date|Birth date)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : '';
}

function heightFrom(value) {
  const match = value.match(/(\d{3})/);
  return match ? match[1] : '';
}

function socialValues(value) {
  const social = {};
  const patterns = [
    ['x', /\{\{X\|([^}|]+)/i],
    ['instagram', /\{\{Instagram\|([^}|]+)/i],
    ['tiktok', /\{\{TikTok\|([^}|]+)/i],
    ['youtube', /\{\{(?:YouTube|Youtube)\|([^}|]+)/i],
    ['showroom', /\{\{showroom\|([^}|]+)/i],
    ['idn', /\{\{IDN App\|([^}|]+)/i],
    ['weibo', /\{\{Weibo\|([^}|]+)/i],
    ['facebook', /\{\{Facebook\|([^}|]+)/i],
  ];
  patterns.forEach(([key, pattern]) => {
    const match = value.match(pattern);
    if (match) social[key] = match[1].trim();
  });
  return social;
}

async function api(title) {
  const params = new URLSearchParams({ action: 'query', titles: title, prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json', origin: '*' });
  const response = await fetch(`${API}?${params}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const page = Object.values(data.query.pages)[0];
  return page && page.revisions && page.revisions[0] ? page.revisions[0].slots.main['*'] : '';
}

async function memberLinks(groupId) {
  if (memberListCache.has(groupId)) return memberListCache.get(groupId);
  const page = MEMBER_LIST_PAGES[groupId];
  if (!page) return [];
  const params = new URLSearchParams({ action: 'parse', page, prop: 'wikitext', format: 'json', origin: '*' });
  const response = await fetch(`${API}?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  const text = data.parse?.wikitext?.['*'] || '';
  const links = [...text.matchAll(/\[\[([^\]|#:]+)(?:\|[^\]]+)?\]\]/g)]
    .map((match) => match[1].trim())
    .filter((title) => !/^(?:Team|File|Category|Template|SKE48|AKB48|NMB48|HKT48|NGT48|STU48|JKT48|BNK48|TPE48|CGM48|KLP48)/i.test(title));
  const unique = [...new Set(links)];
  memberListCache.set(groupId, unique);
  return unique;
}

async function findProfile(name, groupId) {
  const wanted = (PROFILE_ALIASES[name] || name).toLowerCase();
  const direct = await memberLinks(groupId);
  const exact = direct.find((title) => title.toLowerCase() === wanted);
  if (exact) return exact;
  const directCandidate = direct
    .map((title) => ({ title, score: wanted.split(/\s+/).filter((token) => token.length > 2 && title.toLowerCase().includes(token)).length }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score || a.title.length - b.title.length)[0];
  if (directCandidate) return directCandidate.title;

  const query = PROFILE_ALIASES[name] || name;
  const params = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '10', format: 'json', origin: '*' });
  const response = await fetch(`${API}?${params}`);
  if (!response.ok) return '';
  const data = await response.json();
  const tokens = name.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  const ranked = (data.query.search || [])
    .map((item) => {
      const title = item.title.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (title.includes(token) ? 1 : 0), 0);
      return { title: item.title, score };
    })
    .filter((item) => item.score > 0 && !/ members$| single\)| album\)/i.test(item.title))
    .sort((a, b) => b.score - a.score || a.title.length - b.title.length);
  if (!ALLOW_UNCERTAIN) return ranked.length ? ranked[0].title : '';
  for (const candidate of ranked) {
    const text = await api(candidate.title);
    if (/\{\{Member infobox/i.test(text)) return candidate.title;
  }
  return '';
}

function sourceBlock(member, profile, text) {
  const nicknameMatch = rawField(text, 'nickname').match(/\{\{Nihongo\|([^|}]+)/i);
  const nickname = nicknameMatch ? nicknameMatch[1].trim() : firstName(field(text, 'nickname')).replace(/\s*\([^)]*\)/g, '');
  const generation = field(text, 'generation');
  const active = rawField(text, 'active');
  const blog = field(text, 'blog');
  const birthplace = rawField(text, 'birthplace').match(/\{\{residence\|([^|}]+)/i);
  const values = [
    member.name,
    `panggilan: ${nickname}`,
    `angkatan: ${generation}`,
    `lahir: ${dateFrom(rawField(text, 'birthdate'))}`,
    `asal: ${birthplace ? birthplace[1].trim() : firstName(field(text, 'birthplace'))}`,
    `tinggi: ${heightFrom(rawField(text, 'height'))}`,
    `darah: ${field(text, 'bloodtype')}`,
    `gabung: ${dateFrom(active)}`,
  ];
  const social = socialValues(blog);
  Object.entries(social).forEach(([key, value]) => values.push(`${key}: ${value}`));
  return `${[`# --- ${member.id}  ·  ${member.team}${profile ? `  ·  ${profile}` : ''}`, ...values, ''].join('\n')}\n`;
}

function profileMatches(name, profile, text) {
  const tokens = name.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  const title = profile.toLowerCase();
  const realname = field(text, 'realname').toLowerCase();
  const titleScore = tokens.filter((token) => title.includes(token)).length;
  const realnameScore = tokens.filter((token) => realname.includes(token)).length;
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return title.trim() === name.toLowerCase().trim() || realnameScore >= 1;
  return titleScore >= 2 || realnameScore >= 2;
}

async function main() {
  const { GROUPS, MEMBERS } = loadData();
  const target = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const groups = target.length
    ? GROUPS.filter((group) => target.includes(group.id) || target.includes(group.slug))
    : GROUPS;
  fs.mkdirSync(BIO_DIR, { recursive: true });

  for (const group of groups) {
    const members = MEMBERS.filter((member) => member.groupId === group.id);
    const blocks = [`# BIODATA ${group.name} — diambil dari infobox profil AKB48 Wiki.`, '#', ''].join('\n');
    let output = blocks;
    let found = 0;
    for (const member of members) {
      const profile = await findProfile(member.name, group.id);
      const text = profile ? await api(profile) : '';
      const cocok = text && (profileMatches(member.name, profile, text)
        || (ALLOW_UNCERTAIN && /\{\{Member infobox/i.test(text)));
      if (cocok) found += 1;
      output += sourceBlock(member, cocok ? profile : '', cocok ? text : '');
      process.stdout.write(`${group.id}: ${member.name} -> ${cocok ? profile : 'tidak ditemukan/meragukan'}\n`);
    }
    fs.writeFileSync(path.join(BIO_DIR, `${group.id}.txt`), output);
    console.log(`${group.id}: ${found}/${members.length} profil terbaca`);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });