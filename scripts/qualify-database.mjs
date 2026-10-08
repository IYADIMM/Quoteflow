import { randomUUID } from 'node:crypto';

const connectionString = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '';
let parsed;
try { parsed = new URL(connectionString); } catch { throw new Error('Set STAGING_DATABASE_URL to a valid isolated PostgreSQL staging database.'); }
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('Database qualification requires PostgreSQL.');
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')).toLowerCase();
if (!/(staging|stage|test|qualif|drill)/.test(databaseName)) throw new Error('Refusing qualification: the database name must contain staging, stage, test, qualif, or drill.');

process.env.DATABASE_URL = connectionString;
process.env.NODE_ENV ||= 'development';
const { getPrisma } = await import('../lib/prisma.mjs');
const prisma = await getPrisma();
const marker = randomUUID().replaceAll('-', '');
let organizationId, userId;

try {
  await prisma.$queryRaw`SELECT 1`;
  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.create({ data: { email: `qualification-${marker}@example.invalid`, passwordHash: 'qualification-only:not-a-login-hash', emailVerifiedAt: new Date() } });
    userId = user.id;
    const organization = await tx.organization.create({ data: { name: `QuoteFlow qualification ${marker}`, reportingCurrency: 'AED', settings: { create: { data: { company: 'Qualification Company', currency: 'AED', tax: 5, margin: 20, validity: 30 } } }, subscription: { create: { plan: 'FREE', status: 'ACTIVE' } } } });
    organizationId = organization.id;
    await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, role: 'OWNER' } });
    const customer = await tx.customer.create({ data: { organizationId: organization.id, companyName: 'Qualification Customer', email: 'buyer@example.invalid' } });
    const catalog = await tx.catalogItem.create({ data: { organizationId: organization.id, sku: `QUAL-${marker.slice(0, 8)}`, name: 'Qualification service', unit: 'each', cost: '50.0000', sellingPrice: '100.0000', minimumPrice: '80.0000', taxRate: '5.0000', currency: 'AED' } });
    const rfq = await tx.rFQ.create({ data: { organizationId: organization.id, number: `RFQ-${marker.slice(0, 12)}`, title: 'Qualification RFQ', customerId: customer.id, items: { create: { catalogItemId: catalog.id, description: 'Qualification service', quantity: '2.0000', unit: 'each' } } } });
    const snapshot = { version: 1, items: [{ name: catalog.name, qty: 2, unit: 'each', price: 100, tax: 5 }], totals: { subtotal: 200, discount: 0, netSubtotal: 200, tax: 10, total: 210, currency: 'AED' }, customer: { name: customer.companyName }, company: { name: organization.name }, terms: {} };
    const quote = await tx.quote.create({ data: { organizationId: organization.id, createdById: user.id, customerId: customer.id, rfqId: rfq.id, number: `Q-${marker.slice(0, 12)}`, title: 'Qualification quotation', status: 'SENT', currency: 'AED', version: 1, sentAt: new Date(), snapshot, items: { create: { catalogItemId: catalog.id, nameSnapshot: catalog.name, skuSnapshot: catalog.sku, quantity: '2.0000', unitSnapshot: 'each', costSnapshot: '50.0000', sellingPrice: '100.0000', minimumPriceSnapshot: '80.0000', taxRate: '5.0000' } } } });
    await tx.quoteApproval.create({ data: { quoteId: quote.id, quoteVersion: 1, approverUserId: user.id, financialHash: marker } });
    await tx.quoteEvent.create({ data: { quoteId: quote.id, type: 'SENT', actorUserId: user.id, metadata: { qualification: true } } });
    await tx.attachment.create({ data: { organizationId: organization.id, rfqId: rfq.id, storageKey: `qualification/${marker}.txt`, kind: 'RFQ_ATTACHMENT', status: 'READY', provider: 'qualification', fileName: 'qualification.txt', mimeType: 'text/plain', byteSize: 1, sha256: '0'.repeat(64) } });
    await tx.auditLog.create({ data: { organizationId: organization.id, actorUserId: user.id, action: 'qualification.completed', objectType: 'Organization', objectId: organization.id } });
    const persisted = await tx.organization.findUnique({ where: { id: organization.id }, include: { settings: true, subscription: true, customers: true, catalogItems: true, rfqs: { include: { items: true } }, quotes: { include: { items: true, approvals: true, events: true } }, attachments: true, auditLogs: true } });
    if (!persisted?.settings || !persisted.subscription || persisted.customers.length !== 1 || persisted.catalogItems.length !== 1 || persisted.rfqs[0]?.items.length !== 1 || persisted.quotes[0]?.items.length !== 1 || persisted.quotes[0]?.approvals.length !== 1 || persisted.quotes[0]?.events.length !== 1 || persisted.attachments.length !== 1 || persisted.auditLogs.length !== 1) throw new Error('Qualification records did not persist with expected relations.');
    return { organizationId: organization.id, userId: user.id };
  });
  console.log(JSON.stringify({ status: 'DATABASE_QUALIFICATION_PASSED', database: databaseName, ...result }));
} finally {
  if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }).catch(error => console.error('qualification_cleanup_organization_failed', error.message));
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(error => console.error('qualification_cleanup_user_failed', error.message));
  await prisma.$disconnect();
}
