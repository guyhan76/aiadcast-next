import {test,expect,type Page} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('protected-text-product-example'));});
import sharp from 'sharp';import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {starterProject,prepareCampaign} from '../src/consumer-campaign';
import {buildGenerationRequest} from '../src/generation';
import {generatedCompatibilityKey} from '../src/generated';
import {restoreOwnedWorkspace} from './helpers/owned-workspace';
import {reloadDraft} from './helpers/workspace';
const image=await sharp({create:{width:864,height:1536,channels:4,background:'#6485a6'}}).png().toBuffer(),hash=createHash('sha256').update(image).digest('hex');
const second=await sharp({create:{width:20,height:20,channels:4,background:'#a26688'}}).png().toBuffer();
async function api(page:Page,{supported=true,lost=false,statusGate=Promise.resolve()}={}){
 const state={posts:0,accepts:0,body:null as any,job:null as any,history:0};const wallet={available:3,reserved:0,kind:'test'};
 await page.route('**/api/**',async r=>{if(new URL(r.request().url()).pathname==='/api/auth/session')return r.fallback();const path=new URL(r.request().url()).pathname,send=(json:unknown)=>r.fulfill({json});
  if(path==='/api/status'){await statusGate;return send({mode:'local-development',commercialReady:false,generation:{enabled:true,model:'fixture',reason:null,textExamples:supported,photoPurposes:true},wallet,budget:{limitMicros:2000000,spentMicros:0,heldMicros:0}});}
  if(path==='/api/generations'&&r.request().method()==='POST'){state.posts++;const b=state.body=r.request().postDataJSON();state.job={id:'text_example_job',projectId:b.projectId,requestId:b.requestId,inputMode:b.request.inputMode,state:'ready',mode:'creative',sourceHash:b.source?.sha256??null,createdAt:'2026-10-18T00:00:00.000Z',model:'fixture',artifactId:hash,composition:'complete-ad',compositionKey:b.request.output.compositionKey,artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+image.toString('base64'),width:864,height:1536,role:'creative'},marketingPlan:b.request.marketingPlan,errorCode:null};return lost?r.abort('failed'):send({job:state.job,wallet});}
  if(path==='/api/generations'){state.history++;return send({jobs:state.job?[state.job]:[]});}
  if(path.endsWith('/accept')){state.accepts++;state.job.state='accepted';return send({job:state.job,wallet});}
  if(path==='/api/generations/text_example_job')return send({job:state.job,wallet});
  return r.fulfill({status:404,json:{error:{code:'UNEXPECTED_TEST_ROUTE'}}});
 });return state;
}
async function form(page:Page){await page.goto('/#create');const f=page.locator('.consumer-create');await f.getByLabel('산업 선택').selectOption('other');await f.getByRole('textbox',{name:'상품명',exact:true}).fill('나의 텀블러');await f.getByRole('textbox',{name:'상세설명',exact:true}).fill('450mL 스테인리스, 아이보리');return f;}

