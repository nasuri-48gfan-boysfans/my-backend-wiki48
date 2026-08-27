'use strict';

const { RateLimiter } = require('./rate-limit');
const { requestJson } = require('./http');

const DOMESTIC_GROUPS = ['AKB48', 'SKE48', 'NMB48', 'HKT48', 'NGT48', 'STU48'];
const KAIGAI_GROUPS = ['JKT48', 'BNK48', 'TSH48', 'TPE48', 'AKB48 Team TP', 'CGM48', 'KLP48'];
const GROUP_DETECTION_ALIASES = { 'AKB48 Team SH': 'TSH48' };
const SHOWROOM_WORKER_API = 'https://workers-showroom-48wiki.wiki48workers.workers.dev';

/** @typedef {{ id: string, member_name: string, group: string, category: 'Domestic'|'Kaigai', platform: 'showroom', is_live: boolean, live_url: string|null, title: string|null }} LiveMember */

function normalizeName(name) {
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[()\[\]{}]/gu, ' ')
    .replace(/(?:nmb48|akb48|jkt48|ske48|hkt48|ngt48|stu48|bnk48|cgm48|klp48|akb48\s*team\s*(?:sh|tp)|team|チーム|研究生|official)/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detect48Group(roomKey, mainName) {
  const haystack = `${roomKey || ''} ${mainName || ''}`.toLowerCase();
  const candidates = [...DOMESTIC_GROUPS, ...KAIGAI_GROUPS, ...Object.keys(GROUP_DETECTION_ALIASES)]
    .sort((a, b) => b.length - a.length);
  const detected = candidates.find((group) => haystack.includes(group.toLowerCase()));
  const groupName = GROUP_DETECTION_ALIASES[detected] || detected;
  if (!groupName) return null;
  return { groupName, category: DOMESTIC_GROUPS.includes(groupName) ? 'Domestic' : 'Kaigai' };
}

function is48GroupRoom(roomKey, mainName, telop = '') {
  const value = `${roomKey || ''} ${mainName || ''} ${telop || ''}`.toLowerCase();
  return /(?:48|nmb|akb|jkt|ske|hkt|ngt|stu|bnk|cgm|klp)/i.test(value);
}

function hasOfficial48Identifier(room) {
  const roomKey = String(room?.room_url_key || room?.roomUrlKey || room?.url_key || room?.slug || '');
  const mainName = String(room?.main_name || room?.mainName || room?.room_name || room?.roomName || '');
  return /^(?:nmb48|akb48|jkt48|ske48|hkt48|ngt48|stu48|bnk48|cgm48|klp48)(?:_|-)/i.test(roomKey)
    || /(?:NMB48|AKB48|JKT48|SKE48|HKT48|NGT48|STU48|BNK48|CGM48|KLP48|AKB48\s+Team\s+(?:SH|TP))/i.test(mainName);
}

function isOfficialRoom(room) {
  const officialLevel = Number(room?.official_level ?? room?.officialLevel);
  if (Number.isFinite(officialLevel)) return officialLevel > 0;
  const flags = [room?.is_official, room?.isOfficial, room?.official, room?.is_verified, room?.isVerified, room?.verified, room?.official_room];
  const supplied = flags.filter((value) => value !== undefined && value !== null);
  return supplied.length > 0
    ? supplied.some((value) => value === true || value === 1 || value === '1' || value === 'true')
    : true;
}

class ShowroomAdapter {
  constructor({ baseUrl = 'https://www.showroom-live.com', publicApiUrl = process.env.SHOWROOM_ONLIVES_API_URL || SHOWROOM_WORKER_API, limiter = new RateLimiter(), authToken, timeoutMs = 15000, dispatcher } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.publicApiUrl = publicApiUrl.replace(/\/$/, '');
    this.limiter = limiter;
    this.authToken = authToken;
    this.timeoutMs = timeoutMs;
    this.dispatcher = dispatcher;
    this.lastError = null;
  }

  requestOptions() {
    return {
      limiter: this.limiter,
      timeoutMs: this.timeoutMs,
      dispatcher: this.dispatcher,
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.showroom-live.com/',
        ...(this.authToken ? { authorization: `Bearer ${this.authToken}` } : {}),
      },
    };
  }

  async onlives() {
    const data = await requestJson(`${this.baseUrl}/api/live/onlives`, this.requestOptions());
    const list = data?.onlives || data?.rooms || data?.live_onlives || data?.live?.rooms;
    if (!Array.isArray(list)) throw new Error('Struktur Showroom /api/live/onlives berubah: daftar room tidak ditemukan.');
    /* Dua bentuk yang pernah dipakai endpoint ini:
         (a) [{ genre_id, genre_name, lives: [room, …] }, …]  ← dikelompokkan per genre
         (b) [room, …]                                        ← daftar datar
       Tanpa flatten, bentuk (a) menghasilkan "room" berisi objek genre:
       room_id undefined, semua entri terbuang, dan trackernya diam-diam
       melaporkan nol live padahal request-nya sukses. */
    return list.flatMap((item) => (Array.isArray(item?.lives) ? item.lives : [item]));
  }

  async onlivesBy48Groups() {
    this.lastError = null;
    this.lastSource = null;
    const fetchPayload = async (url) => {
      const fetchUrl = url;
      let response;
      try {
        response = await requestJson(fetchUrl, this.requestOptions());
      } catch (error) {
        const status = Number.isFinite(error.status) && error.status > 0 ? ` HTTP ${error.status}` : '';
        throw new Error(`Cloudflare SHOWROOM Worker request gagal${status}.`);
      }
      return response;
    };
    const parseRooms = (data) => {
      const list = data?.onlives;
      if (!Array.isArray(list)) return null;
      const rooms = [];
      list.flatMap((genre) => {
        const inherited = genre?.genre_name || genre?.genreName || genre?.group || genre?.group_name || '';
        return Array.isArray(genre?.lives) ? genre.lives.map((room) => ({ ...room, __genreName: inherited })) : [];
      }).forEach((room) => {
        const inherited = room.__genreName || '';
        if (!room || typeof room !== 'object') return;
        const roomKey = [room.room_url_key, room.roomUrlKey, room.url_key, room.slug, inherited].filter(Boolean).join(' ');
        const mainName = [room.room_name, room.roomName, room.main_name, room.name, room.title, inherited].filter(Boolean).join(' ');
        const group = detect48Group(roomKey, mainName);
        if (group && is48GroupRoom(roomKey, mainName, room.telop) && hasOfficial48Identifier(room) && isOfficialRoom(room)) {
          rooms.push({ ...room, ...group, room_id: room.room_id || room.roomId || room.id || null, room_url_key: room.room_url_key || room.roomUrlKey || room.url_key || room.slug || null, member_name: room.room_name || room.roomName || room.main_name || room.name || room.title || null });
        }
      });
      const seen = new Set();
      return rooms.filter((room) => {
        const key = `${room.room_id || ''}:${room.room_url_key || ''}:${room.member_name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const targetUrl = this.publicApiUrl;
    try {
      const rooms = parseRooms(await fetchPayload(targetUrl));
      if (rooms) {
        this.lastSource = 'cloudflare-showroom-worker';
        return rooms;
      }
      throw new Error('Response Cloudflare SHOWROOM Worker tidak memiliki data.onlives yang valid.');
    } catch (error) {
      this.lastError = error.message;
      return [];
    }
  }

  /* API wrapper publik mengembalikan bentuk yang dapat berubah-ubah. Ambil
     hanya objek yang tampak seperti room live, sambil mewariskan group dari
     parent seperti { group: 'JKT48', lives: [...] }. */
  async publicOnlivesByGroup(groupName = 'JKT48') {
    const payload = await requestJson(this.publicApiUrl, this.requestOptions());
    const wanted = String(groupName).trim().toLowerCase();
    const rooms = [];
    const visit = (value, inheritedGroup = '') => {
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, inheritedGroup));
        return;
      }
      if (!value || typeof value !== 'object') return;
      const group = String(value.group || value.group_name || value.groupName || value.team || inheritedGroup || '').trim();
      const roomId = value.room_id || value.roomId || value.roomid || value.id;
      const roomKey = value.room_url_key || value.roomUrlKey || value.url_key || value.slug || value.room_name_key;
      const memberName = value.member_name || value.memberName || value.room_name || value.roomName || value.name || value.title;
      if (group.toLowerCase() === wanted && (roomId || roomKey) && memberName) rooms.push({ ...value, room_id: roomId, room_url_key: roomKey, member_name: memberName });
      Object.entries(value).forEach(([key, child]) => {
        if (['group', 'group_name', 'groupName', 'team'].includes(key)) return;
        if (Array.isArray(child) || (child && typeof child === 'object')) visit(child, group || inheritedGroup);
      });
    };
    visit(payload);
    const seen = new Set();
    return rooms.filter((room) => {
      const key = `${room.room_id || ''}:${room.room_url_key || ''}:${room.member_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
module.exports.DOMESTIC_GROUPS = DOMESTIC_GROUPS;
module.exports.KAIGAI_GROUPS = KAIGAI_GROUPS;
module.exports.detect48Group = detect48Group;
module.exports.normalizeName = normalizeName;
module.exports.is48GroupRoom = is48GroupRoom;
