import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {newProject} from '../src/model';
import {generatedCompatibilityKey} from '../src/generated';
import {completeAdKey} from '../src/complete-ad';
const bytes=await sharp({create:{width:480,height:640,channels:4,background:'#145c92'}}).png().toBuffer();
const hash=createHash('sha256').update(bytes).digest('hex'),data='data:image/png;base64,'+bytes.toString('base64');
type Case='local'|'accepted'|'missing'|'wrong-list'|'wrong-detail'|'denied'|'broken-local'|'older-id'|'hash-mismatch'|'missing-artifact';
async function setup(page:Page,kind:Case){
 const p=newProject();p.name='저장한 모니터';p.productName='49-inch ultrawide';p.presentation='campaign';p.generation.mode='creative';p.dimensions.visible=false;p.dimensions.lines=false;
 p.product={name:'reference.png',data,width:480,height:640,sha256:hash};
 if(['local','broken-local','older-id'].includes(kind))p.generated={jobId:'completed-job-001',mode:'creative',sourceHash:hash,asset:{...p.product,...(kind==='local'?{}:{data:''})},role:'creative',model:'mock',createdAt:'2026-10-20T00:00:00Z',specificationKey:generatedCompatibilityKey(p),composition:'complete-ad',compositionKey:completeAdKey(p)};
 // Historical images must survive a changed copy/key without becoming current.
 p.copy[p.locale].title='변경된 현재 입력';
 const job={id:'completed-job-001',projectId:p.id,state:'accepted',composition:'complete-ad',mode:'creative',sourceHash:hash,createdAt:'2026-10-20T00:00:00Z',artifactId:hash,artifact:{id:hash,sha256:hash,dataUrl:data,width:480,height:640,role:'creative'}};
 let writes=0,details=0;
 await page.route('**/api/**',async route=>{
  const r=route.request(),url=new URL(r.url());if(r.method()!=='GET'){writes++;await route.fulfill({status:500,json:{error:{code:'TEST_FORBIDS_WRITES'}}});return;}
  if(url.pathname==='/api/generations'){expect(url.searchParams.get('projectId')).toBe(p.id);await route.fulfill({json:{jobs:['missing','older-id','local'].includes(kind)?[]:[{...job,artifact:null,...(kind==='wrong-list'?{projectId:'another-project'}:{})}]}});return;}
  if(url.pathname==='/api/generations/completed-job-001'){
   details++;if(kind==='denied'){await route.fulfill({status:403,json:{error:{code:'FORBIDDEN'}}});return;}
   await route.fulfill({json:{job:{...job,...(kind==='wrong-detail'?{projectId:'another-project'}:{}),...(kind==='missing-artifact'?{artifact:null}:{}),...(kind==='hash-mismatch'?{artifact:{...job.artifact,sha256:'0'.repeat(64)}}:{})}}});return;
  }
  await route.fulfill({json:{generation:{enabled:false},wallet:{available:10,reserved:0},budget:{limitMicros:100000},email:{enabled:false}}});
 });
 await page.goto('/#projects');
 await page.evaluate(async p=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('aiadcast-editor',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>{const tx=r.result.transaction('projects','readwrite');tx.objectStore('projects').put(p);tx.oncomplete=()=>{r.result.close();resolve();};tx.onerror=()=>reject(tx.error);};}),p);
 await page.reload();await page.getByRole('button',{name:/저장한 모니터/}).click();
 return {p,writes:()=>writes,details:()=>details};
}
const region=(page:Page)=>page.getByRole('region',{name:'과거 완료 결과',exact:true});
async function assertDownload(page:Page){const event=page.waitForEvent('download');await region(page).getByRole('button',{name:'과거 원본 저장 · 공유',exact:true}).click();expect(await readFile((await(await event).path())!)).toEqual(bytes);}
for(const kind of ['local','accepted','broken-local','older-id'] as const)test(`${kind}: reopen/download original without generation or changing project`,async({page})=>{
 const state=await setup(page,kind);await expect(region(page).getByRole('img')).toHaveAttribute('src',data);await assertDownload(page);
 await expect(page.getByRole('heading',{name:'새 광고 생성',exact:true})).toBeVisible();await expect(page.locator('.accepted-ad')).toHaveCount(0);
 if(kind==='local')expect(state.details()).toBe(0);else expect(state.details()).toBeGreaterThan(0);
 const saved=await page.evaluate(async id=>new Promise<any>(resolve=>{const r=indexedDB.open('aiadcast-editor',1);r.onsuccess=()=>{const q=r.result.transaction('projects').objectStore('projects').get(id);q.onsuccess=()=>{resolve(q.result);r.result.close();};};}),state.p.id);
 expect(saved).toEqual(state.p);expect(state.writes()).toBe(0);
 await page.reload();await expect(region(page).getByRole('img')).toHaveAttribute('src',data);expect(state.writes()).toBe(0);
});
for(const kind of ['missing','wrong-list','wrong-detail','denied','hash-mismatch','missing-artifact'] as const)test(`${kind}: fail closed and retry without generation`,async({page})=>{
 const state=await setup(page,kind);await expect(region(page).getByRole('button',{name:'과거 결과 다시 확인'})).toBeEnabled();await expect(region(page).getByRole('img')).toHaveCount(0);
 await expect(region(page)).toContainText(kind==='denied'?'로그인 계정을 확인':'새로 생성하지 않았습니다');
 await region(page).getByRole('button',{name:'과거 결과 다시 확인'}).click();await expect(region(page).getByRole('button',{name:'과거 결과 다시 확인'})).toBeEnabled();await expect(region(page).getByRole('img')).toHaveCount(0);
 if(kind==='wrong-list')expect(state.details()).toBe(0);expect(state.writes()).toBe(0);
});
