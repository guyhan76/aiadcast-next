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

export async function submitAdBatch(project:Project,price:BatchPrice,owner:string){
 const check=()=>{if(owner!==storageNamespace())throw Error('SESSION_CHANGED');};
 const request=buildNewGenerationRequest(project);
 if((await preflightProportions(project))?.status==='mismatch')throw Error('PROPORTION_MISMATCH');
 const id='ads-'+await dimensionInputHash(JSON.stringify([owner,project.id,price.count,generationMatchKey(request)]));
 const batch:AdBatch={id,count:price.count};
 const entry={...project,id,adBatch:batch};
 check();await saveProject(entry,owner);check();
 try {
  const result=await apiRequest<{id:string}>('/api/generations',{batch:{...batch,quote:price},projectId:id,requestId:id,request,...generationInputs(project)});
  if(result.id!==id)throw Error('INVALID_RESPONSE');
 }catch(error){
  check();
  const recovered=await apiRequest<{id:string}>('/api/ad-batches/'+id).catch(()=>null);
  if(recovered?.id!==id)throw error;
 }
 check();return entry;
}
