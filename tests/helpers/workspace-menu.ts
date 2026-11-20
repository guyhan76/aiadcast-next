import {expect,type Page} from '@playwright/test';
export async function openWorkspaceMenu(page:Page){const button=page.getByRole('button',{name:/^(메뉴 열기|Open menu)$/});if(await button.getAttribute('aria-expanded')!=='true')await button.click();}
export async function waitForSavedDraft(page:Page,name?:string){
 await expect.poll(()=>page.evaluate(name=>new Promise<boolean>((resolve,reject)=>{const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('drafts')){db.close();resolve(false);return;}const request=db.transaction('drafts').objectStore('drafts').getAll();request.onsuccess=()=>{resolve(request.result.some(d=>d.wizard&&(!name||d.wizard.project.productName===name)));db.close();};request.onerror=()=>{db.close();reject(request.error);};};}),name)).toBe(true);
}
