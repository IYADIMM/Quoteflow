import test from 'node:test';
import assert from 'node:assert/strict';
import { customerPdfModel, generateQuotePdf } from '../lib/pdf-provider.mjs';

const quote = {
  number: 'Q-2026-001', title: 'Unicode café equipment', version: 2, currency: 'AED', issueDate: new Date('2026-10-01T00:00:00Z'), expiryDate: new Date('2026-10-31T00:00:00Z'),
  snapshot: {
    version: 2, company: { name: 'Acme Trading', address: 'Dubai', email: 'sales@example.com', phone: '+971 4 000 0000' }, customer: { name: 'Northwind LLC', contact: 'Mira', email: 'buyer@example.com', address: 'Abu Dhabi' },
    items: Array.from({ length: 45 }, (_, i) => ({ sku: `SKU-${i + 1}`, name: `Commercial item ${i + 1}`, description: 'A long customer-safe description for multi-page layout verification.', qty: 2, unit: 'each', price: 100.25, tax: 5, cost: 1, margin: 99, minimumPrice: 90 })),
    totals: { subtotal: 9022.5, discount: 22.5, netSubtotal: 9000, tax: 450, total: 9450, cost: 1, profit: 9449, margin: 99 }, terms: { payment: '30 days', delivery: 'Two weeks', notes: 'Thank you.' }
  }
};

test('customer PDF model excludes internal financial authority fields', () => {
  const model = customerPdfModel(quote), serialized = JSON.stringify(model);
  assert.equal(model.version, 2);
  assert.equal(model.items.length, 45);
  assert.equal(model.totals.subtotal, 9022.5);
  assert.equal(model.totals.netSubtotal, 9000);
  for (const forbidden of ['cost','margin','minimumPrice','profit']) assert.equal(serialized.includes(`"${forbidden}"`), false);
});

test('server PDF is a real multi-page PDF generated from the immutable snapshot', async () => {
  const pdf = await generateQuotePdf(quote);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 5000);
  assert.match(pdf.toString('latin1'), /\/Count\s+[2-9]/);
});
