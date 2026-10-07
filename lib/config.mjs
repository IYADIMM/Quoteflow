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
  const config = Object.freeze({
    nodeEnv: env.NODE_ENV || 'development', production,
    appUrl: env.APP_URL || 'http://localhost:4173', port: integer('PORT', env.PORT, 4173, 1, 65535),
    databaseUrl: env.DATABASE_URL || '', directUrl: env.DIRECT_URL || '',
    ai: Object.freeze({ enabled: aiEnabled, configured: Boolean(env.GEMINI_API_KEY), apiKey: env.GEMINI_API_KEY || '', model: env.GEMINI_MODEL || 'gemini-3.8-flash', maxRequestsPerMinute: integer('AI_MAX_REQUESTS_PER_MINUTE', env.AI_MAX_REQUESTS_PER_MINUTE, 30, 1, 1000), maxInputChars: integer('AI_MAX_INPUT_CHARS', env.AI_MAX_INPUT_CHARS, 30000, 100, 200000), monthlyLimits: Object.freeze({ FREE: integer('AI_MONTHLY_LIMIT_FREE', env.AI_MONTHLY_LIMIT_FREE, 25, 0, 1000000), PRO: integer('AI_MONTHLY_LIMIT_PRO', env.AI_MONTHLY_LIMIT_PRO, 500, 0, 1000000), BUSINESS: integer('AI_MONTHLY_LIMIT_BUSINESS', env.AI_MONTHLY_LIMIT_BUSINESS, 5000, 0, 1000000) }) }),
    email: Object.freeze({ provider: env.EMAIL_PROVIDER || '', apiKey: env.EMAIL_API_KEY || '', from: env.EMAIL_FROM || '' }),
    stripe: Object.freeze({ secretKey: env.STRIPE_SECRET_KEY || '', webhookSecret: env.STRIPE_WEBHOOK_SECRET || '' })
  });
  if (production) {
    const missing = [];
    if (!config.databaseUrl) missing.push('DATABASE_URL');
    if (!env.APP_URL) missing.push('APP_URL');
    try {
      const parsed = new URL(config.appUrl);
      if (parsed.username || parsed.password || parsed.protocol !== 'https:') missing.push('APP_URL (use HTTPS in production)');
    } catch { missing.push('APP_URL (valid absolute URL)'); }
    if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(', ')}.`);
  }
  return config;
}
