import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const context=new AsyncLocalStorage();
const stages=new Set(['authentication','service_initialization','schema_setup','generation_initialize','table_protection','expiry','budget','wallet','pool_wait','lock_wait']);
// Observe only; never abort, retry, settle, or alter a request. No supplied values
// (including error messages, URL parameters and identifiers) enter log records.
export function readinessMeasure(stage,fn){
 const trace=context.getStore();if(!trace||trace.done||!stages.has(stage))return fn();
 const start=performance.now(),entry={stage,start};trace.active.add(entry);
 const end=outcome=>{trace.active.delete(entry);const row=trace.stages[stage]??={durationMs:0,outcome:'ok'};row.durationMs+=Math.max(0,performance.now()-start);if(outcome==='error')row.outcome='error';};
 try{const value=fn();if(value&&typeof value.then==='function')return value.then(result=>{end('ok');return result;},error=>{end('error');throw error;});end('ok');return value;}catch(error){end('error');throw error;}
}
export function createReadinessObserver({write=line=>console.info(line),slowMs=5000,pendingMs=10000,maxEvents=60,clock=()=>performance.now()}={}){
 let windowStart=clock(),events=0;
 return function observe(req,res,handle){
  if(req.method!=='GET'||req.url?.split('?')[0]!=='/api/status')return handle();
  const trace={id:randomUUID(),start:performance.now(),active:new Set(),stages:{},done:false};
  const emit=outcome=>{const now=clock();if(now-windowStart>=60000){windowStart=now;events=0;}if(events>=maxEvents)return;events++;
   const durations={};for(const [key,value] of Object.entries(trace.stages))durations[key]={durationMs:Math.round(value.durationMs),outcome:value.outcome};
   for(const item of trace.active){const row=durations[item.stage]??={durationMs:0,outcome:'pending'};row.durationMs+=Math.round(Math.max(0,performance.now()-item.start));row.outcome='pending';}
   try{write(JSON.stringify({event:'readiness_timing',correlationId:trace.id,outcome,durationMs:Math.round(Math.max(0,performance.now()-trace.start)),stages:durations}));}catch{/* Logging cannot change business results. */}
  };
  const timer=setTimeout(()=>{if(!trace.done)emit('pending');},pendingMs);timer.unref?.();
  const finish=outcome=>{if(trace.done)return;trace.done=true;clearTimeout(timer);res.removeListener('finish',finished);res.removeListener('close',closed);if(outcome!=='ok'||performance.now()-trace.start>=slowMs)emit(outcome);};
  const finished=()=>finish(res.statusCode>=400?'error':'ok'),closed=()=>finish(res.writableFinished?(res.statusCode>=400?'error':'ok'):'disconnected');
  res.once('finish',finished);res.once('close',closed);
  return context.run(trace,()=>{try{const result=handle();if(result&&typeof result.then==='function')return result.catch(error=>{finish('error');throw error;});return result;}catch(error){finish('error');throw error;}});
 };
}
export const observeReadiness=createReadinessObserver();
