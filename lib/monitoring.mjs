const clean = value => String(value ?? '').replace(/(bearer|token|password|secret|key|authorization|cookie)\s*[:=]\s*\S+/gi, '$1=[redacted]').slice(0, 2000);

export class WebhookMonitor {
  constructor({ dsn, environment = 'development', fetchImpl = fetch } = {}) { this.dsn = dsn; this.environment = environment; this.fetchImpl = fetchImpl; }
  async capture(event) {
    if (!this.dsn) return false;
    const payload = { timestamp: new Date().toISOString(), environment: this.environment, level: event.level || 'error', event: clean(event.event || 'application_error'), message: clean(event.message), requestId: clean(event.requestId, 120), method: clean(event.method, 20), path: clean(event.path, 300), status: Number(event.status) || undefined, provider: clean(event.provider, 60) };
    const response = await this.fetchImpl(this.dsn, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(3000) });
    return response.ok;
  }
}

export function createMonitor(config) {
  if (!config.monitoring?.provider) return null;
  if (config.monitoring.provider !== 'webhook') throw new Error('Unsupported monitoring provider.');
  return new WebhookMonitor({ dsn: config.monitoring.dsn, environment: config.nodeEnv });
}
