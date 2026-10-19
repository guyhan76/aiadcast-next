import {expect,type Page,type Dialog} from '@playwright/test';

// Attempt reload immediately. If IndexedDB is still committing a large draft,
// verify the real user-facing unload protection, stay, and retry once saved.
export async function reloadDraft(page:Page){
 let protectedReload=false;let stayed!:()=>void;const stayedOnPage=new Promise<void>(resolve=>{stayed=resolve;});
 const stay=async(dialog:Dialog)=>{expect(dialog.type()).toBe('beforeunload');protectedReload=true;await dialog.dismiss();stayed();};
 page.on('dialog',stay);
 try{await Promise.race([page.reload().catch(error=>{if(!protectedReload)throw error;}),stayedOnPage]);}
 finally{page.off('dialog',stay);}
 if(protectedReload){
  await expect(page.locator('.workspace-save-state')).toHaveText('입력 내용이 기기에 저장되었습니다.');
  await page.reload();
 }
}

// Emulate a persisted pre-retirement draft, not a new UI affordance.
export async function seedLegacyDimensionDraft(page:Page,planar=false){
 await expect(page.locator('.workspace-save-state')).toHaveText('입력 내용이 기기에 저장되었습니다.');
 await page.evaluate(async planar=>{await new Promise<void>((resolve,reject)=>{
  const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{
   const db=r.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),get=store.get('guest');
   get.onsuccess=()=>{const value=get.result,p=value.wizard.project;p.generation={...p.generation,dimensionBased:true,dimensionBasis:'outer-body',dimensionVariant:'legacy',...(planar?{planarSourceHash:p.product.sha256}:{})};store.put(value,'guest');};
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  };
 });},planar);
 await page.reload();
}

export async function seedLegacyMode(page:Page,mode:'original'|'text-example',editor=false){
 await expect(page.locator('.workspace-save-state')).toHaveText('입력 내용이 기기에 저장되었습니다.');
 await page.evaluate(async ({mode,editor})=>{await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),get=store.get('guest');get.onsuccess=()=>{const v=get.result,p=editor?v.editor:v.wizard.project;p.generation={...p.generation,mode:mode==='original'?'original':'creative',...(mode==='text-example'?{inputMode:'text-example',photoMode:'original'}:{})};store.put(v,'guest');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});},{mode,editor});await page.reload();
}
