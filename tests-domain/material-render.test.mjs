import test from 'node:test';import assert from 'node:assert/strict';
import {MaterialRenderJobs,renderInput} from '../server/material-render-jobs.mjs';
import {createMaterialServer} from '../server/material-render-server.mjs';
const input={shape:'open-carton',widthMm:500,depthMm:350,heightMm:200};
const tick=()=>new Promise(r=>setImmediate(r));
test('material render validates semantic dimensions and rejects unsupported fallback geometry',()=>{
 assert.deepEqual(renderInput(input),input);assert.equal(renderInput({...input,shape:'cylinder'}).depthMm,500);
 for(const bad of [{...input,shape:'bag'},{...input,widthMm:Infinity},{...input,widthMm:'500'},{...input,heightMm:10}])assert.throws(()=>renderInput(bad));
});
test('material jobs enforce single render, preserve manifest and cancel without publishing late output',async()=>{
 let finish,signal;const jobs=new MaterialRenderJobs((_,opts)=>{signal=opts.signal;opts.onProgress(50);return new Promise(r=>finish=r);});
 const job=jobs.start(input);await tick();assert.equal(jobs.status(job.id).progress,50);assert.throws(()=>jobs.start(input),/RENDER_BUSY/);
 jobs.cancel(job.id);assert.equal(signal.aborted,true);finish({png:Buffer.from('late'),manifest:{}});await tick();assert.equal(jobs.status(job.id).state,'cancelled');assert.equal(jobs.image(job.id),null);
 const next=jobs.start(input);await tick();finish({png:Buffer.from('ok'),manifest:{bodyMm:input}});await tick();assert.equal(jobs.status(next.id).state,'done');assert.equal(jobs.image(next.id).toString(),'ok');assert.equal(jobs.status(next.id).manifest.bodyMm.widthMm,500);
});
test('material job missing executable is an actionable terminal failure without automatic retry',async()=>{
 let count=0;const jobs=new MaterialRenderJobs(()=>{count++;throw Object.assign(Error('missing'),{code:'ENOENT'});});const job=jobs.start(input);await tick();assert.equal(jobs.status(job.id).error,'BLENDER_NOT_INSTALLED');assert.equal(jobs.status(job.id).state,'failed');assert.equal(count,1);
});
test('local material HTTP rejects cross-origin and missing intent before starting a job',async()=>{
 let calls=0;const jobs=new MaterialRenderJobs(async()=>{calls++;return{png:Buffer.from('png'),manifest:{}};});const server=createMaterialServer(jobs);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${server.address().port}/api/material-render/jobs`,headers={Host:`127.0.0.1:${server.address().port}`,'Content-Type':'application/json','X-Aiadcast-Local-Render':'1'};
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://unrelated.example'},body:JSON.stringify(input)})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{Host:headers.Host,'Content-Type':'application/json'},body:JSON.stringify(input)})).status,403);assert.equal(calls,0);
  const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(input)});assert.equal(res.status,202);const job=await res.json();await tick();const status=await(await fetch(`${url}/${job.id}`,{headers:{Host:headers.Host}})).json();assert.equal(status.state,'done');assert.equal(calls,1);
 }finally{await new Promise(r=>server.close(r));}
});
