'use strict';

const { ShowroomAdapter, DOMESTIC_GROUPS, KAIGAI_GROUPS, detect48Group } = require('./showroom');

/** @typedef {{ id: string|null, member_name: string, group: string, category: 'Domestic'|'Kaigai', platform: 'showroom', is_live: true, room_id: string|null, room_url_key: string|null, live_url: string|null, title: string|null }} LiveMember */

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function memberName(room) {
  return room.member_name || room.memberName || room.main_name || room.mainName
    || room.room_name || room.roomName || room.name || room.title || '';
}

function mapRoom(room, roster = []) {
  const name = memberName(room);
  const group = detect48Group(
    [room.room_url_key, room.roomUrlKey, room.url_key, room.slug].filter(Boolean).join(' '),
    [room.main_name, room.mainName, name, room.group, room.group_name].filter(Boolean).join(' '),
  );
  if (!group) return null;
  const rosterMember = roster.find((member) => {
    const candidate = normalizeName(member.member_name || member.name);
    const actual = normalizeName(name);
    return candidate && actual && (candidate === actual || candidate.includes(actual) || actual.includes(candidate));
  });
  const roomKey = room.room_url_key || room.roomUrlKey || room.url_key || room.slug || null;
  return {
    id: rosterMember?.id || null,
    member_name: name,
    group: group.groupName,
    category: group.category,
    platform: 'showroom',
    is_live: true,
    room_id: room.room_id || room.roomId || room.id || null,
    room_url_key: roomKey,
    live_url: room.live_url || (roomKey ? `https://www.showroom-live.com/${roomKey}` : null),
    title: room.title || room.main_name || room.room_name || null,
  };
}

async function fetchShowroomLiveMembers({ roster = [], adapter = new ShowroomAdapter() } = {}) {
  const rooms = await adapter.onlivesBy48Groups();
  const seen = new Set();
  return rooms.map((room) => mapRoom(room, roster)).filter(Boolean).filter((member) => {
    const key = `${member.room_id || ''}:${member.room_url_key || ''}:${member.member_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { fetchShowroomLiveMembers, mapRoom, normalizeName, DOMESTIC_GROUPS, KAIGAI_GROUPS };
