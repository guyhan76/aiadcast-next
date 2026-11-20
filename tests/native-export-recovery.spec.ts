import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const bridge=await readFile('native/android-download-bridge.js','utf8');
async function setup(page:any){
 let posts=0;
 page.on('request',(r:any)=>{if(r.method()==='POST')posts++;});
 await page.route('**/export-harness', (r:any)=>r.fulfill({contentType:'text/html',body:'<!doctype html><button>Export fixture</button>'}));
 await page.goto('/export-harness');
 await page.evaluate(()=>{(window as any).messages=[];(window as any).AiadcastNative={postMessage(s:string){(window as any).messages.push(JSON.parse(s));}};});
 await page.addScriptTag({content:bridge});
 const owner=async(value:string)=>page.evaluate((value:string)=>window.dispatchEvent(new CustomEvent('aiadcast-export-context',{detail:{owner:value}})),value);
 const click=async(twice=false)=>page.evaluate((twice:boolean)=>{const a=document.createElement('a');a.download='ad.png';a.href=URL.createObjectURL(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}));a.click();if(twice)a.click();},twice);
 const exports=()=>page.evaluate(()=>(window as any).messages.filter((m:any)=>m.type==='export'));
 return {owner,click,exports,posts:()=>posts};
}
test('one export is owner-bound, duplicate clicks and stale callbacks cannot create another',async({page})=>{
 const s=await setup(page);await s.owner('owner-a');await s.click(true);await expect.poll(async()=>(await s.exports()).length).toBe(1);
 const first=(await s.exports())[0];expect(first.owner).toBe('owner-a');expect(first.requestId).toMatch(/^[a-f0-9-]{36}$/);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-export',{detail:{status:'saved',requestId:'different-job'}})));await s.click();expect(await s.exports()).toHaveLength(1);
 await page.evaluate(id=>window.dispatchEvent(new CustomEvent('aiadcast-native-export',{detail:{status:'cancelled',requestId:id}})),first.requestId);await s.click();await expect.poll(async()=>(await s.exports()).length).toBe(2);
 expect((await s.exports())[1].requestId).not.toBe(first.requestId);expect(s.posts()).toBe(0);
});
test('switching accounts during blob preparation drops the old payload and never generates',async({page})=>{
 const s=await setup(page);await s.owner('owner-a');await page.evaluate(()=>{const read=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(blob){this.addEventListener('loadend',()=>{(window as any).blobPrepared=true;});read.call(this,blob);};const original=window.fetch;window.fetch=(...args)=>new Promise(resolve=>{(window as any).releaseExport=()=>original(...args).then(resolve);});});await s.click();await s.owner('owner-b');await page.evaluate(()=>(window as any).releaseExport());
 await expect.poll(()=>page.evaluate(()=>(window as any).messages.filter((m:any)=>m.type==='export-context').length)).toBe(2);await expect.poll(()=>page.evaluate(()=>(window as any).blobPrepared)).toBe(true);expect(await s.exports()).toHaveLength(0);expect(s.posts()).toBe(0);
});
test('recovered native request stays busy until completion and logout isolates later clicks',async({page})=>{
 const s=await setup(page);await s.owner('owner-a');await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-export',{detail:{status:'requested',requestId:'restored-job'}})));await s.click();expect(await s.exports()).toHaveLength(0);
 await s.owner('guest');await s.click();await expect.poll(async()=>(await s.exports()).length).toBe(1);expect((await s.exports())[0].owner).toBe('guest');expect(s.posts()).toBe(0);
});
test('unready owner and non-local downloads fail closed without remote fetch or exports',async({page})=>{
 const s=await setup(page);await s.click();expect(await s.exports()).toHaveLength(0);await s.owner('owner-a');
 await page.evaluate(()=>{const a=document.createElement('a');a.href='https://external.invalid/private.png';a.download='bad.png';a.click();});expect(await s.exports()).toHaveLength(0);expect(s.posts()).toBe(0);
});
