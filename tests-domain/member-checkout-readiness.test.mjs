import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BetaStore} from '../server/beta-store.mjs';
import {createBetaServer} from '../server/beta-server.mjs';
import {GenerationService,ApiFailure} from '../server/generation-service.mjs';
import {accountConfiguration} from '../server/account-providers.mjs';

async function fixture(t,withCheckout){
 const directory=mkdtempSync(join(tmpdir(),'member-readiness-'));
 const store=new BetaStore(directory,{monthlyBudgetMicros:1000000});
 let receipt,confirmCalls=0,imageCalls=0;
 const accounts=accountConfiguration({AIADCAST_TEST_AUTH_ENABLED:'true',AIADCAST_TEST_ADMIN_EMAIL:'owner@example.com'});
 if(withCheckout)Object.assign(accounts,{clientKey:'test_ck_fixture',provider:{
  lookup:async()=>{if(!receipt)throw new ApiFailure('PAYMENT_NOT_FOUND',404);return receipt;},
  confirm:async p=>{confirmCalls++;return receipt={...p,status:'DONE',currency:'KRW',totalAmount:p.amount};}
 }});
 const app=createBetaServer({store,publicUrl:'https://beta.example.com',accounts,serviceFactory:u=>new GenerationService({databasePath:join(directory,u.id+'.sqlite'),budgetMicros:u.budget,testCredits:u.credits,enabled:true,providerConfigured:true,adapter:{generate:async()=>{imageCalls++;throw Error('Unexpected image call');}}})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();store.close();rmSync(directory,{recursive:true,force:true});});
 const call=async(path,body,token)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method:body?'POST':'GET',headers:{Origin:'https://beta.example.com','Content-Type':'application/json','X-Aiadcast-Client':'local-studio',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const signup=await call('/api/auth/test/signup',{email:'member@example.com',password:'Fixture-member-password!',name:'Member'});
 assert.equal(signup.status,200);
 return {call,store,app,session:signup.data,calls:()=>({confirmCalls,imageCalls})};
}

test('new server member has no credits or API allocation and unavailable checkout cannot create an order',async t=>{
 const {call,store,session,calls}=await fixture(t,false);
 const cap=await call('/api/account/capabilities');assert.equal(cap.data.checkout.enabled,false);assert.equal(cap.data.checkout.test,true);
 const status=(await call('/api/status',undefined,session.token)).data;
 assert.equal(status.wallet.available,0);assert.equal(status.budget.limitMicros,0);assert.equal(status.generation.reason,'BUDGET_NOT_AVAILABLE');
 const order=await call('/api/checkout/orders',{pack:'trial',requestId:'member-checkout-1',agreed:true},session.token);
 assert.equal(order.status,503);assert.equal(order.data.error.code,'CHECKOUT_UNAVAILABLE');
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM test_orders').get().n,0);
 assert.deepEqual(calls(),{confirmCalls:0,imageCalls:0});
});

test('successful substitute sandbox receipt grants credits once but does not authorize provider spending for a new member',async t=>{
 const {call,store,session,calls}=await fixture(t,true);
 assert.equal((await call('/api/account/capabilities')).data.checkout.enabled,true);
 const order=(await call('/api/checkout/orders',{pack:'trial',requestId:'member-checkout-2',agreed:true},session.token)).data;
 const q=new URLSearchParams(new URL(order.checkoutUrl).hash.split('?')[1]);
 const input={orderId:order.id,ticket:q.get('ticket'),amount:order.amount,paymentKey:'fixture-approved-payment'};
 for(let i=0;i<2;i++){const paid=await call('/api/checkout/confirm',input);assert.equal(paid.status,200);assert.equal(paid.data.state,'paid');assert.deepEqual(paid.data.receipt,{verified:true,grantedCredits:3,balance:3});}
 const status=(await call('/api/status',undefined,session.token)).data;
 assert.equal(status.wallet.available,3);assert.equal(status.budget.limitMicros,0);assert.equal(status.generation.enabled,false);assert.equal(status.generation.reason,'BUDGET_NOT_AVAILABLE');
 assert.equal(store.db.prepare('SELECT budget FROM users WHERE id=?').get(session.user.id).budget,0);
 assert.deepEqual(calls(),{confirmCalls:1,imageCalls:0});
});

test('October owner allocation consumes the entire five-dollar cap and rejects an additional member dollar',t=>{
 const directory=mkdtempSync(join(tmpdir(),'member-october-'));
 const store=new BetaStore(directory,{monthlyBudgetMicros:5000000,now:()=>Date.UTC(2026,9,18)});
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 const owner=store.provision({label:'Owner',budgetMicros:500000,credits:0}).userId;store.setRole(owner,'admin');
 const member=store.provision({label:'Member',budgetMicros:0,credits:0}).userId;
 store.activateOctoberBudget(owner);
 assert.equal(store.effectiveCap(),5000000);assert.equal(store.effectiveBudget(owner,'2026-10'),5000000);
 assert.throws(()=>store.setAllocation(member,1000000),/BETA_ALLOCATION_EXCEEDED/);
 assert.equal(store.effectiveBudget(member,'2026-10'),0);assert.equal(store.effectiveCap(),5000000);
});

test('credit overview authenticates and isolates wallet, purchase and grant history without payment or image calls',async t=>{
 const {call,store,session,calls}=await fixture(t,true);
 assert.equal((await call('/api/account/credits')).status,401);
 const other=(await call('/api/auth/test/signup',{email:'other@example.com',password:'Fixture-other-password!',name:'Other'})).data;
 const ownOrder=(await call('/api/checkout/orders',{pack:'trial',requestId:'overview-own-order',agreed:true},session.token)).data;
 await call('/api/checkout/orders',{pack:'basic',requestId:'overview-other-order',agreed:true},other.token);
 const insert=store.db.prepare("INSERT INTO admin_grants(id,actor_id,request_id,user_id,credits,state,created) VALUES(?,?,?,?,?,'completed',?)");
 insert.run('own-grant',session.user.id,'fixture-own-grant',session.user.id,30,Date.now());insert.run('other-grant',other.user.id,'fixture-other-grant',other.user.id,3,Date.now());
 const before=store.db.prepare('SELECT COUNT(*) n FROM admin_grants').get().n;
 for(let i=0;i<2;i++){const r=await call('/api/account/credits?userId='+other.user.id,undefined,session.token);assert.equal(r.status,200);assert.equal(r.data.wallet.available,0);assert.equal(r.data.wallet.reserved,0);assert.deepEqual(r.data.orders.map(o=>o.id),[ownOrder.id]);assert.deepEqual(r.data.grants.map(g=>g.id),['own-grant']);assert.equal(r.data.orders[0].state,'pending');}
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM admin_grants').get().n,before);assert.equal(store.db.prepare('SELECT budget FROM users WHERE id=?').get(session.user.id).budget,0);assert.deepEqual(calls(),{confirmCalls:0,imageCalls:0});
});
