'use strict';

const { RateLimiter } = require('./rate-limit');
const { requestJson } = require('./http');

class ShowroomAdapter {
  constructor({ baseUrl = 'https://www.showroom-live.com', limiter = new RateLimiter(), authToken, timeoutMs = 15000, dispatcher } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.limiter = limiter;
    this.authToken = authToken;
    this.timeoutMs = timeoutMs;
    this.dispatcher = dispatcher;
  }

  requestOptions() {
    return {
      limiter: this.limiter,
      timeoutMs: this.timeoutMs,
      dispatcher: this.dispatcher,
      headers: this.authToken ? { authorization: `Bearer ${this.authToken}` } : {},
    };
  }

  async onlives() {
    const data = await requestJson(`${this.baseUrl}/api/live/onlives`, this.requestOptions());
    const rooms = data?.rooms || data?.live_onlives || data?.onlives || data?.live?.rooms;
    if (!Array.isArray(rooms)) throw new Error('Struktur Showroom /api/live/onlives berubah: daftar room tidak ditemukan.');
    return rooms;
  }

  async profile(roomId) {
    const data = await requestJson(`${this.baseUrl}/api/room/profile?room_id=${encodeURIComponent(roomId)}`, this.requestOptions());
    const profile = data?.room_profile || data?.room || data;
    if (!profile || typeof profile !== 'object') throw new Error(`Profil room Showroom ${roomId} tidak dikenali.`);
    return profile;
  }

  async discover() {
    const rooms = await this.onlives();
    return rooms.map((room) => ({
      room_id: String(room.room_id || room.roomId || room.id || ''),
      room_url_key: room.room_url_key || room.room_url || room.roomUrlKey || room.url_key || null,
      member_name: room.room_name || room.roomName || room.name || room.title || null,
      is_live: true,
      live_url: room.room_url_key ? `${this.baseUrl}/${room.room_url_key}` : null,
      live_started_at: room.started_at || room.startedAt || null,
      raw: room,
    })).filter((room) => room.room_id && room.member_name);
  }

  async check(roomId) {
    const profile = await this.profile(roomId);
    const live = Boolean(profile.is_live ?? profile.isLive ?? profile.live_status ?? profile.broadcasting);
    return {
      platform: 'showroom',
      room_id: String(roomId),
      is_live: live,
      live_url: profile.room_url_key ? `${this.baseUrl}/${profile.room_url_key}` : null,
      title: profile.room_name || profile.name || null,
      started_at: profile.started_at || profile.startedAt || null,
      raw: profile,
    };
  }
}

module.exports = { ShowroomAdapter };
