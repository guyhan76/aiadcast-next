import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BetaStore} from '../server/beta-store.mjs';
import {TestCheckout} from '../server/test-checkout.mjs';
import {GenerationService,ApiFailure} from '../server/generation-service.mjs';
function setup(t){const dir=mkdtempSync(join(tmpdir(),'credits-checkout-')),store=new BetaStore(dir),user={id:store.provision({label:'Fixture',credits:0}).userId},s=new GenerationService({testCredits:0});t.after(()=>{s.close();store.close();rmSync(dir,{recursive:true,force:true});});let payment,calls=0;const provider={lookup:async()=>{if(!payment)throw new ApiFailure('PAYMENT_NOT_FOUND',404);return payment;},confirm:async q=>{calls++;return payment={...q,status:'DONE',currency:'KRW',totalAmount:q.amount};}};const c=new TestCheckout(store,{provider,clientKey:'test_ck_fixture',publicOrigin:'https://fixture.invalid',creditPurchase:async(_,p)=>s.recordTestPurchase(p),readPurchase:async(_,p)=>s.testPurchaseReceipt(p)});return {s,c,user,calls:()=>calls};}
test('all versioned test SKUs quote exact KRW and units; retired SKUs cannot create new orders',t=>{const {c,user}=setup(t);for(const [pack,credits,amount]of [['credits-v3-50',50,18000],['credits-v3-100',100,33900],['credits-v3-250',250,79900],['credits-v3-500',500,149900],['plan-ultra-annual',500,1402800]]){const o=c.create(user,{pack,requestId:'request-'+pack,agreed:true,credits:999,amount:1});assert.equal(o.credits,credits);assert.equal(o.amount,amount);assert.equal(o.unit,'credit-v2');assert.equal(o.policy,'delivered-2026-10-18');}for(const pack of ['trial','basic','bundle','credits-v2-180'])assert.throws(()=>c.create(user,{pack,requestId:'retired-'+pack,agreed:true}),/SKU_RETIRED/);});
test('lost credit success, duplicate confirmations and status recovery never credit twice or change legacy units',async t=>{const {s,c,user,calls}=setup(t);s.recordTestPurchase({purchaseId:'legacy',credits:2});const o=c.create(user,{pack:'credits-v3-50',requestId:'new-credit-request',agreed:true}),params=new URLSearchParams(new URL(o.checkoutUrl).hash.split('?')[1]),b={orderId:o.id,ticket:params.get('ticket'),amount:18000,paymentKey:'fixture-payment'};
 const credit=c.creditPurchase;c.creditPurchase=async(...args)=>{await credit(...args);throw Error('LOST_SUCCESS');};await assert.rejects(c.confirm(b),/LOST_SUCCESS/);assert.equal(s.wallet().credits.available,50);assert.equal(s.wallet().available,2);c.creditPurchase=credit;
 const replies=await Promise.all([c.confirm(b),c.status(user,o.id),c.confirm(b)]);for(const r of replies){assert.equal(r.receipt.balance,50);assert.equal(r.receipt.unit,'credit-v2');}assert.equal(calls(),1);assert.equal(s.wallet().credits.available,50);await assert.rejects(c.confirm({...b,amount:6900}),/INVALID_CONFIRMATION/);assert.equal(s.wallet().available,2);
});

test('a pending pre-launch order retains its original amount and retired quantity on retry',async t=>{
 const {s,c,user}=setup(t);
 const old=c.create(user,{pack:'credits-v3-50',requestId:'before-price-change',agreed:true});
 c.db.prepare('UPDATE test_orders SET pack=?,credits=?,amount=? WHERE id=?').run('credits-v2-180',180,48900,old.id);
 const recovered=c.create(user,{pack:'credits-v2-180',requestId:'before-price-change',agreed:true});
 assert.equal(recovered.amount,48900);assert.equal(recovered.credits,180);
 const params=new URLSearchParams(new URL(recovered.checkoutUrl).hash.split('?')[1]);
 const input={orderId:old.id,ticket:params.get('ticket'),paymentKey:'old-payment',amount:48900};
 await assert.rejects(c.confirm({...input,amount:9900}),/INVALID_CONFIRMATION/);
 assert.equal((await c.confirm(input)).receipt.balance,180);
 assert.equal(s.wallet().credits.available,180);
});

