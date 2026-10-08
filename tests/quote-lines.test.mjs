import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuoteLines, quoteItemData, validCurrency } from '../lib/quote-lines.mjs';
import { calculateQuote } from '../lib/pricing.mjs';

const product = { id: 'p1', name: 'Catalog chair', sku: 'CH-1', description: 'Official description', unit: 'each', cost: '40.0000', sellingPrice: '100.0000', minimumPrice: '80.0000', taxRate: '5.0000', currency: 'AED' };

test('catalog decimal strings persist without Number.toFixed or loss of precision', () => {
  const [line] = normalizeQuoteLines([{ catalogItemId: 'p1', qty: '2.1250', price: '99.1234' }], [product], 'AED');
  const record = quoteItemData(line);
  assert.equal(record.quantity, '2.1250');
  assert.equal(record.costSnapshot, '40.0000');
  assert.equal(record.sellingPrice, '99.1234');
  assert.equal(record.taxRate, '5.0000');
  assert.equal(record.minimumPriceSnapshot, '80.0000');
  assert.equal(record.nameSnapshot, product.name);
});

test('manual numeric inputs produce Prisma-compatible decimal strings', () => {
  const [line] = normalizeQuoteLines([{ name: 'Labour', unit: 'hour', qty: 2, cost: 12.5, price: 25, tax: 5 }], [], 'AED');
  const record = quoteItemData(line);
  assert.equal(record.catalogItemId, null);
  assert.equal(record.quantity, '2');
  assert.equal(record.costSnapshot, '12.5');
  assert.equal(record.sellingPrice, '25');
  assert.equal(record.minimumPriceSnapshot, null);
});

test('catalog line takes cost, tax, currency, unit and descriptive snapshot from the catalog', () => {
  const [line] = normalizeQuoteLines([{ catalogItemId: 'p1', qty: '2', price: '90.0000', cost: 0, tax: 0, unit: 'wrong', name: 'forged' }], [product], 'AED');
  assert.deepEqual({ cost: line.cost, tax: line.tax, unit: line.unit, name: line.name, description: line.description, lineType: line.lineType }, { cost: '40.0000', tax: '5.0000', unit: 'each', name: 'Catalog chair', description: 'Official description', lineType: 'CATALOG' });
  assert.equal(calculateQuote({ items: [line], discount: 0 }).total, 189);
});

test('manual and mixed catalog/manual lines are supported in one quote currency', () => {
  const manual = { catalogItemId: null, name: 'Installation', description: 'On-site assembly', sku: 'LAB-01', qty: '3', unit: 'hour', cost: '20.0000', price: '50.0000', tax: '5.0000', currency: 'AED' };
  const lines = normalizeQuoteLines([{ catalogItemId: 'p1', qty: '1', price: '100' }, manual], [product], 'AED');
  assert.equal(lines[0].lineType, 'CATALOG');
  assert.equal(lines[1].lineType, 'MANUAL');
  assert.equal(calculateQuote({ items: lines, discount: 0 }).total, 262.5);
});

test('rejects unavailable/foreign catalog IDs and below-minimum prices', () => {
  assert.throws(() => normalizeQuoteLines([{ catalogItemId: 'foreign', qty: 1, price: 90 }], [product], 'AED'), /unavailable/);
  assert.throws(() => normalizeQuoteLines([{ catalogItemId: 'p1', qty: 1, price: 79 }], [product], 'AED'), /minimum/);
});

test('rejects cross-currency catalog/manual lines and unsupported currency codes', () => {
  assert.throws(() => normalizeQuoteLines([{ catalogItemId: 'p1', qty: 1, price: 90 }], [product], 'USD'), /currency/);
  const manual = { name: 'Service', qty: 1, unit: 'hour', cost: 10, price: 20, tax: 5, currency: 'USD' };
  assert.throws(() => normalizeQuoteLines([manual], [], 'AED'), /currency/);
  assert.equal(validCurrency('ZZZ'), false);
  assert.equal(validCurrency('USD'), true);
});

test('rejects invalid quantity, cost, price, tax, precision, and excessive values', () => {
  const base = { name: 'Manual service', qty: 1, unit: 'hour', cost: 10, price: 20, tax: 5 };
  for (const line of [{ ...base, qty: 0 }, { ...base, cost: -1 }, { ...base, price: -1 }, { ...base, tax: 101 }, { ...base, cost: '1.00001' }, { ...base, price: '999999999999999999' }]) {
    assert.throws(() => normalizeQuoteLines([line], [], 'AED'));
  }
});
