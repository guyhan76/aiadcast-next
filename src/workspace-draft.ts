import {saveProject} from './storage';
import {storageNamespace} from './beta-session';
import type {Project} from './model';
export type WizardDraft={project:Project;step:number};
export type WorkspaceDraft={wizard?:WizardDraft;editor:Project;returnPage:'create'|'studio'|'home'};
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
let writes:Promise<void>=Promise.resolve();
export function saveWorkspace(draft:WorkspaceDraft,scope=storageNamespace()){
 // Serialize writes so a slow older snapshot cannot overwrite a newer one.
 const snapshot=structuredClone(draft);
 const write=writes.catch(()=>{}).then(async()=>{const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(snapshot,scope);tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}});
 writes=write;return write;
}
export async function loadWorkspace(scope=storageNamespace()):Promise<WorkspaceDraft|undefined>{
 await writes.catch(()=>{});const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get(scope);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}
}
// Only the guest's current work can cross into the newly authenticated account.
// Work belonging to another signed-in account stays in its own namespace.
export async function carryGuestWorkspace(userId:string){if(storageNamespace()!=='guest')return;const draft=await loadWorkspace('guest');
 if(!draft||draft.returnPage==='home')return;
 const previous=await loadWorkspace(userId);
 if(previous){const project=previous.returnPage==='create'?previous.wizard?.project:previous.returnPage==='studio'?previous.editor:undefined;if(project)await saveProject({...project,id:crypto.randomUUID(),name:project.name||project.productName||'이전 작업'},userId);}
 await saveWorkspace(draft,userId);}
