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
