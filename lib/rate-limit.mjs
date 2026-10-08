import { createHash } from 'node:crypto';

export class UpstashRateLimiter {
  constructor({ url, token, fetchImpl = fetch } = {}) { this.url = String(url || '').replace(/\/$/, ''); this.token = token; this.fetchImpl = fetchImpl; }
  async consume(scope, subject, { limit, windowSeconds }) {
    if (!this.url || !this.token) throw new Error('Distributed rate limiting is not configured.');
    const identity = createHash('sha256').update(String(subject || 'unknown')).digest('hex'), key = `quoteflow:${scope}:${identity}`;
    const response = await this.fetchImpl(`${this.url}/pipeline`, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSeconds, 'NX']]), signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Distributed rate limiter returned ${response.status}.`);
    const results = await response.json(), count = Number(results?.[0]?.result);
    if (!Number.isFinite(count)) throw new Error('Distributed rate limiter returned an invalid response.');
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter: windowSeconds };
  }
}

export const createRateLimiter = config => config.rateLimit?.provider === 'upstash' ? new UpstashRateLimiter(config.rateLimit) : null;
