import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readConfig } from '../../lib/config.mjs';
import { getPrisma } from '../../lib/prisma.mjs';
import { GeminiProvider } from '../../lib/ai-provider.mjs';
import { createEmailProvider } from '../../lib/email-provider.mjs';
import { calculateQuote } from '../../lib/pricing.mjs';
import { evaluateQuotePolicy } from '../../lib/commercial-policy.mjs';
import { amountScaled, normalizeQuoteLines, quoteItemData, validCurrency } from '../../lib/quote-lines.mjs';
import { StripeBillingProvider, stripePayloadHash, subscriptionRecord } from '../../lib/billing-provider.mjs';
import { entitlementsFor } from '../../lib/entitlements.mjs';
import { S3StorageProvider, storageKey, validateUpload } from '../../lib/storage-provider.mjs';
import { generateQuotePdf } from '../../lib/pdf-provider.mjs';
import { createRateLimiter } from '../../lib/rate-limit.mjs';
import { createMonitor } from '../../lib/monitoring.mjs';

export const config = { path: '/api/*' };
const scrypt = promisify(scryptCallback);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const financialFingerprint = quote => sha256(JSON.stringify({ currency: quote.currency, discount: String(quote.discount), items: quote.items.map(item => [item.catalogItemId, item.nameSnapshot, item.quantity.toString(), item.unitSnapshot, item.costSnapshot.toString(), item.sellingPrice.toString(), item.minimumPriceSnapshot?.toString() || null, item.taxRate.toString()]) }));
const cookieValue = token => { try { return decodeURIComponent(token); } catch { return ''; } };
const json = (statusCode, body, headers = {}) => {
  const { 'set-cookie': cookies, ...singleHeaders } = headers;
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...singleHeaders }, ...(cookies ? { multiValueHeaders: { 'set-cookie': Array.isArray(cookies) ? cookies : [cookies] } } : {}), body: JSON.stringify(body) };
};
const binary = (statusCode, body, contentType, fileName) => ({ statusCode, isBase64Encoded: true, headers: { 'content-type': contentType, 'content-disposition': `attachment; filename="${String(fileName).replace(/[^a-zA-Z0-9_.-]/g, '_')}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }, body: body.toString('base64') });
const requireVerifiedEmail = user => user?.emailVerifiedAt ? null : json(403, { error: 'Verify your email before performing this action.', code: 'EMAIL_VERIFICATION_REQUIRED' });
/** Never put customer bearer tokens into logs, monitoring or traces. */
export const sanitizedRequestPath = path => String(path || '')
  .replace(/\/api\/public\/quote\/[^/]+/g, '/api/public/quote/[redacted]')
  .replace(/\/public\/quote\/[^/]+/g, '/public/quote/[redacted]')
  .replace(/\/q\/[^/]+/g, '/q/[redacted]');
async function passwordMatches(user, password) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [saltHex, expectedHex] = String(user?.passwordHash || '').split(':'), expected = Buffer.from(expectedHex || '', 'hex');
  if (!saltHex || !expected.length) return false;
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), 64));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const ai = config => new GeminiProvider({ apiKey: config.ai.apiKey, model: config.ai.model });
const titleStatus = value => ({ DRAFT: 'Draft', INTERNAL_REVIEW: 'Internal Review', SENDING: 'Sending', SENT: 'Sent', VIEWED: 'Viewed', ACCEPTED: 'Accepted', REJECTED: 'Rejected', EXPIRED: 'Expired', NEW: 'New', REVIEWING: 'Reviewing', PRICING: 'Pricing', QUOTED: 'Quoted', WON: 'Won', LOST: 'Lost', CANCELLED: 'Cancelled', PENDING: 'Pending', COMPLETED: 'Completed', SNOOZED: 'Snoozed' })[value] || value;
const quoteDTO = quote => ({ ...quote, created: quote.issueDate?.toISOString().slice(0, 10), expiry: quote.expiryDate?.toISOString().slice(0, 10) || '', payment: quote.paymentTerms, delivery: quote.deliveryTerms, notes: quote.customerNotes, status: titleStatus(quote.status), discount: Number(quote.discount), items: (quote.items || []).map(line => ({ id: line.id, catalogItemId: line.catalogItemId, lineType: line.catalogItemId ? 'CATALOG' : 'MANUAL', name: line.nameSnapshot, sku: line.skuSnapshot, description: line.descriptionSnapshot, qty: Number(line.quantity), unit: line.unitSnapshot, cost: Number(line.costSnapshot), price: Number(line.sellingPrice), minimumPrice: line.minimumPriceSnapshot == null ? null : Number(line.minimumPriceSnapshot), tax: Number(line.taxRate) })) });

async function authenticate(event, prisma) {
  const rawCookie = event.headers.cookie || event.headers.Cookie || '';
  const token = /(?:^|;\s*)qf_session=([^;]+)/.exec(rawCookie)?.[1];
  if (!token) return null;
  const decoded = cookieValue(token); if (!decoded) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(decoded) }, include: { user: true, organization: true } });
  // Resolve membership by both the authenticated user and the session tenant.
  if (!session || session.expiresAt <= new Date()) return null;
  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: session.userId, organizationId: session.organizationId } } });
  if (!membership) return null;
  return { user: session.user, organization: session.organization, role: membership.role, session };
}

function csrf(event, config) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(event.httpMethod)) return true;
  const origin = event.headers.origin || event.headers.Origin;
  let trustedOrigin = false;
  try { trustedOrigin = Boolean(origin) && new URL(origin).origin === new URL(config.appUrl).origin; } catch { trustedOrigin = false; }
  if (!trustedOrigin) return false;
  const cookie = event.headers.cookie || event.headers.Cookie || '';
  if (/(?:^|;\s*)qf_session=/.test(cookie)) {
    const csrfCookie = /(?:^|;\s*)qf_csrf=([^;]+)/.exec(cookie)?.[1];
    const csrfHeader = event.headers['x-csrf-token'] || event.headers['X-CSRF-Token'];
    return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader);
  }
  return true;
}
const authCookies = (sessionToken, production) => {
  const csrfToken = randomBytes(24).toString('base64url');
  const secure = production ? '; Secure' : '';
  return [`qf_session=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`, `qf_csrf=${csrfToken}; SameSite=Lax; Path=/; Max-Age=2592000${secure}`];
};

export async function reserveAIUsage(prisma, organizationId, feature, config, ip) {
  const minuteAgo = new Date(Date.now() - 60_000);
  const requestKey = sha256(ip || 'unknown');
  try {
    return await prisma.$transaction(async tx => {
      const [recent, ipRecent, subscription, monthCount] = await Promise.all([
        tx.aiUsage.count({ where: { organizationId, createdAt: { gte: minuteAgo } } }),
        tx.aiUsage.count({ where: { requestKey, createdAt: { gte: minuteAgo } } }),
        tx.subscription.findUnique({ where: { organizationId } }),
        tx.aiUsage.count({ where: { organizationId, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } })
      ]);
      if (recent >= config.ai.maxRequestsPerMinute || ipRecent >= config.ai.maxRequestsPerMinute) return { limited: 'rate' };
      const limit = entitlementsFor(subscription).limits.aiRequestsPerMonth;
      if (monthCount >= limit) return { limited: 'limit' };
      const usage = await tx.aiUsage.create({ data: { organizationId, provider: 'gemini', feature, success: false, requestKey } });
      return { id: usage.id };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2034') return { limited: 'rate' };
    throw error;
  }
}

export function createHandler(dependencies = {}) {
  const loadConfig = dependencies.readConfig || readConfig;
  const loadPrisma = dependencies.getPrisma || getPrisma;
  const makeAI = dependencies.ai || ai;
  const makeEmail = dependencies.emailProvider || createEmailProvider;
  const makeBilling = dependencies.billingProvider || (config => new StripeBillingProvider({ ...config.stripe, appUrl: config.appUrl }));
  const makeStorage = dependencies.storageProvider || (config => new S3StorageProvider(config.storage));
  const makePdf = dependencies.pdfProvider || generateQuotePdf;
  const makeRateLimiter = dependencies.rateLimiter || createRateLimiter;
  const makeMonitor = dependencies.monitor || createMonitor;
  return async function handler(event) {
  let config, prisma;
  try { config = loadConfig(); }
  catch (error) { console.error('startup_configuration_error', error.message); return json(503, { error: 'The service configuration is incomplete.' }); }
  const path = event.path.replace(/^\/api/, '');
  const method = event.httpMethod;
  if (path === '/ai/health' && method === 'GET') return json(200, { enabled: config.ai.enabled, configured: config.ai.configured, provider: 'gemini', model: config.ai.model });
  if (path === '/health' && method === 'GET') {
    try { prisma = await loadPrisma(); await prisma.$queryRaw`SELECT 1`; return json(200, { ok: true, database: 'postgresql', time: new Date().toISOString() }); }
    catch { return json(503, { ok: false, database: 'unavailable' }); }
  }
  try { prisma = await loadPrisma(); }
  catch (error) { console.error('database_connection_error', error.message); return json(503, { error: 'The PostgreSQL service is unavailable.' }); }
  if (path !== '/stripe/webhook' && !csrf(event, config)) return json(403, { error: 'Request origin could not be verified.' });
  const body = (() => { try { return event.body ? JSON.parse(event.body) : {}; } catch { return null; } })();
  if (body === null && path !== '/stripe/webhook') return json(400, { error: 'Request body must be valid JSON.' });
  const requestIp = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown';
  const throttle = async (scope, subject, limit, windowSeconds) => {
    const limiter = makeRateLimiter(config); if (!limiter) return null;
    try { const result = await limiter.consume(scope, subject, { limit, windowSeconds }); return result.allowed ? null : json(429, { error: 'Too many attempts. Try again later.' }, { 'retry-after': String(result.retryAfter) }); }
    catch (error) { console.error('distributed_rate_limit_unavailable', { scope, message: error.message }); return config.production ? json(503, { error: 'Security rate limiting is temporarily unavailable.' }) : null; }
  };

  if (path === '/client-error' && method === 'POST') {
    const limited = await throttle('client-error', requestIp, 10, 300); if (limited) return limited;
    const monitor = makeMonitor(config); if (monitor) await monitor.capture({ event: 'frontend_exception', message: String(body.message || '').slice(0, 500), path: sanitizedRequestPath(String(body.path || '').slice(0, 300)), provider: 'browser' }).catch(() => {});
    return json(202, { received: true });
  }

  if (path === '/stripe/webhook' && method === 'POST') {
    if (!config.stripe.enabled) return json(404, { error: 'Billing webhook is disabled.' });
    let stripeEvent;
    try { stripeEvent = await makeBilling(config).constructEvent(event.body || '', event.headers['stripe-signature'] || event.headers['Stripe-Signature'] || ''); }
    catch (error) { console.error('stripe_webhook_rejected', { message: error.message }); return json(400, { error: 'Stripe signature verification failed.' }); }
    const object = stripeEvent.data?.object || {}, eventHash = stripePayloadHash(event.body || '');
    const metadataOrganizationId = object.metadata?.quoteflowOrganizationId || object.client_reference_id || object.subscription_details?.metadata?.quoteflowOrganizationId || null;
    try {
      await prisma.$transaction(async tx => {
        await tx.stripeEvent.create({ data: { id: stripeEvent.id, organizationId: metadataOrganizationId, type: stripeEvent.type, livemode: Boolean(stripeEvent.livemode), payloadHash: eventHash } });
        if (stripeEvent.type === 'checkout.session.completed' && metadataOrganizationId) {
          await tx.subscription.upsert({ where: { organizationId: metadataOrganizationId }, create: { organizationId: metadataOrganizationId, plan: String(object.metadata?.plan || 'FREE').toUpperCase(), status: 'INCOMPLETE', stripeCustomerId: typeof object.customer === 'string' ? object.customer : object.customer?.id || null, stripeSubscriptionId: typeof object.subscription === 'string' ? object.subscription : object.subscription?.id || null, lastStripeSyncAt: new Date() }, update: { stripeCustomerId: typeof object.customer === 'string' ? object.customer : object.customer?.id || undefined, stripeSubscriptionId: typeof object.subscription === 'string' ? object.subscription : object.subscription?.id || undefined, lastStripeSyncAt: new Date() } });
        }
        if (stripeEvent.type.startsWith('customer.subscription.')) {
          let organizationId = metadataOrganizationId;
          if (!organizationId) organizationId = (await tx.subscription.findFirst({ where: { OR: [{ stripeSubscriptionId: object.id }, { stripeCustomerId: typeof object.customer === 'string' ? object.customer : object.customer?.id }] }, select: { organizationId: true } }))?.organizationId;
          if (!organizationId) throw new Error('Stripe subscription is not linked to a QuoteFlow organization.');
          await tx.subscription.upsert({ where: { organizationId }, create: { organizationId, ...subscriptionRecord(object, config.stripe.prices) }, update: subscriptionRecord(object, config.stripe.prices) });
          await tx.auditLog.create({ data: { organizationId, action: `billing.${stripeEvent.type}`, objectType: 'Subscription', objectId: object.id, metadata: { status: object.status, priceId: object.items?.data?.[0]?.price?.id || null } } });
        }
        if (['invoice.payment_failed', 'payment_intent.payment_failed'].includes(stripeEvent.type)) {
          const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
          const subscription = customerId ? await tx.subscription.findFirst({ where: { stripeCustomerId: customerId } }) : null;
          if (subscription) { await tx.subscription.update({ where: { organizationId: subscription.organizationId }, data: { status: 'PAST_DUE', lastStripeSyncAt: new Date() } }); await tx.auditLog.create({ data: { organizationId: subscription.organizationId, action: 'billing.payment_failed', objectType: 'Subscription', objectId: subscription.id } }); }
        }
        if (['invoice.paid', 'invoice.payment_succeeded'].includes(stripeEvent.type)) {
          const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
          const subscription = customerId ? await tx.subscription.findFirst({ where: { stripeCustomerId: customerId } }) : null;
          if (subscription && subscription.status === 'PAST_DUE') await tx.subscription.update({ where: { organizationId: subscription.organizationId }, data: { status: 'ACTIVE', lastStripeSyncAt: new Date() } });
        }
      });
    } catch (error) { if (error.code === 'P2002') return json(200, { received: true, duplicate: true }); console.error('stripe_webhook_processing_failed', { eventId: stripeEvent.id, type: stripeEvent.type, message: error.message }); return json(500, { error: 'Webhook processing failed and may be retried.' }); }
    return json(200, { received: true });
  }

  if (path === '/auth/signup' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase(), password = body.password, organizationName = String(body.organization || '').trim();
    const limited = await throttle('auth-signup', requestIp, 5, 3600); if (limited) return limited;
    const inviteToken = String(body.invitationToken || '').slice(0, 200);
    if (!/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 12 || password.length > 256 || (!inviteToken && (organizationName.length < 2 || organizationName.length > 120))) return json(400, { error: 'Enter a valid email, a 12-character password and an organization name.' });
    const invitation = inviteToken ? await prisma.invitation.findUnique({ where: { tokenHash: sha256(inviteToken) }, include: { organization: true } }) : null;
    if (inviteToken && (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date())) return json(400, { error: 'Invitation is invalid, expired or already accepted.' });
    if (invitation && invitation.email !== email) return json(403, { error: 'Use the email address that received this invitation.' });
    const salt = randomBytes(16);
    const passwordHash = `${salt.toString('hex')}:${Buffer.from(await scrypt(password, salt, 64)).toString('hex')}`;
    const sessionToken = randomBytes(32).toString('base64url');
    try {
      const result = await prisma.$transaction(async tx => {
        const user = await tx.user.create({ data: { email, passwordHash } });
        let organization, memberRole = 'OWNER';
        if (invitation) {
          const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
          if (!claimed.count) throw new Error('INVITATION_CLAIMED');
          organization = invitation.organization; memberRole = invitation.role;
          await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, role: memberRole } });
        } else {
          organization = await tx.organization.create({ data: { name: organizationName, settings: { create: { data: { company: organizationName, currency: 'AED', tax: 5, margin: 20, validity: 30 } } }, subscription: { create: { plan: 'FREE', status: 'ACTIVE' } } } });
          await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, role: memberRole } });
        }
        await tx.session.create({ data: { tokenHash: sha256(sessionToken), userId: user.id, organizationId: organization.id, expiresAt: new Date(Date.now() + 30 * 864e5) } });
        return { user, organization, memberRole };
      });
      const emailProvider = makeEmail(config);
      let verificationSent = false;
      if (emailProvider) {
        const verificationToken = randomBytes(32).toString('base64url');
        await prisma.emailVerificationToken.create({ data: { userId: result.user.id, tokenHash: sha256(verificationToken), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
        try { await emailProvider.send({ to: email, subject: 'Verify your QuoteFlow account', text: `Verify your email within 24 hours: ${config.appUrl}/verify-email?token=${encodeURIComponent(verificationToken)}` }); verificationSent = true; }
        catch (error) { console.error('verification_email_failed', { userId: result.user.id, message: error.message }); }
      }
      return json(201, { user: { id: result.user.id, email }, organization: { id: result.organization.id, name: result.organization.name }, role: result.memberRole, onboardingRequired: !invitation, verificationSent }, { 'set-cookie': authCookies(sessionToken, config.production) });
    } catch (error) { if (error.code === 'P2002') return json(409, { error: 'An account already exists for this email.' }); if (error.message === 'INVITATION_CLAIMED') return json(409, { error: 'This invitation was already accepted.' }); throw error; }
  }
  if (path === '/auth/login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const ipLimited = await throttle('auth-login-ip', requestIp, 20, 900), identityLimited = await throttle('auth-login-identity', email || 'invalid', 10, 900); if (ipLimited || identityLimited) return ipLimited || identityLimited;
    const user = await prisma.user.findUnique({ where: { email }, include: { memberships: { include: { organization: true }, orderBy: { createdAt: 'asc' } } } });
    if (!user || typeof body.password !== 'string') return json(401, { error: 'Email or password is incorrect.' });
    const [saltHex, expectedHex] = user.passwordHash.split(':');
    if (!saltHex || !expectedHex) return json(401, { error: 'Email or password is incorrect.' });
    const actual = Buffer.from(await scrypt(body.password, Buffer.from(saltHex, 'hex'), 64));
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json(401, { error: 'Email or password is incorrect.' });
    const memberships = user.memberships; if (!memberships.length) return json(403, { error: 'This account has no organization membership.' });
    const membership = memberships[0];
    const sessionToken = randomBytes(32).toString('base64url');
    await prisma.session.create({ data: { tokenHash: sha256(sessionToken), userId: user.id, organizationId: membership.organizationId, expiresAt: new Date(Date.now() + 30 * 864e5) } });
    return json(200, { user: { id: user.id, email: user.email }, memberships: memberships.map(m => ({ organizationId: m.organizationId, name: m.organization.name, role: m.role })) }, { 'set-cookie': authCookies(sessionToken, config.production) });
  }
  if (path === '/auth/logout' && method === 'POST') {
    const token = /(?:^|;\s*)qf_session=([^;]+)/.exec(event.headers.cookie || '')?.[1];
    if (token && cookieValue(token)) await prisma.session.deleteMany({ where: { tokenHash: sha256(cookieValue(token)) } });
    return json(200, { ok: true }, { 'set-cookie': [`qf_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${config.production ? '; Secure' : ''}`, `qf_csrf=; SameSite=Lax; Path=/; Max-Age=0${config.production ? '; Secure' : ''}`] });
  }

  if (path === '/auth/verify-email' && method === 'POST') {
    const token = String(body.token || '').slice(0, 200);
    const limited = await throttle('auth-verify', requestIp, 20, 900); if (limited) return limited;
    const found = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!found || found.usedAt || found.expiresAt <= new Date()) return json(400, { error: 'Verification link is invalid or expired.' });
    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: found.userId }, data: { emailVerifiedAt: new Date() } });
      await tx.emailVerificationToken.update({ where: { id: found.id }, data: { usedAt: new Date() } });
    });
    return json(200, { ok: true });
  }

  if (path === '/auth/recovery' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const ipLimited = await throttle('auth-recovery-ip', requestIp, 5, 3600), identityLimited = await throttle('auth-recovery-identity', email || 'invalid', 3, 3600); if (ipLimited || identityLimited) return ipLimited || identityLimited;
    const user = /^\S+@\S+\.\S+$/.test(email) ? await prisma.user.findUnique({ where: { email } }) : null;
    const emailProvider = makeEmail(config);
    if (user && emailProvider) {
      const token = randomBytes(32).toString('base64url');
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
      try { await emailProvider.send({ to: email, subject: 'Reset your QuoteFlow password', text: `Use this link within 30 minutes to reset your password: ${config.appUrl}/reset-password?token=${encodeURIComponent(token)}` }); }
      catch (error) { console.error('password_recovery_email_failed', { userId: user.id, message: error.message }); }
    }
    return json(200, { ok: true, message: 'If this account exists, recovery instructions will be sent.' });
  }

  if (path === '/auth/reset-password' && method === 'POST') {
    const token = String(body.token || '').slice(0, 200), password = body.password;
    const limited = await throttle('auth-reset', requestIp, 10, 3600); if (limited) return limited;
    if (typeof password !== 'string' || password.length < 12 || password.length > 256) return json(400, { error: 'Password must be between 12 and 256 characters.' });
    const found = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!found || found.usedAt || found.expiresAt <= new Date()) return json(400, { error: 'Recovery link is invalid or expired.' });
    const salt = randomBytes(16), passwordHash = `${salt.toString('hex')}:${Buffer.from(await scrypt(password, salt, 64)).toString('hex')}`;
    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: found.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({ where: { id: found.id }, data: { usedAt: new Date() } });
      await tx.session.deleteMany({ where: { userId: found.userId } });
    });
    return json(200, { ok: true });
  }

  const publicPdfMatch = /^\/public\/quote\/([^/]+)\/pdf$/.exec(path);
  if (publicPdfMatch && method === 'GET') {
    const quote = await prisma.quote.findFirst({ where: { publicTokenHash: sha256(publicPdfMatch[1]), publicTokenExpiresAt: { gt: new Date() }, deletedAt: null }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    if (!quote || !quote.snapshot || !['SENT', 'VIEWED', 'ACCEPTED', 'REJECTED'].includes(quote.status) || (quote.expiryDate && quote.expiryDate < new Date())) return json(404, { error: 'Quote PDF is unavailable.' });
    const pdf = await makePdf(quote, config.pdf);
    await prisma.quoteEvent.create({ data: { quoteId: quote.id, type: 'PDF_DOWNLOADED', metadata: { source: 'customer-portal', version: quote.version } } }).catch(() => {});
    return binary(200, pdf, 'application/pdf', `${quote.number}-v${quote.snapshot.version || quote.version}.pdf`);
  }

  const publicQuoteMatch = /^\/public\/quote\/([^/]+)$/.exec(path);
  if (publicQuoteMatch) {
    const quote = await prisma.quote.findFirst({ where: { publicTokenHash: sha256(publicQuoteMatch[1]), deletedAt: null }, include: { items: { orderBy: { sortOrder: 'asc' } }, acceptance: true } });
    if (!quote || !quote.publicTokenExpiresAt || quote.publicTokenExpiresAt <= new Date() || !quote.snapshot || (quote.expiryDate && quote.expiryDate < new Date())) return json(404, { error: 'Quote link is invalid or unavailable.' });
    if (method === 'GET') {
      if (quote.status === 'SENT') {
        await prisma.$transaction(async tx => {
          const viewed = await tx.quote.updateMany({ where: { id: quote.id, status: 'SENT', version: quote.version }, data: { status: 'VIEWED', viewedAt: new Date() } });
          if (viewed.count) await tx.quoteEvent.create({ data: { quoteId: quote.id, type: 'VIEWED', metadata: { source: 'customer-portal', version: quote.version } } });
        });
      }
      if (!['SENT', 'VIEWED', 'ACCEPTED', 'REJECTED'].includes(quote.status)) return json(404, { error: 'Quote link is invalid or unavailable.' });
      const snapshot = quote.snapshot;
      return json(200, { quote: { number: quote.number, title: quote.title, status: quote.status === 'SENT' ? 'VIEWED' : quote.status, expiry: quote.expiryDate?.toISOString().slice(0, 10) || '', currency: quote.currency, items: snapshot.items, totals: snapshot.totals, customer: snapshot.customer, company: snapshot.company, terms: snapshot.terms } });
    }
    if (method === 'POST') {
      if (!['accept', 'reject', 'question'].includes(body.action)) return json(400, { error: 'Unsupported response.' });
      if (!['SENT', 'VIEWED'].includes(quote.status)) return json(409, { error: 'This quote already has a final response or is unavailable.' });
      if (body.action === 'question') {
        const message = String(body.message || '').trim();
        const name = String(body.name || '').trim(), email = String(body.email || '').trim();
        if (message.length < 3 || message.length > 2000 || name.length < 1 || name.length > 160 || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: 'Enter your name, valid email and a question of 3–2,000 characters.' });
        const limiter = makeRateLimiter(config);
        if (limiter) {
          try { const limit = await limiter.consume('public-question', `${quote.id}:${event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown'}`, { limit: 5, windowSeconds: 600 }); if (!limit.allowed) return json(429, { error: 'Too many questions were sent recently. Please try again later.' }, { 'retry-after': String(limit.retryAfter) }); }
          catch (error) { console.error('distributed_rate_limit_unavailable', { scope: 'public-question', message: error.message }); }
        }
        if (prisma.quoteEvent.count) {
          const recentQuestions = await prisma.quoteEvent.count({ where: { quoteId: quote.id, type: 'CUSTOMER_QUESTION', createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
          if (recentQuestions >= 5) return json(429, { error: 'Too many questions were sent recently. Please try again later.' }, { 'retry-after': '600' });
        }
        await prisma.quoteEvent.create({ data: { quoteId: quote.id, type: 'CUSTOMER_QUESTION', metadata: { message, name, email } } });
        const notificationProvider = makeEmail(config);
        try {
          const settings = await prisma.companySettings.findUnique({ where: { organizationId: quote.organizationId } });
          const sellerEmail = settings?.data?.email;
          if (notificationProvider && sellerEmail) await notificationProvider.send({ to: sellerEmail, subject: `Customer question about quotation ${quote.number}`, text: `${name} (${email}) asked about ${quote.number}:\n\n${message}` });
        } catch (error) { console.error('quote_question_notification_failed', { quoteId: quote.id, message: error.message }); }
        return json(200, { status: quote.status, message: 'Your question has been recorded.' });
      }
      const name = String(body.name || '').trim().slice(0, 160), email = String(body.email || '').trim().slice(0, 254);
      if (quote.expiryDate && quote.expiryDate < new Date()) return json(409, { error: 'This quotation has expired and can no longer receive a response.' });
      if (body.action === 'accept' && (!name || !/^\S+@\S+\.\S+$/.test(email) || body.agree !== true)) return json(400, { error: 'Name, valid email and agreement are required.' });
      const acceptedRevision = Number(quote.snapshot?.version);
      if (!Number.isInteger(acceptedRevision) || acceptedRevision < 1) return json(409, { error: 'This link does not identify a valid sent revision.' });
      const finalStatus = body.action === 'accept' ? 'ACCEPTED' : 'REJECTED';
      const result = await prisma.$transaction(async tx => {
        const update = await tx.quote.updateMany({ where: { id: quote.id, status: { in: ['SENT', 'VIEWED'] }, publicTokenHash: sha256(publicQuoteMatch[1]), version: quote.version, publicTokenExpiresAt: { gt: new Date() }, expiryDate: quote.expiryDate ? { gte: new Date() } : null }, data: { status: finalStatus, ...(finalStatus === 'ACCEPTED' ? { acceptedAt: new Date() } : { rejectedAt: new Date(), rejectionReason: String(body.reason || '').slice(0, 1000) }) } });
        if (!update.count) return false;
        if (finalStatus === 'ACCEPTED') await tx.quoteAcceptance.create({ data: { quoteId: quote.id, quoteVersion: acceptedRevision, name, email, statement: 'I agree to the quotation and terms.' } });
        await tx.quoteEvent.create({ data: { quoteId: quote.id, type: finalStatus, metadata: finalStatus === 'REJECTED' ? { reason: String(body.reason || '').slice(0, 1000) } : undefined } });
        if (quote.rfqId) await tx.rFQ.updateMany({ where: { id: quote.rfqId, organizationId: quote.organizationId }, data: { status: finalStatus === 'ACCEPTED' ? 'WON' : 'LOST' } });
        return true;
      });
      if (!result) return json(409, { error: 'This quote has already received a response.' });
      return json(200, { status: finalStatus });
    }
    return json(405, { error: 'Method not allowed.' });
  }

  const principal = await authenticate(event, prisma);
  if (!principal) return json(401, { error: 'Authentication required.' });
  const { user, organization, role } = principal;
  if (path === '/auth/resend-verification' && method === 'POST') {
    if (user.emailVerifiedAt) return json(200, { verified: true });
    const limited = await throttle('auth-verification-resend', `${requestIp}:${user.email}`, 3, 3600); if (limited) return limited;
    const emailProvider = makeEmail(config); if (!emailProvider) return json(503, { error: 'Email delivery is not configured.' });
    const token = randomBytes(32).toString('base64url'), expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.$transaction(async tx => { await tx.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }); await tx.emailVerificationToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt } }); });
    try { await emailProvider.send({ to: user.email, subject: 'Verify your QuoteFlow account', text: `Verify your email within one hour: ${config.appUrl}/verify-email?token=${encodeURIComponent(token)}` }); }
    catch (error) { console.error('verification_resend_failed', { userId: user.id, message: error.message }); return json(502, { error: 'Verification email could not be sent. Try again later.' }); }
    return json(200, { sent: true, expiresAt });
  }
  if (path === '/billing' && method === 'GET') {
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [subscription, teamMembers, quotesThisMonth, aiRequestsThisMonth, storage, deletionRequest] = await Promise.all([
      prisma.subscription.findUnique({ where: { organizationId: organization.id } }), prisma.membership.count({ where: { organizationId: organization.id } }),
      prisma.quote.count({ where: { organizationId: organization.id, createdAt: { gte: monthStart }, deletedAt: null } }), prisma.aiUsage.count({ where: { organizationId: organization.id, createdAt: { gte: monthStart } } }),
      prisma.attachment.aggregate({ where: { organizationId: organization.id, status: 'READY', deletedAt: null }, _sum: { byteSize: true } }),
      prisma.organizationDeletionRequest.findFirst({ where: { organizationId: organization.id, canceledAt: null, completedAt: null }, orderBy: { requestedAt: 'desc' } })
    ]);
    return json(200, { subscription, entitlements: entitlementsFor(subscription, { teamMembers, quotesThisMonth, aiRequestsThisMonth, storageBytes: storage._sum.byteSize || 0 }), billingEnabled: config.stripe.enabled, deletionRequest });
  }
  if (path === '/billing/checkout' && method === 'POST') {
    const verification = requireVerifiedEmail(user); if (verification) return verification;
    if (!['OWNER', 'ADMIN'].includes(role)) return json(403, { error: 'Only an Owner or Admin may manage billing.' });
    if (!config.stripe.enabled) return json(503, { error: 'Billing is not configured for this deployment.' });
    const plan = String(body.plan || '').toUpperCase(); if (!['PRO', 'BUSINESS'].includes(plan)) return json(400, { error: 'Choose the Pro or Business plan.' });
    const billing = makeBilling(config); let subscription = await prisma.subscription.findUnique({ where: { organizationId: organization.id } });
    let customerId = subscription?.stripeCustomerId;
    if (!customerId) { const customer = await billing.createCustomer({ organizationId: organization.id, name: organization.name, email: user.email }); customerId = customer.id; subscription = await prisma.subscription.upsert({ where: { organizationId: organization.id }, create: { organizationId: organization.id, plan: 'FREE', status: 'ACTIVE', stripeCustomerId: customerId }, update: { stripeCustomerId: customerId } }); }
    const session = await billing.createCheckout({ organizationId: organization.id, customerId, plan });
    await prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'billing.checkout_created', objectType: 'Subscription', objectId: subscription.id, metadata: { plan } } });
    return json(200, { url: session.url });
  }
  if (path === '/billing/portal' && method === 'POST') {
    const verification = requireVerifiedEmail(user); if (verification) return verification;
    if (!['OWNER', 'ADMIN'].includes(role)) return json(403, { error: 'Only an Owner or Admin may manage billing.' });
    if (!config.stripe.enabled) return json(503, { error: 'Billing is not configured for this deployment.' });
    const subscription = await prisma.subscription.findUnique({ where: { organizationId: organization.id } });
    if (!subscription?.stripeCustomerId) return json(409, { error: 'This organization does not have a Stripe billing profile.' });
    const session = await makeBilling(config).createPortal({ customerId: subscription.stripeCustomerId }); return json(200, { url: session.url });
  }
  if (path === '/account/export' && method === 'GET') {
    if (role !== 'OWNER') return json(403, { error: 'Only the organization Owner may export all organization data.' });
    const [settings, members, customers, catalogItems, rfqs, quotes, followUps, auditLogs, attachments, subscription] = await Promise.all([
      prisma.companySettings.findUnique({ where: { organizationId: organization.id } }), prisma.membership.findMany({ where: { organizationId: organization.id }, include: { user: { select: { email: true } } } }),
      prisma.customer.findMany({ where: { organizationId: organization.id } }), prisma.catalogItem.findMany({ where: { organizationId: organization.id } }), prisma.rFQ.findMany({ where: { organizationId: organization.id }, include: { items: true } }),
      prisma.quote.findMany({ where: { organizationId: organization.id }, include: { items: true, events: true, acceptance: true, approvals: true } }), prisma.followUp.findMany({ where: { organizationId: organization.id } }),
      prisma.auditLog.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: 'asc' } }), prisma.attachment.findMany({ where: { organizationId: organization.id } }), prisma.subscription.findUnique({ where: { organizationId: organization.id } })
    ]);
    await prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'organization.data_exported', objectType: 'Organization', objectId: organization.id } });
    return json(200, { exportedAt: new Date().toISOString(), organization, settings, members: members.map(m => ({ email: m.user.email, role: m.role, createdAt: m.createdAt })), customers, catalogItems, rfqs, quotes, followUps, auditLogs, attachments, subscription });
  }
  if (path === '/account/deletion-request' && method === 'POST') {
    const verification = requireVerifiedEmail(user); if (verification) return verification;
    if (role !== 'OWNER') return json(403, { error: 'Only the organization Owner may request deletion.' });
    const scheduledFor = new Date(Date.now() + 7 * 864e5), pending = await prisma.organizationDeletionRequest.findFirst({ where: { organizationId: organization.id, canceledAt: null, completedAt: null } });
    if (pending) return json(200, { request: pending, duplicate: true });
    const request = await prisma.organizationDeletionRequest.create({ data: { organizationId: organization.id, requestedById: user.id, scheduledFor } });
    await prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'organization.deletion_requested', objectType: 'Organization', objectId: organization.id, metadata: { scheduledFor: scheduledFor.toISOString() } } });
    return json(202, { request, message: 'Deletion requested — scheduled for operator processing after the seven-day cooling-off period. Export your data before that date.' });
  }
  if (path === '/account/deletion-request' && method === 'DELETE') {
    if (role !== 'OWNER') return json(403, { error: 'Only the organization Owner may cancel deletion.' });
    const canceled = await prisma.organizationDeletionRequest.updateMany({ where: { organizationId: organization.id, canceledAt: null, completedAt: null }, data: { canceledAt: new Date() } });
    if (canceled.count) await prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'organization.deletion_canceled', objectType: 'Organization', objectId: organization.id } });
    return json(200, { canceled: Boolean(canceled.count) });
  }

  const quotePdfMatch = /^\/quotes\/([^/]+)\/pdf$/.exec(path);
  if (quotePdfMatch && method === 'GET') {
    const quote = await prisma.quote.findFirst({ where: { id: quotePdfMatch[1], organizationId: organization.id, deletedAt: null }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    if (!quote || !quote.snapshot || !['SENT', 'VIEWED', 'ACCEPTED', 'REJECTED'].includes(quote.status)) return json(409, { error: 'Save and send the quote before generating its immutable customer PDF.' });
    const pdf = await makePdf(quote, config.pdf); const fileName = `${quote.number}-v${quote.snapshot.version || quote.version}.pdf`;
    if (config.storage.enabled) { const storage = makeStorage(config), key = storageKey(organization.id, '.pdf', 'generated-quotes'); await storage.put({ key, body: pdf, mimeType: 'application/pdf' }); await prisma.attachment.upsert({ where: { organizationId_storageKey: { organizationId: organization.id, storageKey: key } }, create: { organizationId: organization.id, quoteId: quote.id, storageKey: key, kind: 'QUOTE_PDF', status: 'READY', provider: config.storage.provider, fileName, mimeType: 'application/pdf', byteSize: pdf.length, sha256: sha256(pdf) }, update: { status: 'READY', byteSize: pdf.length, sha256: sha256(pdf) } }).catch(async () => prisma.attachment.create({ data: { organizationId: organization.id, quoteId: quote.id, storageKey: key, kind: 'QUOTE_PDF', status: 'READY', provider: config.storage.provider, fileName, mimeType: 'application/pdf', byteSize: pdf.length, sha256: sha256(pdf) } })); }
    await prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'quote.pdf_generated', objectType: 'Quote', objectId: quote.id, metadata: { version: quote.snapshot.version || quote.version } } });
    return binary(200, pdf, 'application/pdf', fileName);
  }

  if (path === '/attachments/upload' && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    if (!config.storage.enabled) return json(503, { error: 'Object storage is not configured.' });
    let file; try { file = validateUpload(body, config.storage.maxUploadBytes); } catch (error) { return json(400, { error: error.message }); }
    const rfqId = body.rfqId ? String(body.rfqId) : null; if (rfqId && !await prisma.rFQ.findFirst({ where: { id: rfqId, organizationId: organization.id, deletedAt: null } })) return json(404, { error: 'RFQ not found.' });
    const subscription = await prisma.subscription.findUnique({ where: { organizationId: organization.id } }), used = await prisma.attachment.aggregate({ where: { organizationId: organization.id, deletedAt: null }, _sum: { byteSize: true } }), entitlement = entitlementsFor(subscription, { storageBytes: used._sum.byteSize || 0 });
    if (file.byteSize > entitlement.available.storageBytes) return json(402, { error: 'Organization storage quota would be exceeded.' });
    const key = storageKey(organization.id, file.extension), attachment = await prisma.attachment.create({ data: { organizationId: organization.id, rfqId, storageKey: key, provider: config.storage.provider, fileName: file.fileName, mimeType: file.mimeType, byteSize: file.byteSize, sha256: /^[a-f0-9]{64}$/i.test(body.sha256 || '') ? body.sha256.toLowerCase() : 'pending' } });
    const uploadUrl = await makeStorage(config).createUploadUrl({ key, mimeType: file.mimeType, byteSize: file.byteSize }); return json(201, { attachment: { id: attachment.id, fileName: attachment.fileName, status: attachment.status }, uploadUrl, expiresIn: 900 });
  }
  const attachmentMatch = /^\/attachments\/([^/]+)(?:\/(complete|download))?$/.exec(path);
  if (attachmentMatch) {
    const attachment = await prisma.attachment.findFirst({ where: { id: attachmentMatch[1], organizationId: organization.id, deletedAt: null } }); if (!attachment) return json(404, { error: 'Attachment not found.' });
    if (attachmentMatch[2] === 'complete' && method === 'POST') { if (!config.storage.enabled) return json(503, { error: 'Object storage is not configured.' }); try { const result = await makeStorage(config).verify(attachment); const changed = await prisma.attachment.update({ where: { id: attachment.id }, data: { status: 'READY', sha256: /^[a-f0-9]{64}$/i.test(body.sha256 || '') ? body.sha256.toLowerCase() : attachment.sha256 } }); return json(200, { attachment: { id: changed.id, fileName: changed.fileName, status: changed.status, etag: result.etag } }); } catch (error) { await prisma.attachment.update({ where: { id: attachment.id }, data: { status: 'REJECTED' } }).catch(() => {}); return json(400, { error: error.message }); } }
    if (attachmentMatch[2] === 'download' && method === 'GET') { if (attachment.status !== 'READY') return json(409, { error: 'Attachment is not ready.' }); return json(200, { url: await makeStorage(config).createDownloadUrl(attachment.storageKey), expiresIn: 300 }); }
    if (!attachmentMatch[2] && method === 'DELETE') { if (!['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'Only managers may delete attachments.' }); await makeStorage(config).delete(attachment.storageKey); await prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date(), status: 'DELETED' } }); return json(200, { deleted: true }); }
  }
  if (path === '/auth/me' && method === 'GET') {
    const memberships = await prisma.membership.findMany({ where: { userId: user.id }, include: { organization: { select: { id: true, name: true, reportingCurrency: true } } }, orderBy: { createdAt: 'asc' } });
    return json(200, { user: { id: user.id, email: user.email, emailVerifiedAt: user.emailVerifiedAt, verified: Boolean(user.emailVerifiedAt) }, organization: { id: organization.id, name: organization.name, currency: organization.reportingCurrency }, role, memberships: memberships.map(m => ({ organizationId: m.organizationId, name: m.organization.name, role: m.role })) });
  }
  if (path === '/auth/switch-organization' && method === 'POST') {
    const organizationId = String(body.organizationId || '').trim();
    if (!organizationId || organizationId.length > 128) return json(400, { error: 'Choose a valid organization.' });
    const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId } }, include: { organization: true } });
    if (!membership) return json(403, { error: 'You do not have access to that organization.' });
    const changed = await prisma.session.updateMany({ where: { id: principal.session.id, userId: user.id, expiresAt: { gt: new Date() } }, data: { organizationId } });
    if (!changed.count) return json(401, { error: 'Your session has expired. Sign in again.' });
    await prisma.auditLog.create({ data: { organizationId, actorUserId: user.id, action: 'auth.organization_switched', objectType: 'Organization', objectId: organizationId, metadata: { previousOrganizationId: organization.id } } });
    return json(200, { organization: { id: membership.organization.id, name: membership.organization.name, currency: membership.organization.reportingCurrency }, role: membership.role });
  }
  if (path === '/auth/change-password' && method === 'POST') {
    const limited = await throttle('auth-change-password', `${requestIp}:${user.id}`, 5, 900); if (limited) return limited;
    const currentPassword = body.currentPassword, nextPassword = body.newPassword;
    if (typeof currentPassword !== 'string' || typeof nextPassword !== 'string' || nextPassword.length < 12 || nextPassword.length > 256 || currentPassword === nextPassword) return json(400, { error: 'Enter your current password and a different new password of 12–256 characters.' });
    if (!await passwordMatches(user, currentPassword)) return json(401, { error: 'Current password is incorrect.' });
    const salt = randomBytes(16), passwordHash = `${salt.toString('hex')}:${Buffer.from(await scrypt(nextPassword, salt, 64)).toString('hex')}`;
    await prisma.$transaction(async tx => { await tx.user.update({ where: { id: user.id }, data: { passwordHash } }); await tx.session.deleteMany({ where: { userId: user.id, id: { not: principal.session.id } } }); await tx.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'auth.password_changed', objectType: 'User', objectId: user.id } }); });
    return json(200, { changed: true, otherSessionsRevoked: true });
  }
  if (path === '/auth/logout-other-sessions' && method === 'POST') {
    const removed = await prisma.session.deleteMany({ where: { userId: user.id, id: { not: principal.session.id } } });
    await prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'auth.other_sessions_revoked', objectType: 'User', objectId: user.id, metadata: { count: removed.count } } });
    return json(200, { revoked: removed.count });
  }
  if (path === '/account' && method === 'DELETE') {
    const verification = requireVerifiedEmail(user); if (verification) return verification;
    const limited = await throttle('account-delete', `${requestIp}:${user.id}`, 3, 3600); if (limited) return limited;
    if (body.confirm !== 'DELETE MY ACCOUNT') return json(400, { error: 'Enter the account deletion confirmation exactly.' });
    if (!await passwordMatches(user, body.currentPassword)) return json(401, { error: 'Current password is incorrect.' });
    const owned = await prisma.membership.findMany({ where: { userId: user.id, role: 'OWNER' }, select: { organizationId: true } });
    for (const membership of owned) {
      const otherOwners = await prisma.membership.count({ where: { organizationId: membership.organizationId, role: 'OWNER', userId: { not: user.id } } });
      if (!otherOwners) return json(409, { error: 'Transfer ownership or request deletion for every organization you solely own before deleting your account.' });
    }
    const affected = await prisma.membership.findMany({ where: { userId: user.id }, select: { organizationId: true, role: true } });
    await prisma.$transaction(async tx => {
      for (const membership of affected) await tx.auditLog.create({ data: { organizationId: membership.organizationId, actorUserId: user.id, action: 'account.deletion_requested', objectType: 'User', objectId: user.id, metadata: { previousRole: membership.role } } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
    });
    const secure = config.production ? '; Secure' : '';
    return json(200, { deleted: true }, { 'set-cookie': [`qf_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`, `qf_csrf=; SameSite=Lax; Path=/; Max-Age=0${secure}`] });
  }
    if (path === '/bootstrap' && method === 'GET') {
    const [settings, customers, catalogItems, rfqs, quotes, followUps, events] = await Promise.all([
      prisma.companySettings.findUnique({ where: { organizationId: organization.id } }),
      prisma.customer.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
      prisma.catalogItem.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
      prisma.rFQ.findMany({ where: { organizationId: organization.id, deletedAt: null }, include: { items: true }, orderBy: { createdAt: 'desc' } }),
      prisma.quote.findMany({ where: { organizationId: organization.id, deletedAt: null }, include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
      prisma.followUp.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { dueAt: 'asc' } }),
      prisma.quoteEvent.findMany({ where: { quote: { organizationId: organization.id, deletedAt: null } }, include: { quote: { select: { id: true, number: true } } }, orderBy: { createdAt: 'desc' }, take: 500 })
    ]);
    const statusLabel = value => ({ DRAFT: 'Draft', INTERNAL_REVIEW: 'Internal Review', SENDING: 'Sending', SENT: 'Sent', VIEWED: 'Viewed', ACCEPTED: 'Accepted', REJECTED: 'Rejected', EXPIRED: 'Expired', NEW: 'New', REVIEWING: 'Reviewing', PRICING: 'Pricing', QUOTED: 'Quoted', WON: 'Won', LOST: 'Lost', CANCELLED: 'Cancelled', PENDING: 'Pending', COMPLETED: 'Completed', SNOOZED: 'Snoozed' })[value] || value;
    return json(200, { user: { id: user.id, email: user.email, role }, organization: { id: organization.id, name: organization.name, currency: organization.reportingCurrency }, settings: settings?.data || {}, customers: customers.map(item => ({ ...item, name: item.companyName, contact: item.contactName })), products: catalogItems.map(item => ({ ...item, price: Number(item.sellingPrice), cost: Number(item.cost), tax: Number(item.taxRate) })), rfqs: rfqs.map(item => ({ ...item, received: item.receivedAt.toISOString().slice(0, 10), deadline: item.deadline?.toISOString().slice(0, 10) || '', status: statusLabel(item.status), items: item.items.map(line => ({ catalogItemId: line.catalogItemId, name: line.description, description: line.notes || '', qty: Number(line.quantity), unit: line.unit, sourceText: line.sourceText, confidence: Number(line.confidence) || 0 })) })), quotes: quotes.map(item => ({ ...item, created: item.issueDate.toISOString().slice(0, 10), expiry: item.expiryDate?.toISOString().slice(0, 10) || '', payment: item.paymentTerms, delivery: item.deliveryTerms, notes: item.customerNotes, status: statusLabel(item.status), discount: Number(item.discount), items: item.items.map(line => ({ catalogItemId: line.catalogItemId, lineType: line.catalogItemId ? 'CATALOG' : 'MANUAL', name: line.nameSnapshot, sku: line.skuSnapshot, description: line.descriptionSnapshot, qty: Number(line.quantity), unit: line.unitSnapshot, cost: Number(line.costSnapshot), price: Number(line.sellingPrice), minimumPrice: line.minimumPriceSnapshot == null ? null : Number(line.minimumPriceSnapshot), tax: Number(line.taxRate) })) })), followups: followUps.map(item => ({ ...item, title: item.task, due: item.dueAt.toISOString().slice(0, 10), note: item.notes, status: statusLabel(item.status) })), events: events.map(event => ({ ...event, number: event.quote.number })) });
  }
  if (path === '/customers' && method === 'GET') return json(200, { items: await prisma.customer.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { createdAt: 'desc' } }) });
  if (path === '/customers' && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    const companyName = String(body.companyName || body.name || '').trim();
    if (!companyName || companyName.length > 200) return json(400, { error: 'Customer company name is required.' });
    const item = await prisma.customer.create({ data: { organizationId: organization.id, companyName, contactName: String(body.contactName || body.contact || '').slice(0, 160) || null, email: String(body.email || '').slice(0, 254) || null, phone: String(body.phone || '').slice(0, 60) || null, address: String(body.address || '').slice(0, 1000) || null, industry: String(body.industry || '').slice(0, 100) || null, notes: String(body.notes || '').slice(0, 2000) || null } });
    await prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'customer.created', objectType: 'Customer', objectId: item.id } });
    return json(201, { item: { ...item, name: item.companyName, contact: item.contactName } });
  }
  const customerMatch = /^\/customers\/([^/]+)$/.exec(path);
  if (customerMatch && ['PATCH', 'DELETE'].includes(method)) {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    const existing = await prisma.customer.findFirst({ where: { id: customerMatch[1], organizationId: organization.id, deletedAt: null } });
    if (!existing) return json(404, { error: 'Customer not found in this organization.' });
    if (method === 'DELETE') {
      const archived = await prisma.customer.updateMany({ where: { id: existing.id, organizationId: organization.id, deletedAt: null }, data: { deletedAt: new Date() } });
      if (!archived.count) return json(409, { error: 'This customer has already been archived.' });
      await prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'customer.archived', objectType: 'Customer', objectId: existing.id } });
      return json(200, { archived: true });
    }
    const fields = {
      companyName: ['companyName', 'name', 200],
      contactName: ['contactName', 'contact', 160],
      email: ['email', null, 254],
      phone: ['phone', null, 60],
      address: ['address', null, 1000],
      industry: ['industry', null, 100],
      notes: ['notes', null, 2000]
    };
    const data = {};
    for (const [column, [source, alias, maxLength]] of Object.entries(fields)) {
      if (!Object.prototype.hasOwnProperty.call(body, source) && !(alias && Object.prototype.hasOwnProperty.call(body, alias))) continue;
      const value = body[source] ?? (alias ? body[alias] : null);
      if (value !== null && typeof value !== 'string') return json(400, { error: 'Customer fields must contain text.' });
      const clean = (value || '').trim();
      if (clean.length > maxLength || (column === 'companyName' && !clean)) return json(400, { error: 'Customer information is missing or too long.' });
      if (column === 'email' && clean && !/^\S+@\S+\.\S+$/.test(clean)) return json(400, { error: 'Customer email is invalid.' });
      data[column] = clean || null;
    }
    if (!Object.keys(data).length) return json(400, { error: 'No editable customer fields were provided.' });
    const item = await prisma.customer.update({ where: { id: existing.id }, data });
    await prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'customer.updated', objectType: 'Customer', objectId: item.id, metadata: { fields: Object.keys(data) } } });
    return json(200, { item: { ...item, name: item.companyName, contact: item.contactName } });
  }
  if (path === '/products' && method === 'GET') {
    const items = await prisma.catalogItem.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return json(200, { items: items.map(({ cost, sellingPrice, taxRate, ...item }) => ({ ...item, price: sellingPrice, tax: taxRate })) });
  }
  if (path === '/products' && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'Catalog changes require a manager role.' });
    const name = String(body.name || '').trim(), costInput = body.cost, priceInput = body.price ?? body.sellingPrice;
    const companySettings = await prisma.companySettings.findUnique({ where: { organizationId: organization.id } });
    const taxInput = body.tax ?? body.taxRate ?? companySettings?.data?.tax ?? 0;
    const cost = Number(costInput), price = Number(priceInput), tax = Number(taxInput);
    if (!name || name.length > 240 || costInput == null || priceInput == null || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(tax) || tax < 0 || tax > 100) return json(400, { error: 'Catalog item name, cost, price and tax are invalid.' });
    try { calculateQuote({ items: [{ qty: '1', cost: costInput, price: priceInput, tax: taxInput }], discount: 0 }); }
    catch (error) { return json(400, { error: error.message }); }
    const currency = String(body.currency || organization.reportingCurrency).trim().toUpperCase();
    const minimumInput = body.minimumPrice == null || body.minimumPrice === '' ? null : body.minimumPrice;
    if (!validCurrency(currency)) return json(400, { error: 'Catalog currency is invalid.' });
      if (minimumInput != null) {
      try { calculateQuote({ items: [{ qty: '1', cost: '0', price: minimumInput, tax: '0' }], discount: 0 }); }
      catch (error) { return json(400, { error: error.message }); }
      try { calculateQuote({ items: [{ qty: '1', cost: '0', price: priceInput, tax: '0' }, { qty: '1', cost: '0', price: minimumInput, tax: '0' }], discount: 0 }); }
      catch (error) { return json(400, { error: error.message }); }
      if (amountScaled(minimumInput) > amountScaled(priceInput)) return json(400, { error: 'Minimum price cannot exceed the selling price.' });
    }
    const minimumPrice = minimumInput == null ? null : Number(minimumInput);
    if (minimumPrice != null && amountScaled(priceInput) < amountScaled(minimumInput)) return json(400, { error: 'Selling price cannot be below the minimum price.' });
    const data = { name, sku: String(body.sku || '').slice(0, 80) || null, description: String(body.description || '').slice(0, 2000) || null, category: String(body.category || '').slice(0, 100) || null, unit: String(body.unit || 'each').slice(0, 40), cost: cost.toFixed(4), sellingPrice: price.toFixed(4), minimumPrice: minimumPrice?.toFixed(4) ?? null, taxRate: tax.toFixed(4), currency, active: body.active !== false };
    let item;
    if (body.id) {
      const current = await prisma.catalogItem.findFirst({ where: { id: String(body.id), organizationId: organization.id, deletedAt: null } });
      if (!current) return json(404, { error: 'Catalog item not found in this organization.' });
      item = await prisma.catalogItem.update({ where: { id: current.id }, data });
    } else item = await prisma.catalogItem.create({ data: { organizationId: organization.id, ...data } });
    return json(201, { item: { ...item, cost: Number(item.cost), price: Number(item.sellingPrice), tax: Number(item.taxRate) } });
  }
  if (path === '/rfqs' && method === 'GET') return json(200, { items: await prisma.rFQ.findMany({ where: { organizationId: organization.id, deletedAt: null }, include: { items: true }, orderBy: { createdAt: 'desc' } }) });
  if (path === '/rfqs' && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    const title = String(body.title || '').trim(), customerId = String(body.customerId || '');
    if (!title || title.length > 200) return json(400, { error: 'RFQ title is required.' });
    const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId: organization.id, deletedAt: null } });
    if (!customer) return json(404, { error: 'Customer not found in this organization.' });
    const statuses = { New: 'NEW', Reviewing: 'REVIEWING', Pricing: 'PRICING', Quoted: 'QUOTED', Won: 'WON', Lost: 'LOST', Expired: 'EXPIRED', Cancelled: 'CANCELLED' };
    const data = { title, customerId, deadline: body.deadline ? new Date(`${body.deadline}T23:59:59.999Z`) : null, priority: ['Normal', 'High', 'Urgent'].includes(body.priority) ? body.priority : 'Normal', status: statuses[body.status] || 'NEW', source: String(body.source || 'Manual').slice(0, 100), notes: String(body.notes || '').slice(0, 10000) || null };
    if (body.id && !body.sourceQuoteId) {
      const prior = await prisma.rFQ.findFirst({ where: { id: String(body.id), organizationId: organization.id, deletedAt: null } });
      if (!prior) return json(404, { error: 'RFQ not found in this organization.' });
      const item = await prisma.rFQ.update({ where: { id: prior.id }, data });
      return json(200, { item });
    }
    const rawItems = Array.isArray(body.items) ? body.items.slice(0, 200).filter(line => String(line.name || line.description || '').trim() && Number.isFinite(Number(line.quantity ?? line.qty)) && Number(line.quantity ?? line.qty) > 0) : [];
    const catalogIds = [...new Set(rawItems.map(line => String(line.catalogItemId || '')).filter(Boolean))];
    const validCatalog = catalogIds.length ? await prisma.catalogItem.findMany({ where: { id: { in: catalogIds }, organizationId: organization.id, active: true, deletedAt: null }, select: { id: true } }) : [];
    if (validCatalog.length !== catalogIds.length) return json(400, { error: 'An RFQ catalog suggestion is not available in this organization.' });
    const items = rawItems.map(line => ({ catalogItemId: line.catalogItemId || null, description: String(line.name || line.description).trim().slice(0, 500), quantity: Number(line.quantity ?? line.qty).toFixed(4), unit: String(line.unit || '').slice(0, 40) || null, notes: String(line.description || line.notes || '').slice(0, 500) || null, sourceText: String(line.sourceText || '').slice(0, 1000) || null, confidence: line.confidence == null || !Number.isFinite(Number(line.confidence)) ? null : Math.max(0, Math.min(1, Number(line.confidence))).toFixed(4) }));
    const item = await prisma.rFQ.create({ data: { ...data, organizationId: organization.id, number: `RFQ-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`, items: { create: items } }, include: { items: true } });
    return json(201, { item });
  }
  if (path === '/followups' && method === 'GET') return json(200, { items: await prisma.followUp.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { dueAt: 'asc' } }) });
  if (path === '/followups' && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    const quoteId = String(body.quoteId || ''), task = String(body.task || body.title || '').trim(), due = String(body.due || '');
    const quote = await prisma.quote.findFirst({ where: { id: quoteId, organizationId: organization.id, deletedAt: null } });
    if (!quote) return json(404, { error: 'Quote not found in this organization.' });
    const dueAt = new Date(`${due}T12:00:00Z`);
    if (!task || task.length > 500 || !Number.isFinite(dueAt.getTime())) return json(400, { error: 'Follow-up task and due date are required.' });
    if (body.id) {
      const prior = await prisma.followUp.findFirst({ where: { id: String(body.id), organizationId: organization.id, deletedAt: null } });
      if (!prior) return json(404, { error: 'Follow-up not found.' });
      const status = body.status === 'Completed' ? 'COMPLETED' : body.status === 'Snoozed' ? 'SNOOZED' : 'PENDING';
      const item = await prisma.followUp.update({ where: { id: prior.id }, data: { task, dueAt, notes: String(body.note || body.notes || '').slice(0, 2000) || null, status, completedAt: status === 'COMPLETED' ? new Date() : null } });
      return json(200, { item: { ...item, title: item.task, due: item.dueAt.toISOString().slice(0, 10), status: item.status === 'COMPLETED' ? 'Completed' : item.status === 'SNOOZED' ? 'Snoozed' : 'Pending' } });
    }
    const item = await prisma.followUp.create({ data: { organizationId: organization.id, quoteId, task, dueAt, notes: String(body.note || body.notes || '').slice(0, 2000) || null } });
    return json(201, { item: { ...item, title: item.task, due: item.dueAt.toISOString().slice(0, 10), status: 'Pending' } });
  }
  if (path === '/settings' && method === 'PUT') {
    const verification = requireVerifiedEmail(user); if (verification) return verification;
    if (!['OWNER', 'ADMIN'].includes(role)) return json(403, { error: 'Only an Owner or Admin may update settings.' });
    const company = String(body.company || organization.name).trim().slice(0, 120);
    const minMargin = Number(body.margin ?? 20);
    if (!Number.isFinite(minMargin) || minMargin < 0 || minMargin > 100) return json(400, { error: 'Minimum margin must be between 0 and 100 percent.' });
    const marginMode = ({ Block: 'BLOCK', 'Approval Required': 'APPROVAL_REQUIRED', WARNING: 'WARNING', BLOCK: 'BLOCK', APPROVAL_REQUIRED: 'APPROVAL_REQUIRED' })[body.marginMode] || 'WARNING';
    const validity = Number(body.validity ?? 30);
    if (!Number.isInteger(validity) || validity < 1 || validity > 365) return json(400, { error: 'Quote validity must be between 1 and 365 days.' });
    const quoteValidityDays = validity;
    const settings = await prisma.companySettings.upsert({ where: { organizationId: organization.id }, create: { organizationId: organization.id, data: { ...body, company, margin: minMargin, marginMode, validity: quoteValidityDays }, marginMode, minMargin: minMargin.toFixed(4), quoteValidityDays }, update: { data: { ...body, company, margin: minMargin, marginMode, validity: quoteValidityDays }, marginMode, minMargin: minMargin.toFixed(4), quoteValidityDays } });
    if (body.currency) await prisma.organization.update({ where: { id: organization.id }, data: { reportingCurrency: String(body.currency).slice(0, 3).toUpperCase() } });
    return json(200, { settings: settings.data });
  }
  if (path === '/analytics' && method === 'GET') {
    const quotes = await prisma.quote.findMany({ where: { organizationId: organization.id, deletedAt: null }, include: { items: true } });
    const byCurrency = {};
    for (const quote of quotes) {
      const currency = quote.currency || organization.reportingCurrency;
      const group = byCurrency[currency] ||= { quotes: 0, quotedValue: 0, wonValue: 0, won: 0, decided: 0, marginTotal: 0 };
      const totals = calculateQuote({ items: quote.items.map(item => ({ qty: Number(item.quantity), cost: Number(item.costSnapshot), price: Number(item.sellingPrice), tax: Number(item.taxRate) })), discount: Number(quote.discount) });
      group.quotes++; group.quotedValue += totals.total; group.marginTotal += totals.margin;
      if (['ACCEPTED'].includes(quote.status)) { group.wonValue += totals.total; group.won++; group.decided++; }
      else if (['REJECTED', 'EXPIRED'].includes(quote.status)) group.decided++;
    }
    for (const group of Object.values(byCurrency)) { group.winRate = group.decided ? group.won / group.decided * 100 : 0; group.averageMargin = group.quotes ? group.marginTotal / group.quotes : 0; }
    return json(200, { reportingCurrency: organization.reportingCurrency, byCurrency });
  }
  if (path === '/team' && method === 'GET') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'Team access is not permitted.' });
    const members = await prisma.membership.findMany({ where: { organizationId: organization.id }, include: { user: { select: { email: true } } }, orderBy: { createdAt: 'asc' } });
    return json(200, { members: members.map(member => ({ userId: member.userId, email: member.user.email, role: member.role, createdAt: member.createdAt })) });
  }
  if (path === '/team/invite' && method === 'POST') {
    const verification = requireVerifiedEmail(user); if (verification) return verification;
    const limited = await throttle('team-invite', `${requestIp}:${organization.id}`, 10, 3600); if (limited) return limited;
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'Team access is not permitted.' });
    const email = String(body.email || '').trim().toLowerCase();
    const requestedRole = String(body.role || 'SALES_REP').toUpperCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return json(400, { error: 'Enter a valid email address.' });
    if (!['ADMIN', 'SALES_MANAGER', 'SALES_REP', 'VIEWER'].includes(requestedRole)) return json(400, { error: 'Choose an assignable team role.' });
    if (requestedRole === 'ADMIN' && role !== 'OWNER') return json(403, { error: 'Only an Owner may invite an Admin.' });
    const [subscription, memberCount] = await Promise.all([prisma.subscription.findUnique({ where: { organizationId: organization.id } }), prisma.membership.count({ where: { organizationId: organization.id } })]);
    if (memberCount >= entitlementsFor(subscription, { teamMembers: memberCount }).limits.teamMembers) return json(402, { error: 'Your plan team-member limit has been reached.' });
    const emailProvider = makeEmail(config);
    if (!emailProvider) return json(503, { error: 'Email delivery must be configured before sending an invitation.' });
    const existing = await prisma.membership.findFirst({ where: { organizationId: organization.id, user: { email } } });
    if (existing) return json(409, { error: 'This person is already a member of the organization.' });
    const pending = await prisma.invitation.findFirst({ where: { organizationId: organization.id, email, acceptedAt: null, expiresAt: { gt: new Date() } } });
    if (pending) return json(409, { error: 'A current invitation already exists for this email.' });
    const token = randomBytes(32).toString('base64url');
    const invitation = await prisma.invitation.create({ data: { organizationId: organization.id, email, role: requestedRole, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 864e5), invitedById: user.id } });
    try {
      await emailProvider.send({ to: email, subject: `Invitation to ${organization.name} on QuoteFlow`, text: `You have been invited to join ${organization.name} as ${requestedRole}. Sign in or create a QuoteFlow account using ${email}, then accept the invitation here: ${config.appUrl}/team/accept?token=${encodeURIComponent(token)}. This link expires in seven days.` });
    } catch (error) {
      await prisma.invitation.delete({ where: { id: invitation.id } });
      console.error('team_invitation_email_failed', { organizationId: organization.id, message: error.message });
      return json(502, { error: 'The invitation email could not be sent. No invitation was retained.' });
    }
    return json(201, { invitation: { email, role: requestedRole, expiresAt: invitation.expiresAt } });
  }
  if (path === '/team/accept' && method === 'POST') {
    const limited = await throttle('team-invitation-accept', requestIp, 20, 3600); if (limited) return limited;
    const token = String(body.token || '').slice(0, 200);
    const invitation = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { organization: true } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return json(400, { error: 'Invitation is invalid, expired or already accepted.' });
    if (invitation.email !== user.email) return json(403, { error: 'Sign in with the email address that received this invitation.' });
    const existingMembership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } } });
    if (existingMembership) return json(409, { error: 'You are already a member of this organization.' });
    try {
      await prisma.$transaction(async tx => {
        const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
        if (!claimed.count) throw new Error('INVITATION_CLAIMED');
        await tx.membership.create({ data: { userId: user.id, organizationId: invitation.organizationId, role: invitation.role } });
        await tx.auditLog.create({ data: { organizationId: invitation.organizationId, actorUserId: user.id, action: 'team.invitation.accepted', objectType: 'Invitation', objectId: invitation.id } });
        await tx.session.update({ where: { id: principal.session.id }, data: { organizationId: invitation.organizationId } });
      });
    } catch (error) {
      if (error.message === 'INVITATION_CLAIMED') return json(409, { error: 'This invitation was already accepted.' });
      throw error;
    }
    return json(200, { organization: { id: invitation.organization.id, name: invitation.organization.name }, role: invitation.role });
  }
  if (path === '/team/transfer-ownership' && method === 'POST') {
    const verification = requireVerifiedEmail(user); if (verification) return verification;
    const limited = await throttle('team-ownership-transfer', `${requestIp}:${organization.id}`, 5, 3600); if (limited) return limited;
    if (role !== 'OWNER') return json(403, { error: 'Only the current Owner may transfer ownership.' });
    const targetUserId = String(body.targetUserId || '').trim();
    if (!targetUserId || targetUserId === user.id || body.confirm !== 'TRANSFER') return json(400, { error: 'Choose another current team member and enter the transfer confirmation.' });
    if (!await passwordMatches(user, body.currentPassword)) return json(401, { error: 'Current password is incorrect.' });
    const target = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: targetUserId, organizationId: organization.id } } });
    if (!target) return json(404, { error: 'The new Owner must already belong to this organization.' });
    if (target.role === 'OWNER') return json(409, { error: 'That team member is already the Owner.' });
    try {
      await prisma.$transaction(async tx => {
        const current = await tx.membership.updateMany({ where: { userId: user.id, organizationId: organization.id, role: 'OWNER' }, data: { role: 'ADMIN' } });
        if (current.count !== 1) throw new Error('OWNERSHIP_CHANGED');
        await tx.membership.update({ where: { userId_organizationId: { userId: targetUserId, organizationId: organization.id } }, data: { role: 'OWNER' } });
        await tx.session.deleteMany({ where: { organizationId: organization.id, userId: { in: [user.id, targetUserId] }, id: { not: principal.session.id } } });
        await tx.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'organization.ownership_transferred', objectType: 'User', objectId: targetUserId, metadata: { previousOwnerUserId: user.id, previousTargetRole: target.role } } });
      });
    } catch (error) {
      if (error.message === 'OWNERSHIP_CHANGED') return json(409, { error: 'Organization ownership changed. Refresh and try again.' });
      throw error;
    }
    return json(200, { transferred: true, ownerUserId: targetUserId, previousOwnerRole: 'ADMIN' });
  }
  const memberMatch = /^\/team\/([^/]+)$/.exec(path);
  if (memberMatch && ['PATCH', 'DELETE'].includes(method)) {
    if (!['OWNER', 'ADMIN'].includes(role)) return json(403, { error: 'Only an Owner or Admin may change team membership.' });
    const target = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: memberMatch[1], organizationId: organization.id } } });
    if (!target) return json(404, { error: 'Team member not found.' });
    if (target.role === 'OWNER') return json(409, { error: 'Organization ownership must be transferred before changing or removing the Owner.' });
    if (role !== 'OWNER' && target.role === 'ADMIN') return json(403, { error: 'Only the Owner may change or remove an Admin.' });
    if (method === 'DELETE') {
      await prisma.$transaction(async tx => { await tx.membership.delete({ where: { userId_organizationId: { userId: target.userId, organizationId: organization.id } } }); await tx.session.deleteMany({ where: { userId: target.userId, organizationId: organization.id } }); await tx.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'team.member_removed', objectType: 'User', objectId: target.userId, metadata: { previousRole: target.role } } }); });
      return json(200, { removed: true });
    }
    const requestedRole = String(body.role || '').toUpperCase();
    if (!['ADMIN', 'SALES_MANAGER', 'SALES_REP', 'VIEWER'].includes(requestedRole)) return json(400, { error: 'Choose a valid role.' });
    if (requestedRole === 'ADMIN' && role !== 'OWNER') return json(403, { error: 'Only the Owner may assign an Admin.' });
    const updated = await prisma.$transaction(async tx => { const membership = await tx.membership.update({ where: { userId_organizationId: { userId: target.userId, organizationId: organization.id } }, data: { role: requestedRole } }); await tx.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'team.role_changed', objectType: 'User', objectId: target.userId, metadata: { from: target.role, to: requestedRole } } }); return membership; });
    return json(200, { member: { userId: updated.userId, role: updated.role } });
  }
  if (path === '/quotes' && method === 'GET') {
    const items = await prisma.quote.findMany({ where: { organizationId: organization.id, deletedAt: null }, include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } });
    return json(200, { items: items.map(quoteDTO) });
  }
  if (path === '/quotes' && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    if (body.sourceQuoteId && body.id) return json(400, { error: 'A revision must create a separate quote record.' });
    const title = String(body.title || '').trim(), customerId = String(body.customerId || ''), requested = Array.isArray(body.items) ? body.items : [];
    if (!title || title.length > 200 || !customerId || !requested.length || requested.length > 200) return json(400, { error: 'Quote title, customer and at least one line are required.' });
    if (body.sourceQuoteId && !body.currency) {
      const source = await prisma.quote.findFirst({ where: { id: String(body.sourceQuoteId), organizationId: organization.id, deletedAt: null }, select: { currency: true } });
      if (!source) return json(404, { error: 'Source quote not found in this organization.' });
      body.currency = source.currency;
    }
    const currency = String(body.currency || organization.reportingCurrency).trim().toUpperCase();
    if (!validCurrency(currency)) return json(400, { error: 'Quote currency is invalid.' });
    const catalogIds = [...new Set(requested.map(line => String(line?.catalogItemId || '').trim()).filter(Boolean))];
    const [customer, rfq, catalog] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, organizationId: organization.id, deletedAt: null } }),
      body.rfqId ? prisma.rFQ.findFirst({ where: { id: String(body.rfqId), organizationId: organization.id, deletedAt: null } }) : Promise.resolve(null),
      catalogIds.length ? prisma.catalogItem.findMany({ where: { organizationId: organization.id, id: { in: catalogIds }, active: true, deletedAt: null } }) : Promise.resolve([])
    ]);
    if (!customer) return json(404, { error: 'Customer not found in this organization.' });
    if (body.rfqId && !rfq) return json(404, { error: 'RFQ not found in this organization.' });
    let prior = null;
    if (body.sourceQuoteId) {
      const sourceQuote = await prisma.quote.findFirst({ where: { id: String(body.sourceQuoteId), organizationId: organization.id, deletedAt: null } });
      if (!sourceQuote) return json(404, { error: 'Source quote not found in this organization.' });
      if (sourceQuote.currency !== currency) return json(400, { error: 'A duplicate must retain the source quote currency.' });
      if (customerId !== sourceQuote.customerId) return json(400, { error: 'A duplicate must retain the source quote customer.' });
      if (!body.rfqId && sourceQuote.rfqId) body.rfqId = sourceQuote.rfqId;
      if (!body.expiry) body.expiry = new Date(Date.now() + Number((await prisma.companySettings.findUnique({ where: { organizationId: organization.id } }))?.quoteValidityDays || 30) * 864e5).toISOString().slice(0, 10);
    }
    if (body.id && !body.sourceQuoteId) {
      prior = await prisma.quote.findFirst({ where: { id: String(body.id), organizationId: organization.id, deletedAt: null }, include: { items: true } });
      if (!prior) return json(404, { error: 'Quote not found in this organization.' });
      if (!body.sourceQuoteId && !['DRAFT', 'INTERNAL_REVIEW'].includes(prior.status)) return json(409, { error: 'Sent quotes are immutable. Create a new revision instead.' });
      if (!body.sourceQuoteId && body.version != null && Number(body.version) !== prior.version) return json(409, { error: 'This quote changed since you opened it. Reload and review the latest version.' });
      if (role === 'SALES_REP' && prior.items.some(item => item.catalogItemId) && requested.some(line => !line.catalogItemId)) return json(403, { error: 'A Sales Representative cannot replace catalog lines with manually priced lines.' });
      const priorItems = new Map(prior.items.map(item => [item.id, item]));
      for (const line of requested) if (!body.sourceQuoteId && line.id) {
        const original = priorItems.get(String(line.id));
        if (!original) return json(400, { error: 'A quote line does not belong to this draft.' });
        if (original.catalogItemId && line.catalogItemId !== original.catalogItemId) return json(403, { error: 'A catalog-backed line cannot be converted to a manual line.' });
      }
    }
    let lines;
    try {
      lines = normalizeQuoteLines(requested, catalog, currency, { enforceMinimum: role !== 'SALES_REP' });
    } catch (error) { return json(400, { error: error.message || 'Quote line values are invalid.' }); }
    let totals;
    try { totals = calculateQuote({ items: lines, discount: body.discount ?? 0 }); }
    catch (error) { return json(400, { error: error.message }); }
    const settings = await prisma.companySettings.findUnique({ where: { organizationId: organization.id } });
    const minimumMargin = Number(settings?.minMargin ?? settings?.data?.margin ?? 20);
    const marginMode = settings?.marginMode || settings?.data?.marginMode || 'WARNING';
    const belowMinimumPrice = lines.some(line => line.minimumPrice != null && amountScaled(line.price) < amountScaled(line.minimumPrice));
    const policy = evaluateQuotePolicy({ margin: totals.margin, minimumMargin, marginMode, belowMinimumPrice, allowMinimumOverride: role === 'SALES_REP' });
    if (policy.blockedReason) return json(409, { error: policy.blockedReason });
    const requiresApproval = policy.requiresApproval;
    const status = requiresApproval ? 'INTERNAL_REVIEW' : 'DRAFT';
    const expiryDate = body.expiry ? new Date(`${body.expiry}T23:59:59.999Z`) : null;
    if (expiryDate && !Number.isFinite(expiryDate.getTime())) return json(400, { error: 'Quote expiry date is invalid.' });
    if (body.id && !body.sourceQuoteId) {
      const changed = await prisma.$transaction(async tx => {
        const result = await tx.quote.updateMany({ where: { id: prior.id, organizationId: organization.id, status: prior.status, version: prior.version }, data: { title, customerId, rfqId: rfq?.id || null, currency, discount: Number(body.discount || 0).toFixed(4), expiryDate, paymentTerms: String(body.paymentTerms || body.payment || '').slice(0, 500) || null, deliveryTerms: String(body.deliveryTerms || body.delivery || '').slice(0, 500) || null, customerNotes: String(body.customerNotes || body.notes || '').slice(0, 2000) || null, status, version: { increment: 1 } } });
        if (!result.count) return false;
        await tx.quoteItem.deleteMany({ where: { quoteId: prior.id } });
        await tx.quoteItem.createMany({ data: lines.map(line => ({ quoteId: prior.id, ...quoteItemData(line) })) });
        if (prior.status === 'INTERNAL_REVIEW' || requiresApproval) {
          await tx.quoteApproval.deleteMany({ where: { quoteId: prior.id } });
          await tx.quoteEvent.create({ data: { quoteId: prior.id, type: 'APPROVAL_INVALIDATED', actorUserId: user.id, metadata: { reason: 'financial-edit' } } });
        }
        if (requiresApproval) await tx.quoteApproval.deleteMany({ where: { quoteId: prior.id } });
        await tx.quoteEvent.create({ data: { quoteId: prior.id, type: 'DRAFT_REVISED', actorUserId: user.id } });
        return tx.quote.findUnique({ where: { id: prior.id }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
      });
      if (!changed) return json(409, { error: 'This quote changed while you were saving. Reload and review the latest version.' });
      return json(200, { item: quoteDTO(changed), totals, warning: policy.warning });
    }
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [subscription, quoteCount] = await Promise.all([prisma.subscription.findUnique({ where: { organizationId: organization.id } }), prisma.quote.count({ where: { organizationId: organization.id, createdAt: { gte: monthStart }, deletedAt: null } })]);
    if (quoteCount >= entitlementsFor(subscription, { quotesThisMonth: quoteCount }).limits.quotesPerMonth) return json(402, { error: 'Your plan monthly quotation limit has been reached.' });
    const quote = await prisma.$transaction(async tx => {
      const counter = await tx.companySettings.update({ where: { organizationId: organization.id }, data: { quoteCounter: { increment: 1 } } });
      const number = `Q-${new Date().getUTCFullYear()}-${String(counter.quoteCounter).padStart(5, '0')}`;
      const created = await tx.quote.create({ data: { organizationId: organization.id, createdById: user.id, sourceQuoteId: body.sourceQuoteId || null, number, customerId, rfqId: rfq?.id || null, title, status, currency, discount: Number(body.discount || 0).toFixed(4), expiryDate, paymentTerms: String(body.paymentTerms || body.payment || '').slice(0, 500) || null, deliveryTerms: String(body.deliveryTerms || body.delivery || '').slice(0, 500) || null, customerNotes: String(body.customerNotes || body.notes || '').slice(0, 2000) || null, version: 1, items: { create: lines.map(line => ({ ...quoteItemData(line) })) } }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
      await tx.quoteEvent.create({ data: { quoteId: created.id, type: 'CREATED', actorUserId: user.id } });
      await tx.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'quote.created', objectType: 'Quote', objectId: created.id } });
      return created;
    });
    return json(201, { item: quoteDTO(quote), totals, warning: policy.warning });
  }
  const approveMatch = /^\/quotes\/([^/]+)\/approve$/.exec(path);
  if (approveMatch && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'Only an Owner, Admin or Sales Manager may approve a quote.' });
    const quote = await prisma.quote.findFirst({ where: { id: approveMatch[1], organizationId: organization.id, deletedAt: null }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    if (!quote || !['DRAFT', 'INTERNAL_REVIEW'].includes(quote.status)) return json(409, { error: 'Only an editable quote can be approved.' });
    if (quote.createdById === user.id && role === 'SALES_MANAGER') return json(403, { error: 'A salesperson cannot self-approve this quote.' });
    if (quote.createdById === user.id && ['OWNER', 'ADMIN'].includes(role)) return json(403, { error: 'The quote creator cannot approve their own quote.' });
    const financialHash = financialFingerprint(quote);
    const approval = await prisma.$transaction(async tx => {
      const created = await tx.quoteApproval.create({ data: { quoteId: quote.id, quoteVersion: quote.version, approverUserId: user.id, financialHash } });
      await tx.quoteEvent.create({ data: { quoteId: quote.id, type: 'APPROVED', actorUserId: user.id, metadata: { version: quote.version, financialHash } } });
      await tx.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'quote.approved', objectType: 'Quote', objectId: quote.id, metadata: { version: quote.version, financialHash } } });
      return created;
    });
    return json(200, { approved: true, version: quote.version, approvedAt: approval.createdAt });
  }
  const sendMatch = /^\/quotes\/([^/]+)\/send$/.exec(path);
  if (sendMatch && method === 'POST') {
    const verification = requireVerifiedEmail(user); if (verification) return verification;
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    const quote = await prisma.quote.findFirst({ where: { id: sendMatch[1], organizationId: organization.id, deletedAt: null }, include: { customer: true, items: { orderBy: { sortOrder: 'asc' } }, organization: { include: { settings: true } } } });
    if (!quote) return json(404, { error: 'Quote not found.' });
    const requestKey = String(event.headers['idempotency-key'] || body.idempotencyKey || '').trim().slice(0, 120);
    if (quote.status === 'SENT' && requestKey && quote.sendAttemptKey === requestKey) return json(200, { status: 'SENT', publicUrl: null, duplicate: true });
    if (quote.status === 'SENDING' || quote.sendAttemptState === 'AMBIGUOUS') return json(409, { error: 'A send attempt is already in progress or has an uncertain provider outcome. Check delivery before retrying.' });
    if (!['DRAFT', 'INTERNAL_REVIEW'].includes(quote.status)) return json(409, { error: 'Only an editable quote can be sent.' });
    if (quote.status === 'INTERNAL_REVIEW' && !['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'A manager must approve this quote before sending.' });
    const currentFinancialHash = financialFingerprint(quote);
    const calculatedSendTotals = calculateQuote({ items: quote.items.map(item => ({ qty: Number(item.quantity), cost: Number(item.costSnapshot), price: Number(item.sellingPrice), tax: Number(item.taxRate) })), discount: Number(quote.discount) });
    const settings = quote.organization.settings;
    const sendPolicy = evaluateQuotePolicy({
      margin: calculatedSendTotals.margin,
      minimumMargin: Number(settings?.minMargin ?? settings?.data?.margin ?? 20),
      marginMode: settings?.marginMode || settings?.data?.marginMode || 'WARNING',
      belowMinimumPrice: quote.items.some(item => item.minimumPriceSnapshot != null && amountScaled(item.sellingPrice) < amountScaled(item.minimumPriceSnapshot)),
      // A below-catalog-minimum quote can only exist after an authorized
      // approval-required save. Never let a changed WARNING policy waive it.
      allowMinimumOverride: true
    });
    if (sendPolicy.blockedReason) return json(409, { error: sendPolicy.blockedReason });
    const requiresApproval = sendPolicy.requiresApproval || quote.status === 'INTERNAL_REVIEW';
    if (requiresApproval) {
      const approval = await prisma.quoteApproval.findFirst({ where: { quoteId: quote.id, quoteVersion: quote.version, financialHash: currentFinancialHash }, orderBy: { createdAt: 'desc' } });
      if (!approval) return json(409, { error: 'This quote requires a current manager approval before it can be sent.' });
    }
    if (!quote.customer.email) return json(400, { error: 'The customer does not have an email address.' });
    const emailProvider = makeEmail(config);
    if (!emailProvider) return json(503, { error: 'Email delivery is not configured; the quote was not marked as sent.' });
    const token = randomBytes(32).toString('base64url');
    const lines = quote.items.map(item => ({ catalogItemId: item.catalogItemId, name: item.nameSnapshot, sku: item.skuSnapshot, description: item.descriptionSnapshot, qty: Number(item.quantity), unit: item.unitSnapshot, price: Number(item.sellingPrice), tax: Number(item.taxRate) }));
    const totals = calculateQuote({ items: quote.items.map(item => ({ qty: Number(item.quantity), cost: Number(item.costSnapshot), price: Number(item.sellingPrice), tax: Number(item.taxRate) })), discount: Number(quote.discount) });
    const company = quote.organization.settings?.data || {};
    const snapshot = { version: quote.version, items: lines, totals: { subtotal: totals.gross, discount: totals.discount, netSubtotal: totals.subtotal, tax: totals.tax, total: totals.total, currency: quote.currency }, customer: { name: quote.customer.companyName, contact: quote.customer.contactName, email: quote.customer.email }, company: { name: company.company || quote.organization.name, address: company.address || '', email: company.email || '', phone: company.phone || '' }, terms: { payment: quote.paymentTerms || '', delivery: quote.deliveryTerms || '', notes: quote.customerNotes || '' } };
    const expiryAt = quote.expiryDate || new Date(Date.now() + 30 * 864e5);
    if (expiryAt <= new Date()) return json(409, { error: 'An expired quote cannot be sent.' });
    const url = `${config.appUrl}/q/${token}`;
    const effectiveRequestKey = requestKey || randomBytes(16).toString('hex');
    // Reserve the exact snapshot and token hash before giving the URL to the provider.
    // The raw bearer token exists only in this invocation and the outbound message.
    const reserved = await prisma.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: quote.status, version: quote.version }, data: { status: 'SENDING', sendAttemptKey: effectiveRequestKey, sendAttemptState: 'SENDING', sendAttemptAt: new Date(), snapshot, publicTokenHash: sha256(token), publicTokenExpiresAt: expiryAt } });
    if (!reserved.count) return json(409, { error: 'The quote changed while delivery was being prepared.' });
    let delivery;
    try { delivery = await emailProvider.send({ to: quote.customer.email, subject: `Quotation ${quote.number} — ${quote.title}`, text: `Your quotation ${quote.number} is ready. View it securely: ${url}\n\nThis link expires ${expiryAt.toISOString().slice(0, 10)}.` }); }
    catch (error) {
      const ambiguous = Boolean(error?.ambiguous || error?.name === 'AbortError' || error?.code === 'ETIMEDOUT');
      await prisma.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: 'SENDING', sendAttemptKey: effectiveRequestKey }, data: ambiguous ? { sendAttemptState: 'AMBIGUOUS' } : { status: quote.status, sendAttemptState: 'FAILED', snapshot: quote.snapshot, publicTokenHash: null, publicTokenExpiresAt: null } }).catch(() => {});
      console.error('quote_email_failed', { organizationId: organization.id, quoteId: quote.id, message: error.message });
      return json(502, { error: 'The quote could not be emailed. It remains in its current status.' });
    }
    const changed = await prisma.$transaction(async tx => {
      const result = await tx.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: 'SENDING', sendAttemptKey: effectiveRequestKey }, data: { status: 'SENT', sendAttemptState: 'SENT', sentAt: new Date() } });
      if (!result.count) throw new Error('Quote state changed during delivery.');
      await tx.quoteEvent.create({ data: { quoteId: quote.id, type: 'SENT', actorUserId: user.id, metadata: delivery?.id ? { providerMessageId: String(delivery.id).slice(0, 200) } : undefined } });
      return result.count;
    }).catch(() => 0);
    if (!changed) {
      await prisma.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: 'SENDING', sendAttemptKey: effectiveRequestKey }, data: { sendAttemptState: 'AMBIGUOUS' } }).catch(() => {});
      return json(409, { error: 'Email may have been accepted, but final state could not be confirmed. The send is blocked from retry to prevent duplicates; verify delivery.' });
    }
    return json(200, { status: 'SENT', publicUrl: url });
  }
  const renewLinkMatch = /^\/quotes\/([^/]+)\/share-link$/.exec(path);
  if (renewLinkMatch && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    const quote = await prisma.quote.findFirst({ where: { id: renewLinkMatch[1], organizationId: organization.id, deletedAt: null }, include: { customer: true } });
    if (!quote || !['SENT', 'VIEWED'].includes(quote.status)) return json(409, { error: 'Only a sent quote can receive a replacement customer link.' });
    if (quote.expiryDate && quote.expiryDate <= new Date()) return json(409, { error: 'An expired quote cannot receive a new customer link.' });
    const token = randomBytes(32).toString('base64url'), publicUrl = `${config.appUrl}/q/${token}`;
    const expiryAt = quote.expiryDate || new Date(Date.now() + 30 * 864e5);
    const updated = await prisma.$transaction(async tx => {
      const result = await tx.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: quote.status, version: quote.version }, data: { publicTokenHash: sha256(token), publicTokenExpiresAt: expiryAt } });
      if (!result.count) return false;
      await tx.quoteEvent.create({ data: { quoteId: quote.id, type: 'PUBLIC_LINK_REISSUED', actorUserId: user.id } });
      return true;
    });
    if (!updated) return json(409, { error: 'A concurrent quote update prevented link replacement. Check the quote before retrying.' });
    const emailProvider = makeEmail(config);
    if (emailProvider && quote.customer.email) {
      try { await emailProvider.send({ to: quote.customer.email, subject: `Updated secure link for quotation ${quote.number}`, text: `Open your quotation ${quote.number}: ${publicUrl}\n\nThis link expires ${expiryAt.toISOString().slice(0, 10)}. The previous link has been replaced.` }); }
      catch (error) { console.error('quote_link_email_failed', { organizationId: organization.id, quoteId: quote.id, message: error.message }); }
    }
    return json(200, { publicUrl });
  }
  const revokeLinkMatch = /^\/quotes\/([^/]+)\/share-link$/.exec(path);
  if (revokeLinkMatch && method === 'DELETE') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'Only managers and administrators may revoke a customer link.' });
    const quote = await prisma.quote.findFirst({ where: { id: revokeLinkMatch[1], organizationId: organization.id, deletedAt: null }, select: { id: true, status: true, version: true, publicTokenHash: true } });
    if (!quote || !['SENT', 'VIEWED'].includes(quote.status) || !quote.publicTokenHash) return json(404, { error: 'An active customer link was not found.' });
    const revoked = await prisma.$transaction(async tx => {
      const result = await tx.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: quote.status, version: quote.version, publicTokenHash: quote.publicTokenHash }, data: { publicTokenHash: null, publicTokenExpiresAt: null } });
      if (!result.count) return false;
      await tx.quoteEvent.create({ data: { quoteId: quote.id, type: 'PUBLIC_LINK_REVOKED', actorUserId: user.id } });
      return true;
    });
    return revoked ? json(200, { status: 'REVOKED' }) : json(409, { error: 'The quote changed while the link was being revoked.' });
  }
  if (path === '/ai/extract-rfq' && method === 'POST') {
    if (!config.ai.enabled) return json(503, { error: 'AI is disabled for this deployment.' });
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > config.ai.maxInputChars) return json(400, { error: `RFQ text must contain 1–${config.ai.maxInputChars} characters.` });
    const reservation = await reserveAIUsage(prisma, organization.id, 'extract-rfq', config, event.headers['x-nf-client-connection-ip']);
    if (reservation.limited) return json(reservation.limited === 'rate' ? 429 : 402, { error: reservation.limited === 'rate' ? 'AI request limit reached. Try again shortly.' : 'Your plan AI usage limit has been reached.' }, reservation.limited === 'rate' ? { 'retry-after': '60' } : {});
    const started = Date.now();
    try {
      const catalog = await prisma.catalogItem.findMany({ where: { organizationId: organization.id, active: true, deletedAt: null }, select: { id: true, name: true, sku: true, description: true, unit: true }, take: 500 });
      const provider = makeAI(config);
      const extraction = await provider.extractRFQ(body.text, catalog);
      const allowed = new Map(catalog.map(item => [item.id, item]));
      for (const item of extraction.items) {
        const match = item.matchedCatalogItemId && allowed.get(item.matchedCatalogItemId);
        if (!match) { item.matchedCatalogItemId = null; item.catalogMatch = false; }
        else { item.catalogMatch = true; item.name = item.name || match.name; item.sku = match.sku || ''; item.unit = item.unit || match.unit; }
      }
      await prisma.aiUsage.update({ where: { id: reservation.id }, data: { success: true, ...provider.lastUsage } });
      return json(200, { extraction, reviewRequired: true, label: 'AI-generated — review before using' });
    } catch (error) {
      await prisma.aiUsage.update({ where: { id: reservation.id }, data: { success: false } }).catch(() => {});
      console.error('ai_extract_failed', { organizationId: organization.id, durationMs: Date.now() - started, message: error.message });
      return json(502, { error: 'AI extraction is unavailable. Use fallback extraction or try again.' });
    }
  }
  if (path === '/ai/follow-up' && method === 'POST') {
    if (!config.ai.enabled) return json(503, { error: 'AI is disabled for this deployment.' });
    if (!body.quoteId) return json(400, { error: 'A quote is required.' });
    const quote = await prisma.quote.findFirst({ where: { id: String(body.quoteId), organizationId: organization.id, deletedAt: null }, include: { customer: true, items: { orderBy: { sortOrder: 'asc' } } } });
    if (!quote) return json(404, { error: 'Quote not found.' });
    const reservation = await reserveAIUsage(prisma, organization.id, 'follow-up', config, event.headers['x-nf-client-connection-ip']);
    if (reservation.limited) return json(reservation.limited === 'rate' ? 429 : 402, { error: reservation.limited === 'rate' ? 'AI request limit reached. Try again shortly.' : 'Your plan AI usage limit has been reached.' });
    const safe = { customer: quote.customer.companyName, contact: quote.customer.contactName, quoteNumber: quote.number, title: quote.title, status: quote.status, total: String(quote.snapshot?.totals?.total ?? ''), currency: quote.currency, expiry: quote.expiryDate?.toISOString().slice(0, 10) || '', context: String(body.context || '').slice(0, 1000), tone: String(body.tone || 'professional').slice(0, 40) };
    try {
      const provider = makeAI(config);
      const draft = await provider.draftFollowUp(safe);
      await prisma.aiUsage.update({ where: { id: reservation.id }, data: { success: true, ...provider.lastUsage } });
      return json(200, { draft, label: 'AI-generated — review before using' });
    } catch (error) {
      await prisma.aiUsage.update({ where: { id: reservation.id }, data: { success: false } }).catch(() => {});
      console.error('ai_followup_failed', { organizationId: organization.id, message: error.message });
      return json(502, { error: 'AI follow-up drafting is unavailable.' });
    }
  }
  if (path === '/ai/generate-description' && method === 'POST') {
    if (!config.ai.enabled) return json(503, { error: 'AI is disabled for this deployment.' });
    const description = String(body.description || '').slice(0, 2000);
    if (!description.trim()) return json(400, { error: 'Provide an existing description to improve.' });
    const reservation = await reserveAIUsage(prisma, organization.id, 'generate-description', config, event.headers['x-nf-client-connection-ip']);
    if (reservation.limited) return json(reservation.limited === 'rate' ? 429 : 402, { error: reservation.limited === 'rate' ? 'AI request limit reached. Try again shortly.' : 'Your plan AI usage limit has been reached.' });
    try {
      const provider = makeAI(config);
      const result = await provider.generateDescription({ name: String(body.name || '').slice(0, 240), description, category: String(body.category || '').slice(0, 100) });
      await prisma.aiUsage.update({ where: { id: reservation.id }, data: { success: true, ...provider.lastUsage } });
      return json(200, { ...result, label: 'AI-generated — review before using' });
    } catch (error) {
      await prisma.aiUsage.update({ where: { id: reservation.id }, data: { success: false } }).catch(() => {});
      console.error('ai_description_failed', { organizationId: organization.id, message: error.message });
      return json(502, { error: 'AI description generation is unavailable.' });
    }
  }
  if (path === '/ai/summarize-quote' && method === 'POST') {
    if (!config.ai.enabled) return json(503, { error: 'AI is disabled for this deployment.' });
    if (!body.quoteId) return json(400, { error: 'A quote is required.' });
    const quote = await prisma.quote.findFirst({ where: { id: String(body.quoteId), organizationId: organization.id, deletedAt: null }, include: { customer: true, items: { orderBy: { sortOrder: 'asc' } } } });
    if (!quote) return json(404, { error: 'Quote not found.' });
    const reservation = await reserveAIUsage(prisma, organization.id, 'summarize-quote', config, event.headers['x-nf-client-connection-ip']);
    if (reservation.limited) return json(reservation.limited === 'rate' ? 429 : 402, { error: reservation.limited === 'rate' ? 'AI request limit reached. Try again shortly.' : 'Your plan AI usage limit has been reached.' });
    const safe = { customer: quote.customer.companyName, contact: quote.customer.contactName, quoteNumber: quote.number, title: quote.title, status: quote.status, value: String(quote.snapshot?.totals?.total ?? ''), currency: quote.currency, expiry: quote.expiryDate?.toISOString().slice(0, 10) || '', items: quote.items.map(item => ({ name: item.nameSnapshot, description: item.descriptionSnapshot, quantity: String(item.quantity), unit: item.unitSnapshot })) };
    try {
      const provider = makeAI(config);
      const summary = await provider.summarizeQuote(safe);
      await prisma.aiUsage.update({ where: { id: reservation.id }, data: { success: true, ...provider.lastUsage } });
      return json(200, { ...summary, label: 'AI-generated — review before using' });
    } catch (error) {
      await prisma.aiUsage.update({ where: { id: reservation.id }, data: { success: false } }).catch(() => {});
      console.error('ai_quote_summary_failed', { organizationId: organization.id, message: error.message });
      return json(502, { error: 'AI quote summary is unavailable.' });
    }
  }
  return json(404, { error: 'API route not found.' });
  };
}

