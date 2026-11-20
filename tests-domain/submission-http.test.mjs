import test from 'node:test';
import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BetaStore} from '../server/beta-store.mjs';
import {createBetaServer} from '../server/beta-server.mjs';
import {ApiFailure} from '../server/generation-service.mjs';
test('real HTTP admission logs routing auth body and service failures without payloads or changed responses',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'submission-http-')),store=new BetaStore(dir,{monthlyBudgetMicros:1000000});const logs=[],original=console.info;
 let calls=0,mode='ok';const service={create:async()=>{calls++;if(mode==='reject')throw new ApiFailure('CREDIT_RESERVATION_FAILED',409);return {job:{id:'mock-job'}};},close(){}};
 const app=createBetaServer({store,publicUrl:'https://beta.example.com',serviceFactory:()=>{if(mode==='initialize-fail')throw Error('PRIVATE_DATABASE_ERROR');return service;}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const account=store.provision({label:'PRIVATE_NAME',budgetMicros:500000,credits:3}),session=store.login(account.invite),base='http://127.0.0.1:'+app.server.address().port;
 console.info=line=>{try{const value=JSON.parse(line);if(value.event==='generation_submission')logs.push(value);}catch{}};
 try{
  const headers={Origin:'https://beta.example.com','X-Aiadcast-Client':'local-studio','Content-Type':'application/json',Authorization:'Bearer '+session.token};
  const check=async(options,status,stage,code)=>{const before=logs.length;const r=await fetch(base+'/api/generations?private=PRIVATE',{method:'POST',body:'{"private":"PRIVATE_IMAGE_PROMPT"}',headers,...options});assert.equal(r.status,status);await r.json();const rows=logs.slice(before);assert.equal(rows.length,2);assert.equal(rows[1].stage,stage);assert.equal(rows[1].httpStatus,status);assert.equal(rows[1].errorCode,code);};
  await check({headers:{...headers,Origin:'https://wrong.example'}},403,'routing','ORIGIN_NOT_ALLOWED');
  await check({headers:{...headers,Authorization:'Bearer invalid'}},401,'authentication','AUTH_REQUIRED');
  await check({body:'invalid PRIVATE'},400,'body_read','INVALID_JSON');
  await check({headers:{...headers,'Content-Type':'text/plain'}},415,'body_read','JSON_REQUIRED');
  const before=logs.length;
  const oversized=await new Promise((resolve,reject)=>{const req=httpRequest(base+'/api/generations',{method:'POST',headers:{...headers,'Content-Length':'14100001'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end('{}');});
  assert.equal(oversized,413);assert.equal(logs[before+1].stage,'body_read');assert.equal(logs[before+1].errorCode,'REQUEST_TOO_LARGE');
  mode='initialize-fail';await check({},500,'service_initialization','INTERNAL_ERROR');
  mode='reject';await check({},409,'generation_admission','CREDIT_RESERVATION_FAILED');mode='ok';await check({},202,'response',null);
  assert.equal(calls,2);assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|Bearer|Authorization|private|userId|prompt/);assert.equal(JSON.stringify(logs).includes(session.token),false);
 }finally{console.info=original;await app.close();store.close();rmSync(dir,{recursive:true,force:true});}
});
