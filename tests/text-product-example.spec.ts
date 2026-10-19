import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {reloadDraft,seedLegacyMode} from './helpers/workspace';
const image=await sharp({create:{width:864,height:1536,channels:4,background:'#6485a6'}}).png().toBuffer(),hash=createHash('sha256').update(image).digest('hex');
const second=await sharp({create:{width:20,height:20,channels:4,background:'#a26688'}}).png().toBuffer();
async function api(page:Page,{supported=true,lost=false,statusGate=Promise.resolve()}={}){
 const state={posts:0,accepts:0,body:null as any,job:null as any,history:0};const wallet={available:3,reserved:0,kind:'test'};
 await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname,send=(json:unknown)=>r.fulfill({json});
  if(path==='/api/status'){await statusGate;return send({mode:'local-development',commercialReady:false,generation:{enabled:true,model:'fixture',reason:null,textExamples:supported,photoPurposes:true},wallet,budget:{limitMicros:2000000,spentMicros:0,heldMicros:0}});}
  if(path==='/api/generations'&&r.request().method()==='POST'){state.posts++;const b=state.body=r.request().postDataJSON();state.job={id:'text_example_job',projectId:b.projectId,requestId:b.requestId,inputMode:b.request.inputMode,state:'ready',mode:'creative',sourceHash:b.source?.sha256??null,createdAt:'2026-10-18T00:00:00.000Z',model:'fixture',artifactId:hash,composition:'complete-ad',compositionKey:b.request.output.compositionKey,artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+image.toString('base64'),width:864,height:1536,role:'creative'},marketingPlan:b.request.marketingPlan,errorCode:null};return lost?r.abort('failed'):send({job:state.job,wallet});}
  if(path==='/api/generations'){state.history++;return send({jobs:state.job?[state.job]:[]});}
  if(path.endsWith('/accept')){state.accepts++;state.job.state='accepted';return send({job:state.job,wallet});}
  if(path==='/api/generations/text_example_job')return send({job:state.job,wallet});
  return r.fulfill({status:404,json:{error:{code:'UNEXPECTED_TEST_ROUTE'}}});
 });return state;
}
async function form(page:Page){await page.goto('/#create');const f=page.locator('.consumer-create');await f.getByLabel('산업 선택').selectOption('other');await f.getByRole('textbox',{name:'상품명',exact:true}).fill('나의 텀블러');await f.getByRole('textbox',{name:'상세설명',exact:true}).fill('450mL 스테인리스, 아이보리');return f;}


for(const mode of ['original','text-example'] as const)test(`saved ${mode} draft generates from retained photos without hidden mode or pixel identity promise`,async({page})=>{
 const state=await api(page),f=await form(page);
 await f.getByLabel('참조사진 추가').setInputFiles([{name:'front.png',mimeType:'image/png',buffer:image},{name:'style.png',mimeType:'image/png',buffer:second}]);await f.getByLabel('2 사진 용도',{exact:true}).selectOption('style');
 await seedLegacyMode(page,mode);await expect(f.locator('.reference-item')).toHaveCount(2);await expect(f.getByLabel('2 사진 용도',{exact:true})).toHaveValue('style');
 await f.locator('[data-guide="facts"] summary').click();await expect(f.locator('[data-guide="facts"]')).not.toContainText('설명으로 예시 만들기');
 for(const name of ['설명으로 예시 만들기','실사 그대로 사용'])await expect(f.getByRole('button',{name,exact:true})).toHaveCount(0);
 await f.getByRole('button',{name:'광고 생성',exact:true}).click();const review=page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true});await expect(review).toBeEnabled();
 expect(state.body.request.mode).toBe('creative');expect(state.body.request.inputMode).toBeUndefined();expect(state.body.source.sha256).toBe(hash);expect(state.body.references).toHaveLength(1);expect(state.body.request.preserveProduct).toBe(false);
 const preview=await page.locator('.generation-ad-preview').getAttribute('src');await review.check();await page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'이미지 저장 · 공유',exact:true}).click();expect((await readFile((await(await event).path())!)).equals(Buffer.from(preview!.split(',')[1],'base64'))).toBe(true);
 await reloadDraft(page);await expect(page.locator('.accepted-ad canvas')).toBeVisible();expect(state.posts).toBe(1);expect(state.accepts).toBe(1);
});
test('saved text-only draft and service without photos cannot dispatch',async({page})=>{
 const state=await api(page),f=await form(page);await seedLegacyMode(page,'text-example');await f.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(f.getByRole('alert')).toContainText('사진');expect(state.posts).toBe(0);
 await f.getByLabel('산업 선택').selectOption('education');await f.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(f.getByRole('alert')).toContainText('사진');expect(state.posts).toBe(0);
});
test('lost photo response still recovers once after retiring text mode',async({page})=>{
 const state=await api(page,{lost:true}),f=await form(page);await f.getByLabel('참조사진 추가').setInputFiles({name:'front.png',mimeType:'image/png',buffer:image});await expect(f.locator('.reference-item')).toHaveCount(1);await seedLegacyMode(page,'text-example');await f.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();await expect(page.locator('.generation-panel').getByRole('alert')).toHaveCount(0);await page.reload();await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(state.history).toBeGreaterThan(0);expect(state.posts).toBe(1);await expect(page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true})).not.toBeChecked();
});
test('same-tick create clicks enter the saved result once before capability loading completes',async({page})=>{
 let release!:()=>void;const statusGate=new Promise<void>(r=>release=r),state=await api(page,{statusGate}),f=await form(page);await f.getByLabel('참조사진 추가').setInputFiles({name:'front.png',mimeType:'image/png',buffer:image});
 await page.evaluate(()=>{(window as any).creationSaves=0;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value:any,key?:IDBValidKey){if(this.name==='projects'&&value.productName==='나의 텀블러')(window as any).creationSaves++;return key===undefined?put.call(this,value):put.call(this,value,key);};});
 const create=f.getByRole('button',{name:'광고 생성',exact:true,includeHidden:true});await create.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(page.getByRole('heading',{name:'내 광고',exact:true})).toBeVisible();await expect(create).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).creationSaves)).toBe(1);expect(state.posts).toBe(0);release();await expect(page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true})).toBeEnabled();expect(state.posts).toBe(1);
});
