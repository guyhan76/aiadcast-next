import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
import {manualSnapshot} from '../src/manual-dimensions';
import {reloadDraft} from './helpers/workspace';
const bytes=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000" fill="#f6f0e8"/><text x="60" y="95" font-size="30">MOCK AD · MANUAL POSITIONS · NO AI ANALYSIS</text><path d="M250 600 L700 600 L800 350 L350 350Z" fill="#c8a179"/><path d="M250 600 L700 600 L700 650 L250 650Z" fill="#a27e58"/></svg>')).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
async function setup(page:Page,language:'ko'|'en',mode:'main'|'inset',supported=true,lost=false){
 const owner='manual-dimension-owner';await protectedScreen(page,mockSession(owner));await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
 let p=starterProject('boxes');p.locale=language;p.format='1:1';p.productName='Manual dimension fixture';p.productProfile={...p.productProfile,specType:'rectangular',material:'Source product'};p.dimensions={...p.dimensions,width:'364',depth:'266',height:'30.23',visible:true,displayUnit:'mm'};p.product={name:'reference.png',data:'data:image/png;base64,'+bytes.toString('base64'),width:1000,height:1000,sha256:hash};p=prepareCampaign(p);p.dimensionAnnotation={method:'manual',mode,snapshot:''};
 const state={posts:0,accepts:0,analysis:0,job:null as any,request:null as any,requests:[] as any[],jobs:[] as any[],reads:0};const wallet={available:5,reserved:0,kind:'test'};
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;if(path==='/api/auth/session')return route.fallback();
 if(path==='/api/status')return route.fulfill({json:{generation:{enabled:true,manualDimensionOverlay:supported,photoPurposes:true,aiDimensionDisplay:true},wallet,budget:{limitMicros:5000000,spentMicros:0,heldMicros:0}}});
 if(path==='/api/dimension-analysis'){state.analysis++;return route.fulfill({status:500,json:{error:{code:'FORBIDDEN_TEST_ANALYSIS'}}});}
 if(path==='/api/generations'&&req.method()==='POST'){state.posts++;const body=req.postDataJSON(),r=normalizeGenerationRequest(body.request);state.request=r;state.requests.push(body);state.job={id:'manual-dimension-fixture-'+state.posts,projectId:body.projectId,requestIds:[body.requestId],state:'ready',mode:'creative',sourceHash:hash,createdAt:'2026-10-25T00:00:00.000Z',model:'fixture',artifactId:hash,composition:'complete-ad',compositionKey:r.output.compositionKey,artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+bytes.toString('base64'),width:1000,height:1000,role:'creative'},marketingPlan:r.marketingPlan};state.jobs.push(state.job);if(lost&&state.posts===1)return route.abort('failed');return route.fulfill({json:{job:state.job,wallet}});}
 if(path.endsWith('/accept')){state.accepts++;state.job.state='accepted';return route.fulfill({json:{job:state.job,wallet}});}
 if(path==='/api/generations'){state.reads++;return route.fulfill({json:{jobs:state.jobs}});}
 if(path.startsWith('/api/generations/')){state.reads++;return route.fulfill({json:{job:state.jobs.find(j=>j.id===path.split('/').at(-1)),wallet}});}
 return route.fulfill({json:{}});});
 await restoreOwnedWorkspace(page,p,owner);const options=page.locator('.new-ad-options');if(!await options.evaluate(e=>(e as HTMLDetailsElement).open))await options.locator(':scope > summary').click();await page.locator('.generate-button').click();return {state,p,owner};
}
async function storedDraft(page:Page,owner:string){return page.evaluate(owner=>new Promise<any>((resolve,reject)=>{const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('drafts').objectStore('drafts').get(owner);q.onsuccess=()=>{db.close();resolve(q.result.editor);};q.onerror=()=>reject(q.error);};}),owner);}
async function restoreConfirmedAnnotation(page:Page,owner:string,mode:'main'|'inset'){
 await expect.poll(async()=>!!(await storedDraft(page,owner))?.generated).toBe(true);
 const project=await storedDraft(page,owner);
 project.dimensionAnnotation.manual={version:1,snapshot:manualSnapshot(project),clearBase:true,confirmed:true,axes:{width:{start:[.25,.6],end:[.7,.6],offset:.06},depth:{start:[.7,.6],end:[.8,.35],offset:.06},height:{start:[.25,.6],end:[.25,.3],offset:-.06}},...(mode==='inset'?{crop:[.2,.2,.65,.5],inset:[.2,.1,.65,.75]}:{})};
 await restoreOwnedWorkspace(page,project,owner);return project;
}
async function download(page:Page,language:'ko'|'en'){const promise=page.waitForEvent('download');await page.getByRole('button',{name:language==='ko'?'이미지 저장 · 공유':'Save / share image',exact:true}).click();return readFile((await(await promise).path())!);}
for(const language of ['ko','en'] as const)for(const mode of ['main','inset'] as const)test(`saved confirmed ${mode} annotations survive editor removal and reload (${language})`,async({page},info)=>{
 const {state,owner}=await setup(page,language,mode);const ko=language==='ko';
 await expect(page.locator('.generation-ad-preview')).toBeVisible();await expect.poll(()=>state.posts).toBe(1);
 await expect(page.locator('.manual-dimension-panel')).toHaveCount(0);
 expect(state.request.output.manualDimensionBase).toBe(true);expect(state.request.output.showDimensions).toBe(false);expect(state.request.output.showDimensionLines).toBe(false);expect(state.request.dimensionDisplay).toBeUndefined();
 await expect(page.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();
 await page.getByRole('button',{name:ko?'사용 확정':'Accept',exact:true}).click();
 await expect(page.locator('.accepted-ad')).toBeVisible();
 const saved=await restoreConfirmedAnnotation(page,owner,mode);
 const png=await download(page,language);const canvas=await page.locator('.accepted-ad canvas').evaluate((c:HTMLCanvasElement)=>c.toDataURL('image/png'));expect(png.equals(Buffer.from(canvas.split(',')[1],'base64'))).toBe(true);expect(png.equals(bytes)).toBe(false);
 await reloadDraft(page);expect((await download(page,language)).equals(png)).toBe(true);
 await expect(page.locator('.manual-dimension-panel')).toHaveCount(0);await expect(page.getByRole('slider')).toHaveCount(0);
 const preserved=await page.evaluate(owner=>new Promise<any>(resolve=>{const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('drafts').objectStore('drafts').get(owner);q.onsuccess=()=>{db.close();resolve(q.result.editor);};};}),owner);
 expect(preserved.dimensionAnnotation).toEqual(saved.dimensionAnnotation);expect(preserved.dimensions).toEqual(saved.dimensions);expect(preserved.generated.asset).toEqual(saved.generated.asset);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await page.locator('.accepted-ad').screenshot({path:info.outputPath(`saved-${mode}-${language}-${width}.png`)});}
 expect(state.posts).toBe(1);expect(state.accepts).toBe(1);expect(state.analysis).toBe(0);
});
test('unsupported server blocks manual base before generation and leaves the draft',async({page})=>{const {state}=await setup(page,'ko','main',false);await expect(page.getByRole('alert')).toBeVisible();expect(state.posts).toBe(0);expect(state.analysis).toBe(0);});

