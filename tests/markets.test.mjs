import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKETS, SUPPORTED_CURRENCIES, marketForCountry, validMarketCurrency } from '../lib/markets.mjs';

test('market defaults include United States and Kuwait currencies', () => {
  assert.deepEqual(marketForCountry('us'), { country: 'US', name: 'United States', currency: 'USD', taxRate: 0 });
  assert.equal(marketForCountry('KW').currency, 'KWD');
  assert.equal(marketForCountry('AE').currency, 'AED');
  assert.ok(MARKETS.length >= 10);
  assert.ok(SUPPORTED_CURRENCIES.includes('USD'));
  assert.ok(SUPPORTED_CURRENCIES.includes('KWD'));
});

test('market validation rejects unknown countries and currencies', () => {
  assert.equal(marketForCountry('XX'), null);
  assert.equal(validMarketCurrency('USD'), true);
  assert.equal(validMarketCurrency('BTC'), false);
});
