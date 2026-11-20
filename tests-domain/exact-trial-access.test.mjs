import test from 'node:test';import assert from 'node:assert/strict';import {trialHttpDiagnostic,validTrialCapability} from '../src/exact-trial-access.ts';
test('diagnostics preserve only status and explicitly allowed codes, never raw error text',()=>{
 for(const [status,kind,code] of [[401,'auth','AUTH_REQUIRED'],[403,'forbidden','EXACT_TEXT_TRIAL_FORBIDDEN'],[503,'server','SERVER_BUSY'],[429,'server','RATE_LIMITED'],[200,'invalid','NOT_FOUND']])assert.deepEqual(trialHttpDiagnostic(status,{error:{code,message:'SECRET_SQL_EMAIL_TOKEN'}}),{status,kind,code});
 for(const body of [null,'secret',{error:{code:'SECRET_SQL_EMAIL_TOKEN',message:'private'}},{error:{code:{private:true}}}])assert.equal(trialHttpDiagnostic(503,body).code,'UNCLASSIFIED_RESPONSE');
 assert.equal(validTrialCapability({version:2,preparation:true,generationEnabled:false,reason:'PAID_TRIAL_NOT_APPROVED'}),true);
 for(const value of [null,{},true,{version:2,preparation:true,generationEnabled:true,reason:'PAID_TRIAL_NOT_APPROVED'}])assert.equal(validTrialCapability(value),false);
});
