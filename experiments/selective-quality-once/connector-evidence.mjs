// Local-only evidence/reconciliation layer. No provider callback or credentials.
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {evidenceStore,fixture,OWNER} from './runner.mjs';
import {hashBytes,imageUsageCost} from '../../server/openai-image-adapter.mjs';
import {compositeSelectiveEdit} from '../../server/selective-image-edit.mjs';
import {ledgerProtocol} from './connector-ledger.mjs';
import {parseRows} from './connector-once.mjs';
export function evidenceProtocol({profile='synthetic',loadFixture=fixture,merge=compositeSelectiveEdit}={}){
 const {trialId:TRIAL_ID,revision,claimPrefix,inspectSql,settleSql,commitProofSql}=ledgerProtocol(profile);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const costOf=r=>{const c=imageUsageCost(r?.usage);return c&&c.microUsd===r?.cost?.microUsd?c.microUsd:null;};
// Persist usage first: a bad/missing image must not erase known estimated cost.
// Any failed save stops. No settlement occurs from this method.
async function writeResponse({directory,token,hash,result,providerRequestId=null,store}){
 if(!digest(hash)||!/^([a-f0-9]{32})$/.test(token))throw Error('INVALID_EVIDENCE_ID');
 const receipt={trialId:TRIAL_ID,owner:OWNER,revision,hash,token,cost:costOf(result),usage:result?.usage??null,providerRequestId:typeof providerRequestId==='string'?providerRequestId:null};
 await store.save('connector-receipt.json',receipt);
 if(!Buffer.isBuffer(result?.bytes))return {state:'cost-only'};
 await store.save('connector-provider.png',result.bytes);
 const f=await loadFixture();if(f.requestHash!==hash)throw Error('FIXTURE_MISMATCH');
 let merged;try{merged=await merge(f.source,f.mask,result);}catch{return {state:'cost-only'};}
 await store.save('connector-copy.png',merged.bytes);
 await store.save('connector-complete.json',{receiptHash:hashBytes(Buffer.from(JSON.stringify(receipt))),providerHash:hashBytes(result.bytes),copyHash:merged.sha256});
 return {state:'recorded'};
}
async function recordResponse(options){
 const store=options.store??evidenceStore(options.directory),archiveId=randomUUID();
 // Unique exclusive evidence key: concurrent archives cannot publish one another's end marker.
 await store.save('connector-archive-started.json',{archiveId});
 try{return await writeResponse({...options,store});}
 finally{await store.save('connector-archive-finished.json',{archiveId});}
}
async function optional(path){try{return await readFile(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
// Recovery only reads evidence and reconciles ledger. It has no way to dispatch a provider.
async function reconcileEvidence({directory,execute}){
 let r,artifact=null;
 try{
  const bytes=await optional(`${directory}/connector-receipt.json`);if(!bytes)return {state:'no-evidence-hold-retained'};
  const start=await optional(`${directory}/connector-archive-started.json`),end=await optional(`${directory}/connector-archive-finished.json`);
  if(!start||!end||JSON.parse(start).archiveId!==JSON.parse(end).archiveId)return {state:'archive-incomplete-hold-retained'};
  r=JSON.parse(bytes);
  const f=await loadFixture();
  if(r.trialId!==TRIAL_ID||r.owner!==OWNER||r.revision!==revision||r.hash!==f.requestHash||!/^([a-f0-9]{32})$/.test(r.token)||!(r.cost===null||(r.usage&&Number.isSafeInteger(r.cost)&&r.cost>=0&&r.cost<=1e9)))throw Error('INVALID_EVIDENCE');
  if(r.cost!==null&&imageUsageCost(r.usage)?.microUsd!==r.cost)throw Error('INVALID_USAGE_COST');
  const complete=await optional(`${directory}/connector-complete.json`);
  if(complete){
   const c=JSON.parse(complete),provider=await readFile(`${directory}/connector-provider.png`),copy=await readFile(`${directory}/connector-copy.png`);
   if(c.receiptHash!==hashBytes(bytes)||!digest(c.copyHash)||c.providerHash!==hashBytes(provider)||c.copyHash!==hashBytes(copy))throw Error('EVIDENCE_INTEGRITY');
   // Recompute to verify exact crop/composite; a mere PNG hash is not pixel validation.
   const merged=await merge(f.source,f.mask,{bytes:provider,width:1024,height:1024});
   if(merged.sha256!==c.copyHash)throw Error('EVIDENCE_INTEGRITY');artifact=c.copyHash;
  }
 }catch{return {state:'evidence-conflict-hold-retained'};}
 let before;
 try{before=parseRows(await execute(inspectSql()))[0];}catch{return {state:'inspection-uncertain'};}
 if(before.trial_id!==TRIAL_ID||before.user_id!==OWNER||before.request_hash!==r.hash||before.model_revision!==revision||before.attempt_id!==TRIAL_ID+'-attempt1'||before.claim!==claimPrefix+r.token)return {state:'identity-conflict'};
 if(['completed','failed'].includes(before.attempt_status)){
  if(!await provenSettlement(directory,execute,r))return {state:'settlement-unverified'};
  return {state:before.attempt_status==='completed'&&r.cost!==null&&Number(before.actual_micros)===r.cost?'already-settled':'cost-conflict'};}
 if(!['pending','uncertain'].includes(before.attempt_status))return {state:'attempt-conflict'};
 try{const ack=parseRows(await execute(settleSql({hash:r.hash,token:r.token,cost:r.cost,artifact:r.cost===null?null:artifact})))[0];
  if(ack.trial_id!==TRIAL_ID||ack.acknowledgement!=='settled')throw Error('INVALID_SETTLEMENT_ACK');
  commitProofSql(ack.writer_xid,r.token);
  await evidenceStore(directory).save('connector-settlement-ack.json',{xid:ack.writer_xid,hash:r.hash,token:r.token,cost:r.cost});
 }
 catch{return {state:'settlement-uncertain'};} // Never blindly retry. Next invocation reads first.
 try{
  const after=parseRows(await execute(inspectSql()))[0];
  if(after.trial_id!==TRIAL_ID||after.claim!==claimPrefix+r.token||after.user_id!==OWNER||after.request_hash!==r.hash)return {state:'settlement-uncertain'};
  if(r.cost!==null&&!await provenSettlement(directory,execute,r))return {state:'settlement-uncertain'};
  return {state:r.cost===null?(after.attempt_status==='uncertain'?'unknown-hold-retained':'settlement-uncertain'):(after.attempt_status==='completed'&&Number(after.actual_micros)===r.cost?'settled':'settlement-uncertain')};
 }catch{return {state:'settlement-uncertain'};}
}
// Bridge only a completed in-memory one-shot outcome to durable evidence.
// Never receives a dispatch callback; a failed archive is not a reason to regenerate.
async function archiveOutcome({outcome,directory,hash,execute,providerRequestId=null}){
 if(!['responded','uncertain'].includes(outcome?.status))return {state:'not-dispatched'};
 try{await recordResponse({directory,hash,token:outcome.token,result:outcome.status==='responded'?outcome.result:null,providerRequestId});}
 catch{return {state:'archive-incomplete-hold-retained'};}
 return reconcileEvidence({directory,execute});
}

async function provenSettlement(directory,execute,r){
 try{const bytes=await optional(`${directory}/connector-settlement-ack.json`);if(!bytes)return false;const ack=JSON.parse(bytes);
 if(ack.hash!==r.hash||ack.token!==r.token||ack.cost!==r.cost)return false;
 const p=parseRows(await execute(commitProofSql(ack.xid,r.token)))[0];return p.writer_xid===ack.xid&&p.nonce===r.token&&p.commit_status==='committed';}catch{return false;}
}

 return {recordResponse,reconcileEvidence,archiveOutcome};
}
export const {recordResponse,reconcileEvidence,archiveOutcome}=evidenceProtocol();
