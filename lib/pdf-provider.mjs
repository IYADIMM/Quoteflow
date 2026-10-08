const safe = (value, max = 2000) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').slice(0, max);
export function customerPdfModel(quote) {
  const snapshot = quote.snapshot;
  if (!snapshot?.items || !snapshot?.totals) throw new Error('A customer-safe quote snapshot is required.');
  const discount = Number(snapshot.totals.discount || 0), hasExplicitNet = snapshot.totals.netSubtotal != null;
  return {
    number: safe(quote.number, 80), title: safe(quote.title, 240), version: Number(snapshot.version || quote.version || 1), currency: safe(quote.currency || snapshot.totals.currency, 3),
    issueDate: quote.issueDate instanceof Date ? quote.issueDate.toISOString().slice(0, 10) : safe(quote.issueDate, 10), expiryDate: quote.expiryDate instanceof Date ? quote.expiryDate.toISOString().slice(0, 10) : safe(quote.expiryDate, 10),
    company: { name: safe(snapshot.company?.name, 160), address: safe(snapshot.company?.address, 500), email: safe(snapshot.company?.email, 200), phone: safe(snapshot.company?.phone, 80), legal: safe(snapshot.company?.legal, 500) },
    customer: { name: safe(snapshot.customer?.name, 160), contact: safe(snapshot.customer?.contact, 160), email: safe(snapshot.customer?.email, 200), address: safe(snapshot.customer?.address, 500) },
    items: snapshot.items.map((item, index) => ({ line: index + 1, sku: safe(item.sku, 80), name: safe(item.name, 240), description: safe(item.description, 2000), quantity: Number(item.qty), unit: safe(item.unit, 40), price: Number(item.price), tax: Number(item.tax) })),
    totals: { subtotal: Number(snapshot.totals.subtotal) + (hasExplicitNet ? 0 : discount), discount, netSubtotal: Number(hasExplicitNet ? snapshot.totals.netSubtotal : snapshot.totals.subtotal), tax: Number(snapshot.totals.tax), total: Number(snapshot.totals.total) },
    terms: { payment: safe(snapshot.terms?.payment, 500), delivery: safe(snapshot.terms?.delivery, 500), notes: safe(snapshot.terms?.notes, 2000) }
  };
}

const amount = (value, currency) => new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
export async function generateQuotePdf(quote, { fontPath } = {}) {
  const model = customerPdfModel(quote), PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: `${model.number} — ${model.title}`, Author: model.company.name, Subject: 'Customer quotation' } });
  const chunks = []; doc.on('data', chunk => chunks.push(chunk)); const finished = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  if (fontPath) doc.registerFont('QuoteFlow', fontPath).font('QuoteFlow');
  const bottom = 750, green = '#245c49', ink = '#172b26', muted = '#68766f', line = '#dbe2dd';
  const ensure = height => { if (doc.y + height > bottom) doc.addPage(); };
  const row = (label, value, bold = false) => { ensure(22); const y = doc.y; doc.fillColor(muted).fontSize(9).text(label, 350, y, { width: 90 }); doc.fillColor(ink).fontSize(bold ? 12 : 9).text(value, 440, y, { width: 110, align: 'right' }); doc.y = Math.max(doc.y, y + (bold ? 22 : 16)); };
  doc.fillColor(green).fontSize(18).text(model.company.name || 'QuoteFlow', 42, 42, { width: 330 });
  doc.fillColor(ink).fontSize(24).text('QUOTATION', 385, 42, { width: 168, align: 'right' });
  doc.moveTo(42, 82).lineTo(553, 82).strokeColor(green).lineWidth(1.5).stroke();
  doc.fillColor(muted).fontSize(9).text(`${model.company.address}\n${model.company.email}${model.company.phone ? ` · ${model.company.phone}` : ''}`, 42, 94, { width: 300, lineGap: 3 });
  doc.fillColor(ink).fontSize(10).text(`${model.number}\nRevision ${model.version}\nIssued ${model.issueDate || '—'}\nValid until ${model.expiryDate || '—'}\nCurrency ${model.currency}`, 385, 94, { width: 168, align: 'right', lineGap: 3 });
  doc.y = 168; doc.fillColor(muted).fontSize(8).text('PREPARED FOR'); doc.fillColor(ink).fontSize(12).text(model.customer.name || 'Customer'); doc.fontSize(9).fillColor(muted).text([model.customer.contact, model.customer.email, model.customer.address].filter(Boolean).join('\n'), { lineGap: 2 });
  doc.moveDown(1); doc.fillColor(ink).fontSize(15).text(model.title); doc.moveDown(.6);
  const widths = [24, 230, 50, 72, 48, 87], left = 42;
  const header = () => { const y = doc.y; ['#','ITEM / DESCRIPTION','QTY','UNIT PRICE','TAX','AMOUNT'].forEach((text, i) => doc.fillColor(muted).fontSize(7.5).text(text, left + widths.slice(0, i).reduce((a,b)=>a+b,0), y, { width: widths[i], align: i > 1 ? 'right' : 'left' })); doc.y = y + 18; doc.moveTo(left, doc.y).lineTo(553, doc.y).strokeColor(line).lineWidth(.7).stroke(); doc.y += 7; };
  header();
  for (const item of model.items) {
    const description = `${item.name}${item.sku ? `\n${item.sku}` : ''}${item.description ? `\n${item.description}` : ''}`;
    const height = Math.max(36, doc.heightOfString(description, { width: widths[1] - 8, lineGap: 2 }) + 10); if (doc.y + height > bottom) { doc.addPage(); header(); }
    const y = doc.y, values = [String(item.line), description, `${item.quantity} ${item.unit}`, amount(item.price, model.currency), `${item.tax}%`, amount(item.quantity * item.price, model.currency)];
    values.forEach((text, i) => doc.fillColor(i === 1 ? ink : muted).fontSize(i === 1 ? 8.5 : 8).text(text, left + widths.slice(0, i).reduce((a,b)=>a+b,0), y, { width: widths[i] - 6, align: i > 1 ? 'right' : 'left', lineGap: 2 }));
    doc.y = y + height; doc.moveTo(left, doc.y).lineTo(553, doc.y).strokeColor(line).lineWidth(.5).stroke(); doc.y += 7;
  }
  ensure(120); doc.moveDown(.4); row('Subtotal', amount(model.totals.subtotal, model.currency)); if (model.totals.discount) row('Discount', `− ${amount(model.totals.discount, model.currency)}`); row('Net subtotal', amount(model.totals.netSubtotal, model.currency)); row('Tax', amount(model.totals.tax, model.currency)); row(`Total ${model.currency}`, amount(model.totals.total, model.currency), true);
  ensure(100); doc.moveDown(1); doc.fillColor(ink).fontSize(9).text(`Payment · ${model.terms.payment || 'As agreed'}\nDelivery · ${model.terms.delivery || 'As agreed'}${model.terms.notes ? `\nNotes · ${model.terms.notes}` : ''}`, 42, doc.y, { width: 511, lineGap: 4 });
  const range = doc.bufferedPageRange(); for (let index = range.start; index < range.start + range.count; index++) { doc.switchToPage(index); doc.fillColor(muted).fontSize(7.5).text(`${model.company.name} · ${model.number} · Revision ${model.version}`, 42, 790, { width: 400 }); doc.text(`Page ${index + 1} of ${range.count}`, 450, 790, { width: 103, align: 'right' }); }
  doc.end(); return finished;
}
