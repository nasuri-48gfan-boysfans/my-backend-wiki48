'use strict';

const { RateLimiter } = require('./rate-limit');
const { requestJson } = require('./http');

class YouTubeAdapter {
  constructor({ apiKey = process.env.YOUTUBE_API_KEY, baseUrl = 'https://www.googleapis.com/youtube/v3', limiter = new RateLimiter(), authToken, timeoutMs = 15000, dispatcher } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.limiter = limiter;
    this.authToken = authToken;
    this.timeoutMs = timeoutMs;
    this.dispatcher = dispatcher;
  }

  async check(member) {
    if (!this.apiKey) throw new Error('YOUTUBE_API_KEY belum diatur.');
    const videoId = member.youtube_video_id || member.youtubeVideoId;
    const params = new URLSearchParams({ part: 'snippet,liveStreamingDetails', maxResults: '1', type: 'video', eventType: 'live', key: this.apiKey });
    if (videoId) params.set('id', videoId);
    else if (member.youtube_channel_id || member.youtubeChannelId) params.set('channelId', member.youtube_channel_id || member.youtubeChannelId);
    else return { platform: 'youtube', is_live: false, live_url: null };
    const data = await requestJson(`${this.baseUrl}/search?${params}`, {
      limiter: this.limiter,
      timeoutMs: this.timeoutMs,
      dispatcher: this.dispatcher,
      headers: this.authToken ? { authorization: `Bearer ${this.authToken}` } : {},
    });
    const item = data.items?.[0];
    const id = item?.id?.videoId || videoId;
    return {
      platform: 'youtube',
      is_live: Boolean(item?.id?.videoId),
      live_url: item?.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : null,
      title: item?.snippet?.title || null,
      started_at: item?.snippet?.publishedAt || null,
      video_id: id || null,
    };
  }
}

module.exports = { YouTubeAdapter };