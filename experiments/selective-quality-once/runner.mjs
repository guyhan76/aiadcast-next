// Operator-only synthetic quality trial. Never mounted as an HTTP route.
// Uses existing tenant billing tables, never initializes/migrates them.
import sharp from 'sharp';
import {mkdir,open,readFile,link,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {BillingLedger} from '../../server/cloud/billing-base.mjs';
import {PostgresDatabase,cloudSchema} from '../../server/cloud/postgres.mjs';
import {readExternalSupplierBudget} from '../../server/external-supplier-budget.mjs';
import {OpenAIImageAdapter,hashBytes,IMAGE_MODEL} from '../../server/openai-image-adapter.mjs';
import {prepareSelectiveEdit,compositeSelectiveEdit} from '../../server/selective-image-edit.mjs';
export const TRIAL_ID='synthetic-selective-quality-20261107-v1';
export const OWNER='1cd5ecd6-19b6-4ee9-a735-764a490e0057';
export const PROMPT='Change only the selected red center panel of the synthetic product to cobalt blue. Keep its rectangular shape and all other details unchanged.';
const HOLD=500000,REVISION='synthetic-fixture/2.6-high-png/quality-once-v1';
export async function fixture(){
 const width=1024,height=1024,raw=Buffer.alloc(width*height*4,255),mask=Buffer.alloc(raw.length,255);
 function box(x0,y0,x1,y1,color){for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)for(let c=0;c<4;c++)raw[(y*width+x)*4+c]=color[c];}
 box(0,0,1024,1024,[236,240,246,255]);box(304,220,720,820,[35,42,52,255]);box(348,350,676,650,[215,45,55,255]);box(380,260,644,300,[255,255,255,255]);
 for(let y=350;y<650;y++)for(let x=348;x<676;x++)mask[(y*width+x)*4+3]=0;
 const sourceBytes=await sharp(raw,{raw:{width,height,channels:4}}).png().toBuffer(),maskBytes=await sharp(mask,{raw:{width,height,channels:4}}).png().toBuffer();
 const prepared=await prepareSelectiveEdit({dataUrl:'data:image/png;base64,'+sourceBytes.toString('base64'),sha256:hashBytes(sourceBytes),width,height},{data:'data:image/png;base64,'+maskBytes.toString('base64'),sha256:hashBytes(maskBytes),width,height});
 const manifest={trialId:TRIAL_ID,owner:OWNER,synthetic:true,sourceHash:hashBytes(sourceBytes),maskHash:hashBytes(maskBytes),width,height,model:IMAGE_MODEL,quality:'high',n:1,format:'png',prompt:PROMPT};
 return {...prepared,manifest,requestHash:hashBytes(Buffer.from(JSON.stringify(manifest)))};
}
export function evidenceStore(directory){
 async function write(name,bytes){
  await mkdir(directory,{recursive:true,mode:0o700});const temp=join(directory,'.pending-'+randomUUID()),target=join(directory,name);const f=await open(temp,'wx',0o600);
  try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}
  try{try{await link(temp,target);}catch(e){if(e.code!=='EEXIST')throw e;const old=await readFile(target);if(!old.equals(Buffer.from(bytes)))throw Error('EVIDENCE_CONFLICT');}}finally{await unlink(temp);}
  const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}
 }
 return {prepare:async f=>{await write('original.png',f.source.bytes);await write('mask.png',f.mask.bytes);await write('manifest.json',JSON.stringify(f.manifest));},save:async(name,data)=>write(name,Buffer.isBuffer(data)?data:JSON.stringify(data))};
}
// Existing key stays in memory. Capture only the public provider request ID.
export function trialAdapter(apiKey,fetchImpl=globalThis.fetch){
 let dispatched=false,requestId=null;const adapter=new OpenAIImageAdapter({apiKey,fetchImpl:async(...args)=>{if(dispatched)throw Error('ONE_SHOT_ALREADY_DISPATCHED');dispatched=true;const response=await fetchImpl(...args);requestId=response.headers.get('x-request-id');return response;}});
 adapter.selectiveEditReady=true;return {adapter,diagnostics:()=>({providerRequestId:requestId,transportCalls:dispatched?1:0})};
}
export async function runOnce({pool,adapter,evidence,diagnostics=()=>({}),owner=OWNER,now=()=>Date.now()}){
 if(owner!==OWNER)throw Error('TRIAL_OWNER_MISMATCH');
 if(IMAGE_MODEL!=='gpt-image-2.6-sunburst'||adapter?.selectiveEditReady!==true)throw Error('TRIAL_ADAPTER_DISABLED');
 const f=await fixture();adapter.validateSelectiveInput?.(f);const providerInput=await adapter.prepareSelectiveInput?.(f);await evidence.prepare(f);
 const db=new PostgresDatabase(pool,cloudSchema(owner)); // DO NOT call initialize().
 const ledger=new BillingLedger();Object.assign(ledger,{db,now,budgetOwner:owner,budgetAdmin:true,externalBudget:()=>readExternalSupplierBudget(db,owner)});
 const jobId=TRIAL_ID,attemptId=TRIAL_ID+'-attempt1';let before;
 const claimed=await db.transaction(async()=>{
  const account=await db.prepare('SELECT role,disabled FROM aiadcast_accounts.users WHERE id=?').get(owner);if(account?.role!=='admin'||Number(account.disabled)!==0)throw Error('TRIAL_OWNER_NOT_ACTIVE_ADMIN');
  const guard=await db.prepare("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid=?::regclass AND tgname='cumulative_supplier_reservation' AND tgenabled='O'").get(cloudSchema(owner)+'.budgets');if(guard.n!==1)throw Error('CUMULATIVE_GUARD_REQUIRED');
  const period=new Date(now()).toISOString().slice(0,7);before=await ledger.supplierBudget(period,100000000);if(!before)throw Error('CUMULATIVE_POLICY_REQUIRED');
  const prior=await db.prepare('SELECT user_id,request_hash,model_revision FROM jobs WHERE id=?').get(jobId);
  if(prior){if(prior.user_id!==owner||prior.request_hash!==f.requestHash||prior.model_revision!==REVISION)throw Error('TRIAL_REPLAY_CONFLICT');return false;}
  await ledger.reserve({jobId,userId:owner,credits:1,requestHash:f.requestHash,modelRevision:REVISION,kind:'image',expiresAt:now()+86400000,creditExempt:true});
  const a=await ledger.beginAttempt({jobId,attemptId,period,maximumMicros:HOLD,limitMicros:100000000});if(!a.shouldDispatch)throw Error('TRIAL_CLAIM_CONFLICT');return true;
 });
 if(!claimed)return {state:'already-recorded',jobId,attemptId,attempt:await db.prepare('SELECT status,actual_micros,maximum_micros FROM attempts WHERE id=?').get(attemptId),transportCalls:0};
 let cost=null,report;
 try{
  await evidence.save('dispatch-intent.json',{jobId,attemptId,requestHash:f.requestHash,synthetic:true});
  // Reservation is committed before this sole dispatch. Any subsequent replay is read-only.
  const result=await adapter.editRegion({...f,providerInput,prompt:PROMPT,attemptId});
  if(Number.isSafeInteger(result.cost?.microUsd)&&result.cost.microUsd>=0&&result.cost.microUsd<=1e9)cost=result.cost.microUsd;
  await evidence.save('provider-result.png',result.bytes);
  await evidence.save('provider-usage.json',{usage:result.usage??null,estimatedMicros:cost,...diagnostics()});
  const merged=await compositeSelectiveEdit(f.source,f.mask,result);
  const [original,edited,mask]=await Promise.all([f.source.bytes,merged.bytes,f.mask.bytes].map(b=>sharp(b).ensureAlpha().raw().toBuffer()));
  for(let i=0;i<original.length;i+=4)if(mask[i+3]===255&&!original.subarray(i,i+4).equals(edited.subarray(i,i+4)))throw Error('OUTSIDE_MASK_CHANGED');
  if(hashBytes(f.source.bytes)!==f.manifest.sourceHash||merged.width!==1024||merged.height!==1024)throw Error('ORIGINAL_CHANGED');
  await evidence.save('edited-copy.png',merged.bytes);
  if(cost===null)throw Error('PROVIDER_COST_UNKNOWN');
  await ledger.settleAttempt(attemptId,cost,'completed');
  await ledger.markReady(jobId,merged.sha256); // Review only: never accept or charge customer credits.
  report={state:'ready',jobId,attemptId,estimatedMicros:cost,usage:result.usage??null,originalHash:f.manifest.sourceHash,copyHash:merged.sha256,outsideRgbaEqual:true,...diagnostics()};
 }catch(error){
  // Absence of a valid usage report is never a zero-cost inference, even on 4xx.
  if(cost===null){await ledger.markAttemptUncertain(attemptId);report={state:'uncertain',jobId,attemptId,estimatedMicros:null,...diagnostics()};}
  else{await ledger.settleAttempt(attemptId,cost,'completed');await ledger.release(jobId,owner,'system_error');report={state:'failed-with-known-usage',jobId,attemptId,estimatedMicros:cost,...diagnostics()};}
 }
 const after=await db.transaction(()=>ledger.supplierBudget(new Date(now()).toISOString().slice(0,7),100000000));
 await evidence.save('outcome.json',{...report,before,after});return {...report,before,after};
}
