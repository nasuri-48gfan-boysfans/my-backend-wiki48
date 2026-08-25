'use strict';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RateLimiter {
  constructor({ minDelayMs = 3500, maxRetries = 3, backoffMs = 1500 } = {}) {
    this.minDelayMs = minDelayMs;
    this.maxRetries = maxRetries;
    this.backoffMs = backoffMs;
    this.nextAllowedAt = 0;
  }

  async wait() {
    const waitMs = Math.max(0, this.nextAllowedAt - Date.now());
    if (waitMs) await sleep(waitMs);
    this.nextAllowedAt = Date.now() + this.minDelayMs;
  }

  async run(task) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.wait();
      try {
        return await task(attempt);
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries || !error.retryable) break;
        await sleep(this.backoffMs * (attempt + 1));
      }
    }
    throw lastError;
  }
}

module.exports = { RateLimiter, sleep };
