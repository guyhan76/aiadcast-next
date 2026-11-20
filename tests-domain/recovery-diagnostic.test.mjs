import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoveryDiagnostic} from '../src/recovery-diagnostic.ts';
for(const [name,input,expected] of [
 ['401',{status:401,code:'AUTH_REQUIRED'},'AUTH_REQUIRED'],
 ['404',{status:404,code:'JOB_NOT_FOUND'},'JOB_NOT_FOUND'],
 ['timeout',{aborted:true},'LOOKUP_TIMEOUT'],
 ['body timeout',{status:200,aborted:true},'LOOKUP_TIMEOUT'],
 ['network',{network:true},'NETWORK_ERROR'],
 ['schema',{status:200,code:'INVALID_HISTORY'},'INVALID_HISTORY'],
 ['unknown HTTP error',{status:500,code:'secret prompt token'},'HTTP_ERROR'],
 ['untrusted exception',{code:'private details'},'INVALID_RESPONSE'],
 ['session change',{code:'SESSION_CHANGED'},'SESSION_CHANGED'],
])test(`sanitized recovery diagnostic: ${name}`,()=>{
 const result=recoveryDiagnostic({step:'job',...input,body:'private image',token:'private token'});
 assert.deepEqual(Object.keys(result),['step','status','code']);assert.equal(result.code,expected);
 assert.equal(result.status,input.status??null);assert.ok(!JSON.stringify(result).includes('private'));
});
test('invalid status cannot become display data',()=>{
 for(const status of [0,600,NaN,200.5,'private'])assert.equal(recoveryDiagnostic({step:'history',status}).status,null);
});
