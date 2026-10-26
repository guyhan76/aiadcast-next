import {assertRecommendationExecution} from './safety-policy.mjs';
import {PostgresDatabase,cloudSchema} from '../cloud/postgres.mjs';
import {CloudGenerationService} from '../cloud/beta.mjs';
import {PostgresRecommendationService} from './postgres-service.mjs';
import {ExistingImageBudget} from './existing-image-budget.mjs';
import {savedRequestSnapshot} from './contracts.mjs';
import {recommendationApi} from './api.mjs';
// Uses existing authentication, private artifacts and authoritative image budgets.
export function existingAppRecommendationApi({store,pool,storage,adapter,origin,enabled=false,executionMode,policy,reservationMicros=1000,outputProvenance='mock-ai',version='mock-v1/prompt-v1',extraOrigins=[]}){
 if(enabled)assertRecommendationExecution(executionMode,policy);
 const services=new Map();
 async function serviceFor(owner){if(!enabled)throw Error('RECOMMENDATIONS_DISABLED');if(!services.has(owner))services.set(owner,(async()=>{
  const db=new PostgresDatabase(pool,cloudSchema(owner));
  const exists=await db.prepare("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=? AND table_name='generation_records') AS present").get(cloudSchema(owner));if(!exists.present)throw Error('NOT_FOUND');
  const period=()=>store.budgetPeriod(),limit=p=>store.effectiveBudget(owner,p);
  const sharedBudget=new ExistingImageBudget({db,owner,period,limit,recommendationCap:policy?.monthlyCapMicros});
  const service=await new PostgresRecommendationService().initialize(db,{enabled,executionMode,policy,outputProvenance,version,sharedBudget,adapter,reservationMicros,budgetMicros:0,resolveOwnedImage:async(userId,generationId)=>{
   if(userId!==owner)throw Error('NOT_FOUND');
   // The schema is chosen exclusively from the authenticated account ID.
   const row=await db.prepare("SELECT g.request_json,g.artifact_hash FROM generation_records g JOIN jobs j ON j.id=g.id WHERE g.id=? AND j.status IN ('ready','accepted') AND g.artifact_hash IS NOT NULL").get(generationId);
   if(!row)throw Error('NOT_FOUND');
   const request=JSON.parse(row.request_json),asset=await CloudGenerationService.prototype.asset.call({db,storage,cloudUser:owner},row.artifact_hash);
   if(!asset?.dataUrl)throw Error('OWNED_PERSISTED_IMAGE_REQUIRED');
   return {ownerId:owner,media:'image',persisted:true,artifactHash:row.artifact_hash,imageBytes:Buffer.from(asset.dataUrl.split(',')[1],'base64'),snapshot:savedRequestSnapshot(request)};
  }});
  return service;
 })().catch(error=>{services.delete(owner);throw error;}));return services.get(owner);}
 const service={readForGeneration:async(context,id)=>(await serviceFor(context.userId)).readForGeneration(context,id),read:async(context,id)=>(await serviceFor(context.userId)).read(context,id),request:async(context,body)=>(await serviceFor(context.userId)).request(context,body)};
 return {handle:recommendationApi({enabled,origin,extraOrigins,service,adminPolicy:executionMode==='server'?{reservationMicros:policy.reservationMicros,monthlyCapMicros:policy.monthlyCapMicros}:undefined,authenticate:header=>store.authenticate(header)}),serviceFor};
}
