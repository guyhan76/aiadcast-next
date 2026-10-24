import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generationFailureDiagnostic,ProviderFailure} from '../server/openai-image-adapter.mjs';
test('failure diagnostics contain only fixed enums and a safe job identifier',()=>{
 const secret='private prompt token image https://example.com/secret';
 const err=new ProviderFailure('PROVIDER_UNCERTAIN',{diagnosticCode:'PROVIDER_TIMEOUT',providerStatus:504});err.message=secret;err.stack=secret;err.body=secret;
 assert.deepEqual(generationFailureDiagnostic({jobId:'12345678-1234-1234-1234-123456789abc',stage:'provider',error:err}),{event:'generation_failure',jobId:'12345678-1234-1234-1234-123456789abc',stage:'provider',code:'PROVIDER_TIMEOUT',httpStatus:504});
 const hidden=generationFailureDiagnostic({jobId:secret,stage:secret,error:{code:secret,message:secret}});assert.equal(JSON.stringify(hidden).includes(secret),false);assert.equal(hidden.code,'UNCLASSIFIED');assert.equal(hidden.jobId,null);
 assert.equal(generationFailureDiagnostic({stage:'persist-image',error:{code:'SUPABASE_UPLOAD_FAILED'}}).code,'SUPABASE_UPLOAD_FAILED');
});
