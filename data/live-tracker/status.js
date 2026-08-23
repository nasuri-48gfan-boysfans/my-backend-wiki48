'use strict';

const { readStore, upsertMembers } = require('./store');

function streamUrl(mapping, result) {
  if (result.live_url) return result.live_url;
  if (result.platform === 'showroom' && mapping.showroom_room_url_key) return `https://www.showroom-live.com/${mapping.showroom_room_url_key}`;
  if (result.platform === 'idn' && mapping.idn_username) return `https://www.idn.app/${mapping.idn_username}`;
  return null;
}

async function checkLiveStatus({ showroom, idn, youtube, file, members, logger = console, onTransition } = {}) {
  const store = members ? { members } : readStore(file);
  const results = [];
  const updates = [];
  for (const mapping of store.members) {
    const checks = [];
    if (showroom && mapping.showroom_room_id) checks.push(showroom.check(mapping.showroom_room_id));
    if (idn && mapping.idn_username) checks.push(idn.check(mapping.idn_username));
    if (youtube && (mapping.youtube_video_id || mapping.youtube_channel_id)) checks.push(youtube.check(mapping));
    const settled = await Promise.allSettled(checks);
    const liveResults = settled.filter((item) => item.status === 'fulfilled' && item.value.is_live).map((item) => item.value);
    settled.filter((item) => item.status === 'rejected').forEach((item) => logger.warn(`${mapping.member_name}: ${item.reason.message}`));
    const live = liveResults.length > 0;
    const latest = liveResults[0];
    if (!mapping.is_live && live && onTransition) {
      liveResults.forEach((result) => onTransition({ member_name: mapping.member_name, platform: result.platform, live_url: streamUrl(mapping, result), title: result.title || null }));
    }
    updates.push({ ...mapping, is_live: live, last_live_at: live ? (latest.started_at || mapping.last_live_at || new Date().toISOString()) : mapping.last_live_at });
    liveResults.forEach((result) => results.push({
      id: mapping.id,
      member_name: mapping.member_name,
      platform: result.platform,
      is_live: true,
      live_url: streamUrl(mapping, result),
      title: result.title || null,
      checked_at: new Date().toISOString(),
    }));
  }
  if (file && !members) upsertMembers(updates, file);
  return results;
}

module.exports = { checkLiveStatus };
