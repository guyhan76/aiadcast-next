import {storageNamespace} from './beta-session';
import type { Project } from './model';
import {parseProfile} from './product';
async function db(scope=storageNamespace()){return new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open(scope==='guest'?'aiadcast-editor':'aiadcast-editor-'+scope,1);req.onupgradeneeded=()=>req.result.createObjectStore('projects',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function saveProject(p:Project,scope=storageNamespace(),signal?:AbortSignal){
 signal?.throwIfAborted();const database=await db(scope);
 try{signal?.throwIfAborted();await new Promise<void>((resolve,reject)=>{
  const tx=database.transaction('projects','readwrite');
  const cancel=()=>{try{tx.abort();}catch{/* An already committed transaction stays in its original owner's store. */}};
  const cleanup=()=>signal?.removeEventListener('abort',cancel);
  tx.oncomplete=()=>{cleanup();resolve();};tx.onerror=()=>{cleanup();reject(tx.error);};tx.onabort=()=>{cleanup();reject(signal?.reason??tx.error??new DOMException('Save cancelled','AbortError'));};
  signal?.addEventListener('abort',cancel,{once:true});tx.objectStore('projects').put(p);
 });}finally{database.close();}
}
export async function projects(){const database=await db();try{return await new Promise<Project[]>((resolve,reject)=>{const req=database.transaction('projects').objectStore('projects').getAll();req.onsuccess=()=>{try{resolve((req.result as Project[]).map(p=>({...p,productProfile:parseProfile(p.productProfile)})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));}catch(error){reject(error);}};req.onerror=()=>reject(req.error);});}finally{database.close();}}
