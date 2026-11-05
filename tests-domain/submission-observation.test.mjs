import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createSubmissionObserver,submissionStage,submissionError} from '../server/submission-observation.mjs';
const response=()=>Object.assign(new EventEmitter(),{statusCode:200,headersSent:false,writableFinished:false});
const finish=(res,status=202)=>{res.statusCode=status;res.headersSent=true;res.writableFinished=true;res.emit('finish');res.emit('close');};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('entry and HTTP exit retain only allowlisted metadata and do not inspect payloads',()=>{
 const logs=[],observe=createSubmissionObserver({write:s=>logs.push(JSON.parse(s))}),res=response();
 const req={method:'POST',url:'/api/generations?token=PRIVATE',get headers(){throw Error('must not inspect');},get body(){throw Error('must not inspect');}};
 assert.equal(observe(req,res,()=>{submissionStage('body_read');submissionError('INVALID_JSON');finish(res,400);return 4;}),4);
 assert.deepEqual(logs.map(x=>[x.outcome,x.stage,x.httpStatus,x.errorCode]),[['entered','routing',null,null],['error','body_read',400,'INVALID_JSON']]);
 assert.equal(logs[0].correlationId,logs[1].correlationId);assert.match(logs[0].correlationId,/^[a-f0-9-]{36}$/);assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|token|headers|body"/);
});
test('slow initialization and disconnect are bounded and do not cancel or retry work',async()=>{
 const logs=[],observe=createSubmissionObserver({write:s=>logs.push(JSON.parse(s)),pendingMs:5}),res=response();let release,calls=0;
 const work=observe({method:'POST',url:'/api/generations'},res,async()=>{calls++;submissionStage('service_initialization');await new Promise(r=>release=r);return 8;});
 await pause(20);res.emit('close');await pause(15);release();assert.equal(await work,8);finish(res);
 assert.deepEqual(logs.map(x=>x.outcome),['entered','pending','disconnected','handler_completed_after_disconnect']);assert.equal(new Set(logs.map(x=>x.correlationId)).size,1);assert.equal(logs[2].stage,'service_initialization');assert.equal(logs[2].httpStatus,null);assert.equal(calls,1);
});
test('concurrent contexts remain separate and log volume is capped without limiting business work',async()=>{
 const logs=[],observe=createSubmissionObserver({write:s=>logs.push(JSON.parse(s)),maxRequests:2});let calls=0;
 await Promise.all(['authentication','generation_admission','body_read'].map(stage=>{const res=response();return observe({method:'POST',url:'/api/generations'},res,async()=>{calls++;submissionStage(stage);await pause(2);finish(res);});}));
 assert.equal(calls,3);assert.equal(logs.length,4);assert.equal(new Set(logs.map(x=>x.correlationId)).size,2);assert.deepEqual(logs.filter(x=>x.outcome==='finished').map(x=>x.stage).sort(),['authentication','generation_admission']);
});
test('raw errors are never logged and logger failures do not alter results',async()=>{
 const logs=[],observe=createSubmissionObserver({write:s=>logs.push(JSON.parse(s))}),error=Error('PRIVATE_SQL_IMAGE_EMAIL');
 await assert.rejects(observe({method:'POST',url:'/api/generations'},response(),async()=>{submissionStage('PRIVATE');submissionError('PRIVATE');throw error;}),e=>e===error);
 assert.equal(logs[1].errorCode,'INTERNAL_ERROR');assert.doesNotMatch(JSON.stringify(logs),/PRIVATE/);
 const broken=createSubmissionObserver({write:()=>{throw Error('bad logger');}}),res=response();assert.equal(broken({method:'POST',url:'/api/generations'},res,()=>{finish(res);return 9;}),9);
});
test('unrelated routes and GET do not enter submission telemetry',()=>{
 const logs=[],observe=createSubmissionObserver({write:s=>logs.push(s)});for(const req of [{method:'GET',url:'/api/status'},{method:'POST',url:'/api/assistant'},{method:'OPTIONS',url:'/api/generations'}])assert.equal(observe(req,response(),()=>7),7);assert.equal(logs.length,0);
});

test('late handled errors retain safe code and handler status, not a delivered HTTP response',async()=>{
 const logs=[],observe=createSubmissionObserver({write:s=>logs.push(JSON.parse(s))}),res=response();let release;
 const work=observe({method:'POST',url:'/api/generations'},res,async()=>{await new Promise(r=>release=r);submissionStage('original_persistence');submissionError('SUPABASE_CONNECTION_FAILED');res.statusCode=503;});
 res.emit('close');res.emit('close');release();await work;finish(res,503);
 assert.deepEqual(logs.map(x=>x.outcome),['entered','disconnected','handler_error_after_disconnect']);
 assert.equal(logs[2].stage,'original_persistence');assert.equal(logs[2].errorCode,'SUPABASE_CONNECTION_FAILED');assert.equal(logs[2].handlerStatus,503);assert.equal(logs[2].httpStatus,null);
});
test('late thrown error is rethrown unchanged without private message; logging cannot retry work',async()=>{
 const logs=[],observe=createSubmissionObserver({write:s=>logs.push(JSON.parse(s))}),res=response();let reject,calls=0;const error=Error('PRIVATE_TOKEN_PROMPT');
 const work=observe({method:'POST',url:'/api/generations'},res,()=>{calls++;return new Promise((_,r)=>reject=r);});
 res.emit('close');reject(error);await assert.rejects(work,e=>e===error);
 assert.equal(logs.at(-1).outcome,'handler_error_after_disconnect');assert.equal(logs.at(-1).errorCode,'INTERNAL_ERROR');assert.doesNotMatch(JSON.stringify(logs),/PRIVATE/);assert.equal(calls,1);
});
test('disconnect final records stay bounded and sampled-out work still completes',async()=>{
 const logs=[],observe=createSubmissionObserver({write:s=>logs.push(JSON.parse(s)),maxRequests:1});let calls=0;
 for(let i=0;i<3;i++){const res=response();let release;const work=observe({method:'POST',url:'/api/generations'},res,async()=>{calls++;await new Promise(r=>release=r);submissionStage('response');res.statusCode=202;return i;});res.emit('close');release();assert.equal(await work,i);}
 assert.equal(calls,3);assert.equal(logs.length,3);assert.equal(logs.at(-1).handlerStatus,202);
});

test('real disconnected socket retains correlation through delayed acceptance without resending',async t=>{
 const {createServer,request}=await import('node:http');
 const logs=[],observe=createSubmissionObserver({write:s=>logs.push(JSON.parse(s))});let release,entered,closed,calls=0,completed;
 const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),gone=new Promise(r=>closed=r),done=new Promise(r=>completed=r);
 const server=createServer((req,res)=>{res.once('close',closed);observe(req,res,async()=>{calls++;submissionStage('original_persistence');entered();await gate;submissionStage('response');res.writeHead(202,{'Content-Type':'application/json'});res.end('{}');}).finally(completed);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{release();await new Promise(r=>server.close(r));});
 const client=request(`http://127.0.0.1:${server.address().port}/api/generations`,{method:'POST'});client.on('error',()=>{});client.end('{}');
 await started;client.destroy();await gone;release();await done;
 assert.equal(calls,1);assert.deepEqual(logs.map(x=>x.outcome),['entered','disconnected','handler_completed_after_disconnect']);assert.equal(new Set(logs.map(x=>x.correlationId)).size,1);assert.equal(logs.at(-1).stage,'response');assert.equal(logs.at(-1).handlerStatus,202);
});