const legacyEventAdapter = createHandler();

/** Modern Netlify Functions request/response entry point. */
export default async function netlifyHandler(request, context) {
  const startedAt = Date.now(), requestId = randomBytes(12).toString('hex');
  const url = new URL(request.url);
  const safeLogPath = sanitizedRequestPath(url.pathname);
  const headers = Object.fromEntries(request.headers.entries());
  if (context?.ip) headers['x-nf-client-connection-ip'] = context.ip;
  let body = '';
  if (!['GET', 'HEAD'].includes(request.method)) {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > 1_000_000) return new Response(JSON.stringify({ error: 'Request body is too large.' }), { status: 413, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    body = await request.text();
    if (body.length > 1_000_000) return new Response(JSON.stringify({ error: 'Request body is too large.' }), { status: 413, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  let monitor = null, result;
  try { monitor = createMonitor(readConfig()); } catch {}
  try { result = await legacyEventAdapter({ path: url.pathname, httpMethod: request.method, headers, body }); }
  catch (error) {
    console.error('unhandled_api_error', { requestId, method: request.method, path: safeLogPath, message: error.message });
    if (monitor) await monitor.capture({ event: 'unhandled_api_error', message: error.message, requestId, method: request.method, path: safeLogPath, status: 500 }).catch(() => {});
    result = json(500, { error: 'An unexpected server error occurred.', requestId });
  }
  const responseHeaders = new Headers(result.headers || {});
  responseHeaders.set('x-request-id', requestId);
  for (const cookie of result.multiValueHeaders?.['set-cookie'] || []) responseHeaders.append('set-cookie', cookie);
  console.log(JSON.stringify({ level: 'info', event: 'request_completed', requestId, method: request.method, path: safeLogPath, status: result.statusCode || 200, durationMs: Date.now() - startedAt }));
  if (monitor && (result.statusCode || 200) >= 500) await monitor.capture({ event: 'api_failure', message: 'API request failed', requestId, method: request.method, path: safeLogPath, status: result.statusCode || 500 }).catch(() => {});
  return new Response(result.isBase64Encoded ? Buffer.from(result.body || '', 'base64') : result.body || '', { status: result.statusCode || 200, headers: responseHeaders });
}
