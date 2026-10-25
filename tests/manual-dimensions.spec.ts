import {test,expect,type Page,type Locator} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
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
async function point(surface:Locator,x:number,y:number,touch=false){const rect=await surface.boundingBox();if(!rect)throw Error('MISSING_SURFACE');if(touch)await surface.tap({position:{x:rect.width*x,y:rect.height*y}});else await surface.click({position:{x:rect.width*x,y:rect.height*y}});}
async function positions(page:Page,language:'ko'|'en',mode:'main'|'inset',touch=false){
 const panel=page.locator('.manual-dimension-panel');await expect(panel).toBeVisible();const surface=panel.getByRole('group',{name:language==='ko'?'끝점 선택 사진':'Photo for selecting endpoints'});
 if(mode==='inset'){await panel.getByRole('button',{name:language==='ko'?'작은 사진의 상품 영역 선택':'Select inset product area'}).click();await point(surface,.2,.2,touch);await point(surface,.85,.7,touch);for(const [label,value] of [[language==='ko'?'왼쪽':'Left','20'],[language==='ko'?'위쪽':'Top','10'],[language==='ko'?'너비':'Width','65'],[language==='ko'?'높이':'Height','75']])await panel.getByRole('spinbutton',{name:label,exact:true}).fill(value);}
 const names=language==='ko'?['가로','세로','높이']:['Width','Depth','Height'];
 for(const [i,points] of [[[.25,.6],[.7,.6]],[[.7,.6],[.8,.35]],[[.25,.6],[.25,.3]]].entries()){
  await panel.getByRole('button',{name:`${names[i]} ${language==='ko'?'시작점':'start'}`,exact:true}).click();await point(surface,points[0][0],points[0][1],touch);await point(surface,points[1][0],points[1][1],touch);
 }
 const offset=panel.getByRole('slider',{name:`${names[2]} ${language==='ko'?'선 간격':'line spacing'}`});await offset.focus();await offset.press('Home');for(let i=0;i<28;i++)await offset.press('ArrowRight');
 // Keyboard movement is an explicit adjustment and does not invoke analysis.
 const handle=panel.getByRole('button',{name:`${names[0]} ${language==='ko'?'시작점 위치 조정':'start adjust position'}`});await handle.focus();await handle.press('ArrowRight');await handle.press('ArrowLeft');
 await panel.getByRole('checkbox').check();const confirm=panel.getByRole('button',{name:language==='ko'?'위치 확인':'Confirm positions',exact:true});await expect(confirm).toBeEnabled();await confirm.click();return panel;
}
async function download(page:Page,language:'ko'|'en'){const promise=page.waitForEvent('download');await page.getByRole('button',{name:language==='ko'?'이미지 저장 · 공유':'Save / share image',exact:true}).click();return readFile((await(await promise).path())!);}
for(const language of ['ko','en'] as const)for(const mode of ['main','inset'] as const)test(`manual ${mode} endpoints gate acceptance and identical reload export (${language})`,async({page},info)=>{
 const {state}=await setup(page,language,mode);const accept=page.getByRole('button',{name:language==='ko'?'사용 확정 · 1개 차감':'Accept · use 1 credit',exact:true});await expect(accept).toBeDisabled();const panel=await positions(page,language,mode,info.project.name==='mobile');
 expect(state.request.output.manualDimensionBase).toBe(true);expect(state.request.output.showDimensions).toBe(false);expect(state.request.output.showDimensionLines).toBe(false);expect(state.request.dimensionDisplay).toBeUndefined();expect(state.analysis).toBe(0);
 await page.getByRole('checkbox',{name:language==='ko'?'상품·재질 구조·규격·가격·문구를 확인했습니다.':'I reviewed the product, material structure, dimensions, price and copy.',exact:true}).check();await expect(accept).toBeEnabled();await accept.click();await expect(page.locator('.accepted-ad')).toBeVisible();
 const reviewed=await page.locator('.accepted-ad canvas').evaluate((c:HTMLCanvasElement)=>c.toDataURL('image/png')),png=await download(page,language);expect(png.equals(Buffer.from(reviewed.split(',')[1],'base64'))).toBe(true);expect(png.equals(bytes)).toBe(false);
 await reloadDraft(page);const restored=await download(page,language);expect(restored.equals(png)).toBe(true);expect(state.posts).toBe(1);expect(state.accepts).toBe(1);expect(state.analysis).toBe(0);
 await expect(panel.locator('details')).not.toHaveAttribute('open','');await panel.screenshot({path:info.outputPath('manual-confirmed-collapsed.png')});await panel.locator('summary').click();for(const width of [320,390,768]){await page.setViewportSize({width,height:900});await page.locator('.manual-dimension-panel').screenshot({path:info.outputPath(`manual-${mode}-${language}-${width}.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await panel.getByRole('button',{name:language==='ko'?'가로 시작점 위치 조정':'Width start adjust position'}).focus();await panel.getByRole('button',{name:language==='ko'?'가로 시작점 위치 조정':'Width start adjust position'}).press('ArrowRight');await expect(page.getByRole('button',{name:language==='ko'?'이미지 저장 · 공유':'Save / share image',exact:true})).toBeDisabled();expect(state.analysis).toBe(0);expect(state.posts).toBe(1);
});
test('unsupported server blocks manual base before generation and leaves the draft',async({page})=>{const {state}=await setup(page,'ko','main',false);await expect(page.getByRole('alert')).toBeVisible();expect(state.posts).toBe(0);expect(state.analysis).toBe(0);});

for(const language of ['ko','en'] as const)test(`lost response to manual export then edited request stays distinct (${language})`,async({page},info)=>{
 const {state}=await setup(page,language,'main',true,true);const ko=language==='ko';
 await positions(page,language,'main',info.project.name==='mobile');expect(state.posts).toBe(1);expect(state.reads).toBeGreaterThan(0);
 await page.getByRole('checkbox',{name:ko?'상품·재질 구조·규격·가격·문구를 확인했습니다.':'I reviewed the product, material structure, dimensions, price and copy.',exact:true}).check();
 await page.getByRole('button',{name:ko?'사용 확정 · 1개 차감':'Accept · use 1 credit',exact:true}).click();const exported=await download(page,language);await reloadDraft(page);expect((await download(page,language)).equals(exported)).toBe(true);
 const originalJob=structuredClone(state.jobs[0]);await page.getByRole('button',{name:ko?'입력 내용 수정':'Edit details',exact:true}).click();const form=page.locator('.consumer-create');await expect(form).toBeVisible();
 await form.getByRole('textbox',{name:ko?'상세설명':'Description',exact:true}).fill('Changed factual material for a distinct request');
 await form.getByRole('button',{name:ko?'광고 생성':'Generate ad',exact:true}).click();await expect.poll(()=>state.posts).toBe(2);await expect(page.locator('.manual-dimension-panel')).toBeVisible();
 expect(state.requests[1].requestId).not.toBe(state.requests[0].requestId);expect(state.requests[1].request.productProfile.material).not.toBe(state.requests[0].request.productProfile.material);
 expect(state.jobs[0]).toEqual(originalJob);expect(state.jobs[0].state).toBe('accepted');expect(state.jobs[1].id).not.toBe(originalJob.id);expect(state.analysis).toBe(0);
 await expect(page.getByRole('button',{name:ko?'사용 확정 · 1개 차감':'Accept · use 1 credit',exact:true})).toBeDisabled();expect(state.accepts).toBe(1);
});
