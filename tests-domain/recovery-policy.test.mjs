import test from 'node:test';
import assert from 'node:assert/strict';
import {retryRecoveryRead,recoveryDelays,uncertainReadDelays} from '../src/recovery-policy.ts';
test('read retry allows bounded transient failures only',()=>{
 for(const status of [408,429,500,502,503])assert.equal(retryRecoveryRead({status}),true);
 for(const status of [400,401,403,404,409,422])assert.equal(retryRecoveryRead({status}),false);
 assert.equal(retryRecoveryRead({status:503,code:'SESSION_CHANGED'}),false);
 assert.equal(retryRecoveryRead({network:true}),true);assert.equal(retryRecoveryRead({timedOut:true}),true);
 for(const code of ['INVALID_HISTORY','AMBIGUOUS_HISTORY','REQUEST_NOT_FOUND','SESSION_CHANGED'])assert.equal(retryRecoveryRead({code,network:true}),false);
 assert.equal(retryRecoveryRead({status:200,code:'API_UNAVAILABLE'}),false);
 assert.equal(retryRecoveryRead({status:502,code:'API_UNAVAILABLE'}),true);
});
test('read backoff and uncertain polling have finite increasing bounds',()=>{
 assert.deepEqual(recoveryDelays,[1000,2000]);assert.deepEqual(uncertainReadDelays,[2000,4000,8000]);
 assert.equal(recoveryDelays.length+1,3);assert.equal(uncertainReadDelays.length,3);
});