for(const language of ['ko','en'] as const)test(`lost response to manual export then edited request stays distinct (${language})`,async({page},info)=>{
 const {state}=await setup(page,language,'main',true,true);const ko=language==='ko';
 await expect(page.locator('.generation-ad-preview')).toBeVisible();await expect(page.locator('.manual-dimension-panel')).toHaveCount(0);expect(state.posts).toBe(1);expect(state.reads).toBeGreaterThan(0);
 await expect(page.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();
 await page.getByRole('button',{name:ko?'사용 확정':'Accept',exact:true}).click();const save=page.getByRole('button',{name:ko?'치수선 없이 저장 · 공유':'Save / share without dimension lines',exact:true});const capture=async()=>{const event=page.waitForEvent('download');await save.click();return readFile((await(await event).path())!);};const exported=await capture();await reloadDraft(page);expect((await capture()).equals(exported)).toBe(true);
 const originalJob=structuredClone(state.jobs[0]);await page.getByRole('button',{name:ko?'입력 내용 수정':'Edit details',exact:true}).click();const form=page.locator('.consumer-create');await expect(form).toBeVisible();
 await form.getByRole('textbox',{name:ko?'상세설명':'Description',exact:true}).fill('Changed factual material for a distinct request');
 await form.getByRole('button',{name:ko?'광고 생성':'Generate ad',exact:true}).click();await expect.poll(()=>state.posts).toBe(2);await expect(page.locator('.manual-dimension-panel')).toHaveCount(0);
 expect(state.requests[1].requestId).not.toBe(state.requests[0].requestId);expect(state.requests[1].request.productProfile.material).not.toBe(state.requests[0].request.productProfile.material);
 expect(state.jobs[0]).toEqual(originalJob);expect(state.jobs[0].state).toBe('accepted');expect(state.jobs[1].id).not.toBe(originalJob.id);expect(state.analysis).toBe(0);
 await expect(page.getByRole('button',{name:ko?'사용 확정':'Accept',exact:true})).toBeDisabled();expect(state.accepts).toBe(1);
});

for(const language of ['ko','en'] as const)for(const mode of ['main','inset'] as const)test(`optional dimensions allow explicit original export without endpoints (${language}, ${mode})`,async({page},info)=>{
 const {state}=await setup(page,language,mode);const ko=language==='ko';const panel=page.locator('.manual-dimension-panel');await expect(panel).toHaveCount(0);
 await expect(page.getByRole('slider')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();
 await page.getByRole('button',{name:ko?'사용 확정':'Accept',exact:true}).click();await expect(page.locator('.accepted-ad')).toBeVisible();
 const save=page.getByRole('button',{name:ko?'치수선 없이 저장 · 공유':'Save / share without dimension lines',exact:true});await expect(save).toBeEnabled();
 const capture=async()=>{const event=page.waitForEvent('download');await save.click();const file=await event;expect(file.suggestedFilename()).toContain('without-dimension-lines');return readFile((await file.path())!);};
 const png=await capture();const expected=await page.locator('.accepted-ad canvas').evaluate(async(c:HTMLCanvasElement,source)=>{const original=new Image();original.src=source;await original.decode();const output=document.createElement('canvas');output.width=c.width;output.height=c.height;output.getContext('2d')!.drawImage(original,0,0,c.width,c.height);return output.toDataURL('image/png');},'data:image/png;base64,'+bytes.toString('base64'));expect(png.equals(Buffer.from(expected.split(',')[1],'base64'))).toBe(true);
 await reloadDraft(page);expect((await capture()).equals(png)).toBe(true);expect(state.posts).toBe(1);expect(state.accepts).toBe(1);expect(state.analysis).toBe(0);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await page.locator('.accepted-ad').screenshot({path:info.outputPath(`optional-${language}-${mode}-${width}.png`)});}
});

