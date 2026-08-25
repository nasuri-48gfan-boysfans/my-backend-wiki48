'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.resolve(__dirname, 'members.json');
const EMPTY = { members: [], updated_at: null };

function readStore(file = DEFAULT_FILE) {
  if (!fs.existsSync(file)) return { ...EMPTY };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      members: Array.isArray(parsed.members) ? parsed.members.filter((member) => !String(member?.id || '').startsWith('showroom-')) : [],
      updated_at: parsed.updated_at || null,
    };
  } catch (error) {
    throw new Error(`Mapping JSON tidak valid: ${file}: ${error.message}`);
  }
}

function writeStore(store, file = DEFAULT_FILE) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(temp, file);
}

function upsertMembers(discovered, file = DEFAULT_FILE) {
  const store = readStore(file);
  const byId = new Map(store.members.map((member) => [member.id, member]));
  discovered.filter((member) => !String(member?.id || '').startsWith('showroom-')).forEach((member) => {
    const previous = byId.get(member.id) || {};
    byId.set(member.id, { ...previous, ...member });
  });
  const next = { members: [...byId.values()], updated_at: new Date().toISOString() };
  writeStore(next, file);
  return next;
}

module.exports = { DEFAULT_FILE, readStore, writeStore, upsertMembers };
