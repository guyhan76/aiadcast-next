import type {AdBatch,BatchPrice} from './batch-price';
import {buildNewGenerationRequest} from './generation';
import {generationInputs} from './generation-input';
import {generationMatchKey} from './generation-match';
import {dimensionInputHash} from './ai-dimension-display';
import {preflightProportions} from './proportion-browser';
import {apiRequest} from './generation-client';
import {storageNamespace} from './beta-session';
import {saveProject} from './storage';
import type {Project} from './model';
import {carouselCount,carouselFormat,validStoryPlan} from './story-carousel';

export async function submitAdBatch(project:Project,price:BatchPrice,owner:string){
 const check=()=>{if(owner!==storageNamespace())throw Error('SESSION_CHANGED');};
 check();
 // Check the approved plan against the quoted batch before saving or submitting.
 // An individually saved card may retain its full storyboard; it must be planned
 // again before being used to request a new carousel.
 if(project.storyCarousel&&(project.format!==carouselFormat||
   (project.requestedImageCount??carouselCount)!==price.count||
   !validStoryPlan(project.storyPlan,price.count)))throw Error('INVALID_STORY_PLAN');
 const request=buildNewGenerationRequest(project);
 if((await preflightProportions(project))?.status==='mismatch')throw Error('PROPORTION_MISMATCH');
 const id='ads-'+await dimensionInputHash(JSON.stringify([owner,project.id,price.count,generationMatchKey(request),...(project.storyCarousel?[project.storyPlan]:[])]));
 const batch:AdBatch={id,count:price.count};
 const entry={...project,id,generated:undefined,resultSet:undefined,adBatch:batch};
 check();await saveProject(entry,owner);check();
 try {
  const result=await apiRequest<{id:string}>('/api/generations',{batch:{...batch,quote:price,...(project.storyCarousel?{storyPlan:project.storyPlan}:{})},projectId:id,requestId:id,request,...generationInputs(project)});
  if(result.id!==id)throw Error('INVALID_RESPONSE');
 }catch(error){
  check();
  const recovered=await apiRequest<{id:string}>('/api/ad-batches/'+id).catch(()=>null);
  if(recovered?.id!==id)throw error;
 }
 check();return entry;
}
