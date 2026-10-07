/** Quote-wide discounts are allocated across lines in proportion to pre-discount revenue. */
export function calculateQuote(quote) {
  if(!quote||!Array.isArray(quote.items))throw new TypeError('Quote items are required.');
  const lines=quote.items.map(item=>{const quantity=Number(item.qty),price=Number(item.price),cost=Number(item.cost),taxRate=Number(item.tax)||0;if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0||!Number.isFinite(cost)||cost<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>100)throw new RangeError('Quote line has invalid quantity, price, cost or tax.');return{...item,revenue:quantity*price,costTotal:quantity*cost,taxRate};});
  const gross=lines.reduce((s,l)=>s+l.revenue,0),discount=Number(quote.discount)||0;if(discount<0||discount>gross)throw new RangeError('Discount exceeds subtotal.');
  const normalized=lines.map(l=>{const allocated=gross?discount*l.revenue/gross:0,net=l.revenue-allocated;return{...l,discountAllocated:allocated,net,taxAmount:net*l.taxRate/100};});
  const subtotal=gross-discount,tax=normalized.reduce((s,l)=>s+l.taxAmount,0),cost=lines.reduce((s,l)=>s+l.costTotal,0),profit=subtotal-cost;
  return{lines:normalized,gross,discount,subtotal,tax,total:subtotal+tax,cost,profit,margin:subtotal?profit/subtotal*100:0};
}
