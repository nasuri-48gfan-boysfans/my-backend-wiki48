#!/usr/bin/env node
/* Downloads member portraits and group logos from AKB48 Wiki. */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..', 'frontend');
const COMMON_JS = path.join(ROOT, 'common.js');
const IMG_DIR = path.join(ROOT, 'img');
const API = 'https://akb48.fandom.com/api.php';

const PROFILE_ALIASES = {
  'Takahshi Ayane': 'Takahashi Ayane',
  'Hatekayama Nozomi': 'Hatakeyama Nozomi',
  'Celline Thefanie': 'Celline Thefani',
};

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

function rawField(wikitext, name) {
  const match = wikitext.match(new RegExp(`^\\|\\s*${name}\\s*=\\s*(.*)$`, 'im'));
  return match ? match[1].trim() : '';
}

function titleScore(name, title, text) {
  const tokens = name.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  const titleText = title.toLowerCase();
  const realname = rawField(text, 'realname').toLowerCase();
  const scoreTitle = tokens.filter((token) => titleText.includes(token)).length;
  const scoreRealname = tokens.filter((token) => realname.includes(token)).length;
  return tokens.length <= 1 || scoreTitle >= 2 || scoreRealname >= 2;
}

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

async function findProfile(name) {
  const query = PROFILE_ALIASES[name] || name;
  const params = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '10', format: 'json', origin: '*' });
  const data = await json(`${API}?${params}`);
  const candidates = (data?.query?.search || []).filter((item) => !/ members$| single\)| album\)/i.test(item.title));
  for (const candidate of candidates) {
    const page = await profile(candidate.title);
    if (page && titleScore(name, candidate.title, page)) return { title: candidate.title, text: page };
  }
  return null;
}

async function profile(title) {
  const params = new URLSearchParams({ action: 'query', titles: title, prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json', origin: '*' });
  const data = await json(`${API}?${params}`);
  const page = data ? Object.values(data.query.pages)[0] : null;
  return page?.revisions?.[0]?.slots?.main?.['*'] || '';
}

async function pageImage(title, width) {
  const params = new URLSearchParams({ action: 'query', titles: title, prop: 'pageimages', piprop: 'thumbnail', pithumbsize: String(width), format: 'json', origin: '*' });
  const data = await json(`${API}?${params}`);
  const page = data ? Object.values(data.query.pages)[0] : null;
  return page?.thumbnail?.source || '';
}

async function download(url, destination) {
  if (!url) return false;
  if (fs.existsSync(destination)) return true;
  const response = await fetch(url);
  if (!response.ok) return false;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) return false;
  fs.writeFileSync(destination, bytes);
  return true;
}

async function imageUrl(file, width) {
  const params = new URLSearchParams({ action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(width), format: 'json', origin: '*' });
  const data = await json(`${API}?${params}`);
  const page = data ? Object.values(data.query.pages)[0] : null;
  return page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || '';
}

async function memberImage(member) {
  const destination = path.join(IMG_DIR, `${member.id}.jpg`);
  if (fs.existsSync(destination)) return true;
  const found = await findProfile(member.name);
  if (!found) return false;
  const image = rawField(found.text, 'image').replace(/^File:/i, '').trim();
  const url = image ? await imageUrl(image, 600) : await pageImage(found.title, 600);
  return download(url, destination);
}

async function groupImage(group) {
  const destination = path.join(IMG_DIR, `group-${group.id}.jpg`);
  if (fs.existsSync(destination)) return true;
  const found = await findProfile(group.name);
  if (!found) return false;
  const image = rawField(found.text, 'image').replace(/^File:/i, '').trim();
  const url = image ? await imageUrl(image, 1000) : await pageImage(found.title, 1000);
  return download(url, destination);
}

async function eachLimit(items, limit, task) {
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const { GROUPS, MEMBERS } = loadData();
  fs.mkdirSync(IMG_DIR, { recursive: true });
  let memberCount = 0;
  await eachLimit(MEMBERS, 6, async (member) => {
    if (await memberImage(member)) memberCount += 1;
    process.stdout.write(`member ${member.id}\n`);
  });
  let groupCount = 0;
  await eachLimit(GROUPS, 4, async (group) => {
    if (await groupImage(group)) groupCount += 1;
    process.stdout.write(`group ${group.id}\n`);
  });
  console.log(`Downloaded ${memberCount}/${MEMBERS.length} member images and ${groupCount}/${GROUPS.length} group images.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });