import { calculateQuote } from './pricing.mjs';

const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
/** Prisma accepts decimal strings; keep authoritative catalog decimals exact. */
export function quoteItemData(line) {
  return {
    catalogItemId: line.catalogItemId, nameSnapshot: line.name, skuSnapshot: line.sku,
    descriptionSnapshot: line.description, quantity: String(line.qty), unitSnapshot: line.unit,
    costSnapshot: String(line.cost), sellingPrice: String(line.price), taxRate: String(line.tax),
    minimumPriceSnapshot: line.minimumPrice == null ? null : String(line.minimumPrice), sortOrder: line.sortOrder
  };
}
export const amountScaled = value => {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));
  if (!match) throw new Error('Financial amounts must be non-negative decimals with at most four places.');
  return BigInt(match[1]) * 10_000n + BigInt(((match[2] || '') + '0000').slice(0, 4));
};
export function validCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return false;
  try {
    if (typeof Intl.supportedValuesOf === 'function' && !Intl.supportedValuesOf('currency').includes(currency)) return false;
    new Intl.NumberFormat('en', { style: 'currency', currency }).format(1); return true;
  } catch { return false; }
}

/** Build quote line snapshots. Catalog commercial values always come from the server. */
export function normalizeQuoteLines(requested, catalogItems, quoteCurrency, { enforceMinimum = true } = {}) {
  if (!Array.isArray(requested) || !requested.length || requested.length > 200) throw new Error('Quote requires 1 to 200 lines.');
  if (!validCurrency(quoteCurrency)) throw new Error('Quote currency is invalid.');
  const catalogById = new Map(catalogItems.map(item => [item.id, item]));
  const normalized = requested.map((line, index) => {
    if (line?.catalogItemId != null && typeof line.catalogItemId !== 'string') throw new Error('Catalog item reference is invalid.');
    const catalogId = typeof line?.catalogItemId === 'string' ? line.catalogItemId.trim() : '';
    if (catalogId) {
      const source = catalogById.get(catalogId);
      if (!source) throw new Error('A catalog item is unavailable in this organization.');
      if (String(source.currency).toUpperCase() !== quoteCurrency || (line.currency != null && String(line.currency).toUpperCase() !== quoteCurrency)) throw new Error('Catalog item currency must match the quote currency.');
      const result = {
        catalogItemId: source.id, name: source.name, sku: source.sku || '',
        description: source.description || '', qty: line.quantity ?? line.qty,
        unit: source.unit, cost: String(source.cost),
        price: line.sellingPrice ?? line.price ?? String(source.sellingPrice),
        tax: String(source.taxRate), currency: quoteCurrency, sortOrder: index,
        minimumPrice: source.minimumPrice == null ? null : String(source.minimumPrice), lineType: 'CATALOG'
      };
      if (enforceMinimum && result.minimumPrice != null && amountScaled(result.price) < amountScaled(result.minimumPrice)) throw new Error('A line price is below the catalog minimum.');
      return result;
    }
    if (line?.currency != null && String(line.currency).toUpperCase() !== quoteCurrency) throw new Error('Manual line currency must match the quote currency.');
    if ((line?.quantity == null && line?.qty == null) || line?.cost == null || (line?.sellingPrice == null && line?.price == null) || line?.tax == null) throw new Error('Manual lines require quantity, cost, selling price and tax.');
    const name = text(line?.name, 240), description = text(line?.description, 2000), sku = text(line?.sku, 80);
    const unit = text(line?.unit, 40);
    if (!name || !unit) throw new Error('Manual lines require a name and unit.');
    return {
      catalogItemId: null, name, sku, description, qty: line.quantity ?? line.qty,
      unit, cost: line.cost, price: line.sellingPrice ?? line.price, tax: line.tax,
      currency: quoteCurrency, sortOrder: index, minimumPrice: null, lineType: 'MANUAL'
    };
  });
  calculateQuote({ items: normalized, discount: 0 });
  return normalized;
}
