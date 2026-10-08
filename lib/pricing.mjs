/** Quote math performed in four-decimal fixed point to avoid binary float drift. */
const SCALE = 10_000n;
const MAX_SCALED = 999_999_999_999_999_9n;

function scaled(value, label) {
  if (typeof value === 'string' && value.trim() === '') throw new RangeError(`${label} is required.`);
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) throw new RangeError(`${label} must be a finite decimal.`);
  const text = String(value).trim();
  if (!/^-?(?:\d+)(?:\.\d{1,4})?$/.test(text)) throw new RangeError(`${label} supports at most four decimal places.`);
  const negative = text.startsWith('-'), abs = negative ? text.slice(1) : text;
  const [whole, fraction = ''] = abs.split('.');
  const result = BigInt(whole) * SCALE + BigInt((fraction + '0000').slice(0, 4));
  if (result > MAX_SCALED) throw new RangeError(`${label} exceeds the supported range.`);
  return negative ? -result : result;
}
const roundedDiv = (numerator, denominator) => (numerator + (numerator >= 0n ? denominator / 2n : -(denominator / 2n))) / denominator;
const asNumber = value => Number(value) / Number(SCALE);

/** Quote-wide discounts are allocated proportionally across lines before tax. */
export function calculateQuote(quote) {
  if (!quote || !Array.isArray(quote.items)) throw new TypeError('Quote items are required.');
  const lines = quote.items.map(item => {
    const quantity = scaled(item.qty, 'Quantity'), price = scaled(item.price, 'Price'), cost = scaled(item.cost, 'Cost'), taxRate = scaled(item.tax ?? 0, 'Tax rate');
    if (quantity <= 0n || price < 0n || cost < 0n || taxRate < 0n || taxRate > 100n * SCALE) throw new RangeError('Quote line has invalid quantity, price, cost or tax.');
    const revenue = roundedDiv(quantity * price, SCALE), costTotal = roundedDiv(quantity * cost, SCALE);
    return { source: item, quantity, price, cost, taxRate, revenue, costTotal };
  });
  const gross = lines.reduce((sum, line) => sum + line.revenue, 0n);
  const discount = scaled(quote.discount ?? 0, 'Discount');
  if (discount < 0n || discount > gross) throw new RangeError('Discount exceeds subtotal.');
  // Allocate exactly the requested fixed-point discount. Independent rounding can
  // otherwise create or lose money across multiple lines (particularly tiny values).
  const allocations = lines.map(line => gross ? discount * line.revenue / gross : 0n);
  let remaining = discount - allocations.reduce((sum, amount) => sum + amount, 0n);
  const order = lines.map((line, index) => ({
    index, remainder: gross ? discount * line.revenue % gross : 0n
  })).sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const { index } of order) {
    if (!remaining) break;
    if (allocations[index] < lines[index].revenue) {
      allocations[index] += 1n;
      remaining -= 1n;
    }
  }
  if (remaining) throw new Error('Quote discount allocation could not be reconciled.');
  const normalized = lines.map((line, index) => {
    const allocated = allocations[index];
    const net = line.revenue - allocated;
    const taxAmount = roundedDiv(net * line.taxRate, 100n * SCALE);
    return { ...line.source, revenue: asNumber(line.revenue), costTotal: asNumber(line.costTotal), discountAllocated: asNumber(allocated), net: asNumber(net), taxRate: asNumber(line.taxRate), taxAmount: asNumber(taxAmount) };
  });
  const subtotal = gross - discount;
  const tax = normalized.reduce((sum, line) => sum + scaled(line.taxAmount, 'Line tax'), 0n);
  const cost = lines.reduce((sum, line) => sum + line.costTotal, 0n);
  const profit = subtotal - cost;
  return { lines: normalized, gross: asNumber(gross), discount: asNumber(discount), subtotal: asNumber(subtotal), tax: asNumber(tax), total: asNumber(subtotal + tax), cost: asNumber(cost), profit: asNumber(profit), margin: subtotal ? Number(profit * 10000n / subtotal) / 100 : 0 };
}
