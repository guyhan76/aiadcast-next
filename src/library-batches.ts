import type {Project} from './model';
import {validBatch,type AdBatch} from './batch-price.ts';
import {hasSavedAcceptedAd} from './generated.ts';

export function savedBatchMembers(items:Project[]) {
 const groups=new Map<string,number[]>();
 for(const item of items){
  const match=/^(ads-[a-f0-9]{64})-([1-9]|10)$/.exec(item.id);
  if(!match || !hasSavedAcceptedAd(item))continue;
  const slots=groups.get(match[1])??[];
  slots.push(Number(match[2]));
  groups.set(match[1],slots);
 }
 return groups;
}

export function withSavedSlots(project:Project,slots:readonly number[]):Project {
 const batch=project.adBatch;
 if(!validBatch(batch)||!slots.length)return project;
 const prior=batch.savedSlots??[];
 const merged=new Set(prior);
 for(const slot of slots)if(Number.isInteger(slot)&&slot>=1&&slot<=batch.count)merged.add(slot);
 if(merged.size===prior.length)return project;
 return {...project,adBatch:{...batch,savedSlots:[...merged].sort((a,b)=>a-b)}};
}

export function libraryBatch(project:Project){
 const batch=project.adBatch;
 return validBatch(batch)&&(project.id===batch.id||!hasSavedAcceptedAd(project))?batch:undefined;
}

export function visibleLibraryProjects(items:Project[]):Project[] {
 const parents=new Map<string,Project>();
 // A restored workspace can also contain an older copy of a request.
 for(const item of items){
  const batch=libraryBatch(item);
  if(batch&&(!parents.has(batch.id)||item.id===batch.id))parents.set(batch.id,item);
 }
 return items.filter(p=>{
  const batch=libraryBatch(p);
  if(!batch&&hasSavedAcceptedAd(p))return true;
  if(p.presentation!=='campaign'||!p.productName.trim())return false;
  return !batch||(parents.get(batch.id)===p&&(batch.savedSlots?.length??0)<batch.count);
 });
}

type JobState='running'|'ready'|'accepted'|'failed'|'expired'|'refunded'|'rejected'|'uncertain';
type SummaryJob={id:string;projectId:string;state:JobState;artifactId:string|null};
export type BatchSummary={id:string;jobs:SummaryJob[]};
export function readLibraryBatch(batch:AdBatch,summary:BatchSummary):{
 state:'running'|'ready'|'unknown'|'partial'|'unavailable';cover?:SummaryJob;
}{
 if(summary?.id!==batch.id||!Array.isArray(summary.jobs)||summary.jobs.length!==batch.count||
    !summary.jobs.every((j,i)=>j?.projectId===batch.id+'-'+(i+1)&&typeof j.id==='string'&&j.id.length>0))
  throw Error('INVALID_BATCH');
 const jobs=summary.jobs;
 if(new Set(jobs.map(j=>j.id)).size!==jobs.length||jobs.some(j=>!['running','ready','accepted','failed','expired','refunded','rejected','uncertain'].includes(j.state)))throw Error('INVALID_BATCH');
 const delivered=jobs.filter(j=>(j.state==='ready'||j.state==='accepted')&&j.artifactId);
 const state=jobs.some(j=>j.state==='running')?'running':delivered.length===jobs.length?'ready':
  jobs.some(j=>j.state==='uncertain'||(j.state==='ready'||j.state==='accepted')&&!j.artifactId)?'unknown':delivered.length?'partial':'unavailable';
 const cover=delivered.find(j=>!batch.savedSlots?.includes(jobs.indexOf(j)+1))??delivered[0];
 return {state,cover};
}
