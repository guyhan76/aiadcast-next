import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createReadinessObserver,readinessMeasure} from '../server/readiness-observation.mjs';
const response=()=>Object.assign(new EventEmitter(),{statusCode:200,writableFinished:false});
const finish=res=>{res.writableFinished=true;res.emit('finish');res.emit('close');};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('fast successful and unrelated requests remain silent and return unchanged values',()=>{
 const logs=[],observe=createReadinessObserver({write:s=>logs.push(s)});for(const req of [{method:'POST',url:'/api/generations'},{method:'GET',url:'/api/status'}]){const res=response();assert.equal(observe(req,res,()=>readinessMeasure('authentication',()=>{finish(res);return 42;})),42);}assert.deepEqual(logs,[]);
});
test('one pending snapshot and terminal record expose stages without inputs or errors',async()=>{
 const logs=[],observe=createReadinessObserver({write:s=>logs.push(JSON.parse(s)),pendingMs:5,slowMs:0});const res=response();let release;const gate=new Promise(r=>release=r);
 const work=observe({method:'GET',url:'/api/status?secret=private',headers:{authorization:'PRIVATE_TOKEN'}},res,async()=>{await readinessMeasure('authentication',()=>Promise.resolve('PRIVATE_EMAIL'));return readinessMeasure('expiry',()=>readinessMeasure('lock_wait',()=>gate));});
 await pause(15);assert.equal(logs.length,1);assert.equal(logs[0].outcome,'pending');assert.equal(logs[0].stages.lock_wait.outcome,'pending');assert.equal(logs[0].stages.expiry.outcome,'pending');release(7);assert.equal(await work,7);finish(res);assert.equal(logs.length,2);assert.equal(logs[1].correlationId,logs[0].correlationId);assert.equal(logs[1].stages.lock_wait.outcome,'ok');assert.equal(logs[1].outcome,'ok');assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|secret|headers|authorization/);
});
test('errors remain identical while logs omit raw error details and arbitrary stage names',async()=>{
 const logs=[],observe=createReadinessObserver({write:s=>logs.push(JSON.parse(s))});const res=response(),error=Error('SECRET_SQL_TOKEN_IMAGE');
 await assert.rejects(observe({method:'GET',url:'/api/status'},res,()=>readinessMeasure('authentication',async()=>{throw error;})),e=>e===error);
 assert.equal(logs.length,1);assert.equal(logs[0].outcome,'error');assert.equal(logs[0].stages.authentication.outcome,'error');assert.doesNotMatch(JSON.stringify(logs),/SECRET/);
 const r=response();assert.equal(observe({method:'GET',url:'/api/status'},r,()=>readinessMeasure('SECRET',()=>{r.statusCode=401;finish(r);return 9;})),9);assert.deepEqual(logs[1].stages,{});
});
test('client disconnect logs once, does not cancel business work, and clears watchdog',async()=>{
 const logs=[],observe=createReadinessObserver({write:s=>logs.push(JSON.parse(s)),pendingMs:5});const res=response();let release;const work=observe({method:'GET',url:'/api/status'},res,()=>readinessMeasure('budget',()=>new Promise(r=>release=r)));res.emit('close');await pause(15);assert.equal(logs.length,1);assert.equal(logs[0].outcome,'disconnected');assert.equal(logs[0].stages.budget.outcome,'pending');release(1);assert.equal(await work,1);finish(res);assert.equal(logs.length,1);
});
test('concurrent requests have independent opaque IDs and bounded logs',async()=>{
 const logs=[],observe=createReadinessObserver({write:s=>logs.push(JSON.parse(s)),maxEvents:2,slowMs:0});await Promise.all(['authentication','wallet','budget'].map(stage=>{const res=response();return observe({method:'GET',url:'/api/status'},res,async()=>{await readinessMeasure(stage,()=>pause(1));finish(res);});}));assert.equal(logs.length,2);assert.notEqual(logs[0].correlationId,logs[1].correlationId);for(const log of logs)assert.equal(Object.keys(log.stages).length,1);
});
test('logger failure cannot fail the response',()=>{const observe=createReadinessObserver({write:()=>{throw Error('logger failed');},slowMs:0}),res=response();assert.equal(observe({method:'GET',url:'/api/status'},res,()=>{finish(res);return 3;}),3);});
