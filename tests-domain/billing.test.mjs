import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BillingLedger } from '../server/billing.mjs';

function setup(t, credits = 3) {
  let time = 1000;
  const ledger = new BillingLedger(':memory:', () => time);
  t.after(() => ledger.close());
  ledger.recordVerifiedPurchase({ purchaseId: 'TEST-RECEIPT-1', userId: 'user', credits });
  const reserve = (id = 'job') => ledger.reserve({ jobId: id, userId: 'user', credits: 1, requestHash: 'input-sha256', modelRevision: 'TEST-MODEL-v1', expiresAt: 2000 });
  return { ledger, reserve, advance: () => { time = 2001; } };
}
function attempt(ledger, jobId = 'job', attemptId = 'attempt', limitMicros = 200_000) {
  return ledger.beginAttempt({ jobId, attemptId, period: '2026-10-test', maximumMicros: 100_000, limitMicros });
}

test('administrator tests reserve and accept without inventing credits or purchases while retaining actual provider cost',t=>{
 const ledger=new BillingLedger(':memory:',()=>1000);t.after(()=>ledger.close());
 const input={jobId:'admin-test',userId:'admin',credits:1,creditExempt:true,requestHash:'hash',modelRevision:'revision',expiresAt:2000};
 assert.equal(ledger.reserve(input).creditExempt,true);ledger.reserve(input);
 assert.deepEqual(ledger.wallet('admin'),{available:0,reserved:0});
 assert.throws(()=>ledger.reserve({...input,creditExempt:false}),/replay mismatch/);
 attempt(ledger,'admin-test','admin-attempt');ledger.settleAttempt('admin-attempt',1234,'completed');ledger.markReady('admin-test','artifact');
 ledger.accept('admin-test','admin','artifact');ledger.accept('admin-test','admin','artifact');
 assert.deepEqual(ledger.wallet('admin'),{available:0,reserved:0});assert.equal(ledger.budget('2026-10-test').spent_micros,1234);
 assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM purchases').get().n,0);
 assert.equal(ledger.db.prepare("SELECT COUNT(*) n FROM credit_events WHERE kind='capture'").get().n,0);
 assert.equal(ledger.db.prepare("SELECT COUNT(*) n FROM credit_events WHERE kind='admin-test-accept'").get().n,1);
});
test('administrator rejection, expiry, uncertain settlement and confirmed-defect refund never add credit balances',t=>{
 let now=1000;const ledger=new BillingLedger(':memory:',()=>now);t.after(()=>ledger.close());
 const reserve=id=>ledger.reserve({jobId:id,userId:'admin',credits:1,creditExempt:true,requestHash:id,modelRevision:'revision',expiresAt:2000});
 reserve('rejected');ledger.markReady('rejected','a');ledger.release('rejected','admin','customer_rejected');
 reserve('refunded');ledger.markReady('refunded','b');ledger.accept('refunded','admin','b');ledger.refundConfirmedDefect('refunded','incident');
 reserve('uncertain');attempt(ledger,'uncertain','uncertain-attempt');ledger.markAttemptUncertain('uncertain-attempt');ledger.release('uncertain','admin','system_error');
 assert.equal(ledger.budget('2026-10-test').held_micros,100000);ledger.settleAttempt('uncertain-attempt',111,'completed');
 reserve('expired');now=2001;ledger.expire();assert.equal(ledger.job('expired').status,'released');
 assert.deepEqual(ledger.wallet('admin'),{available:0,reserved:0});assert.equal(ledger.budget('2026-10-test').spent_micros,111);
});
test('credit exemption is persisted per job and does not alter an earlier metered reservation after restart',t=>{
 const folder=mkdtempSync(join(tmpdir(),'admin-credit-policy-')),path=join(folder,'ledger.sqlite');let ledger=new BillingLedger(path,()=>1000);
 t.after(()=>{ledger.close();rmSync(folder,{recursive:true,force:true});});
 ledger.recordVerifiedPurchase({purchaseId:'previous-test',userId:'owner',credits:1});
 const input={userId:'owner',credits:1,requestHash:'h',modelRevision:'r',expiresAt:2000};
 ledger.reserve({...input,jobId:'metered'});ledger.markReady('metered','m');ledger.reserve({...input,jobId:'exempt',creditExempt:true});ledger.markReady('exempt','e');
 ledger.close();ledger=new BillingLedger(path,()=>1000);
 assert.equal(ledger.job('metered').creditExempt,false);assert.equal(ledger.job('exempt').creditExempt,true);
 ledger.accept('exempt','owner','e');assert.deepEqual(ledger.wallet('owner'),{available:0,reserved:1});
 ledger.accept('metered','owner','m');assert.deepEqual(ledger.wallet('owner'),{available:0,reserved:0});
});

