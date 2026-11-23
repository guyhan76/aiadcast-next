import {CustomerImageCosts, customerBalanceSql, initializeCustomerAccounting} from './customer-image-costs.mjs';
import {Membership} from './membership.mjs';
import {SharedGenerationBudget} from './shared-generation-budget.mjs';
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
import {BetaStore} from './beta-store-base.mjs';
import {GenerationService} from './generation-base.mjs';
import {PostgresDatabase,postgresConfiguration,createPool,cloudSchema,acquireInstanceLock} from './postgres.mjs';
import {SupabaseStorage} from './storage.mjs';
import {createBetaServer} from './http-base.mjs';
import {OpenAIImageAdapter,hashBytes} from '../openai-image-adapter.mjs';
import {ApiFailure} from '../generation-service.mjs';
import {assistCopy} from '../text-assistant.mjs';
import {accountConfiguration} from '../account-providers.mjs';
import {providerGate,guardedImageAdapter} from '../beta-server.mjs';
export {guardedImageAdapter} from '../beta-server.mjs';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const fail=(code,status=400)=>{throw new ApiFailure(code,status);};
export class CloudBetaStore extends BetaStore {
 async list(userId){return this.db.prepare('SELECT id,revision,name,updated,expires_at AS "expiresAt" FROM projects WHERE user_id=? AND expires_at>now() ORDER BY updated DESC').all(userId);}
 async save(){fail('DEVICE_ONLY',403);}
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
export class CloudGenerationService extends GenerationService {
 deliveryDeadline(row,billing){
  return row.created_at<this.membership.cutover?this.membership.cutover+30*86400000:billing.expires_at;
 }
 async jobView(row,billing,requestIds,defectReport,options){
  if(!this.membership)return super.jobView(row,billing,requestIds,defectReport,options);
  const expires=this.deliveryDeadline(row,billing);
  if(row.error_code==='DOWNLOAD_REMOVED'||row.artifact_hash && expires<=this.now()){
   const summary=await super.jobView(row,billing,requestIds,defectReport,{includeArtifact:false});
   return {...summary,state:'expired',artifact:null,artifactId:null,downloadExpiresAt:new Date(expires).toISOString()};
  }
  const result=await super.jobView(row,billing,requestIds,defectReport,options);
  if(row.artifact_hash && ['ready','accepted'].includes(result.state))result.downloadExpiresAt=new Date(expires).toISOString();
  return result;
 }
 async archiveDefect(report){
  const db=this.membership.db;
  await db.prepare(`INSERT INTO protected_complaints(case_id,received_at,description,resolution,resolved_at,erase_at)
   VALUES(?,to_timestamp(?/1000.0),?,?,to_timestamp(?/1000.0),to_timestamp(?/1000.0)+interval '3 years')
   ON CONFLICT(case_id) DO UPDATE SET resolution=EXCLUDED.resolution,resolved_at=EXCLUDED.resolved_at,erase_at=EXCLUDED.erase_at`)
   .run(report.id,report.created_at,report.description,report.resolution,report.reviewed_at,report.reviewed_at??report.created_at);
  await db.prepare('INSERT INTO complaint_member_links VALUES(?,?) ON CONFLICT DO NOTHING').run(report.id,this.cloudUser);
  return report;
 }
 async reportDefect(id,body){return this.ledger.transaction(async()=>this.archiveDefect(await super.reportDefect(id,body)));}
 async reviewDefect(id,body){return this.ledger.transaction(async()=>this.archiveDefect(await super.reviewDefect(id,body)));}
 async defectEvidence(id){
  const info=await this.job(id,{includeArtifact:false});
  if(info.state==='expired')fail('PROJECT_EXPIRED',410);
  return super.defectEvidence(id);
 }
 async wallet(){
  const wallet=await super.wallet();
  if(!this.customerImagesEnabled || this.adminTestUnlimited)return wallet;
  // Only delivered ads and currently reserved jobs consume customer entitlements.
  const row=await this.db.prepare(customerBalanceSql('','?')).get(this.cloudUser);
  const available=Math.max(0,Math.min(wallet.credits.available,row.available));
  return {...wallet,kind:'customer-ads',available:0,reserved:0,credits:{available,reserved:row.reserved}};
 }
 async recordVerifiedPurchase(receipt){
  return this.ledger.transaction(async()=>{
   if(receipt.livePlayPurchase){
    const prior=await this.db.prepare('SELECT 1 FROM purchases WHERE purchase_id=?').get(receipt.purchaseId);
    if(this.customerImagesEnabled && !this.adminTestUnlimited)await this.customerCosts.sale(receipt,Boolean(prior));
    await this.membership.records.recordSale(receipt,this.cloudUser,Boolean(prior));
   }
   return super.recordVerifiedPurchase(receipt);
  });
 }
 async verifiedPurchaseReceipt(receipt){
  const result=await super.verifiedPurchaseReceipt(receipt);
  if(receipt.livePlayPurchase)await this.ledger.transaction(async()=>{
   if(this.customerImagesEnabled && !this.adminTestUnlimited)await this.customerCosts.sale(receipt,true);
   await this.membership.records.recordSale(receipt,this.cloudUser,true);
   result.balance=(await this.wallet()).credits.available;
  });
  return result;
 }
 async history(projectId){return readGenerationHistory(this,projectId);}
 async create(body,options){
  if(typeof body?.requestId==='string'&&this.membership){
   const expired=await this.membership.db.prepare("SELECT 1 FROM retired_generation_keys WHERE digest=encode(sha256(convert_to(?||':'||?,'UTF8')),'hex') AND expires_at>now()").get(this.cloudUser,body.requestId);
   if(expired)fail('PROJECT_EXPIRED',410);
  }
  submissionStage('admission_queue');
  // The local implementation has synchronous admission. Cloud reads yield: serialize
  // admission so concurrent retries see the persisted job before reserving again.
  if((this.admissions??0)>=2)fail('GENERATION_ALREADY_RUNNING',409);
  this.admissions=(this.admissions??0)+1;
  const work=(this.admissionTail??Promise.resolve()).then(()=>super.create(body,options));
  this.admissionTail=work.catch(()=>{});
  try{
   const result=await work;
   if(result.reused && this.customerImagesEnabled && !this.adminTestUnlimited)await this.customerCosts.retry();
   return result;
  }finally{this.admissions--;}
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
 async asset(hash,{includeBytes=true,optional=false}={}){
  if(!hash)return null;const a=await this.db.prepare('SELECT * FROM generation_assets WHERE hash=?').get(hash);if(!a)return null;
  const extension=a.mime==='image/png'?'png':a.mime==='image/jpeg'?'jpeg':'webp';
  let bytes;
  if(includeBytes){
   try{bytes=await this.storage.get(this.cloudUser,this.cloudUser+'/'+hash+'.'+extension);}
   catch(error){if(optional&&error.code==='STORAGE_NOT_FOUND')return null;throw error;}
  }
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
  const sharedBudget=await new SharedGenerationBudget(accountsDb).initialize(env.AIADCAST_MEMBER_GENERATION_BUDGET_OWNER_ID);
  store.sharedGenerationBudget=sharedBudget;
  store.customerGeneration=await accountsDb.transaction(async()=>{
   await initializeCustomerAccounting(accountsDb);
   if(env.AIADCAST_CUSTOMER_GENERATION_ENABLED==='true'){
    if(!sharedBudget.active)throw Error('TEST_BUDGET_POLICY_REQUIRED');
    await accountsDb.exec('INSERT INTO customer_generation_policy VALUES(1) ON CONFLICT DO NOTHING');
   }
   return Boolean(await accountsDb.prepare('SELECT id FROM customer_generation_policy WHERE id=1').get());
  });
  const storage=injectedStorage??await new SupabaseStorage({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY,accountsDb,fetchImpl:storageFetch}).initialize();store.storage=storage;
  const membership=new Membership(store,storage);await membership.initialize();store.membership=membership;
  const gate=providerGate(2),adapter=injectedAdapter??new OpenAIImageAdapter({apiKey:config.key,enableEdits:config.enabled});
  const supabaseMail=env.AIADCAST_EMAIL_ENABLED==='true'&&env.AIADCAST_EMAIL_PROVIDER==='supabase';
  const accounts=injectedAccounts??accountConfiguration(env);
  membership.records.provider=accounts.play;
  membership.records.configurePayout(env.AIADCAST_CASE_PAYOUT_KEY);
  if(accounts.password&&await accountsDb.prepare("SELECT value FROM settings WHERE key='owner_withdrawn'").get())accounts.password={...accounts.password,adminPassword:undefined};
  if(!injectedAccounts&&supabaseMail)accounts.sendMail=options=>storage.sendAuthEmail(options);
  app=await createBetaServer({store,recommendations:recommendationRuntime({store,pool,storage,origin:config.publicUrl,extraOrigins:['https://appassets.androidplatform.net',...extraOrigins],apiKey:config.key,policy:config.recommendationPolicy,transport:recommendationTransport,guard:()=>instance?.assert()}),generationHistoryReader:(actor,search)=>readAdminGenerationPage({pool,guard,actor,search}),overviewReader:(actor,admin,options)=>readAdminOverview({pool,guard,actor,admin,...options,enabled:config.enabled,providerConfigured:Boolean(config.key)||Boolean(injectedAdapter)}),publicUrl:config.publicUrl,singleBox:singleBoxService({apiKey:config.key,statusReader:(actor,id)=>readSingleBoxEvaluation(accountsDb,actor,id),ledgerFactory:()=>new SingleBoxLedger().initialize(accountsDb),gate:fn=>{instance?.assert();return gate(fn);}}),dimensionAnalysis:dimensionAnalysisService({evaluationEnabled:true,apiKey:config.key,statusReader:(actor,id)=>readCloudEvaluation(accountsDb,actor,id),ledgerFactory:()=>new CloudVisionLedger().initialize(accountsDb),gate:fn=>{instance?.assert();return gate(fn);}}),extraOrigins,staticDirectory,accounts,serviceFactory:async user=>{
   instance?.assert();const db=await readinessMeasure('schema_setup',()=>new PostgresDatabase(pool,cloudSchema(user.id),{guard}).initialize());
   const s=new CloudGenerationService();s.storage=storage;s.cloudUser=user.id;s.membership=membership;
   s.customerCosts=new CustomerImageCosts(accountsDb,user.id);
   s.customerImagesEnabled=store.customerGeneration && Boolean(await accountsDb.prepare(
    'SELECT 1 FROM email_identities e WHERE e.user_id=? AND NOT EXISTS(SELECT 1 FROM test_passwords t WHERE t.user_id=e.user_id)'
   ).get(user.id));
   await readinessMeasure('generation_initialize',()=>s.initialize({db,managedBudgetIncrease:true,budgetForPeriod:period=>store.effectiveBudget(user.id,period),enabled:config.enabled,assistantEnabled:config.assistantEnabled,budgetMicros:user.budget,testCredits:user.credits,providerConfigured:Boolean(config.key)||Boolean(injectedAdapter),adapter:guardedImageAdapter(adapter,()=>instance?.assert(),gate),assistantAdapter:options=>{instance?.assert();return gate(()=>assistCopy({...options,apiKey:config.key}));}}));
   s.ledger.recordDelivery=async(job,customer)=>{
    if(await db.prepare('SELECT job_id FROM previous_beta_jobs WHERE job_id=?').get(job.id))return;
    const funds=customer?await db.prepare(customerBalanceSql('','?')).get(user.id):await s.ledger.wallet(job.user_id,'credit-v2');
    await membership.records.capture(user.id,job.id,Number(funds.available)+Number(funds.reserved),job.credits);
   };
   s.ledger.restoreDelivery=id=>membership.records.restore(id,user.id);
   if(sharedBudget.active){
    await sharedBudget.protectTenant(db.schema);
    s.ledger.sharedBudget=period=>sharedBudget.view(user.id,period);
   }
   // cloudSchema validates the UUID before embedding it as the fixed trigger argument.
   await db.exec(`CREATE OR REPLACE TRIGGER first_result_delivery BEFORE UPDATE OF status ON jobs
     FOR EACH ROW EXECUTE FUNCTION aiadcast_accounts.set_delivery_deadline('${user.id}')`);
   s.ledger.externalBudget=()=>readExternalSupplierBudget(db,user.id);
   await readinessMeasure('table_protection',()=>db.protectTables());membership.jobs.set(user.id,s);return s;
  }});
  await accountsDb.exec(readFileSync(new URL('./bootstrap-owner.sql',import.meta.url),'utf8'));
  await accountsDb.protectTables();
  membership.forgetService=app.forgetService;
  membership.start();
  const checkoutRecovery=app.recoverCheckoutOrders().catch(()=>console.warn('Test checkout reconciliation deferred until wallet refresh.'));
  return {...app,store,storage,pool,close:async()=>{if(closing)return;closing=true;await checkoutRecovery;await membership.stop();await app.close();await store.close();await instance?.close();await pool.end();}};
 }catch(e){await instance?.close().catch(()=>{});await pool.end().catch(()=>{});throw e;}
}
