import {PostgresDatabase,cloudSchema} from '../cloud/postgres.mjs';
import {CloudGenerationService} from '../cloud/beta.mjs';
import {PostgresRecommendationService} from './postgres-service.mjs';
import {ExistingImageBudget} from './existing-image-budget.mjs';
import {savedRequestSnapshot} from './contracts.mjs';
import {recommendationApi} from './api.mjs';
// Explicit local test factory. No production caller or feature activation.
export function existingAppRecommendationApi({store,pool,storage,adapter,origin,enabled=false,reservationMicros=1000}){
 const services=new Map();
 async function serviceFor(owner){if(!enabled)throw Error('RECOMMENDATIONS_DISABLED');if(!services.has(owner))services.set(owner,(async()=>{
  const db=new PostgresDatabase(pool,cloudSchema(owner));
  const exists=await db.prepare("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=? AND table_name='generation_records') AS present").get(cloudSchema(owner));if(!exists.present)throw Error('NOT_FOUND');
  const period=store.budgetPeriod(),limit=()=>store.effectiveBudget(owner,period);
  const service=await new PostgresRecommendationService().initialize(db,{enabled,adapter,reservationMicros,budgetMicros:await limit(),resolveOwnedImage:async(userId,generationId)=>{
   if(userId!==owner)throw Error('NOT_FOUND');
   // The schema is chosen exclusively from the authenticated account ID.
   const row=await db.prepare("SELECT g.request_json,g.artifact_hash FROM generation_records g JOIN jobs j ON j.id=g.id WHERE g.id=? AND j.status IN ('ready','accepted') AND g.artifact_hash IS NOT NULL").get(generationId);
   if(!row)throw Error('NOT_FOUND');
   const request=JSON.parse(row.request_json),asset=await CloudGenerationService.prototype.asset.call({db,storage,cloudUser:owner},row.artifact_hash);
   if(!asset?.dataUrl)throw Error('OWNED_PERSISTED_IMAGE_REQUIRED');
   return {ownerId:owner,media:'image',persisted:true,artifactHash:row.artifact_hash,imageBytes:Buffer.from(asset.dataUrl.split(',')[1],'base64'),snapshot:savedRequestSnapshot(request)};
  }});
  service.shared=new ExistingImageBudget({db,owner,period,limit});return service;
 })().catch(error=>{services.delete(owner);throw error;}));return services.get(owner);}
 const service={readForGeneration:async(context,id)=>(await serviceFor(context.userId)).readForGeneration(context,id),read:async(context,id)=>(await serviceFor(context.userId)).read(context,id),request:async(context,body)=>(await serviceFor(context.userId)).request(context,body)};
 return {handle:recommendationApi({enabled,origin,service,authenticate:header=>store.authenticate(header)}),serviceFor};
}
