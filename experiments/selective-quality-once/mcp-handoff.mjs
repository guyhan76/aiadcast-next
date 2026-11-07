// A local, non-resumable protocol. It emits requests, never calls MCP or a database.
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,open} from 'node:fs/promises';
import {PROJECT,ledgerProtocol} from './connector-ledger.mjs';
import {OWNER,TRIAL_ID,evidenceStore} from './runner.mjs';
import {parseRows} from './connector-once.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export async function createHandoff({directory,emit,timeoutMs=60000,mode='mock',profile='synthetic'}){
 const {trialId}=ledgerProtocol(profile);
 if(profile!=='synthetic'&&mode!=='mock')throw Error('USER_TRIAL_LIVE_NOT_APPROVED');
 if(!['mock','approved-trial'].includes(mode))throw Error('INVALID_HANDOFF_MODE');
 const project=mode==='mock'?'LOCAL_POSTGRES_ONLY_DO_NOT_SEND_TO_MCP':PROJECT;
 if(timeoutMs!==60000)throw Error('INVALID_HANDOFF_TIMEOUT');
 await mkdir(directory,{recursive:true,mode:0o700});
 const sessionId=randomBytes(16).toString('hex');
 const lock=await open(`${directory}/handoff-started.json`,'wx',0o600);
 try{await lock.writeFile(JSON.stringify({sessionId,project,owner:OWNER,trial:trialId}));await lock.sync();}finally{await lock.close();}
 const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}
 const evidence=evidenceStore(directory);let pending=null,closed=false,sequence=0;
 function stop(){closed=true;if(pending){clearTimeout(pending.timer);const p=pending;pending=null;p.reject(Error('HANDOFF_STOPPED'));}}
 async function execute(sql){
  if(closed||pending||typeof sql!=='string')throw Error('HANDOFF_NOT_AVAILABLE');
  const request={kind:'sql-request',mode,sessionId,requestId:randomBytes(16).toString('hex'),sequence:++sequence,project,owner:OWNER,trial:trialId,attempt:trialId+'-attempt1',sqlHash:sha(sql),sql};
  await evidence.save(`handoff-${sequence}-request.json`,request);
  if(closed)throw Error('HANDOFF_STOPPED');
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>stop(),timeoutMs);
   pending={request,resolve,reject,timer,accepting:false};
   try{emit(request);}catch{stop();}
  });
 }
 async function accept(envelope){
  const p=pending;
  if(closed||!p||p.accepting){stop();throw Error('UNEXPECTED_HANDOFF_RESPONSE');}
  p.accepting=true;
  try{
   for(const key of ['mode','sessionId','requestId','sequence','project','owner','trial','attempt','sqlHash'])if(envelope?.[key]!==p.request[key])throw Error('HANDOFF_BINDING_MISMATCH');
   if(Object.keys(envelope).some(k=>!['mode','sessionId','requestId','sequence','project','owner','trial','attempt','sqlHash','responseHash','response'].includes(k)))throw Error('UNEXPECTED_HANDOFF_FIELD');
   if(envelope.responseHash!==sha(JSON.stringify(envelope.response)))throw Error('HANDOFF_RESPONSE_HASH_MISMATCH');
   parseRows(envelope.response); // Full original tool envelope, no extracted or rewritten rows.
   await evidence.save(`handoff-${p.request.sequence}-response.json`,envelope);
   if(closed||pending!==p)throw Error('HANDOFF_STOPPED');
   clearTimeout(p.timer);pending=null;p.resolve(envelope.response);
  }catch(e){stop();throw e;}
 }
 return {execute,accept,stop,sessionId};
}
