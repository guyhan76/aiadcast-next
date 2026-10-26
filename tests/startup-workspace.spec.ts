import {test,expect} from '@playwright/test';
import {mockSession,protectedScreen} from './helpers/authenticated-session';
for(const language of ['ko','en'])test(`stalled local draft stops loading without overwriting data (${language})`,async({page},info)=>{
 await protectedScreen(page,mockSession('workspace-startup-owner'));
 await page.addInitScript(language=>{localStorage.setItem('aiadcast.ui-language',language);const w=window as any;w.draftHold=true;w.draftPuts=0;w.draftReads=0;w.draftRelease=[];const get=IDBObjectStore.prototype.get,put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.get=function(key){if(this.name==='drafts'&&w.draftHold){w.draftReads++;const r:any={result:undefined,onsuccess:null,onerror:null};w.draftRelease.push(()=>r.onsuccess?.());return r;}return get.call(this,key);};
 IDBObjectStore.prototype.put=function(...args:any[]){if(this.name==='drafts')w.draftPuts++;return (put as any).apply(this,args);};
 },language);
 await page.clock.install({time:Date.now()});await page.goto('/');await expect.poll(()=>page.evaluate(()=>(window as any).draftReads)).toBe(1);await page.clock.fastForward(16000);
 const retry=page.getByRole('button',{name:language==='ko'?'저장된 작업 다시 읽기':'Reload saved work',exact:true});await expect(retry).toBeEnabled();await page.screenshot({path:info.outputPath('workspace-retry.png')});expect(await page.evaluate(()=>(window as any).draftPuts)).toBe(0);
 await page.evaluate(()=>{const w=window as any;w.draftHold=false;w.draftRelease.forEach((f:any)=>f());});await expect(page.locator('.home-page')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).draftPuts)).toBe(0);
 await retry.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(page.locator('.home-page')).toBeVisible();
});
