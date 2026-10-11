export const MARKETS = Object.freeze([
  Object.freeze({ country: 'AE', name: 'United Arab Emirates', currency: 'AED', taxRate: 5 }),
  Object.freeze({ country: 'US', name: 'United States', currency: 'USD', taxRate: 0 }),
  Object.freeze({ country: 'KW', name: 'Kuwait', currency: 'KWD', taxRate: 0 }),
  Object.freeze({ country: 'SA', name: 'Saudi Arabia', currency: 'SAR', taxRate: 15 }),
  Object.freeze({ country: 'BH', name: 'Bahrain', currency: 'BHD', taxRate: 10 }),
  Object.freeze({ country: 'OM', name: 'Oman', currency: 'OMR', taxRate: 5 }),
  Object.freeze({ country: 'QA', name: 'Qatar', currency: 'QAR', taxRate: 0 }),
  Object.freeze({ country: 'GB', name: 'United Kingdom', currency: 'GBP', taxRate: 20 }),
  Object.freeze({ country: 'DE', name: 'Germany', currency: 'EUR', taxRate: 19 }),
  Object.freeze({ country: 'CA', name: 'Canada', currency: 'CAD', taxRate: 5 }),
  Object.freeze({ country: 'AU', name: 'Australia', currency: 'AUD', taxRate: 10 }),
  Object.freeze({ country: 'IN', name: 'India', currency: 'INR', taxRate: 18 })
]);

export const SUPPORTED_CURRENCIES = Object.freeze([...new Set(MARKETS.map(market => market.currency))]);

export function marketForCountry(value) {
  const country = String(value || '').trim().toUpperCase();
  return MARKETS.find(market => market.country === country) || null;
}

export function validMarketCurrency(value) {
  return SUPPORTED_CURRENCIES.includes(String(value || '').trim().toUpperCase());
}