test('purchase notifications and job retries cannot grant or reserve twice', t => {
  const { ledger, reserve } = setup(t);
  ledger.recordVerifiedPurchase({ purchaseId: 'TEST-RECEIPT-1', userId: 'user', credits: 3 });
  reserve(); reserve();
  assert.deepEqual(ledger.wallet('user'), { available: 2, reserved: 1 });
  assert.throws(() => ledger.recordVerifiedPurchase({ purchaseId: 'TEST-RECEIPT-1', userId: 'another', credits: 3 }), /mismatch/);
  assert.throws(() => ledger.reserve({ jobId: 'job', userId: 'user', credits: 2, requestHash: 'changed', modelRevision: 'TEST-MODEL-v1', expiresAt: 2000 }), /mismatch/);
});
test('system error or rejected preview restores credits once and late results cannot charge', t => {
  const { ledger, reserve } = setup(t);
  reserve(); ledger.release('job', 'user', 'system_error'); ledger.release('job', 'user', 'system_error');
  assert.equal(ledger.markReady('job', 'late-artifact').status, 'released');
  assert.throws(() => ledger.accept('job', 'user', 'late-artifact'));
  assert.deepEqual(ledger.wallet('user'), { available: 3, reserved: 0 });
  reserve('rejected'); ledger.markReady('rejected', 'preview'); ledger.release('rejected', 'user', 'customer_rejected');
  assert.deepEqual(ledger.wallet('user'), { available: 3, reserved: 0 });
});
test('only the owner accepting the correct ready artifact captures once', t => {
  const { ledger, reserve } = setup(t);
  reserve(); assert.throws(() => ledger.accept('job', 'user', null), /not ready/);
  ledger.markReady('job', 'artifact');
  assert.throws(() => ledger.accept('job', 'intruder', 'artifact'), /owner/);
  assert.throws(() => ledger.accept('job', 'user', 'wrong'), /version/);
  ledger.accept('job', 'user', 'artifact'); ledger.accept('job', 'user', 'artifact');
  assert.deepEqual(ledger.wallet('user'), { available: 2, reserved: 0 });
  assert.equal(ledger.db.prepare("SELECT count(*) n FROM credit_events WHERE kind='capture'").get().n, 1);
});
test('confirmed defect after acceptance restores one credit, including duplicate reports', t => {
  const { ledger, reserve } = setup(t);
  reserve(); ledger.markReady('job', 'artifact'); ledger.accept('job', 'user', 'artifact');
  ledger.refundConfirmedDefect('job', 'incident-1'); ledger.refundConfirmedDefect('job', 'incident-2');
  assert.deepEqual(ledger.wallet('user'), { available: 3, reserved: 0 });
  assert.equal(ledger.job('job').status, 'refunded');
});
test('unaccepted preview expires without a charge, including acceptance at the deadline', t => {
  const { ledger, reserve, advance } = setup(t);
  reserve(); ledger.markReady('job', 'artifact'); advance();
  assert.equal(ledger.accept('job', 'user', 'artifact').status, 'released');
  ledger.expire(); assert.deepEqual(ledger.wallet('user'), { available: 3, reserved: 0 });
});
test('an uncertain provider request cannot trigger a blind retry and customer expiry does not erase API cost', t => {
  const { ledger, reserve, advance } = setup(t);
  reserve(); assert.equal(attempt(ledger).shouldDispatch, true);
  assert.equal(attempt(ledger).shouldDispatch, false);
  ledger.markAttemptUncertain('attempt');
  assert.throws(() => attempt(ledger, 'job', 'new-attempt'), /dispatchable/);
  assert.throws(() => ledger.markReady('job', 'artifact'), /Resolve/);
  advance(); ledger.expire();
  assert.deepEqual(ledger.wallet('user'), { available: 3, reserved: 0 });
  assert.equal(ledger.budget('2026-10-test').held_micros, 100_000);
  ledger.settleAttempt('attempt', 70_000, 'completed'); ledger.settleAttempt('attempt', 70_000, 'completed');
  assert.equal(ledger.budget('2026-10-test').spent_micros, 70_000);
  assert.equal(ledger.budget('2026-10-test').held_micros, 0);
  assert.equal(ledger.job('job').status, 'released');
});
test('quality failure refunds the customer while provider usage remains a business cost', t => {
  const { ledger, reserve } = setup(t);
  reserve(); attempt(ledger); ledger.settleAttempt('attempt', 80_000, 'completed');
  ledger.release('job', 'user', 'quality_failed');
  assert.equal(ledger.wallet('user').available, 3);
  assert.equal(ledger.budget('2026-10-test').spent_micros, 80_000);
});
test('provider budget includes in-flight requests and pauses new calls after an overrun', t => {
  const { ledger, reserve } = setup(t);
  reserve('one'); reserve('two'); attempt(ledger, 'one', 'one', 100_000);
  assert.throws(() => attempt(ledger, 'two', 'two', 100_000), /budget/);
  ledger.settleAttempt('one', 120_000, 'completed');
  assert.equal(ledger.budget('2026-10-test').spent_micros, 120_000);
  assert.throws(() => attempt(ledger, 'two', 'two', 100_000), /budget/);
  assert.equal(ledger.wallet('user').reserved, 2); // No hidden customer capture.
});
test('known failures have a bounded retry allowance', t => {
  const { ledger, reserve } = setup(t);
  reserve(); attempt(ledger); ledger.settleAttempt('attempt', 0, 'failed');
  attempt(ledger, 'job', 'retry'); ledger.settleAttempt('retry', 0, 'failed');
  assert.throws(() => attempt(ledger, 'job', 'third'), /Retry limit/);
  ledger.release('job', 'user', 'system_error');
  assert.deepEqual(ledger.wallet('user'), { available: 3, reserved: 0 });
});
test('SQL transaction rolls back a wallet movement if event persistence fails', t => {
  const { ledger, reserve } = setup(t);
  ledger.db.exec("CREATE TRIGGER fail_reserve BEFORE INSERT ON credit_events WHEN NEW.kind='reserve' BEGIN SELECT RAISE(ABORT, 'disk simulation'); END;");
  assert.throws(() => reserve(), /disk simulation/);
  assert.deepEqual(ledger.wallet('user'), { available: 3, reserved: 0 });
  assert.throws(() => ledger.job('job'), /not found/);
});
test('independent connections and restart retain balances and prevent spending the same credit', t => {
  const path = mkdtempSync(join(tmpdir(), 'aiadcast-ledger-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  const a = new BillingLedger(join(path, 'ledger.sqlite'), () => 1000);
  const b = new BillingLedger(join(path, 'ledger.sqlite'), () => 1000);
  a.recordVerifiedPurchase({ purchaseId: 'TEST-RECEIPT', userId: 'user', credits: 1 });
  const job = { userId: 'user', credits: 1, requestHash: 'input', modelRevision: 'test', expiresAt: 2000 };
  a.reserve({ ...job, jobId: 'one' });
  assert.throws(() => b.reserve({ ...job, jobId: 'two' }), /Insufficient/);
  a.close(); b.close();
  const c = new BillingLedger(join(path, 'ledger.sqlite'), () => 1000);
  assert.deepEqual(c.wallet('user'), { available: 0, reserved: 1 });
  c.release('one', 'user', 'system_error'); c.close();
});

