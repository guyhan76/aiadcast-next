import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {buildGenerationRequest} from '../src/generation';
import {generatedCompatibilityKey} from '../src/generated';
import {protectedScreen,mockSession,authenticatedSession} from './helpers/authenticated-session';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
const bytes=await sharp({create:{width:864,height:1536,channels:3,background:'#6485a6'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
const owner='export-owner-a',other='export-owner-b';
async function setup(page:Page){
 await protectedScreen(page,mockSession(owner));let posts=0;page.on('request',r=>{if(r.method()==='POST')posts++;});
 let p=starterProject('other');p.productName='Private owner A ad';p.productProfile.material='Fixture cream';p.product={name:'original.png',data:'data:image/png;base64,'+bytes.toString('base64'),sha256:hash,width:864,height:1536};p=prepareCampaign(p);const req=buildGenerationRequest(p);p.generated={jobId:'export-boundary',mode:'creative',sourceHash:hash,asset:structuredClone(p.product!),role:'creative',model:'mock',createdAt:'2026-10-26T00:00:00Z',acceptedAt:'2026-10-26T00:01:00Z',specificationKey:generatedCompatibilityKey(p),composition:'complete-ad',compositionKey:req.output.compositionKey};
 await restoreOwnedWorkspace(page,p,owner);await expect(page.locator('.accepted-ad > .primary-action')).toBeEnabled();
 await page.evaluate(()=>{(window as any).exportMessages=[];(window as any).AiadcastNative={postMessage(raw:string){(window as any).exportMessages.push(JSON.parse(raw));}};});
 await page.addScriptTag({content:await readFile('native/android-download-bridge.js','utf8')});
 return {p,posts:()=>posts,exports:()=>page.evaluate(()=>(window as any).exportMessages.filter((m:any)=>m.type==='export'))};
}
async function account(page:Page,id:string){const session=mockSession(id,'member',id===owner?'a':'b');await authenticatedSession(page,session,{seed:false});await page.evaluate(s=>{sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s));window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'home'}}));},session);await expect.poll(()=>page.evaluate(()=>(window as any).exportMessages.filter((m:any)=>m.type==='export-context').at(-1)?.owner)).toBe(id);}
async function saved(page:Page,scope:string,id:string){return page.evaluate(({scope,id})=>new Promise<any>((resolve,reject)=>{const open=indexedDB.open(scope==='guest'?'aiadcast-editor':'aiadcast-editor-'+scope,1);open.onupgradeneeded=()=>open.result.createObjectStore('projects',{keyPath:'id'});open.onsuccess=()=>{const db=open.result,q=db.transaction('projects').objectStore('projects').get(id);q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};}),{scope,id});}
for(const phase of ['render','png','storage-open'] as const)for(const transition of ['account','logout','account-return','screen-return'] as const)test(`pending ${phase} export is cancelled by ${transition} without cross-owner records or revival`,async({page})=>{
 const s=await setup(page);
 await page.evaluate(phase=>{
  if(phase==='render'){const original=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){HTMLImageElement.prototype.decode=original;return original.call(this).then(()=>new Promise<void>(resolve=>{(window as any).releaseOldExport=resolve;}));};}
  else if(phase==='storage-open'){const original=IDBFactory.prototype.open;IDBFactory.prototype.open=function(...args){const request=original.apply(this,args);if(args[0]==='aiadcast-editor-export-owner-a'){IDBFactory.prototype.open=original;request.addEventListener('success',event=>{event.stopImmediatePropagation();(window as any).releaseOldExport=()=>request.dispatchEvent(new Event('success'));},{once:true});}return request;};}
  else{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...rest){HTMLCanvasElement.prototype.toBlob=original;original.call(this,blob=>{(window as any).releaseOldExport=()=>callback(blob);},...rest);};}
 },phase);
 // Two synchronous DOM clicks must still prepare only one export.
 await page.locator('.accepted-ad > .primary-action').evaluate((button:HTMLButtonElement)=>{button.click();button.click();});await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseOldExport)).toBe('function');
 if(transition==='screen-return'){
  await page.locator('a[href="#projects"]:visible').first().click();await expect(page.locator('.projects-page')).toBeVisible();await page.getByRole('navigation',{name:'Screen history'}).getByRole('button',{name:'Back',exact:true}).click();await expect(page.locator('.accepted-ad > .primary-action')).toBeEnabled();
 }else if(transition==='logout'){
  await page.evaluate(()=>{sessionStorage.removeItem('aiadcast.beta-session');window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'login'}}));});await expect(page.locator('.accepted-ad')).toHaveCount(0);
 }else {await account(page,other);await expect(page.locator('.accepted-ad')).toHaveCount(0);if(transition==='account-return')await account(page,owner);}
 await page.evaluate(()=>(window as any).releaseOldExport());await page.waitForTimeout(500);
 expect(await s.exports()).toHaveLength(0);expect(await saved(page,other,s.p.id)).toBeUndefined();expect(await saved(page,'guest',s.p.id)).toBeUndefined();expect(await saved(page,owner,s.p.id)).toBeUndefined();expect(s.posts()).toBe(0);
 // Returning to the owner allows a fresh explicit save; the cancelled operation cannot revive.
 if(transition==='account'||transition==='logout')await account(page,owner);
 await restoreOwnedWorkspace(page,s.p,owner);await expect(page.locator('.accepted-ad > .primary-action')).toBeEnabled();
 // restoreOwnedWorkspace reloads the page: install the native mock again.
 await page.evaluate(()=>{(window as any).exportMessages=[];(window as any).AiadcastNative={postMessage(raw:string){(window as any).exportMessages.push(JSON.parse(raw));}};});await page.addScriptTag({content:await readFile('native/android-download-bridge.js','utf8')});
 await page.locator('.accepted-ad > .primary-action').click();await expect.poll(async()=>(await s.exports()).length).toBe(1);expect((await s.exports())[0].owner).toBe(owner);expect((await saved(page,owner,s.p.id)).productName).toBe(s.p.productName);expect(s.posts()).toBe(0);
});
test('native blob preparation cancels on screen exit and permits a new save on return',async({page})=>{
 const s=await setup(page);await page.evaluate(()=>{const original=window.fetch;window.fetch=(...args)=>{if(String(args[0]).startsWith('blob:')){window.fetch=original;return new Promise(resolve=>{(window as any).releaseNativeBlob=()=>original(...args).then(resolve);});}return original(...args);};});
 await page.locator('.accepted-ad > .primary-action').click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseNativeBlob)).toBe('function');
 await page.locator('a[href="#projects"]:visible').first().click();await expect(page.locator('.projects-page')).toBeVisible();await page.evaluate(()=>(window as any).releaseNativeBlob());await page.waitForTimeout(500);expect(await s.exports()).toHaveLength(0);
 await page.getByRole('navigation',{name:'Screen history'}).getByRole('button',{name:'Back',exact:true}).click();await expect(page.locator('.accepted-ad > .primary-action')).toBeEnabled();await page.locator('.accepted-ad > .primary-action').click();await expect.poll(async()=>(await s.exports()).length).toBe(1);expect((await s.exports())[0].owner).toBe(owner);expect(s.posts()).toBe(0);
});
test('account switch during IndexedDB write aborts replacement and preserves the prior owner record',async({page})=>{
 const s=await setup(page),previous={...s.p,productName:'Previously saved version'};
 await page.evaluate(({owner,previous})=>new Promise<void>((resolve,reject)=>{const open=indexedDB.open('aiadcast-editor-'+owner,1);open.onupgradeneeded=()=>open.result.createObjectStore('projects',{keyPath:'id'});open.onsuccess=()=>{const db=open.result,tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(previous);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),{owner,previous});
 const session=mockSession(other,'member','b');await authenticatedSession(page,session,{seed:false});
 await page.evaluate(({session,owner})=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(this.name==='projects'&&this.transaction.db.name==='aiadcast-editor-'+owner){IDBObjectStore.prototype.put=put;sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(session));window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'home'}}));(window as any).switchedDuringPut=true;}return request;};},{session,owner});
 await page.locator('.accepted-ad > .primary-action').click();await expect.poll(()=>page.evaluate(()=>(window as any).switchedDuringPut)).toBe(true);await expect(page.locator('.accepted-ad')).toHaveCount(0);
 expect((await saved(page,owner,s.p.id)).productName).toBe(previous.productName);expect(await saved(page,other,s.p.id)).toBeUndefined();expect(await s.exports()).toHaveLength(0);expect(s.posts()).toBe(0);
});
