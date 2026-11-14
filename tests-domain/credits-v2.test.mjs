import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BillingLedger} from '../server/billing.mjs';
import {GenerationService} from '../server/generation-service.mjs';
import {ProviderFailure,hashBytes} from '../server/openai-image-adapter.mjs';
import sharp from 'sharp';
const unit='credit-v2';
function fixture(t){let now=1000;const ledger=new BillingLedger(':memory:',()=>now);t.after(()=>ledger.close());ledger.recordVerifiedPurchase({purchaseId:'new-purchase',userId:'user',credits:30,unit});const reserve=(jobId,extra={})=>ledger.reserve({jobId,userId:'user',credits:10,unit,requestHash:'hash',modelRevision:'test',expiresAt:2000,...extra});return {ledger,reserve,advance:()=>now=3000};}
test('new credit purchase, reservation, delivery and duplicate callbacks are idempotent and separate from tickets',t=>{
 const {ledger:l,reserve}=fixture(t);l.recordVerifiedPurchase({purchaseId:'old',userId:'user',credits:2});
 l.recordVerifiedPurchase({purchaseId:'new-purchase',userId:'user',credits:30,unit});assert.throws(()=>l.recordVerifiedPurchase({purchaseId:'new-purchase',userId:'user',credits:30}),/mismatch/);
 reserve('new');reserve('new');assert.deepEqual(l.wallet('user',unit),{available:20,reserved:10});l.markReady('new','artifact');l.markReady('new','artifact');assert.deepEqual(l.wallet('user',unit),{available:20,reserved:0});l.accept('new','user','artifact');l.accept('new','user','artifact');assert.equal(l.wallet('user',unit).available,20);assert.deepEqual(l.wallet('user'),{available:2,reserved:0});assert.equal(l.db.prepare("SELECT COUNT(*) n FROM credit_events WHERE event_key='capture:new'").get().n,1);
});
test('unreviewed delivered results do not expire/refund; preference rejection does not refund; confirmed defects refund once',t=>{
 const {ledger:l,reserve,advance}=fixture(t);reserve('first');l.markReady('first','artifact');advance();l.expire();assert.equal(l.job('first').status,'ready');l.release('first','user','customer_rejected');assert.equal(l.wallet('user',unit).available,20);l.refundConfirmedDefect('first','incident');l.refundConfirmedDefect('first','incident');assert.deepEqual(l.wallet('user',unit),{available:30,reserved:0});
});
test('failed and expired undelivered work releases exactly its unit while provider holds remain separate',t=>{
 const {ledger:l,reserve,advance}=fixture(t);reserve('a');reserve('b');reserve('c');assert.throws(()=>reserve('d'),/Insufficient/);l.markReady('a','artifact');l.release('b','user','system_error');l.beginAttempt({jobId:'c',attemptId:'attempt-c',period:'test',maximumMicros:500000,limitMicros:1000000});l.markAttemptUncertain('attempt-c');advance();l.expire();l.markReady('c','late');assert.deepEqual(l.wallet('user',unit),{available:20,reserved:0});assert.equal(l.budget('test').held_micros,500000);assert.equal(l.job('a').status,'ready');assert.equal(l.job('c').status,'released');
});
test('legacy jobs keep one-ticket acceptance, rejection and expiry with simultaneous v2 balance',t=>{
 const {ledger:l,reserve,advance}=fixture(t);l.recordVerifiedPurchase({purchaseId:'old',userId:'user',credits:3});for(const id of ['a','b','c'])reserve(id,{unit:'legacy-ticket',credits:1});l.markReady('a','artifact');assert.equal(l.wallet('user').reserved,3);l.accept('a','user','artifact');l.release('b','user','customer_rejected');advance();l.expire();assert.deepEqual(l.wallet('user'),{available:2,reserved:0});assert.equal(l.wallet('user',unit).available,30);
});
const bytes=await sharp({create:{width:8,height:8,channels:4,background:'#ffffff'}}).png().toBuffer();
const source={name:'test.png',data:`data:image/png;base64,${bytes.toString('base64')}`,width:8,height:8,sha256:hashBytes(bytes)};
function input(s){return {requestId:randomUUID(),projectId:randomUUID(),creditQuote:s.creditQuote(),source,request:{version:1,mode:'original',operation:'compose-original',subjectType:'physical-product',productName:'Test',productProfile:{category:'box'},brief:'Test background',source:{sha256:source.sha256,role:'protected-product'},copy:{title:'Test'},specifications:[],output:{format:'1:1',locale:'ko',showDimensions:false},scene:{backgroundColor:'#ffffff'}}};}
function service(t,{testCredits=0,adapter}={}){let calls=0;const s=new GenerationService({testCredits,enabled:true,providerConfigured:true,budgetMicros:2000000,adapter:adapter??{generate:async()=>{calls++;return {bytes,mime:'image/png',width:8,height:8,sha256:source.sha256,role:'background',cost:{microUsd:100},usage:{},model:'local-fixture'};}}});t.after(()=>s.close());s.recordTestPurchase({purchaseId:'new-purchase',credits:30,unit});return {s,calls:()=>calls};}
test('new requests require explicit current quote, lost success response reuses result, and review is idempotent',async t=>{
 const {s,calls}=service(t);const b=input(s);await assert.rejects(s.create({...b,creditQuote:undefined}),/CREDIT_QUOTE_CHANGED/);assert.equal(calls(),0);
 const first=await s.create(b);await s.waitForIdle();const again=await s.create(b);assert.equal(first.job.id,again.job.id);assert.equal(calls(),1);assert.equal(again.job.creditCaptured,true);assert.equal(s.wallet().credits.available,20);
 const report=s.reportDefect(first.job.id,{description:'The supplied text is missing from the result.'});assert.equal(s.reportDefect(first.job.id,{description:'Duplicate user report without duplicate restoration.'}).id,report.id);assert.equal(s.wallet().credits.available,20);
 s.reviewDefect(first.job.id,{decision:'confirmed',resolution:'Verified missing supplied headline against the input.',reviewer:'admin-user'});s.reviewDefect(first.job.id,{decision:'confirmed',resolution:'Verified missing supplied headline against the input.',reviewer:'admin-user'});assert.equal(s.wallet().credits.available,30);assert.throws(()=>s.reviewDefect(first.job.id,{decision:'declined',resolution:'Changed decision.',reviewer:'admin-user'}),/REVIEW_CONFLICT/);
});
test('legacy tickets are consumed first without conversion and stale unit quotes cannot trigger a generation',async t=>{
 const {s,calls}=service(t,{testCredits:1});const b=input(s);assert.equal(b.creditQuote.unit,'legacy-ticket');const {job}=await s.create(b);await s.waitForIdle();s.accept(job.id,s.job(job.id).artifactId);assert.equal(s.wallet().credits.available,30);await assert.rejects(s.create({...input(s),creditQuote:b.creditQuote}),/CREDIT_QUOTE_CHANGED/);assert.equal(calls(),1);assert.equal(s.creditQuote().amount,10);
});
test('known provider failure restores new reservations without invented delivery or cost',async t=>{
 const {s}=service(t,{adapter:{generate:async()=>{throw new ProviderFailure('FIXTURE_FAILURE',{uncertain:false});}}});const {job}=await s.create(input(s));await s.waitForIdle();assert.equal(s.job(job.id).state,'failed');assert.equal(s.wallet().credits.available,30);assert.equal(s.wallet().credits.reserved,0);
});
test('capture failure rolls back the entire delivery transition instead of leaving a partial debit',t=>{
 const {ledger:l,reserve}=fixture(t);reserve('atomic');l.db.exec("CREATE TRIGGER fail_capture BEFORE INSERT ON credit_events WHEN NEW.kind='delivered-capture' BEGIN SELECT RAISE(ABORT,'fixture capture failure'); END;");assert.throws(()=>l.markReady('atomic','artifact'),/fixture capture failure/);assert.equal(l.job('atomic').status,'reserved');assert.equal(l.job('atomic').captured,false);assert.deepEqual(l.wallet('user',unit),{available:20,reserved:10});l.db.exec('DROP TRIGGER fail_capture');l.markReady('atomic','artifact');assert.deepEqual(l.wallet('user',unit),{available:20,reserved:0});
});
test('a lost delivery-commit response preserves the delivered result and single charge',async t=>{
 const {s,calls}=service(t);const ready=s.ledger.markReady.bind(s.ledger);s.ledger.markReady=(...args)=>{ready(...args);throw Error('LOST_DELIVERY_COMMIT_RESPONSE');};const b=input(s),created=await s.create(b);await s.waitForIdle();const recovered=await s.create(b);assert.equal(recovered.job.id,created.job.id);assert.equal(recovered.job.state,'ready');assert.equal(recovered.job.creditCaptured,true);assert.deepEqual(s.wallet().credits,{available:20,reserved:0});assert.equal(s.status().budget.spentMicros,100);assert.equal(calls(),1);
});

test('edited delivered image charges once per new result and preserves the earlier delivery',async t=>{
 const {s,calls}=service(t);const a=input(s),first=await s.create(a);await s.waitForIdle();const original=s.job(first.job.id);
 const b={...a,requestId:randomUUID(),request:{...a.request,brief:'Changed backdrop'}};const next=await s.create(b);await s.waitForIdle();
 assert.notEqual(next.job.id,first.job.id);assert.deepEqual(s.job(first.job.id),original);
 assert.equal((await s.create(b)).job.id,next.job.id);assert.equal((await s.create({...b,requestId:randomUUID()})).job.id,next.job.id);
 s.accept(next.job.id,s.job(next.job.id).artifactId);s.accept(next.job.id,s.job(next.job.id).artifactId);
 assert.equal(calls(),2);assert.deepEqual(s.wallet().credits,{available:10,reserved:0});
});
