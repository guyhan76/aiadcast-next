import {Membership} from './membership.mjs';
import {readExternalSupplierBudget} from '../external-supplier-budget.mjs';
import {readGenerationHistory} from './generation-history.mjs';
import {readAdminGenerationPage} from './admin-generation-page.mjs';
import {recommendationRuntime} from '../recommendations/runtime.mjs';
import {submissionStage} from '../submission-observation.mjs';
import {readinessMeasure} from '../readiness-observation.mjs';
import {MAX_GENERATED_IMAGE_BYTES} from '../openai-image-adapter.mjs';
import {readAdminOverview} from './admin-overview.mjs';
import {singleBoxService} from '../vision-evaluation/single-box-service.mjs';
import {SingleBoxLedger,readSingleBoxEvaluation} from '../vision-evaluation/single-box-ledger.mjs';
import {dimensionAnalysisService} from '../vision-evaluation/service.mjs';
import {CloudVisionLedger,readCloudEvaluation} from '../vision-evaluation/cloud-ledger.mjs';
import {randomUUID} from 'node:crypto';
import {BetaStore} from './beta-store-base.mjs';
import {GenerationService} from './generation-base.mjs';
import {PostgresDatabase,postgresConfiguration,createPool,cloudSchema,acquireInstanceLock} from './postgres.mjs';
import {SupabaseStorage} from './storage.mjs';
import {createBetaServer} from './http-base.mjs';
import {OpenAIImageAdapter,hashBytes} from '../openai-image-adapter.mjs';
import {ApiFailure} from '../generation-service.mjs';
import {assistCopy} from '../text-assistant.mjs';
import {accountConfiguration} from '../account-providers.mjs';
import {providerGate} from '../beta-server.mjs';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const fail=(code,status=400)=>{throw new ApiFailure(code,status);};
export class CloudBetaStore extends BetaStore {
 async list(userId){return this.db.prepare('SELECT id,revision,name,updated,expires_at AS "expiresAt" FROM projects WHERE user_id=? AND expires_at>now() ORDER BY updated DESC').all(userId);}
 async save(userId,id,body){
  if((await this.membership.policy({id:userId})).plan==='free')fail('DEVICE_ONLY',403);
  const p=body?.project,revision=body?.revision;
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(id??'')||!p||p.version!==1||p.id!==id||typeof p.name!=='string'||p.name.length>80||!Number.isSafeInteger(revision)||revision<0)fail('INVALID_PROJECT');
  const bytes=Buffer.from(JSON.stringify(p));if(bytes.length>40000000)fail('PROJECT_TOO_LARGE',413);
  const name='project-'+id+'-'+randomUUID()+'.json';
  const path=await this.storage.put(userId,name,bytes,'application/json');
  let oldPath;
  try{
   const result=await this.transaction(async()=>{
    const old=await this.db.prepare('SELECT revision,bytes,json,expires_at FROM projects WHERE user_id=? AND id=?').get(userId,id);
    if((old?.revision??0)!==revision)fail('PROJECT_CONFLICT',409);
    if(old&&new Date(old.expires_at)<=new Date())fail('PROJECT_EXPIRED',410);
    const policy=await this.membership.policy({id:userId});
    if(policy.plan==='free')fail('DEVICE_ONLY',403);
    if(policy.usedBytes-(old?.bytes??0)+bytes.length>policy.limitBytes)fail('PROJECT_QUOTA',413);
    oldPath=old?JSON.parse(old.json).storagePath:undefined;
    const next=revision+1,updated=new Date(this.now()).toISOString();
    const ref=JSON.stringify({storagePath:path,sha256:hashBytes(bytes)});
    await this.db.prepare('INSERT INTO projects(user_id,id,revision,name,json,bytes,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET revision=excluded.revision,name=excluded.name,json=excluded.json,bytes=excluded.bytes,updated=excluded.updated').run(userId,id,next,p.name,ref,bytes.length,updated);
    await this.db.prepare('UPDATE storage_objects SET expires_at=(SELECT expires_at FROM projects WHERE user_id=? AND id=?) WHERE path=? AND user_id=?').run(userId,id,path,userId);
    return {revision:next,updated};
   });
   if(oldPath)void this.storage.remove(userId,oldPath).catch(()=>{});
   return result;
  }catch(e){
   // A confirmed conflict was rolled back. Unknown database outcomes retain the object.
   if(e instanceof ApiFailure)void this.storage.remove(userId,path).catch(()=>{});throw e;
  }
 }
 async project(userId,id){
  const live=await this.db.prepare('SELECT id FROM projects WHERE user_id=? AND id=? AND expires_at>now()').get(userId,id);
  if(!live)fail('PROJECT_NOT_FOUND',404);
  const record=await super.project(userId,id),ref=record.project;
  if(typeof ref.storagePath!=='string')fail('CLOUD_PROJECT_MIGRATION_REQUIRED',409);
  const bytes=await this.storage.get(userId,ref.storagePath);
  if(hashBytes(bytes)!==ref.sha256)fail('STORAGE_CONTENT_MISMATCH',503);
  let project;try{project=JSON.parse(bytes.toString('utf8'));}catch{fail('STORAGE_CONTENT_MISMATCH',503);}
  return {revision:record.revision,project};
 }
}
// Keep selective edits behind the same instance ownership and provider concurrency gate.
export function guardedImageAdapter(adapter,guard,gate){return {
 prepareSelectiveInput:input=>{guard();return adapter.prepareSelectiveInput?.(input);},
 validateSelectiveInput:input=>{guard();return adapter.validateSelectiveInput?.(input);},
 get selectiveEditReady(){return adapter.selectiveEditReady===true&&typeof adapter.editRegion==='function';},
 generate:options=>{guard();return gate(()=>adapter.generate(options));},
 editRegion:options=>{guard();if(adapter.selectiveEditReady!==true||typeof adapter.editRegion!=='function')fail('REGION_EDIT_NOT_AVAILABLE',503);return gate(()=>adapter.editRegion(options));}
};}
export class CloudGenerationService extends GenerationService {
 async history(projectId){return readGenerationHistory(this,projectId);}
 async create(body,options){
  submissionStage('admission_queue');
  // The local implementation has synchronous admission. Cloud reads yield: serialize
  // admission so concurrent retries see the persisted job before reserving again.
  if((this.admissions??0)>=2)fail('GENERATION_ALREADY_RUNNING',409);
  this.admissions=(this.admissions??0)+1;
  const work=(this.admissionTail??Promise.resolve()).then(()=>super.create(body,options));
  this.admissionTail=work.catch(()=>{});
  try{return await work;}finally{this.admissions--;}
 }
 async assertOutputCapacity(request, originals){
  // Admission check, not a durable reservation: concurrent saves may still consume
  // space. Existing uncertain requests are resolved by deduplication before here.
  await this.storage.assertGenerationCapacity(this.cloudUser,originals,
   MAX_GENERATED_IMAGE_BYTES*(request.proportionControl?2:1));
 }
 async storeAsset(asset){
  if(hashBytes(asset.bytes)!==asset.sha256)fail('STORAGE_CONTENT_MISMATCH');
  // Metadata and a live, owner-scoped byte/hash verification are both required.
  // A missing object is restored using create-only upload, never blind overwrite.
  const existing=await this.db.prepare('SELECT * FROM generation_assets WHERE hash=?').get(asset.sha256);
  if(existing){
   if(existing.mime!==asset.mime||existing.width!==asset.width||existing.height!==asset.height||existing.bytes!==asset.bytes.length)fail('STORAGE_CONTENT_MISMATCH');
   if(await this.storage.verifyAsset(this.cloudUser,asset)){await this.storage.renewAsset(this.cloudUser,asset.sha256);return;}
  }
  const extension=asset.mime==='image/png'?'png':asset.mime==='image/jpeg'?'jpeg':'webp';
  await this.storage.put(this.cloudUser,asset.sha256+'.'+extension,asset.bytes,asset.mime,{immutable:true});
  await this.db.prepare('INSERT INTO generation_assets VALUES(?,?,?,?,?) ON CONFLICT(hash) DO NOTHING').run(asset.sha256,asset.mime,asset.width,asset.height,asset.bytes.length);
 }
 async asset(hash,{includeBytes=true}={}){
  if(!hash)return null;const a=await this.db.prepare('SELECT * FROM generation_assets WHERE hash=?').get(hash);if(!a)return null;
  const extension=a.mime==='image/png'?'png':a.mime==='image/jpeg'?'jpeg':'webp';
  const bytes=includeBytes?await this.storage.get(this.cloudUser,this.cloudUser+'/'+hash+'.'+extension):null;
  return {id:a.hash,sha256:a.hash,width:a.width,height:a.height,...(bytes?{dataUrl:`data:${a.mime};base64,${bytes.toString('base64')}`}:{})};
 }
}
export async function createCloudBackend(config,env=process.env,{pool:injectedPool,storage:injectedStorage,storageFetch,adapter:injectedAdapter,recommendationTransport,extraOrigins=[],accounts:injectedAccounts,staticDirectory=resolve('dist'),skipInstanceLock=false,onStandby}={}){
 const pool=injectedPool??createPool(postgresConfiguration(env.DATABASE_URL,env.SUPABASE_URL,env));
 let instance,app,closing=false;
 const lost=()=>{if(app&&!closing){closing=true;void app.close().finally(()=>pool.end()).finally(()=>{process.exitCode=1;});}};
 try{
  if(!skipInstanceLock)instance=await acquireInstanceLock(pool,lost,{onStandby});
  const guard=()=>instance?.assert();
  const accountsDb=await new PostgresDatabase(pool,'aiadcast_accounts',{guard}).initialize();
  const store=await new CloudBetaStore().initialize(accountsDb,{monthlyBudgetMicros:config.monthlyBudgetMicros});
  const storage=injectedStorage??await new SupabaseStorage({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY,accountsDb,fetchImpl:storageFetch}).initialize();store.storage=storage;
  const membership=new Membership(store,storage);await membership.initialize();store.membership=membership;
  const gate=providerGate(2),adapter=injectedAdapter??new OpenAIImageAdapter({apiKey:config.key,enableEdits:config.enabled});
  const supabaseMail=env.AIADCAST_EMAIL_ENABLED==='true'&&env.AIADCAST_EMAIL_PROVIDER==='supabase';
  const accounts=injectedAccounts??accountConfiguration(env);
  if(accounts.password&&await accountsDb.prepare("SELECT value FROM settings WHERE key='owner_withdrawn'").get())accounts.password={...accounts.password,adminPassword:undefined};
  if(!injectedAccounts&&supabaseMail)accounts.sendMail=options=>storage.sendAuthEmail(options);
  app=await createBetaServer({store,recommendations:recommendationRuntime({store,pool,storage,origin:config.publicUrl,extraOrigins:['https://appassets.androidplatform.net',...extraOrigins],apiKey:config.key,policy:config.recommendationPolicy,transport:recommendationTransport,guard:()=>instance?.assert()}),generationHistoryReader:(actor,search)=>readAdminGenerationPage({pool,guard,actor,search}),overviewReader:(actor,admin,options)=>readAdminOverview({pool,guard,actor,admin,...options,enabled:config.enabled,providerConfigured:Boolean(config.key)||Boolean(injectedAdapter)}),publicUrl:config.publicUrl,singleBox:singleBoxService({apiKey:config.key,statusReader:(actor,id)=>readSingleBoxEvaluation(accountsDb,actor,id),ledgerFactory:()=>new SingleBoxLedger().initialize(accountsDb),gate:fn=>{instance?.assert();return gate(fn);}}),dimensionAnalysis:dimensionAnalysisService({evaluationEnabled:true,apiKey:config.key,statusReader:(actor,id)=>readCloudEvaluation(accountsDb,actor,id),ledgerFactory:()=>new CloudVisionLedger().initialize(accountsDb),gate:fn=>{instance?.assert();return gate(fn);}}),extraOrigins,staticDirectory,accounts,serviceFactory:async user=>{
   instance?.assert();const db=await readinessMeasure('schema_setup',()=>new PostgresDatabase(pool,cloudSchema(user.id),{guard}).initialize());
   const s=new CloudGenerationService();s.storage=storage;s.cloudUser=user.id;
   await readinessMeasure('generation_initialize',()=>s.initialize({db,managedBudgetIncrease:true,budgetForPeriod:period=>store.effectiveBudget(user.id,period),enabled:config.enabled,assistantEnabled:config.assistantEnabled,budgetMicros:user.budget,testCredits:user.credits,providerConfigured:Boolean(config.key)||Boolean(injectedAdapter),adapter:guardedImageAdapter(adapter,()=>instance?.assert(),gate),assistantAdapter:options=>{instance?.assert();return gate(()=>assistCopy({...options,apiKey:config.key}));}}));
   s.ledger.externalBudget=()=>readExternalSupplierBudget(db,user.id);
   await readinessMeasure('table_protection',()=>db.protectTables());return s;
  }});
  await accountsDb.exec(readFileSync(new URL('./bootstrap-owner.sql',import.meta.url),'utf8'));
  await accountsDb.protectTables();
  membership.forgetService=app.forgetService;
  membership.start();
  return {...app,store,storage,pool,close:async()=>{if(closing)return;closing=true;await membership.stop();await app.close();await store.close();await instance?.close();await pool.end();}};
 }catch(e){await instance?.close().catch(()=>{});await pool.end().catch(()=>{});throw e;}
}
