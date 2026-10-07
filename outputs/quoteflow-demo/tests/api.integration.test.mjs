import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('auth, tenant isolation, pricing, quote snapshot and public acceptance',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'quoteflow-test-')),port=46000+Math.floor(Math.random()*1000),env={...process.env,PORT:String(port),QUOTE_DATABASE_PATH:join(dir,'test.sqlite'),APP_URL:`http://localhost:${port}`};
  const child=spawn(process.execPath,['--experimental-sqlite','server.mjs'],{env,stdio:'ignore'});t.after(async()=>{child.kill();await rm(dir,{recursive:true,force:true});});
  const base=env.APP_URL;let ready=false;for(let i=0;i<50&&!ready;i++){try{ready=(await fetch(`${base}/api/health`)).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,80));}assert.ok(ready,'server started');
  async function request(path,{cookie,...opts}={}){const r=await fetch(base+path,{...opts,headers:{...(opts.body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(opts.headers||{})}});return{status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  async function signup(email,organization){const r=await request('/api/auth/signup',{method:'POST',body:JSON.stringify({email,organization,password:'Correct-Horse-Battery-42!'})});assert.equal(r.status,201);return r.cookie;}
  const a=await signup('a@example.test','Tenant A'),b=await signup('b@example.test','Tenant B');
  const customer=await request('/api/customers',{cookie:a,method:'POST',body:JSON.stringify({name:'Private A Customer',email:'customer@example.test'})});assert.equal(customer.status,201);
  assert.equal((await request('/api/customers',{cookie:b})).body.items.length,0);
  assert.equal((await request(`/api/customers/${customer.body.item.id}`,{cookie:b,method:'DELETE'})).status,404);
  const product=await request('/api/products',{cookie:a,method:'POST',body:JSON.stringify({name:'Chair',sku:'CH-1',cost:40,price:100})});assert.equal(product.status,201);
  const quote=await request('/api/quotes',{cookie:a,method:'POST',body:JSON.stringify({title:'Chair order',customerId:customer.body.item.id,currency:'AED',discount:10,expiry:'2099-12-31',items:[{name:'Chair',qty:2,cost:40,price:100,tax:5}],payment:'Due in 30 days',delivery:'As agreed'})});assert.equal(quote.status,201);assert.equal(quote.body.totals.subtotal,190);assert.equal(quote.body.totals.tax,9.5);assert.equal(quote.body.totals.total,199.5);
  assert.equal((await request('/api/quotes',{cookie:b,method:'POST',body:JSON.stringify({...quote.body.item,customerId:customer.body.item.id})})).status,404);
  const sent=await request(`/api/quotes/${quote.body.item.id}/send`,{cookie:a,method:'POST'});assert.equal(sent.status,200);assert.match(sent.body.publicUrl,/\/q\//);const token=sent.body.token;
  const portal=await request(`/api/public/quote/${token}`);assert.equal(portal.status,200);assert.equal(portal.body.quote.status,'Sent');assert.equal(JSON.stringify(portal.body).includes('cost'),false);assert.equal(JSON.stringify(portal.body).includes('Private A Customer'),true);
  const accepted=await request(`/api/public/quote/${token}`,{method:'POST',body:JSON.stringify({action:'accept',name:'Alex Buyer',email:'alex@example.test',agree:true})});assert.equal(accepted.status,200);assert.equal(accepted.body.status,'Accepted');
  assert.equal((await request(`/api/public/quote/${token}`,{method:'POST',body:JSON.stringify({action:'reject',reason:'changed mind'})})).status,409);
  assert.equal((await request('/api/analytics',{cookie:a})).body.byCurrency.AED.won,1);
});