test('a verified annual payment funds one month at a time and cannot renew itself',async t=>{
 const {s,c,user}=setup(t);const start=Date.parse('2026-01-31T01:00:00+09:00');
 let now=start;c.now=s.now=()=>now;
 const order=c.create(user,{pack:'plan-business-annual',requestId:'annual-business-test',agreed:true});
 assert.equal(order.amount,742800);assert.equal(order.credits,250);
 assert.throws(()=>c.create(user,{pack:'plan-plus-monthly',requestId:'duplicate-plan',agreed:true}),/SUBSCRIPTION_ALREADY_ACTIVE/);
 const ticket=new URLSearchParams(new URL(order.checkoutUrl).hash.split('?')[1]).get('ticket');
 const payment={orderId:order.id,ticket,paymentKey:'annual-test-key',amount:742800};
 await c.confirm(payment);await c.confirm(payment);
 assert.equal(s.wallet().credits.available,250);
 now=Date.parse('2026-02-28T01:00:00+09:00');
 s.applySubscriptionCredits();s.applySubscriptionCredits();
 assert.equal(s.wallet().credits.available,500);
 now=Date.parse('2027-02-01T01:00:00+09:00');
 s.applySubscriptionCredits();s.applySubscriptionCredits();assert.equal(s.wallet().credits.available,3000);
});

test('monthly members reserve, change or cancel an annual switch and pay once after expiry',async t=>{
 const {s,c,user}=setup(t);
 const start=Date.parse('2026-01-31T12:00:00+09:00');
 const end=Date.parse('2026-02-28T12:00:00+09:00');
 let now=start;c.now=s.now=()=>now;
 const monthly=c.create(user,{pack:'plan-plus-monthly',requestId:'monthly-to-annual',agreed:true});
 const ticket=o=>new URLSearchParams(new URL(o.checkoutUrl).hash.split('?')[1]).get('ticket');
 assert.equal(c.annualSwitch(user),null);
 await c.confirm({orderId:monthly.id,ticket:ticket(monthly),paymentKey:'monthly-payment',amount:33900});
 const choice={sourceId:monthly.id,pack:'plan-ultra-annual',amount:1402800,agreed:true};
 const other={id:'other-member'};
 assert.throws(()=>c.changeAnnualSwitch(other,choice),/SWITCH_UNAVAILABLE/);
 assert.throws(()=>c.changeAnnualSwitch(user,{...choice,amount:1}),/SWITCH_UNAVAILABLE/);
 const first=c.changeAnnualSwitch(user,choice);
 assert.equal(first.effectiveAt,end);assert.equal(first.due,false);
 assert.deepEqual(c.changeAnnualSwitch(user,choice),first);
 c.changeAnnualSwitch(user,{...choice,pack:'plan-business-annual',amount:742800});
 assert.equal(c.changeAnnualSwitch(user,{sourceId:monthly.id,pack:null}).pack,null);
 c.changeAnnualSwitch(user,choice);
 const orderRequest={pack:choice.pack,switchSource:monthly.id,requestId:'reserved-annual-order',agreed:true};
 now=end-1;
 assert.throws(()=>c.create(user,orderRequest),/SWITCH_UNAVAILABLE/);
 assert.equal(s.wallet().credits.available,100);assert.equal(c.history(user).length,1);
 now=end;
 assert.equal(c.annualSwitch(user).due,true);
 const annual=c.create(user,orderRequest),retry=c.create(user,orderRequest);
 assert.equal(retry.id,annual.id);assert.equal(annual.amount,1402800);
 assert.equal(s.wallet().credits.available,100);
 c.provider.lookup=async()=>{throw new ApiFailure('PAYMENT_NOT_FOUND',404);};
 const confirm={orderId:annual.id,ticket:ticket(retry),amount:annual.amount,paymentKey:'annual-switch-payment'};
 await c.confirm(confirm);await c.confirm(confirm);
 assert.equal(s.wallet().credits.available,600);assert.equal(c.annualSwitch(user),null);
});
