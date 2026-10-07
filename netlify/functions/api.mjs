import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readConfig } from '../../lib/config.mjs';
import { getPrisma } from '../../lib/prisma.mjs';
import { GeminiProvider } from '../../lib/ai-provider.mjs';
import { createEmailProvider } from '../../lib/email-provider.mjs';
import { calculateQuote } from '../../lib/pricing.mjs';

export const config = { path: '/api/*' };
const scrypt = promisify(scryptCallback);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const cookieValue = token => { try { return decodeURIComponent(token); } catch { return ''; } };
const json = (statusCode, body, headers = {}) => {
  const { 'set-cookie': cookies, ...singleHeaders } = headers;
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...singleHeaders }, ...(cookies ? { multiValueHeaders: { 'set-cookie': Array.isArray(cookies) ? cookies : [cookies] } } : {}), body: JSON.stringify(body) };
};
const ai = config => new GeminiProvider({ apiKey: config.ai.apiKey, model: config.ai.model });
const titleStatus = value => ({ DRAFT: 'Draft', INTERNAL_REVIEW: 'Internal Review', SENDING: 'Sending', SENT: 'Sent', VIEWED: 'Viewed', ACCEPTED: 'Accepted', REJECTED: 'Rejected', EXPIRED: 'Expired', NEW: 'New', REVIEWING: 'Reviewing', PRICING: 'Pricing', QUOTED: 'Quoted', WON: 'Won', LOST: 'Lost', CANCELLED: 'Cancelled', PENDING: 'Pending', COMPLETED: 'Completed', SNOOZED: 'Snoozed' })[value] || value;
const quoteDTO = quote => ({ ...quote, created: quote.issueDate?.toISOString().slice(0, 10), expiry: quote.expiryDate?.toISOString().slice(0, 10) || '', payment: quote.paymentTerms, delivery: quote.deliveryTerms, notes: quote.customerNotes, status: titleStatus(quote.status), discount: Number(quote.discount), items: (quote.items || []).map(line => ({ catalogItemId: line.catalogItemId, name: line.nameSnapshot, sku: line.skuSnapshot, description: line.descriptionSnapshot, qty: Number(line.quantity), unit: line.unitSnapshot, cost: Number(line.costSnapshot), price: Number(line.sellingPrice), tax: Number(line.taxRate) })) });

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
      const plan = subscription?.plan || 'FREE';
      if (monthCount >= (config.ai.monthlyLimits[plan] ?? config.ai.monthlyLimits.FREE)) return { limited: 'limit' };
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
  if (!csrf(event, config)) return json(403, { error: 'Request origin could not be verified.' });
  const body = (() => { try { return event.body ? JSON.parse(event.body) : {}; } catch { return null; } })();
  if (body === null) return json(400, { error: 'Request body must be valid JSON.' });

  if (path === '/auth/signup' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase(), password = body.password, organizationName = String(body.organization || '').trim();
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

  const publicQuoteMatch = /^\/public\/quote\/([^/]+)$/.exec(path);
  if (publicQuoteMatch) {
    const quote = await prisma.quote.findFirst({ where: { publicTokenHash: sha256(publicQuoteMatch[1]), deletedAt: null }, include: { items: { orderBy: { sortOrder: 'asc' } }, acceptance: true } });
    if (!quote || !quote.publicTokenExpiresAt || quote.publicTokenExpiresAt <= new Date() || !quote.snapshot) return json(404, { error: 'Quote link is invalid or unavailable.' });
    if (method === 'GET') {
      if (quote.status === 'SENT') {
        const viewed = await prisma.quote.updateMany({ where: { id: quote.id, status: 'SENT', version: quote.version }, data: { status: 'VIEWED', viewedAt: new Date(), version: { increment: 1 } } });
        if (viewed.count) await prisma.quoteEvent.create({ data: { quoteId: quote.id, type: 'VIEWED', metadata: { source: 'customer-portal' } } });
      }
      if (!['SENT', 'VIEWED', 'ACCEPTED', 'REJECTED'].includes(quote.status)) return json(404, { error: 'Quote link is invalid or unavailable.' });
      const snapshot = quote.snapshot;
      return json(200, { quote: { number: quote.number, title: quote.title, status: quote.status === 'SENT' ? 'VIEWED' : quote.status, expiry: quote.expiryDate?.toISOString().slice(0, 10) || '', currency: quote.currency, items: snapshot.items, totals: snapshot.totals, customer: snapshot.customer, company: snapshot.company, terms: snapshot.terms } });
    }
    if (method === 'POST') {
      if (!['accept', 'reject', 'question'].includes(body.action)) return json(400, { error: 'Unsupported response.' });
      if (!['SENT', 'VIEWED'].includes(quote.status)) return json(409, { error: 'This quote already has a final response or is unavailable.' });
      if (body.action === 'question') {
        const message = String(body.message || '').trim().slice(0, 2000);
        if (!message) return json(400, { error: 'Enter a question.' });
        await prisma.quoteEvent.create({ data: { quoteId: quote.id, type: 'CUSTOMER_QUESTION', metadata: { message, name: String(body.name || '').slice(0, 160), email: String(body.email || '').slice(0, 254) } } });
        return json(200, { status: quote.status, message: 'Your question has been recorded.' });
      }
      const name = String(body.name || '').trim().slice(0, 160), email = String(body.email || '').trim().slice(0, 254);
      if (body.action === 'accept' && (!name || !/^\S+@\S+\.\S+$/.test(email) || body.agree !== true)) return json(400, { error: 'Name, valid email and agreement are required.' });
      const finalStatus = body.action === 'accept' ? 'ACCEPTED' : 'REJECTED';
      const result = await prisma.$transaction(async tx => {
        const update = await tx.quote.updateMany({ where: { id: quote.id, status: { in: ['SENT', 'VIEWED'] }, version: quote.version, publicTokenExpiresAt: { gt: new Date() } }, data: { status: finalStatus, ...(finalStatus === 'ACCEPTED' ? { acceptedAt: new Date() } : { rejectedAt: new Date(), rejectionReason: String(body.reason || '').slice(0, 1000) }), version: { increment: 1 } } });
        if (!update.count) return false;
        if (finalStatus === 'ACCEPTED') await tx.quoteAcceptance.create({ data: { quoteId: quote.id, quoteVersion: quote.version, name, email, statement: 'I agree to the quotation and terms.' } });
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
  if (path === '/auth/me' && method === 'GET') {
    const memberships = await prisma.membership.findMany({ where: { userId: user.id }, include: { organization: { select: { id: true, name: true, reportingCurrency: true } } }, orderBy: { createdAt: 'asc' } });
    return json(200, { user: { id: user.id, email: user.email }, organization: { id: organization.id, name: organization.name, currency: organization.reportingCurrency }, role, memberships: memberships.map(m => ({ organizationId: m.organizationId, name: m.organization.name, role: m.role })) });
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
  if (path === '/bootstrap' && method === 'GET') {
    const [settings, customers, catalogItems, rfqs, quotes, followUps] = await Promise.all([
      prisma.companySettings.findUnique({ where: { organizationId: organization.id } }),
      prisma.customer.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
      prisma.catalogItem.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
      prisma.rFQ.findMany({ where: { organizationId: organization.id, deletedAt: null }, include: { items: true }, orderBy: { createdAt: 'desc' } }),
      prisma.quote.findMany({ where: { organizationId: organization.id, deletedAt: null }, include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
      prisma.followUp.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { dueAt: 'asc' } })
    ]);
    const statusLabel = value => ({ DRAFT: 'Draft', INTERNAL_REVIEW: 'Internal Review', SENDING: 'Sending', SENT: 'Sent', VIEWED: 'Viewed', ACCEPTED: 'Accepted', REJECTED: 'Rejected', EXPIRED: 'Expired', NEW: 'New', REVIEWING: 'Reviewing', PRICING: 'Pricing', QUOTED: 'Quoted', WON: 'Won', LOST: 'Lost', CANCELLED: 'Cancelled', PENDING: 'Pending', COMPLETED: 'Completed', SNOOZED: 'Snoozed' })[value] || value;
    return json(200, { user: { id: user.id, email: user.email, role }, organization: { id: organization.id, name: organization.name, currency: organization.reportingCurrency }, settings: settings?.data || {}, customers: customers.map(item => ({ ...item, name: item.companyName, contact: item.contactName })), products: catalogItems.map(item => ({ ...item, price: Number(item.sellingPrice), cost: Number(item.cost), tax: Number(item.taxRate) })), rfqs: rfqs.map(item => ({ ...item, received: item.receivedAt.toISOString().slice(0, 10), deadline: item.deadline?.toISOString().slice(0, 10) || '', status: statusLabel(item.status), items: item.items.map(line => ({ catalogItemId: line.catalogItemId, name: line.description, description: line.notes || '', qty: Number(line.quantity), unit: line.unit, sourceText: line.sourceText, confidence: Number(line.confidence) || 0 })) })), quotes: quotes.map(item => ({ ...item, created: item.issueDate.toISOString().slice(0, 10), expiry: item.expiryDate?.toISOString().slice(0, 10) || '', payment: item.paymentTerms, delivery: item.deliveryTerms, notes: item.customerNotes, status: statusLabel(item.status), discount: Number(item.discount), items: item.items.map(line => ({ catalogItemId: line.catalogItemId, name: line.nameSnapshot, sku: line.skuSnapshot, description: line.descriptionSnapshot, qty: Number(line.quantity), unit: line.unitSnapshot, cost: Number(line.costSnapshot), price: Number(line.sellingPrice), tax: Number(line.taxRate) })) })), followups: followUps.map(item => ({ ...item, title: item.task, due: item.dueAt.toISOString().slice(0, 10), note: item.notes, status: statusLabel(item.status) })), events: [] });
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
  if (path === '/products' && method === 'GET') {
    const items = await prisma.catalogItem.findMany({ where: { organizationId: organization.id, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return json(200, { items: items.map(({ cost, sellingPrice, taxRate, ...item }) => ({ ...item, price: sellingPrice, tax: taxRate })) });
  }
  if (path === '/products' && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'Catalog changes require a manager role.' });
    const name = String(body.name || '').trim(), cost = Number(body.cost), price = Number(body.price ?? body.sellingPrice), tax = Number(body.tax ?? body.taxRate ?? 0);
    if (!name || name.length > 240 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(tax) || tax < 0 || tax > 100) return json(400, { error: 'Catalog item name, cost, price and tax are invalid.' });
    const data = { name, sku: String(body.sku || '').slice(0, 80) || null, description: String(body.description || '').slice(0, 2000) || null, category: String(body.category || '').slice(0, 100) || null, unit: String(body.unit || 'each').slice(0, 40), cost: cost.toFixed(4), sellingPrice: price.toFixed(4), taxRate: tax.toFixed(4), currency: String(body.currency || organization.reportingCurrency).slice(0, 3).toUpperCase() };
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
    if (body.id) {
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
    return json(200, { members: members.map(member => ({ email: member.user.email, role: member.role, createdAt: member.createdAt })) });
  }
  if (path === '/team/invite' && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'Team access is not permitted.' });
    const email = String(body.email || '').trim().toLowerCase();
    const requestedRole = String(body.role || 'SALES_REP').toUpperCase();
    if (!/^\\S+@\\S+\\.\\S+$/.test(email) || email.length > 254) return json(400, { error: 'Enter a valid email address.' });
    if (!['ADMIN', 'SALES_MANAGER', 'SALES_REP', 'VIEWER'].includes(requestedRole)) return json(400, { error: 'Choose an assignable team role.' });
    if (requestedRole === 'ADMIN' && role !== 'OWNER') return json(403, { error: 'Only an Owner may invite an Admin.' });
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
  if (path === '/quotes' && method === 'GET') {
    const items = await prisma.quote.findMany({ where: { organizationId: organization.id, deletedAt: null }, include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } });
    return json(200, { items: items.map(quoteDTO) });
  }
  if (path === '/quotes' && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    const title = String(body.title || '').trim(), customerId = String(body.customerId || ''), requested = Array.isArray(body.items) ? body.items : [];
    if (!title || title.length > 200 || !customerId || !requested.length || requested.length > 200) return json(400, { error: 'Quote title, customer and at least one line are required.' });
    const [customer, rfq, catalog] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, organizationId: organization.id, deletedAt: null } }),
      body.rfqId ? prisma.rFQ.findFirst({ where: { id: String(body.rfqId), organizationId: organization.id, deletedAt: null } }) : Promise.resolve(null),
      prisma.catalogItem.findMany({ where: { organizationId: organization.id, id: { in: [...new Set(requested.map(line => String(line.catalogItemId || '')))] }, active: true, deletedAt: null } })
    ]);
    if (!customer) return json(404, { error: 'Customer not found in this organization.' });
    if (body.rfqId && !rfq) return json(404, { error: 'RFQ not found in this organization.' });
    if (catalog.length !== new Set(requested.map(line => String(line.catalogItemId || ''))).size) return json(400, { error: 'Every quote line must reference an active catalog item in this organization.' });
    const catalogById = new Map(catalog.map(item => [item.id, item]));
    let lines;
    try {
      lines = requested.map((line, index) => {
        const source = catalogById.get(String(line.catalogItemId));
        const quantity = Number(line.quantity ?? line.qty), price = Number(line.sellingPrice ?? line.price ?? source.sellingPrice);
        if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) throw new Error('invalid');
        if (source.minimumPrice && price < Number(source.minimumPrice)) throw new Error('minimum');
        return { catalogItemId: source.id, name: source.name, sku: source.sku || '', description: String(line.description ?? source.description ?? '').slice(0, 2000), qty: quantity, unit: source.unit, cost: Number(source.cost), price, tax: Number(source.taxRate), sortOrder: index };
      });
    } catch (error) { return json(400, { error: error.message === 'minimum' ? 'A line price is below the catalog minimum.' : 'Quote line quantity or price is invalid.' }); }
    let totals;
    try { totals = calculateQuote({ items: lines, discount: body.discount ?? 0 }); }
    catch (error) { return json(400, { error: error.message }); }
    const settings = await prisma.companySettings.findUnique({ where: { organizationId: organization.id } });
    const minimumMargin = Number(settings?.minMargin ?? settings?.data?.margin ?? 20);
    const marginMode = settings?.marginMode || settings?.data?.marginMode || 'WARNING';
    if (totals.margin < minimumMargin && marginMode === 'BLOCK') return json(409, { error: 'Quote is below the configured minimum margin.' });
    const status = totals.margin < minimumMargin && marginMode === 'APPROVAL_REQUIRED' && role === 'SALES_REP' ? 'INTERNAL_REVIEW' : 'DRAFT';
    const currency = String(body.currency || organization.reportingCurrency).slice(0, 3).toUpperCase();
    const expiryDate = body.expiry ? new Date(`${body.expiry}T23:59:59.999Z`) : null;
    if (expiryDate && !Number.isFinite(expiryDate.getTime())) return json(400, { error: 'Quote expiry date is invalid.' });
    if (body.id) {
      const prior = await prisma.quote.findFirst({ where: { id: String(body.id), organizationId: organization.id, deletedAt: null } });
      if (!prior) return json(404, { error: 'Quote not found in this organization.' });
      if (!['DRAFT', 'INTERNAL_REVIEW'].includes(prior.status)) return json(409, { error: 'Sent quotes are immutable. Create a revised quote instead.' });
      if (body.version != null && Number(body.version) !== prior.version) return json(409, { error: 'This quote changed since you opened it. Reload and review the latest version.' });
      const changed = await prisma.$transaction(async tx => {
        const result = await tx.quote.updateMany({ where: { id: prior.id, organizationId: organization.id, status: prior.status, version: prior.version }, data: { title, customerId, rfqId: rfq?.id || null, currency, discount: Number(body.discount || 0).toFixed(4), expiryDate, paymentTerms: String(body.paymentTerms || body.payment || '').slice(0, 500) || null, deliveryTerms: String(body.deliveryTerms || body.delivery || '').slice(0, 500) || null, customerNotes: String(body.customerNotes || body.notes || '').slice(0, 2000) || null, version: { increment: 1 } } });
        if (!result.count) return false;
        await tx.quoteItem.deleteMany({ where: { quoteId: prior.id } });
        await tx.quoteItem.createMany({ data: lines.map(line => ({ quoteId: prior.id, catalogItemId: line.catalogItemId, nameSnapshot: line.name, skuSnapshot: line.sku, descriptionSnapshot: line.description, quantity: line.qty.toFixed(4), unitSnapshot: line.unit, costSnapshot: line.cost.toFixed(4), sellingPrice: line.price.toFixed(4), taxRate: line.tax.toFixed(4), sortOrder: line.sortOrder })) });
        await tx.quoteEvent.create({ data: { quoteId: prior.id, type: 'DRAFT_REVISED', actorUserId: user.id } });
        return tx.quote.findUnique({ where: { id: prior.id }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
      });
      if (!changed) return json(409, { error: 'This quote changed while you were saving. Reload and review the latest version.' });
      return json(200, { item: quoteDTO(changed), totals, warning: totals.margin < minimumMargin && marginMode === 'WARNING' ? 'Quote is below the configured margin guideline.' : null });
    }
    const quote = await prisma.$transaction(async tx => {
      const counter = await tx.companySettings.update({ where: { organizationId: organization.id }, data: { quoteCounter: { increment: 1 } } });
      const number = `Q-${new Date().getUTCFullYear()}-${String(counter.quoteCounter).padStart(5, '0')}`;
      const created = await tx.quote.create({ data: { organizationId: organization.id, number, customerId, rfqId: rfq?.id || null, title, status, currency, discount: Number(body.discount || 0).toFixed(4), expiryDate, paymentTerms: String(body.paymentTerms || body.payment || '').slice(0, 500) || null, deliveryTerms: String(body.deliveryTerms || body.delivery || '').slice(0, 500) || null, customerNotes: String(body.customerNotes || body.notes || '').slice(0, 2000) || null, version: 1, items: { create: lines.map(line => ({ catalogItemId: line.catalogItemId, nameSnapshot: line.name, skuSnapshot: line.sku, descriptionSnapshot: line.description, quantity: line.qty.toFixed(4), unitSnapshot: line.unit, costSnapshot: line.cost.toFixed(4), sellingPrice: line.price.toFixed(4), taxRate: line.tax.toFixed(4), sortOrder: line.sortOrder })) } }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
      await tx.quoteEvent.create({ data: { quoteId: created.id, type: 'CREATED', actorUserId: user.id } });
      await tx.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'quote.created', objectType: 'Quote', objectId: created.id } });
      return created;
    });
    return json(201, { item: quoteDTO(quote), totals, warning: totals.margin < minimumMargin && marginMode === 'WARNING' ? 'Quote is below the configured margin guideline.' : null });
  }
  const sendMatch = /^\/quotes\/([^/]+)\/send$/.exec(path);
  if (sendMatch && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    const quote = await prisma.quote.findFirst({ where: { id: sendMatch[1], organizationId: organization.id, deletedAt: null }, include: { customer: true, items: { orderBy: { sortOrder: 'asc' } }, organization: { include: { settings: true } } } });
    if (!quote) return json(404, { error: 'Quote not found.' });
    if (!['DRAFT', 'INTERNAL_REVIEW'].includes(quote.status)) return json(409, { error: 'Only an editable quote can be sent.' });
    if (quote.status === 'INTERNAL_REVIEW' && !['OWNER', 'ADMIN', 'SALES_MANAGER'].includes(role)) return json(403, { error: 'A manager must approve this quote before sending.' });
    if (!quote.customer.email) return json(400, { error: 'The customer does not have an email address.' });
    const emailProvider = makeEmail(config);
    if (!emailProvider) return json(503, { error: 'Email delivery is not configured; the quote was not marked as sent.' });
    const token = randomBytes(32).toString('base64url');
    const lines = quote.items.map(item => ({ catalogItemId: item.catalogItemId, name: item.nameSnapshot, sku: item.skuSnapshot, description: item.descriptionSnapshot, qty: Number(item.quantity), unit: item.unitSnapshot, price: Number(item.sellingPrice), tax: Number(item.taxRate) }));
    const totals = calculateQuote({ items: quote.items.map(item => ({ qty: Number(item.quantity), cost: Number(item.costSnapshot), price: Number(item.sellingPrice), tax: Number(item.taxRate) })), discount: Number(quote.discount) });
    const company = quote.organization.settings?.data || {};
    const snapshot = { version: quote.version, items: lines, totals: { subtotal: totals.subtotal, tax: totals.tax, total: totals.total }, customer: { name: quote.customer.companyName, contact: quote.customer.contactName, email: quote.customer.email }, company: { name: company.company || quote.organization.name, address: company.address || '', email: company.email || '', phone: company.phone || '' }, terms: { payment: quote.paymentTerms || '', delivery: quote.deliveryTerms || '', notes: quote.customerNotes || '' } };
    const expiryAt = quote.expiryDate || new Date(Date.now() + 30 * 864e5);
    const url = `${config.appUrl}/q/${token}`;
    const reserved = await prisma.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: quote.status, version: quote.version }, data: { status: 'SENDING', version: { increment: 1 } } });
    if (!reserved.count) return json(409, { error: 'The quote changed while delivery was being prepared.' });
    try { await emailProvider.send({ to: quote.customer.email, subject: `Quotation ${quote.number} — ${quote.title}`, text: `Your quotation ${quote.number} is ready. View it securely: ${url}\n\nThis link expires ${expiryAt.toISOString().slice(0, 10)}.` }); }
    catch (error) {
      await prisma.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: 'SENDING' }, data: { status: quote.status, version: { increment: 1 } } }).catch(() => {});
      console.error('quote_email_failed', { organizationId: organization.id, quoteId: quote.id, message: error.message });
      return json(502, { error: 'The quote could not be emailed. It remains in its current status.' });
    }
    const changed = await prisma.$transaction(async tx => {
      const result = await tx.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: 'SENDING' }, data: { status: 'SENT', sentAt: new Date(), snapshot, publicTokenHash: sha256(token), publicTokenExpiresAt: expiryAt, version: { increment: 1 } } });
      if (!result.count) throw new Error('Quote state changed during delivery.');
      await tx.quoteEvent.create({ data: { quoteId: quote.id, type: 'SENT', actorUserId: user.id } });
      return result.count;
    }).catch(() => 0);
    if (!changed) return json(409, { error: 'Email was sent, but quote state could not be finalized. Contact support before retrying.' });
    return json(200, { status: 'SENT', publicUrl: url });
  }
  const renewLinkMatch = /^\/quotes\/([^/]+)\/share-link$/.exec(path);
  if (renewLinkMatch && method === 'POST') {
    if (!['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP'].includes(role)) return json(403, { error: 'Read-only role.' });
    const quote = await prisma.quote.findFirst({ where: { id: renewLinkMatch[1], organizationId: organization.id, deletedAt: null }, include: { customer: true } });
    if (!quote || !['SENT', 'VIEWED'].includes(quote.status)) return json(409, { error: 'Only a sent quote can receive a replacement customer link.' });
    if (!quote.customer.email) return json(400, { error: 'The customer does not have an email address.' });
    const emailProvider = makeEmail(config);
    if (!emailProvider) return json(503, { error: 'Email delivery is not configured.' });
    const token = randomBytes(32).toString('base64url'), publicUrl = `${config.appUrl}/q/${token}`;
    const expiryAt = quote.expiryDate || new Date(Date.now() + 30 * 864e5);
    try { await emailProvider.send({ to: quote.customer.email, subject: `Updated secure link for quotation ${quote.number}`, text: `Open your quotation ${quote.number}: ${publicUrl}\n\nThis link expires ${expiryAt.toISOString().slice(0, 10)}. The previous link has been replaced.` }); }
    catch (error) { console.error('quote_link_email_failed', { organizationId: organization.id, quoteId: quote.id, message: error.message }); return json(502, { error: 'A replacement link could not be emailed.' }); }
    const updated = await prisma.$transaction(async tx => {
      const result = await tx.quote.updateMany({ where: { id: quote.id, organizationId: organization.id, status: quote.status, version: quote.version }, data: { publicTokenHash: sha256(token), publicTokenExpiresAt: expiryAt, version: { increment: 1 } } });
      if (!result.count) return false;
      await tx.quoteEvent.create({ data: { quoteId: quote.id, type: 'PUBLIC_LINK_REISSUED', actorUserId: user.id } });
      return true;
    });
    return updated ? json(200, { publicUrl }) : json(409, { error: 'A concurrent quote update prevented link replacement. Check the quote before retrying.' });
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
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  if (context?.ip) headers['x-nf-client-connection-ip'] = context.ip;
  let body = '';
  if (!['GET', 'HEAD'].includes(request.method)) {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > 1_000_000) return new Response(JSON.stringify({ error: 'Request body is too large.' }), { status: 413, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    body = await request.text();
    if (body.length > 1_000_000) return new Response(JSON.stringify({ error: 'Request body is too large.' }), { status: 413, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const result = await legacyEventAdapter({ path: url.pathname, httpMethod: request.method, headers, body });
  const responseHeaders = new Headers(result.headers || {});
  for (const cookie of result.multiValueHeaders?.['set-cookie'] || []) responseHeaders.append('set-cookie', cookie);
  return new Response(result.body || '', { status: result.statusCode || 200, headers: responseHeaders });
}
