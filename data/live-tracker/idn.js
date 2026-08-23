'use strict';

const { RateLimiter } = require('./rate-limit');
const { requestText } = require('./http');

class IdnAdapter {
  constructor({ baseUrl = 'https://www.idn.app', limiter = new RateLimiter(), authToken, timeoutMs = 15000, dispatcher } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.limiter = limiter;
    this.authToken = authToken;
    this.timeoutMs = timeoutMs;
    this.dispatcher = dispatcher;
  }

  async check(username) {
    const handle = String(username || '').replace(/^@/, '').trim();
    if (!handle) return { platform: 'idn', username: null, is_live: false, live_url: null };
    const url = `${this.baseUrl}/${encodeURIComponent(handle)}`;
    const html = await requestText(url, {
      limiter: this.limiter,
      timeoutMs: this.timeoutMs,
      dispatcher: this.dispatcher,
      headers: { accept: 'text/html,application/xhtml+xml', ...(this.authToken ? { authorization: `Bearer ${this.authToken}` } : {}) },
    });
    const live = /\b(isLive|is_live|liveStatus|live_status)\s*["':]+\s*(true|1)|"live"\s*:\s*true/i.test(html)
      || /"@type"\s*:\s*"LiveBroadcast"/i.test(html);
    const title = (html.match(/<title[^>]*>([^<]+)/i) || [])[1]?.trim() || null;
    return { platform: 'idn', username: handle, is_live: live, live_url: live ? url : null, title, checked_at: new Date().toISOString() };
  }
}

module.exports = { IdnAdapter };
