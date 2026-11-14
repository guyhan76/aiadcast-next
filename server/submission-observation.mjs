import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const context=new AsyncLocalStorage();
const stages=new Set(['routing','authentication','body_read','service_initialization','generation_admission','response','admission_queue','input_validation','request_deduplication','existing_response','admission_readiness','storage_capacity','original_persistence','admission_transaction','accepted_response']);
const codes=new Set(['RATE_LIMITED','ORIGIN_NOT_ALLOWED','ORIGIN_REQUIRED','CLIENT_HEADER_REQUIRED','AUTH_REQUIRED','FORBIDDEN','JSON_REQUIRED','REQUEST_TOO_LARGE','SERVER_BUSY','INVALID_JSON','INTERNAL_ERROR','INVALID_REQUEST','INVALID_SPECIFICATIONS','INVALID_IMAGE','SOURCE_REQUIRED','SOURCE_MISMATCH','GENERATION_DISABLED','PROVIDER_NOT_CONFIGURED','BUDGET_NOT_AVAILABLE','CREDIT_RESERVATION_FAILED','CREDIT_QUOTE_CHANGED','NO_TEST_CREDITS','GENERATION_ALREADY_RUNNING','IDEMPOTENCY_CONFLICT','STORAGE_LIMIT','STORAGE_CAPACITY_UNAVAILABLE','SUPABASE_UPLOAD_FAILED','SUPABASE_CONNECTION_FAILED','STORAGE_CONTENT_MISMATCH','STORAGE_CONTENT_CONFLICT','TOO_MANY_REQUESTS']);
export function submissionStage(stage){const trace=context.getStore();if(trace&&!trace.done&&stages.has(stage))trace.stage=stage;}
export function submissionError(code){const trace=context.getStore();if(trace&&!trace.done)trace.code=codes.has(code)?code:'UNCLASSIFIED';}
// Observation only: no body reads, request identifiers, cancellation or retries.
export function createSubmissionObserver({write=line=>console.info(line),pendingMs=10000,maxRequests=20,clock=()=>performance.now()}={}){
 let windowStart=clock(),requests=0;
 return function observe(req,res,handle){
  if(req.method!=='POST'||req.url?.split('?')[0]!=='/api/generations')return handle();
  const now=clock();if(now-windowStart>=60000){windowStart=now;requests=0;}
  if(requests++>=maxRequests)return handle(); // At most four records per sampled request (including completion after disconnect).
  const trace={id:randomUUID(),start:performance.now(),stage:'routing',code:null,done:false,disconnected:false,settled:false};
  const emit=(outcome,extra={})=>{try{write(JSON.stringify({event:'generation_submission',at:new Date().toISOString(),correlationId:trace.id,outcome,stage:trace.stage,durationMs:Math.round(Math.max(0,performance.now()-trace.start)),httpStatus:res.headersSent&&Number.isInteger(res.statusCode)?res.statusCode:null,errorCode:trace.code,...extra}));}catch{/* Telemetry cannot change the request. */}};
  emit('entered');
  const timer=setTimeout(()=>{if(!trace.done)emit('pending');},pendingMs);timer.unref?.();
  const finish=outcome=>{if(trace.done)return;trace.done=true;clearTimeout(timer);res.removeListener('finish',finished);res.removeListener('close',closed);emit(outcome);};
  const finished=()=>finish(res.statusCode>=400?'error':'finished');
  const settled=failed=>{
   trace.settled=true;
   if(trace.disconnected&&!trace.done){
    trace.done=true;clearTimeout(timer);
    // Handler completion is not provider completion or delivery to the client.
    emit(failed||trace.code||res.statusCode>=400?'handler_error_after_disconnect':'handler_completed_after_disconnect',
     {handlerStatus:Number.isInteger(res.statusCode)?res.statusCode:null});
   }
  };
  const closed=()=>{
   if(res.writableFinished)return finish(res.statusCode>=400?'error':'finished');
   if(trace.done||trace.disconnected)return;
   trace.disconnected=true;clearTimeout(timer);res.removeListener('finish',finished);res.removeListener('close',closed);
   emit('disconnected');if(trace.settled)settled(false);
  };
  res.once('finish',finished);res.once('close',closed);
  return context.run(trace,()=>{try{const result=handle();if(result&&typeof result.then==='function')return result.then(value=>{settled(false);return value;},error=>{submissionError('INTERNAL_ERROR');if(trace.disconnected)settled(true);else finish('error');throw error;});settled(false);return result;}catch(error){submissionError('INTERNAL_ERROR');if(trace.disconnected)settled(true);else finish('error');throw error;}});
 };
}
export const observeSubmission=createSubmissionObserver();
