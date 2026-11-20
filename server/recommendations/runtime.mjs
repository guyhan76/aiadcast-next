import {existingAppRecommendationApi} from './existing-app-integration.mjs';
import {createOpenAIRecommendationAdapter} from './openai-adapter.mjs';
import {validateServerRecommendationPolicy} from './safety-policy.mjs';
// Uses the image server's existing injected key. Does not read env/files or migrate.
export function recommendationRuntime({store,pool,storage,origin,extraOrigins=[],apiKey,policy,transport=globalThis.fetch,guard=()=>{}}){
 if(!policy)return {handle:async()=>Response.json({error:{code:'RECOMMENDATIONS_DISABLED'}},{status:503})};
 try {
 const p=validateServerRecommendationPolicy(policy);
 const adapter=createOpenAIRecommendationAdapter({executionMode:'server',policy:p,apiKey,transport,model:p.model,pricing:p.pricing,maxOutputTokens:p.maxOutputTokens});
 return existingAppRecommendationApi({store,pool,storage,origin,extraOrigins,enabled:true,executionMode:'server',policy:p,reservationMicros:p.reservationMicros,version:p.model+'/'+p.promptVersion,outputProvenance:'openai',adapter:input=>{guard();return adapter(input);}});
 }catch{return {handle:async()=>Response.json({error:{code:'RECOMMENDATION_LIVE_POLICY_NOT_APPROVED'}},{status:503})};}
}
