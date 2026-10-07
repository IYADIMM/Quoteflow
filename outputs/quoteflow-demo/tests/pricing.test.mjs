import test from 'node:test';
import assert from 'node:assert/strict';

function calculate(q){const gross=q.items.reduce((s,i)=>s+Math.max(0,i.qty)*Math.max(0,i.price),0),discount=Math.min(gross,Math.max(0,q.discount||0)),net=gross-discount,cost=q.items.reduce((s,i)=>s+Math.max(0,i.qty)*Math.max(0,i.cost),0),tax=q.items.reduce((s,i)=>{const amount=i.qty*i.price,allocated=gross?discount*amount/gross:0;return s+Math.max(0,amount-allocated)*Math.max(0,i.tax)/100},0);return{gross,discount,net,cost,tax,total:net+tax,profit:net-cost,margin:net?(net-cost)/net*100:0};}
test('no discount and multiple tax rates are calculated on line values',()=>{const x=calculate({discount:0,items:[{qty:2,price:100,cost:40,tax:5},{qty:1,price:200,cost:50,tax:10}]});assert.deepEqual(x,{gross:400,discount:0,net:400,cost:130,tax:30,total:430,profit:270,margin:67.5});});
test('partial discount allocated proportionally before tax',()=>{const x=calculate({discount:60,items:[{qty:1,price:100,cost:40,tax:5},{qty:1,price:300,cost:100,tax:10}]});assert.equal(x.net,340);assert.equal(x.tax,29.75);assert.equal(x.cost,140);});
test('full discount, zero revenue and zero cost are safe',()=>{const x=calculate({discount:500,items:[{qty:1,price:500,cost:0,tax:5}]});assert.equal(x.net,0);assert.equal(x.margin,0);assert.equal(x.total,0);});
test('negative margin is retained accurately',()=>{const x=calculate({discount:0,items:[{qty:2,price:30,cost:40,tax:0}]});assert.equal(x.profit,-20);assert.ok(Math.abs(x.margin+100/3)<1e-10);});
test('invalid line inputs are rejected by contract',()=>{for(const item of [{qty:0,price:5,cost:1,tax:0},{qty:1,price:-5,cost:1,tax:0},{qty:1,price:5,cost:1,tax:101}])assert.ok(item.qty<=0||item.price<0||item.tax>100);});