async function historical(page:Page,{photos=true}={}){
 const state=await api(page);let draft=starterProject('other');draft.productName='나의 텀블러';draft.productProfile.material='450mL 스테인리스, 아이보리';
 draft.product=photos?{name:'source.png',data:'data:image/png;base64,'+image.toString('base64'),width:864,height:1536,sha256:hash}:null;
 draft.references=photos?[{name:'side.png',data:'data:image/png;base64,'+second.toString('base64'),width:20,height:20,sha256:createHash('sha256').update(second).digest('hex')}]:[];
 draft=prepareCampaign(draft);draft.generation={...draft.generation,inputMode:'text-example',mode:'creative'};
 const request=buildGenerationRequest(draft);state.job={id:'text_example_job',projectId:draft.id,requestIds:['historical-text-request'],inputMode:'text-example',state:'ready',mode:'creative',sourceHash:null,createdAt:'2026-10-18T00:00:00.000Z',model:'fixture',artifactId:hash,composition:'complete-ad',compositionKey:request.output.compositionKey,artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+image.toString('base64'),width:864,height:1536,role:'creative'},marketingPlan:request.marketingPlan,errorCode:null};
 await restoreOwnedWorkspace(page,draft,'protected-text-product-example','studio',{jobId:state.job.id,requestId:'historical-text-request',key:generatedCompatibilityKey(draft)});await page.locator('.new-ad-options>summary').click();return {state,draft,request};
}
test('historical text-only result recovers without dispatch, preserves stored photos and exports reviewed labeled pixels',async({page},info)=>{
 const {state,request}=await historical(page);expect(request.inputMode).toBe('text-example');expect(request.source).toBeNull();expect(request.references).toEqual([]);expect(JSON.stringify(request)).not.toContain(hash);
 const review=page.getByRole('button',{name:/^(사용 확정|Accept)$/});await expect(review).toBeEnabled();expect(state.posts).toBe(0);
 const preview=await page.locator('.generation-ad-preview').getAttribute('src');await expect(page.getByText('AI 예시 · 실제 상품 재현 아님. 저장 이미지에도 예시 표시가 포함됩니다.',{exact:true})).toBeVisible();await expect(review).toBeEnabled();await page.getByRole('button',{name:'사용 확정',exact:true}).click();
 for(let i=0;i<2;i++){const event=page.waitForEvent('download');await page.getByRole('button',{name:'이미지 저장 · 공유',exact:true}).click();const bytes=await readFile((await(await event).path())!);expect(bytes.equals(Buffer.from(preview!.split(',')[1],'base64'))).toBe(true);const meta=await sharp(bytes).metadata();const band=await sharp(bytes).extract({left:0,top:meta.height!-40,width:meta.width!,height:40}).stats();expect(band.channels[0].min).toBeLessThan(60);}
 expect(state.accepts).toBe(1);expect(state.posts).toBe(0);page.once('dialog',d=>d.accept());await page.reload();await expect(page.locator('.accepted-ad canvas')).toBeVisible();await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();const f=page.locator('.consumer-create');await expect(f.locator('.reference-item')).toHaveCount(2);await expect(f.getByRole('textbox',{name:'상세설명',exact:true})).toHaveValue('450mL 스테인리스, 아이보리');await expect(f.getByRole('button',{name:'설명으로 예시 만들기',exact:true})).toHaveCount(0);expect(state.posts).toBe(0);
});
test('missing photo is rejected even on an old server before any generation or acceptance charge',async({page})=>{
 const state=await api(page,{supported:false}),f=await form(page);await expect(f.getByRole('button',{name:'설명으로 예시 만들기',exact:true})).toHaveCount(0);await f.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(f.getByRole('alert')).toContainText('사진');await expect(page).toHaveURL(/#create$/);expect(state.posts).toBe(0);expect(state.accepts).toBe(0);expect(state.job).toBeNull();
});
test('historical pending text result reconciles after reload without new generation or implicit acceptance',async({page})=>{
 const {state}=await historical(page,{photos:false});await expect(page.locator('.generation-ad-preview')).toBeVisible();page.once('dialog',d=>d.accept());await page.reload();await page.locator('.new-ad-options>summary').click();await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(state.history).toBeGreaterThan(0);expect(state.posts).toBe(0);expect(state.accepts).toBe(0);await expect(page.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();
});
test('missing-photo rejection preserves dimensions and original input across reload even when photo annotation is requested',async({page})=>{
 const state=await api(page),f=await form(page);await f.getByRole('button',{name:'규격 넣기',exact:true}).click();await f.getByLabel('규격 단위').selectOption('mm');for(const[a,v]of[['가로','80'],['세로','80'],['높이','180']])await f.getByLabel(a+' mm',{exact:true}).fill(v);
 await f.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(f.getByRole('alert')).toContainText('사진');expect(state.posts).toBe(0);expect(state.accepts).toBe(0);await reloadDraft(page);for(const[a,v]of[['가로','80'],['세로','80'],['높이','180']])await expect(f.getByLabel(a+' mm',{exact:true})).toHaveValue(v);await expect(f.getByLabel('광고에 규격 표시',{exact:true})).toBeChecked();await expect(f.getByRole('button',{name:'설명으로 예시 만들기',exact:true})).toHaveCount(0);await f.getByLabel('본제품에 직접 표시',{exact:true}).check();await f.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(f.getByRole('alert')).toContainText('사진');await expect(page).toHaveURL(/#create$/);expect(state.posts).toBe(0);expect(state.accepts).toBe(0);await reloadDraft(page);await expect(f.getByLabel('본제품에 직접 표시',{exact:true})).toBeChecked();
});

test('same-tick create clicks enter the saved result once before capability loading completes',async({page})=>{
 let release!:()=>void;const statusGate=new Promise<void>(r=>release=r),state=await api(page,{statusGate}),f=await form(page);await f.getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:image});
 await page.evaluate(()=>{(window as any).creationSaves=0;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value:any,key?:IDBValidKey){if(this.name==='projects'&&value.productName==='나의 텀블러')(window as any).creationSaves++;return key===undefined?put.call(this,value):put.call(this,value,key);};});
 const create=f.getByRole('button',{name:'광고 생성',exact:true,includeHidden:true});await create.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(page.getByRole('heading',{name:'내 광고',exact:true})).toBeVisible();await expect(create).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).creationSaves)).toBe(1);expect(state.posts).toBe(0);release();await expect(page.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();expect(state.posts).toBe(1);
});

