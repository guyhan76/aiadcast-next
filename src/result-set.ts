import type {Project} from './model.ts';

export const imageCounts = [1,2,4,6,8,10] as const;
export type ResultSet = {id:string;projectIds:string[]};
export function parseResultSet(value:unknown,projectId:string):ResultSet|undefined {
 if(value===undefined)return;
 const r=value as ResultSet;
 if(!r||typeof r.id!=='string'||!r.id||r.id.length>100||!Array.isArray(r.projectIds)||!imageCounts.includes(r.projectIds.length as typeof imageCounts[number])||r.projectIds.some(id=>typeof id!=='string'||!id||id.length>100)||new Set(r.projectIds).size!==r.projectIds.length||!r.projectIds.includes(projectId))throw Error('INVALID_RESULT_SET');
 return {id:r.id,projectIds:[...r.projectIds]};
}
export async function createResultSet(source:Project,count:number):Promise<Project[]> {
 if(!imageCounts.includes(count as typeof imageCounts[number]))throw Error('INVALID_IMAGE_COUNT');
 if(count===1)return [{...source,requestedImageCount:1,resultSet:undefined}];
 const {updatedAt:_updated,resultSet:_set,generated:_generated,...input}=source;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({input,count})));
 const id='batch-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const projectIds=Array.from({length:count},(_,index)=>`${id}-${index+1}`);
 return projectIds.map((projectId,index)=>({...structuredClone(source),id:projectId,name:`${source.name.slice(0,74)} · ${index+1}`,requestedImageCount:count,resultSet:{id,projectIds:[...projectIds]},generated:undefined}));
}
// Stable project identity, never display position, determines the editable source.
export function orderedResults(current:Project,stored:Project[]):Project[] {
 const group=parseResultSet(current.resultSet,current.id);if(!group)return [current];
 const values=new Map(stored.filter(p=>p.resultSet?.id===group.id&&JSON.stringify(p.resultSet.projectIds)===JSON.stringify(group.projectIds)).map(p=>[p.id,p]));
 values.set(current.id,current);
 return group.projectIds.map(id=>values.get(id)).filter((p):p is Project=>!!p);
}
