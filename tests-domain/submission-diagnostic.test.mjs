import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submissionDiagnostic,parseSubmissionDiagnostic} from '../src/submission-diagnostic.ts';
const at='2026-10-26T09:36:02.000Z';
test('submission distinguishes HTTP rejection, network, timeout and malformed response',()=>{
 assert.deepEqual(submissionDiagnostic({status:409,code:'CREDIT_RESERVATION_FAILED'},at),{status:409,code:'CREDIT_RESERVATION_FAILED',at});
 assert.equal(submissionDiagnostic({network:true},at).code,'NETWORK_ERROR');
 assert.equal(submissionDiagnostic({timedOut:true},at).code,'SUBMISSION_TIMEOUT');
 assert.equal(submissionDiagnostic({status:202},at).code,'INVALID_RESPONSE');
});
test('untrusted errors and fields cannot leak into stored diagnostics',()=>{
 const input={status:500,code:'private prompt token email image bytes',secret:'never retained'};
 assert.deepEqual(submissionDiagnostic(input,at),{status:500,code:'HTTP_ERROR',at});
 assert.deepEqual(parseSubmissionDiagnostic({...submissionDiagnostic(input,at),secret:'never retained'}),{status:500,code:'HTTP_ERROR',at});
});
test('persisted diagnostics reject untrusted codes, status and timestamps',()=>{
 for(const v of [null,{code:'private',status:500,at},{code:'NETWORK_ERROR',status:900,at},{code:'NETWORK_ERROR',status:null,at:'private value'}])assert.equal(parseSubmissionDiagnostic(v),undefined);
 assert.equal(submissionDiagnostic({status:NaN,code:'private'},at).status,null);
});
