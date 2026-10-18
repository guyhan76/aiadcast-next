import {randomUUID} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
import {parseSourceAsset} from './openai-image-adapter.mjs';
import {runAnalysis} from './vision-evaluation/analysis.mjs';
import {SINGLE_BOX_INSTRUCTION} from './vision-evaluation/single-box-service.mjs';
import {validateProposal} from './vision-evaluation/overlay.mjs';
const HOLD=30000;
const fail=(code,status=409)=>{throw new ApiFailure(code,status);};
const identifier=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(v);
// No production approval is configured. Existing reference approvals are NOT reused.
// A future reviewed approval must bind an owner, exact result hashes, expiry and totals.
export function boxDimensions({db,service,apiKey,approval=null,now=()=>Date.now(),analyze=runAnalysis,fetchImpl=globalThis.fetch}){
 let initialized;
 const valid=()=>Boolean(db.atomicSchemas&&apiKey&&approval&&identifier(approval.id)&&identifier(approval.userId)&&Array.isArray(approval.hashes)&&approval.hashes.length&&approval.hashes.every(h=>/^[a-f0-9]{64}$/.test(h))&&Number.isSafeInteger(approval.expiresAt)&&Number.isInteger(approval.maxCalls)&&approval.maxCalls>0&&approval.maxCalls<=2&&Number.isInteger(approval.maxMicros)&&approval.maxMicros>=HOLD&&approval.maxMicros<=60000);
 const init=()=>initialized??=(async()=>{await db.exec('CREATE TABLE IF NOT EXISTS box_dimension_calls(id TEXT PRIMARY KEY, approval TEXT NOT NULL, actor TEXT NOT NULL, request_id TEXT NOT NULL, job_id TEXT NOT NULL, hash TEXT NOT NULL, period TEXT NOT NULL, state TEXT NOT NULL, actual INTEGER, result_json TEXT, UNIQUE(approval,actor,request_id))');await db.protectTables();})();
 const view=r=>r.result_json?JSON.parse(r.result_json):{state:'uncertain',sourceHash:r.hash,verified:false,reason:'COST_RECONCILIATION_REQUIRED'};
 return {
  capability(user){return {available:valid()&&approval.expiresAt>now()&&user?.id===approval.userId,scope:'owned-single-box',allowNewGeneration:false,manual:true,reason:valid()&&approval.expiresAt>now()&&user?.id===approval.userId?null:'EXPLICIT_IMAGE_APPROVAL_REQUIRED',perCallHoldMicros:HOLD,maxCalls:2};},
  async request(user,body){
   if(!body||Object.keys(body).some(k=>!['jobId','sourceHash','requestId'].includes(k))||!identifier(body.jobId)||!identifier(body.requestId)||! /^[a-f0-9]{64}$/.test(body.sourceHash??''))fail('INVALID_BOX_ANALYSIS',400);
   // Resolve through the authenticated user's service, never through a supplied owner.
   const s=await service(user),row=await s.db.prepare('SELECT request_json,artifact_hash FROM generation_records WHERE id=?').get(body.jobId);
   if(!row||row.artifact_hash!==body.sourceHash)fail('JOB_NOT_FOUND',404);
   const request=JSON.parse(row.request_json);
   if(request.mode!=='creative'||request.productProfile?.category!=='boxes'||request.productProfile?.specType!=='rectangular')fail('BOX_SCOPE_REQUIRED');
   if(!valid()||user.id!==approval.userId||!approval.hashes.includes(body.sourceHash))fail('BOX_ANALYSIS_NOT_APPROVED',403);
   await init();
   const cached=await db.prepare('SELECT * FROM box_dimension_calls WHERE approval=? AND actor=? AND request_id=?').get(approval.id,user.id,body.requestId);
   if(cached){if(cached.job_id!==body.jobId||cached.hash!==body.sourceHash)fail('REQUEST_CONFLICT');return view(cached);}
   if(approval.expiresAt<=now())fail('BOX_ANALYSIS_NOT_APPROVED',403);
   if(s.db.pool!==db.pool)fail('ATOMIC_BUDGET_REQUIRED');
   const period=s.period();
   const job=await s.job(body.jobId);if(!['ready','accepted'].includes(job.state)||job.composition!=='complete-ad')fail('BOX_RESULT_NOT_READY');
   const source=await parseSourceAsset({...job.artifact,data:job.artifact?.dataUrl});
   if(!source||source.sha256!==body.sourceHash)fail('SOURCE_MISMATCH');
   const reservation=await db.transaction(async()=>{
    const prior=await db.prepare('SELECT * FROM box_dimension_calls WHERE approval=? AND actor=? AND request_id=?').get(approval.id,user.id,body.requestId);
    if(prior){if(prior.job_id!==body.jobId||prior.hash!==body.sourceHash)fail('REQUEST_CONFLICT');return {cached:view(prior)};}
    const rows=await db.prepare('SELECT * FROM box_dimension_calls WHERE approval=?').all(approval.id);
    if(rows.some(r=>r.state!=='settled'||!r.result_json))fail('COST_RECONCILIATION_REQUIRED');
    if(!valid()||approval.expiresAt<=now()||rows.length>=approval.maxCalls||(rows.length+1)*HOLD>approval.maxMicros)fail('BOX_ANALYSIS_LIMIT');
    if(s.period()!==period)fail('BUDGET_PERIOD_CHANGED');
    const limit=await s.budgetLimit(period);
    await s.db.prepare('INSERT INTO budgets(period,limit_micros) VALUES(?,?) ON CONFLICT DO NOTHING').run(period,limit);
    const held=await s.db.prepare('UPDATE budgets SET limit_micros=?,held_micros=held_micros+? WHERE period=? AND spent_micros+held_micros+?<=?').run(limit,HOLD,period,HOLD,limit);
    if(held.changes!==1)fail('BUDGET_NOT_AVAILABLE');
    const id=randomUUID();await db.prepare('INSERT INTO box_dimension_calls(id,approval,actor,request_id,job_id,hash,period,state) VALUES(?,?,?,?,?,?,?,?)').run(id,approval.id,user.id,body.requestId,body.jobId,body.sourceHash,period,'reserved');return {id};
   });
   if(reservation.cached)return reservation.cached;
   let settled=false,uncertain=true;
   const ledger={reserve:async()=>reservation.id,settle:async(id,actual)=>{
    if(id!==reservation.id)throw Error('INVALID_RESERVATION');
    const known=Number.isSafeInteger(actual)&&actual>=0&&actual<=HOLD;uncertain=!known;
    await db.transaction(async()=>{
     const numeric=Number.isSafeInteger(actual)&&actual>=0;
     const changed=await db.prepare('UPDATE box_dimension_calls SET state=?,actual=? WHERE id=? AND state=?').run(known?'settled':'uncertain',numeric?actual:null,id,'reserved');
     if(changed.changes!==1)throw Error('ALREADY_SETTLED');
     if(numeric)await s.db.prepare('UPDATE budgets SET held_micros=held_micros-?,spent_micros=spent_micros+? WHERE period=?').run(HOLD,actual,period);
    });settled=true;return known?'settled':'uncertain';
   }};
   let result;
   try{
    const answer=await analyze({bytes:source.bytes,target:body.sourceHash,allowedTargets:[body.sourceHash],approvedHashes:{[body.sourceHash]:body.sourceHash},analysisInstruction:SINGLE_BOX_INSTRUCTION,apiKey,fetchImpl,ledger});
    if(!settled)await ledger.settle(reservation.id,null);
    let proposal;try{if(!uncertain&&answer?.sourceHash===body.sourceHash)proposal=validateProposal(answer.proposal);}catch{}
    result={state:uncertain?'uncertain':proposal?'ready':'failed',sourceHash:body.sourceHash,verified:false,...(proposal?{proposal}:{reason:uncertain?'COST_RECONCILIATION_REQUIRED':'LOCATION_UNCERTAIN'})};
   }catch{if(!settled)await ledger.settle(reservation.id,null);result={state:'uncertain',sourceHash:body.sourceHash,verified:false,reason:'COST_RECONCILIATION_REQUIRED'};}
   await db.prepare('UPDATE box_dimension_calls SET result_json=? WHERE id=?').run(JSON.stringify(result),reservation.id);
   return result;
  }
 };
}
