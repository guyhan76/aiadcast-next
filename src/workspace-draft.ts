import {saveProject} from './storage';
import {storageNamespace} from './beta-session';
import type {Project} from './model';
export type WizardDraft={project:Project;step:number};
export type WorkspaceDraft={wizard?:WizardDraft;editor:Project;returnPage:'create'|'studio'|'editor'|'home'};
let connection:Promise<IDBDatabase>|undefined;
function database(){
 if(!connection)connection=new Promise<IDBDatabase>((resolve,reject)=>{
  const r=indexedDB.open('aiadcast-workspace-drafts',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('drafts');
  r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();connection=undefined;};resolve(db);};
  r.onerror=()=>{connection=undefined;reject(r.error);};
 });
 return connection;
}
let writes:Promise<void>=Promise.resolve();
let pendingWrites=0,writeVersion=0,failedWrite=false;
const protectPendingDraft=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
export function saveWorkspace(draft:WorkspaceDraft,scope=storageNamespace()){
 const snapshot=structuredClone(draft),version=++writeVersion;
 if(pendingWrites++===0)window.addEventListener('beforeunload',protectPendingDraft);
 // Enqueue the transaction immediately, rather than waiting in a JS promise
 // chain. IndexedDB serializes readwrite transactions on this store itself.
 // A reload must not discard edits still waiting for an older large-photo write.
 const write=database().then(db=>new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(snapshot,scope);
  tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
 }));
 const settled=write.then(()=>{if(version===writeVersion)failedWrite=false;},error=>{if(version===writeVersion)failedWrite=true;throw error;}).finally(()=>{if(--pendingWrites===0&&!failedWrite)window.removeEventListener('beforeunload',protectPendingDraft);});
 writes=settled;return settled;
}
export async function loadWorkspace(scope=storageNamespace()):Promise<WorkspaceDraft|undefined>{
 await writes.catch(()=>{});const db=await database();return new Promise((resolve,reject)=>{
  const r=db.transaction('drafts').objectStore('drafts').get(scope);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
}
// Only the guest's current work can cross into the newly authenticated account.
// Work belonging to another signed-in account stays in its own namespace.
export async function carryGuestWorkspace(userId:string,assertCurrent=()=>{}){assertCurrent();if(storageNamespace()!=='guest')return;const draft=await loadWorkspace('guest');assertCurrent();
 if(!draft||draft.returnPage==='home')return;
 const previous=await loadWorkspace(userId);assertCurrent();
 if(previous){const project=previous.returnPage==='create'?previous.wizard?.project:(previous.returnPage==='studio'||previous.returnPage==='editor')?previous.editor:undefined;if(project)await saveProject({...project,id:crypto.randomUUID(),name:project.name||project.productName||'이전 작업'},userId);}
 assertCurrent();await saveWorkspace(draft,userId);assertCurrent();}
