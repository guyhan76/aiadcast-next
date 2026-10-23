import {expect,type Page} from '@playwright/test';
import type {Project} from '../../src/model';

// Restore a pre-existing draft in the authenticated owner's namespace. This is
// not a guest migration and never changes server identity or bypasses the gate.
export async function restoreOwnedWorkspace(page:Page,project:Project,owner:string,route='studio',pending?:{jobId:string;requestId:string;key:string}){
 await page.goto('/#home');await expect(page.locator('.app-header')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')??'null')?.user.id)).toBe(owner);
 await page.evaluate(async({project,owner,route})=>new Promise<void>((resolve,reject)=>{
  const request=indexedDB.open('aiadcast-workspace-drafts',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({editor:project,returnPage:route},owner);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
 }),{project,owner,route});
 if(pending)await page.evaluate(({owner,id,pending})=>localStorage.setItem(owner+':aiadcast.pending-generation.'+id,JSON.stringify({projectId:id,...pending})),{owner,id:project.id,pending});
 await page.evaluate(route=>history.replaceState(null,'','/#'+route),route);await page.reload();
}
