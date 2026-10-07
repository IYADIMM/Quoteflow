export class EmailProvider {
  async send(_message) { throw new Error('send must be implemented by an email provider.'); }
}

export class ResendEmailProvider extends EmailProvider {
  constructor({ apiKey, from, fetchImpl = fetch, timeoutMs = 10000 } = {}) { super(); this.apiKey = apiKey; this.from = from; this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs; }
  async send({ to, subject, text }) {
    if (!this.apiKey || !this.from) throw new Error('Email is not configured.');
    if (typeof to !== 'string' || !/^\S+@\S+\.\S+$/.test(to) || !subject || !text) throw new Error('Email message is invalid.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl('https://api.resend.com/emails', { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: this.from, to: [to], subject, text }) });
      if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
}

export function createEmailProvider(config) {
  if (!config.email.provider) return null;
  if (config.email.provider.toLowerCase() === 'resend') return new ResendEmailProvider({ apiKey: config.email.apiKey, from: config.email.from });
  throw new Error(`Unsupported EMAIL_PROVIDER: ${config.email.provider}.`);
}
