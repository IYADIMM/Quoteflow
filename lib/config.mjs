const bool = (value, fallback = false) => value == null || value === '' ? fallback : ['true', '1', 'yes'].includes(String(value).toLowerCase());
const integer = (name, value, fallback, min, max) => {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid configuration value for ${name}.`);
  return n;
};

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const aiEnabled = bool(env.AI_ENABLED, false);
  const emailProvider = String(env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const stripeEnabled = bool(env.STRIPE_ENABLED, false), storageEnabled = bool(env.STORAGE_ENABLED, false), rateLimitProvider = String(env.RATE_LIMIT_PROVIDER || '').trim().toLowerCase(), monitoringProvider = String(env.MONITORING_PROVIDER || '').trim().toLowerCase();
  const config = Object.freeze({
    nodeEnv: env.NODE_ENV || 'development', production,
    appUrl: env.APP_URL || 'http://localhost:4173', port: integer('PORT', env.PORT, 4173, 1, 65535),
    databaseUrl: env.DATABASE_URL || '',
    ai: Object.freeze({ enabled: aiEnabled, configured: Boolean(env.GEMINI_API_KEY), apiKey: env.GEMINI_API_KEY || '', model: env.GEMINI_MODEL || 'gemini-3-flash-preview', maxRequestsPerMinute: integer('AI_MAX_REQUESTS_PER_MINUTE', env.AI_MAX_REQUESTS_PER_MINUTE, 30, 1, 1000), maxInputChars: integer('AI_MAX_INPUT_CHARS', env.AI_MAX_INPUT_CHARS, 30000, 100, 200000), monthlyLimits: Object.freeze({ FREE: integer('AI_MONTHLY_LIMIT_FREE', env.AI_MONTHLY_LIMIT_FREE, 25, 0, 1000000), PRO: integer('AI_MONTHLY_LIMIT_PRO', env.AI_MONTHLY_LIMIT_PRO, 500, 1, 1000000), BUSINESS: integer('AI_MONTHLY_LIMIT_BUSINESS', env.AI_MONTHLY_LIMIT_BUSINESS, 5000, 1, 1000000) }) }),
    email: Object.freeze({ provider: emailProvider, apiKey: env.EMAIL_API_KEY || '', from: env.EMAIL_FROM || '' }),
    stripe: Object.freeze({ enabled: stripeEnabled, secretKey: env.STRIPE_SECRET_KEY || '', webhookSecret: env.STRIPE_WEBHOOK_SECRET || '', prices: Object.freeze({ PRO: env.STRIPE_PRICE_PRO || '', BUSINESS: env.STRIPE_PRICE_BUSINESS || '' }) }),
    storage: Object.freeze({ enabled: storageEnabled, provider: String(env.STORAGE_PROVIDER || 's3').toLowerCase(), bucket: env.STORAGE_BUCKET || '', region: env.STORAGE_REGION || 'auto', endpoint: env.STORAGE_ENDPOINT || '', accessKeyId: env.STORAGE_ACCESS_KEY_ID || '', secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY || '', forcePathStyle: bool(env.STORAGE_FORCE_PATH_STYLE, false), maxUploadBytes: integer('STORAGE_MAX_UPLOAD_BYTES', env.STORAGE_MAX_UPLOAD_BYTES, 10 * 1024 * 1024, 1024, 100 * 1024 * 1024) }),
    pdf: Object.freeze({ fontPath: env.PDF_FONT_PATH || '' }),
    rateLimit: Object.freeze({ provider: rateLimitProvider, url: env.RATE_LIMIT_REST_URL || '', token: env.RATE_LIMIT_REST_TOKEN || '' }),
    monitoring: Object.freeze({ provider: monitoringProvider, dsn: env.MONITORING_DSN || '' }),
  });
  if (production) {
    const missing = [];
    if (!config.databaseUrl) missing.push('DATABASE_URL');
    else {
      try { const dbUrl = new URL(config.databaseUrl); if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol) || !dbUrl.hostname) missing.push('DATABASE_URL (must be a valid PostgreSQL URL)'); }
      catch { missing.push('DATABASE_URL (must be a valid PostgreSQL URL)'); }
    }
    if (!env.APP_URL) missing.push('APP_URL');
    if (aiEnabled && !config.ai.apiKey) missing.push('GEMINI_API_KEY (required when AI_ENABLED=true)');
    if (emailProvider && emailProvider !== 'resend') missing.push('EMAIL_PROVIDER (supported value: resend)');
    if (emailProvider === 'resend' && !config.email.apiKey) missing.push('EMAIL_API_KEY (required when EMAIL_PROVIDER=resend)');
    if (emailProvider === 'resend' && !config.email.from) missing.push('EMAIL_FROM (required when EMAIL_PROVIDER=resend)');
    if (stripeEnabled && !config.stripe.secretKey) missing.push('STRIPE_SECRET_KEY (required when STRIPE_ENABLED=true)');
    if (stripeEnabled && !config.stripe.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET (required when STRIPE_ENABLED=true)');
    if (stripeEnabled && (!config.stripe.prices.PRO || !config.stripe.prices.BUSINESS)) missing.push('STRIPE_PRICE_PRO and STRIPE_PRICE_BUSINESS');
    if (storageEnabled && config.storage.provider !== 's3') missing.push('STORAGE_PROVIDER (supported value: s3)');
    if (storageEnabled && (!config.storage.bucket || !config.storage.region)) missing.push('STORAGE_BUCKET and STORAGE_REGION');
    if (storageEnabled && Boolean(config.storage.accessKeyId) !== Boolean(config.storage.secretAccessKey)) missing.push('STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY (configure both or neither)');
    if (rateLimitProvider && rateLimitProvider !== 'upstash') missing.push('RATE_LIMIT_PROVIDER (supported value: upstash)');
    if (rateLimitProvider === 'upstash' && (!config.rateLimit.url || !config.rateLimit.token)) missing.push('RATE_LIMIT_REST_URL and RATE_LIMIT_REST_TOKEN');
    if (monitoringProvider && monitoringProvider !== 'webhook') missing.push('MONITORING_PROVIDER (supported value: webhook)');
    if (monitoringProvider === 'webhook' && !config.monitoring.dsn) missing.push('MONITORING_DSN');
    try {
      const parsed = new URL(config.appUrl);
      if (parsed.username || parsed.password || parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) missing.push('APP_URL (use an HTTPS origin in production)');
    } catch { missing.push('APP_URL (valid absolute URL)'); }
    if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(', ')}.`);
  }
  return config;
}
