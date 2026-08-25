'use strict';

const { RateLimiter } = require('./rate-limit');
const { requestText } = require('./http');

const GRAPHQL_ENDPOINT = 'https://api.idn.app/graphql';

const GET_LIVESTREAMS_QUERY = `
  query GetLivestreams($page: Int) {
    getLivestreams(page: $page) {
      slug
      title
      image_url
      view_count
      playback_url
      room_identifier
      status
      live_at
      end_at
      live_type
      category {
        name
      }
      creator {
        uuid
        username
        name
        avatar
      }
    }
  }
`;

const GET_PUBLIC_PROFILE_QUERY = `
  query GetPublicProfile($username: String!) {
    getPublicProfileByUsername(username: $username) {
      uuid
      username
      name
      avatar
    }
  }
`;

async function graphqlRequest(query, variables, { limiter, timeoutMs, dispatcher, authToken } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 15000);
  try {
    const run = async () => {
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {}),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status} dari GraphQL: ${text}`);
      }
      return response.json();
    };
    return limiter ? limiter.run(run) : run();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Request timeout setelah batas waktu untuk GraphQL`);
    if (error.name === 'TypeError') throw new Error(`Request gagal/CORS atau jaringan untuk GraphQL: ${error.message}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

class IdnAdapter {
  constructor({ baseUrl = 'https://www.idn.app', limiter = new RateLimiter(), authToken, timeoutMs = 15000, dispatcher } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.limiter = limiter;
    this.authToken = authToken;
    this.timeoutMs = timeoutMs;
    this.dispatcher = dispatcher;
  }

  async onlivesJkt48() {
    const data = await graphqlRequest(GET_LIVESTREAMS_QUERY, { page: 1 }, {
      limiter: this.limiter,
      timeoutMs: this.timeoutMs,
      dispatcher: this.dispatcher,
      authToken: this.authToken,
    });
    
    const streams = data?.data?.getLivestreams || [];
    
    const items = [];
    for (const stream of streams) {
      // Filter for JKT48 members: status is "live" and creator username starts with jkt48_
      const isLive = stream.status === 'live';
      const isJkt48 = stream.creator?.username?.startsWith('jkt48_');
      
      if (isLive && isJkt48) {
        const creator = stream.creator || {};
        items.push({
          ...stream,
          user: {
            id: creator.uuid,
            username: creator.username,
            name: creator.name,
            avatar: creator.avatar,
            avatar_url: creator.avatar,
          },
        });
      }
    }
    
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.user?.id || item.user?.username}:${item.slug}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((item) => {
      const user = item.user || {};
      const username = user.username;
      return {
        platform: 'idn',
        member_id: user.id || username,
        username,
        member_name: user.name || username,
        group: 'JKT48',
        category: 'Kaigai',
        is_live: true,
        title: item.title || 'Live IDN App',
        avatar_url: user.avatar || user.avatar_url || null,
        live_url: `https://www.idn.app/${encodeURIComponent(username)}/live/${encodeURIComponent(item.slug || '')}`,
        viewer_count: Number(item.view_count ?? 0),
        raw: item,
      };
    });
  }

  async check(username) {
    const handle = String(username || '').replace(/^@/, '').trim();
    if (!handle) return { platform: 'idn', username: null, is_live: false, live_url: null };
    
    /* Query hanya mendeklarasikan $page; filter per-streamer dilakukan di
       sini. Variabel yang tidak dideklarasikan membuat server GraphQL
       menolak seluruh request, jadi semua cek per-member pasti gagal. */
    const data = await graphqlRequest(GET_LIVESTREAMS_QUERY, { page: 1 }, {
      limiter: this.limiter,
      timeoutMs: this.timeoutMs,
      dispatcher: this.dispatcher,
      authToken: this.authToken,
    });

    const streams = data?.data?.getLivestreams || [];
    const liveStream = streams.find((s) => s.status === 'live'
      && String(s.creator?.username || '').toLowerCase() === handle.toLowerCase());
    const isLive = !!liveStream;
    
    // Also get profile info
    let profile = null;
    try {
      const profileData = await graphqlRequest(GET_PUBLIC_PROFILE_QUERY, { username: handle }, {
        limiter: this.limiter,
        timeoutMs: this.timeoutMs,
        dispatcher: this.dispatcher,
        authToken: this.authToken,
      });
      profile = profileData?.data?.getPublicProfileByUsername;
    } catch (e) {
      // Profile fetch failed, continue without it
    }
    
    const title = liveStream?.title || profile?.name || null;
    const liveUrl = isLive ? `https://www.idn.app/${encodeURIComponent(handle)}/live/${encodeURIComponent(liveStream.slug)}` : `https://www.idn.app/${encodeURIComponent(handle)}`;

    return {
      platform: 'idn',
      username: handle,
      is_live: isLive,
      live_url: isLive ? liveUrl : null,
      title,
      started_at: liveStream?.live_at || liveStream?.started_at || null,
      checked_at: new Date().toISOString()
    };
  }
}

module.exports = { IdnAdapter };