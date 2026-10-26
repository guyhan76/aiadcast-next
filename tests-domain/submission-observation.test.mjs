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
 assert.deepEqual(logs.map(x=>x.outcome),['entered','pending','disconnected']);assert.equal(logs[2].stage,'service_initialization');assert.equal(logs[2].httpStatus,null);assert.equal(calls,1);
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
