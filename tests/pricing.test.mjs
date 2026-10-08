import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote } from '../lib/pricing.mjs';

test('no discount and multiple tax rates are calculated on line values', () => {
  const quote = calculateQuote({ discount: 0, items: [{ qty: 2, price: 100, cost: 40, tax: 5 }, { qty: 1, price: 200, cost: 50, tax: 10 }] });
  assert.equal(quote.gross, 400); assert.equal(quote.subtotal, 400); assert.equal(quote.cost, 130); assert.equal(quote.tax, 30); assert.equal(quote.total, 430);
});

test('quote-wide discounts are allocated proportionally before tax', () => {
  const quote = calculateQuote({ discount: 60, items: [{ qty: 1, price: 100, cost: 40, tax: 5 }, { qty: 1, price: 300, cost: 100, tax: 10 }] });
  assert.equal(quote.subtotal, 340); assert.equal(quote.tax, 29.75); assert.equal(quote.total, 369.75); assert.equal(quote.cost, 140);
});

test('full discount and zero revenue safely return zero margin', () => {
  const quote = calculateQuote({ discount: 500, items: [{ qty: 1, price: 500, cost: 0, tax: 5 }] });
  assert.equal(quote.subtotal, 0); assert.equal(quote.margin, 0); assert.equal(quote.total, 0);
});

test('negative margins are retained accurately', () => {
  const quote = calculateQuote({ discount: 0, items: [{ qty: 2, price: 30, cost: 40, tax: 0 }] });
  assert.equal(quote.profit, -20); assert.equal(quote.margin, -33.33);
});

test('fixed-point calculations retain four decimal places and reject over-precision', () => {
  const quote = calculateQuote({ discount: '0.0100', items: [{ qty: '3.0000', price: '0.1000', cost: '0.0400', tax: '5.0000' }] });
  assert.equal(quote.gross, 0.3); assert.equal(quote.subtotal, 0.29); assert.equal(quote.tax, 0.0145); assert.equal(quote.total, 0.3045);
  assert.throws(() => calculateQuote({ discount: 0, items: [{ qty: 1, price: '1.00001', cost: 0, tax: 0 }] }), /four decimal places/);
});

test('invalid quantity, negative prices, excessive tax and excessive discount are rejected', () => {
  assert.throws(() => calculateQuote({ discount: 0, items: [{ qty: 0, price: 5, cost: 1, tax: 0 }] }));
  assert.throws(() => calculateQuote({ discount: 0, items: [{ qty: 1, price: -5, cost: 1, tax: 0 }] }));
  assert.throws(() => calculateQuote({ discount: 0, items: [{ qty: 1, price: 5, cost: 1, tax: 101 }] }));
  assert.throws(() => calculateQuote({ discount: 51, items: [{ qty: 1, price: 50, cost: 1, tax: 0 }] }));
});

test('discount allocation reconciles to the last four-decimal unit', () => {
  const quote = calculateQuote({ discount: '0.0001', items: Array.from({ length: 3 }, () => ({ qty: 1, price: 1, cost: 0, tax: 5 })) });
  const allocatedUnits = quote.lines.map(line => Math.round(line.discountAllocated * 10000));
  assert.deepEqual(allocatedUnits, [1, 0, 0]);
  assert.equal(allocatedUnits.reduce((a, b) => a + b, 0), 1);
  assert.equal(quote.lines.reduce((a, line) => a + Math.round(line.net * 10000), 0), Math.round(quote.subtotal * 10000));
});

test('discount allocation reconciles for 200 taxable lines, full discounts and mixed prices', () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ qty: 1, price: (1 + (i % 13) / 10).toFixed(4), cost: 0, tax: i % 2 ? 5 : 10 }));
  const result = calculateQuote({ items, discount: '0.0531' });
  const units = value => Math.round(value * 10000);
  assert.equal(result.lines.reduce((sum, line) => sum + units(line.discountAllocated), 0), units(result.discount));
  assert.equal(result.lines.reduce((sum, line) => sum + units(line.net), 0), units(result.subtotal));
  assert.equal(units(result.total), units(result.subtotal) + units(result.tax));
  const full = calculateQuote({ items, discount: result.gross.toFixed(4) });
  assert.equal(full.subtotal, 0);
  assert.ok(full.lines.every(line => line.net === 0 && line.discountAllocated === line.revenue));
});
