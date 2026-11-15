import {expect,type Page} from '@playwright/test';
import type {Project} from '../../src/model';
import type {WizardDraft} from '../../src/workspace-draft';

// Restore a pre-existing draft in the authenticated owner's namespace. This is
// not a guest migration and never changes server identity or bypasses the gate.
export async function restoreOwnedWorkspace(page:Page,project:Project,owner:string,route='studio',pending?:{jobId?:string;requestId:string;key:string},wizard?:WizardDraft,scope=owner){
 await page.goto('/#home');await expect(page.locator('.app-header')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')??'null')?.user.id)).toBe(owner);
 await page.evaluate(async({project,scope,route,wizard})=>new Promise<void>((resolve,reject)=>{
  const request=indexedDB.open('aiadcast-workspace-drafts',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({editor:project,returnPage:route,wizard},scope);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
 }),{project,scope,route,wizard});
 if(pending)await page.evaluate(({scope,id,pending})=>localStorage.setItem(scope+':aiadcast.pending-generation.'+id,JSON.stringify({projectId:id,...pending})),{scope,id:project.id,pending});
 await page.evaluate(route=>history.replaceState(null,'','/#'+route),route);await page.reload();
}
