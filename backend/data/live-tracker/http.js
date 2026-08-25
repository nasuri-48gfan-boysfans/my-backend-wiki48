'use strict';

const { RateLimiter } = require('./rate-limit');

function requestError(message, status, retryable = false) {
  const error = new Error(message);
  error.status = status;
  error.retryable = retryable;
  return error;
}

function normalizeFetchError(error, url) {
  if (error.name === 'AbortError') return requestError(`Request timeout setelah batas waktu untuk ${url}`, 408, true);
  if (error.name === 'TypeError') return requestError(`Request gagal/CORS atau jaringan untuk ${url}: ${error.message}`, 0, true);
  return error;
}

async function request(url, { headers = {}, limiter, timeoutMs = 15000, dispatcher, parse = 'json', cache } = {}) {
  const run = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'IdolWikiLiveTracker/1.0', ...headers },
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {}),
        ...(cache ? { cache } : {}),
      });
      if (!response.ok) throw requestError(`HTTP ${response.status} dari ${url}`, response.status, response.status === 408 || response.status === 429 || response.status >= 500);
      try { return parse === 'text' ? await response.text() : await response.json(); } catch (error) {
        throw requestError(`${parse === 'text' ? 'Text' : 'JSON'} tidak valid dari ${url}: ${error.message}`, response.status, true);
      }
    } catch (error) {
      throw normalizeFetchError(error, url);
    } finally {
      clearTimeout(timer);
    }
  };
  return limiter ? limiter.run(run) : run();
}

function requestJson(url, options = {}) { return request(url, { ...options, parse: 'json' }); }
function requestText(url, options = {}) { return request(url, { ...options, parse: 'text' }); }

module.exports = { request, requestJson, requestText, requestError };
