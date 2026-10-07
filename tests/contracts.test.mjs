import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExtraction } from '../lib/ai-provider.mjs';
import { calculateQuote } from '../lib/pricing.mjs';

test('AI extraction validator bounds output and rejects invalid records',()=>{
  assert.throws(()=>validateExtraction({items:'bad'}));
  const result=validateExtraction({title:'  Office refresh  ',items:[{name:'Chair',quantity:12,unit:'each',confidence:1.4,sourceText:'12 Chairs'},{name:'Invalid',quantity:-2},{}]});
  assert.equal(result.title,'Office refresh');assert.equal(result.items.length,1);assert.equal(result.items[0].confidence,1);
});
test('shared pricing engine allocates discount proportionally before tax',()=>{
  const q=calculateQuote({discount:60,items:[{qty:1,price:100,cost:40,tax:5},{qty:1,price:300,cost:100,tax:10}]});
  assert.equal(q.subtotal,340);assert.equal(q.tax,29.75);assert.equal(q.total,369.75);assert.equal(q.cost,140);
});
test('pricing rejects negative price and discount larger than subtotal',()=>{
  assert.throws(()=>calculateQuote({discount:0,items:[{qty:1,price:-1,cost:0,tax:0}]}));
  assert.throws(()=>calculateQuote({discount:101,items:[{qty:1,price:100,cost:0,tax:0}]}));
});
