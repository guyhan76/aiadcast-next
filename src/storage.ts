import {storageNamespace} from './beta-session';
import type { Project } from './model';
import {parseProfile} from './product';
import {savedBatchMembers,withSavedSlots} from './library-batches.ts';
async function db(scope=storageNamespace()){return new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open(scope==='guest'?'aiadcast-editor':'aiadcast-editor-'+scope,1);req.onupgradeneeded=()=>req.result.createObjectStore('projects',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function saveProject(p:Project,scope=storageNamespace(),signal?:AbortSignal){
 signal?.throwIfAborted();const database=await db(scope);
 try{signal?.throwIfAborted();await new Promise<void>((resolve,reject)=>{
  const tx=database.transaction('projects','readwrite');
  const cancel=()=>{try{tx.abort();}catch{/* An already committed transaction stays in its original owner's store. */}};
  const cleanup=()=>signal?.removeEventListener('abort',cancel);
  tx.oncomplete=()=>{cleanup();resolve();};tx.onerror=()=>{cleanup();reject(tx.error);};tx.onabort=()=>{cleanup();reject(signal?.reason??tx.error??new DOMException('Save cancelled','AbortError'));};
  signal?.addEventListener('abort',cancel,{once:true});
  const store=tx.objectStore('projects');
  if(p.adBatch){
   const previous=store.get(p.id);
   previous.onsuccess=()=>store.put(withSavedSlots(p,previous.result?.adBatch?.id===p.adBatch?.id?previous.result.adBatch.savedSlots??[]:[]));
  }else store.put(p);
 });}finally{database.close();}
}
export async function projects(reconcileBatches=false){
 const database=await db();
 try{return await new Promise<Project[]>((resolve,reject)=>{
  const tx=database.transaction('projects',reconcileBatches?'readwrite':'readonly'),store=tx.objectStore('projects');
  const req=store.getAll();let result:Project[]=[];
  req.onsuccess=()=>{
   try{
    const rows:Project[]=req.result;
    const groups=reconcileBatches?savedBatchMembers(rows):undefined;
    result=rows.map(row=>{
     const project=withSavedSlots(row,groups?.get(row.adBatch?.id??'')??[]);
     if(project!==row)store.put(project);
     return {...project,productProfile:parseProfile(project.productProfile)};
    }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
   }catch(error){tx.abort();reject(error);}
  };
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('READ_PROJECTS_FAILED'));
 });}finally{database.close();}
}

// All collection members exist before any paid request can begin. Repeated
// submissions keep previously stored originals and user decisions intact.
export async function saveProjectSet(items:Project[],scope=storageNamespace(),signal?:AbortSignal):Promise<Project[]>{
 const database=await db(scope);
 try{return await new Promise<Project[]>((resolve,reject)=>{
  const tx=database.transaction('projects','readwrite'),store=tx.objectStore('projects'),saved:Project[]=[];
  function cancel(){try{tx.abort();}catch{}}
  const cleanup=()=>signal?.removeEventListener('abort',cancel);
  tx.oncomplete=()=>{cleanup();resolve(saved);};tx.onerror=()=>{cleanup();reject(tx.error);};tx.onabort=()=>{cleanup();reject(signal?.reason??tx.error??Error('SAVE_RESULT_SET_FAILED'));};
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted){cancel();return;}
  const groups=savedBatchMembers(items);
  const delivered=new Set([...groups].flatMap(([id,slots])=>slots.map(slot=>id+'-'+slot)));
  items.forEach((p,index)=>{const read=store.get(p.id);read.onsuccess=()=>{
   const existing=read.result as Project|undefined;
   // An old input snapshot at the exact output ID must yield to its delivered image.
   if(existing&&!existing.generated&&delivered.has(p.id)){
    store.put(p);saved[index]=p;
   }else{saved[index]=existing??p;if(!existing)store.add(p);}
  };});
  for(const [id,slots] of groups){
   const parent=store.get(id);
   parent.onsuccess=()=>{
    if(!parent.result)return;
    const next=withSavedSlots(parent.result,slots);
    if(next!==parent.result)store.put(next);
   };
  }
 });}finally{database.close();}
}

// A deduplicated edit can be saved by multiple tabs. Never replace an existing
// destination project, including user changes made after another tab saved it.
export async function saveProjectCopy(p:Project,scope=storageNamespace(),signal?:AbortSignal):Promise<boolean>{
 signal?.throwIfAborted();const database=await db(scope);
 try{signal?.throwIfAborted();return await new Promise<boolean>((resolve,reject)=>{
  const tx=database.transaction('projects','readwrite');let inserted=false;
  const cancel=()=>{try{tx.abort();}catch{}};
  const cleanup=()=>signal?.removeEventListener('abort',cancel);
  tx.oncomplete=()=>{cleanup();resolve(inserted);};tx.onerror=()=>{cleanup();reject(tx.error);};tx.onabort=()=>{cleanup();reject(signal?.reason??tx.error??new DOMException('Save cancelled','AbortError'));};
  signal?.addEventListener('abort',cancel,{once:true});
  const store=tx.objectStore('projects'),read=store.get(p.id);
  read.onsuccess=()=>{if(!read.result){store.add(p);inserted=true;}};
 });}finally{database.close();}
}

export async function deleteProjects(ids:string[],scope=storageNamespace()){
 const database=await db(scope);
 try{
  if(scope!==storageNamespace())throw Error('OWNER_CHANGED');
  await new Promise<void>((resolve,reject)=>{
   const tx=database.transaction('projects','readwrite'),store=tx.objectStore('projects');
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('DELETE_CANCELLED'));tx.onerror=()=>reject(tx.error);
   for(const id of new Set(ids))store.delete(id);
  });
 }finally{database.close();}
}
