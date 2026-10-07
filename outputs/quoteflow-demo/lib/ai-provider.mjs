/** Minimal provider-independent AI contracts. Never make prices or contract terms authoritative. */
export class AIProvider {
  async extractRFQ(_text) { throw new Error('extractRFQ must be implemented by a provider.'); }
  async draftFollowUp(_quote,_customer) { throw new Error('draftFollowUp must be implemented by a provider.'); }
  async generateDescription(_item) { throw new Error('generateDescription must be implemented by a provider.'); }
  async summarizeQuote(_quote) { throw new Error('summarizeQuote must be implemented by a provider.'); }
}

export function validateExtraction(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) throw new Error('AI returned an invalid extraction.');
  return { title: clean(value.title,160), deadline: clean(value.deadline,40), delivery: clean(value.delivery,500), items: value.items.slice(0,200).map(item=>({name:clean(item?.name,240),quantity:number(item?.quantity),unit:clean(item?.unit,40),notes:clean(item?.notes,500),sourceText:clean(item?.sourceText,1000),confidence:Math.max(0,Math.min(1,number(item?.confidence)||0))})).filter(i=>i.name&&i.quantity>0) };
}
const clean=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
const number=v=>Number.isFinite(Number(v))?Number(v):0;
