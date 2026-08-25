'use strict';

const { initialMappings } = require('./project-data');
const { readStore, upsertMembers } = require('./store');

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function bestMember(room, mappings) {
  const roomName = normalize(room.member_name);
  if (!roomName) return null;
  const exact = mappings.find((member) => normalize(member.member_name) === roomName);
  if (exact) return exact;
  const candidates = mappings.filter((member) => {
    const name = normalize(member.member_name);
    return name && (roomName.includes(name) || name.includes(roomName));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

async function discoverMappings({ showroom, file, logger = console } = {}) {
  const current = readStore(file);
  const seed = current.members.length ? current.members : initialMappings();
  const discovered = showroom ? await showroom.discover() : [];
  const updates = [];
  discovered.forEach((room) => {
    const member = bestMember(room, seed);
    if (!member) {
      logger.warn(`Showroom room belum dipetakan: ${room.member_name} (${room.room_id})`);
      return;
    }
    updates.push({
      ...member,
      showroom_room_id: room.room_id,
      showroom_room_url_key: room.room_url_key || member.showroom_room_url_key || null,
      is_live: true,
      last_live_at: room.live_started_at || new Date().toISOString(),
    });
  });
  return upsertMembers(current.members.length ? updates : seed.concat(updates), file);
}

module.exports = { discoverMappings, bestMember };
