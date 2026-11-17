import type {Project} from './model';
import {visibleLibraryProjects,libraryBatch} from './library-batches.ts';
import {hasSavedAcceptedAd} from './generated.ts';

export type Delivery={id:string;name:string;expiresAt:string;createdAt?:string;projectId?:string;reviewRequired:boolean};
export type CloudProject={id:string;name:string;expiresAt:string;revision:number};
export type AdCard={id:string;name:string;project?:Project;deviceIds:string[];delivery?:Delivery;reviewProject?:Project;backups:CloudProject[]};

export function libraryCards(projects:Project[],deliveries:Delivery[],backups:CloudProject[]):AdCard[]{
 const cards=new Map<string,AdCard>();
 const batchSources=new Map<string,Project>();
 const deliveriesByProject=new Map<string,Delivery[]>();
 for(const d of deliveries){
  if(!d.projectId)continue;
  const group=deliveriesByProject.get(d.projectId)??[];
  group.push(d);deliveriesByProject.set(d.projectId,group);
 }
 for(const p of visibleLibraryProjects(projects)){
  const batch=libraryBatch(p);
  if(batch)for(let slot=1;slot<=batch.count;slot++)batchSources.set(batch.id+'-'+slot,p);
  if(batch&&Array.from({length:batch.count},(_,i)=>i+1).every(slot=>batch.savedSlots?.includes(slot)||deliveriesByProject.has(batch.id+'-'+slot)))continue;
  const matches=deliveriesByProject.get(p.id);
  const jobId=hasSavedAcceptedAd(p)?p.generated!.jobId:!batch&&matches?.length===1?matches[0].id:undefined;
  const id=jobId?'job:'+jobId:'project:'+p.id;
  const existing=cards.get(id);
  if(existing){
   existing.deviceIds.push(p.id);
   const previous=existing.project!,wasFinished=hasSavedAcceptedAd(previous),isFinished=hasSavedAcceptedAd(p);
   if(wasFinished!==isFinished?wasFinished:previous.updatedAt>=p.updatedAt)continue;
  }
  cards.set(id,{id,name:p.name||p.productName,project:p,deviceIds:existing?.deviceIds??[p.id],backups:[]});
 }
 for(const delivery of deliveries){
  const id='job:'+delivery.id,card=cards.get(id)??{id,name:delivery.name,deviceIds:[],backups:[]};
  cards.set(id,{...card,delivery,reviewProject:delivery.projectId?batchSources.get(delivery.projectId):undefined});
 }
 const byProject=new Map<string,AdCard>();
 for(const card of cards.values())for(const id of card.deviceIds)byProject.set(id,card);
 for(const backup of backups){
  const matches=deliveriesByProject.get(backup.id);
  const existing=byProject.get(backup.id)??(matches?.length===1?cards.get('job:'+matches[0].id):undefined);
  if(existing)existing.backups.push(backup);
  else cards.set('backup:'+backup.id,{id:'backup:'+backup.id,name:backup.name,backups:[backup],deviceIds:[]});
 }
 const time=(c:AdCard)=>Date.parse(c.project?.updatedAt??c.delivery?.createdAt??'')||0;
 return [...cards.values()].sort((a,b)=>time(b)-time(a));
}
