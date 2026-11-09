import {selectConsumerIndustry} from './helpers/industry';
import {reloadDraft} from './helpers/workspace';
import {authenticatedSession,mockSession} from './helpers/authenticated-session';
import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
const first=await sharp({create:{width:340,height:250,channels:4,background:'#bc8552'}}).png().toBuffer();
const second=await sharp({create:{width:250,height:210,channels:4,background:'#bd8653'}}).png().toBuffer();
const ad=await sharp({create:{width:864,height:1536,channels:4,background:'#f2e6db'}}).png().toBuffer();
const hash=createHash('sha256').update(ad).digest('hex');
async function mocks(page:Page,{auth=false,enabled=true,admin=false,v2=false,uncertain=false}: {auth?:boolean;enabled?:boolean;admin?:boolean;v2?:boolean;uncertain?:boolean}={}){
 const adminWallet={available:0,reserved:0,kind:'test',unlimited:true};
 const state={bodies:[] as any[],posts:0,accepts:0,recommendationRequests:0,body:null as any,job:null as any,jobs:[] as any[]};
 await page.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
 if(path.includes('/recommendations'))state.recommendationRequests++;
 const send=(body:any,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(path==='/api/account/capabilities')return send({email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}});
 if(path==='/api/status')return auth?send({error:{code:'AUTH_REQUIRED'}},401):send({mode:'local-development',commercialReady:false,generation:{...(v2?{creditQuote:{unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'}}:{}),enabled,aiDimensionDisplay:true,photoPurposes:true,model:'gpt-image-2.5-sunburst',reason:enabled?null:'BUDGET_NOT_AVAILABLE'},wallet:v2?{available:0,reserved:0,credits:{available:state.posts?20:30,reserved:0},kind:'test'}:admin?adminWallet:{available:3,reserved:0,kind:'test'},budget:{limitMicros:1000000,spentMicros:0,heldMicros:0}});
 if(path==='/api/generations'&&request.method()==='POST'){state.posts++;state.body=request.postDataJSON();const body=state.body;state.bodies.push(body);
 state.job={...(v2?{creditUnit:'credit-v2',creditPolicy:'delivered-2026-10-18',creditCaptured:true,creditCost:10}:{}),...(admin?{creditPolicy:'admin-unlimited',creditCost:0}:{}),id:`consumer_fixture_${state.posts}`,projectId:body.projectId,requestIds:[body.requestId],state:'ready',mode:body.request.mode,sourceHash:body.source?.sha256??null,createdAt:'2026-10-13T00:00:00.000Z',model:'verification.fixture',artifactId:hash,dimensionDisplay:normalizeGenerationRequest(body.request).dimensionDisplay,...(body.request.mode==='creative'?{composition:'complete-ad',compositionKey:body.request.output.compositionKey}:{}),artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+ad.toString('base64'),width:864,height:1536,role:body.request.mode==='original'?'background':'creative'},marketingPlan:body.request.marketingPlan,errorCode:null};if(uncertain){state.job.state='uncertain';state.job.artifact=null;state.job.errorCode='PROVIDER_UNCERTAIN';}state.jobs.push(state.job);return send({job:state.job,wallet:v2?{available:0,reserved:0,credits:{available:20,reserved:0},kind:'test'}:admin?adminWallet:{available:2,reserved:1,kind:'test'}});}
 if(path.endsWith('/accept')){state.accepts++;state.job.state='accepted';state.job.dimensionReview=request.postDataJSON().dimensionReview;return send({job:state.job,wallet:v2?{available:0,reserved:0,credits:{available:20,reserved:0},kind:'test'}:admin?adminWallet:{available:2,reserved:0,kind:'test'}});}
 if(/^\/api\/generations\/consumer_fixture_\d+$/.test(path))return send({job:state.jobs.find(j=>path.endsWith('/'+j.id)),wallet:v2?{available:0,reserved:0,credits:{available:20,reserved:0},kind:'test'}:admin?adminWallet:{available:2,reserved:1,kind:'test'}});
 if(path==='/api/generations')return send({jobs:state.jobs.filter(j=>j.projectId===new URL(request.url()).searchParams.get('projectId'))});
 return send({error:{code:'TEST_ROUTE_UNAVAILABLE'}},404);
 });await authenticatedSession(page,mockSession(admin?'admin-budget-test':'consumer-user-123',admin?'admin':'member'),{seed:!auth});return state;
}
async function details(page:Page,service=true){await page.goto('/#create');const form=page.locator('.consumer-create');await selectConsumerIndustry(form,service?'lodging':'boxes');await form.getByLabel(service?'서비스명':'상품명',{exact:true}).fill(service?'숲속 숙소':'우체국3호박스');await form.getByRole('textbox',{name:'상세설명',exact:true}).fill(service?'숲 전망의 객실, 1박 120,000원':'B골, 크라프트재질, 튼튼하고 습기에 강하다. 빠른배송. 10개 19,800원');return form;}


test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));});

for(const language of ['ko','en'] as const)test(`search categories in ${language} directly without changing saved inputs or submitting`,async({page},info)=>{
 const state=await mocks(page,{admin:true}),ko=language==='ko';
 await page.addInitScript(lang=>localStorage.setItem('aiadcast.ui-language',lang),language);
 await page.goto('/#create');
 const form=page.locator('.consumer-create'),section=form.locator('[data-order="1"]'),search=section.getByRole('combobox');
 await expect(section.locator('select')).toHaveCount(0);
 await section.screenshot({path:info.outputPath('category-browse.png')});
 await expect(section.getByRole('button',{name:ko?'상품':'Products',exact:true})).toHaveAttribute('aria-pressed','true');
 await section.getByRole('button',{name:ko?'서비스':'Services',exact:true}).click();
 await expect(section.getByRole('button',{name:ko?'미용·생활·돌봄':'Beauty & daily care',exact:true})).toBeVisible();
 await section.getByRole('button',{name:ko?'미용·생활·돌봄':'Beauty & daily care',exact:true}).click();
 await expect(section.getByRole('option').filter({hasText:ko?'미용실':'Hair'})).toBeVisible();
 await selectConsumerIndustry(form,'boxes');
 await form.getByLabel(ko?'상품명':'Product name',{exact:true}).fill('KEEP ORIGINAL');
 await form.getByRole('textbox',{name:ko?'상세설명':'Description',exact:true}).fill('Original facts and price 19,800');
 await form.getByLabel(ko?'참조사진 추가':'Add reference photos').setInputFiles({name:'original.png',mimeType:'image/png',buffer:first});
 await search.fill(ko?'운동화':'sneakers');
 await expect(section.locator('.industry-selected')).toContainText(ko?'박스':'Boxes');
 await expect(section.getByRole('option')).toHaveCount(1);
 await expect(section.getByRole('option')).toContainText(ko?'신발':'Shoes');
 await section.screenshot({path:info.outputPath('category-search.png')});
 await search.press('Enter');expect(state.posts).toBe(0);await expect(page).toHaveURL(/#create$/);
 await section.getByRole('option').click();await expect(search).toHaveValue('');
 await search.fill('no-such-category-xyz');await expect(section.locator('.industry-selected')).toContainText(ko?'신발':'Shoes');
 await expect(section.getByRole('status')).toContainText(ko?'검색 결과가 없습니다':'No matches');
 await search.press('Escape');
 await reloadDraft(page);await expect(section.locator('.industry-selected')).toContainText(ko?'신발':'Shoes');
 await expect(form.getByLabel(ko?'상품명':'Product name',{exact:true})).toHaveValue('KEEP ORIGINAL');
 await expect(form.getByRole('textbox',{name:ko?'상세설명':'Description',exact:true})).toHaveValue('Original facts and price 19,800');
 await expect(form.locator('.reference-item')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(state.posts).toBe(0);
});

test('search crosses product/service tabs, keyboard and Korean composition cannot accidentally submit',async({page})=>{
 const state=await mocks(page,{admin:true});await page.goto('/#create');
 const section=page.locator('.consumer-create [data-order="1"]'),search=section.getByRole('combobox');
 await search.fill('카페');await expect(section.getByRole('option')).toHaveCount(1);
 await search.press('ArrowDown');
 await search.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,keyCode:229});
 await expect(section.locator('.industry-selected')).toHaveCount(0);
 await search.press('Enter');await expect(section.locator('.industry-selected')).toContainText('카페·디저트');
 await expect(section.getByRole('button',{name:'서비스',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(state.posts).toBe(0);
});

for(const kind of ['product','service'] as const)test(`custom ${kind} category survives reload and reaches the generation request`,async({page})=>{
 const state=await mocks(page,{admin:true});await page.goto('/#create');
 const form=page.locator('.consumer-create'),section=form.locator('[data-order="1"]'),name='맞춤형 분야 85';
 await section.getByRole('combobox').fill(name);
 await section.getByRole('button',{name:kind==='product'?'상품으로 선택':'서비스로 선택',exact:true}).click();
 await form.getByLabel(kind==='product'?'상품명':'서비스명',{exact:true}).fill('내 브랜드');
 await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('사용자가 제공한 설명과 가격 12,000원');
 if(kind==='product')await form.getByLabel('참조사진 추가').setInputFiles({name:'original.png',mimeType:'image/png',buffer:first});
 await reloadDraft(page);await expect(section.locator('.industry-selected')).toContainText(name);
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect.poll(()=>state.posts).toBe(1);
 expect(state.body.request.productProfile.industryName).toBe(name);
 expect(state.body.request.subjectType).toBe(kind==='product'?'physical-product':'service');
 expect(normalizeGenerationRequest(state.body.request).creativeDirection.additionalInstructions).toContain(name);
});

test('section 9 spacing is clear on a tablet as well as phone widths',async({page},info)=>{
 await mocks(page);await page.setViewportSize({width:info.project.name==='mobile'?390:768,height:1000});await page.goto('/#create');
 const section=page.locator('.consumer-create [data-order="9"]');
 const number=await section.locator('h2>span').boundingBox(),title=await section.locator('h2>strong').boundingBox(),heading=await section.locator('h2').boundingBox(),buttons=await section.locator('.image-count-options').boundingBox();
 expect(title!.x-(number!.x+number!.width)).toBeGreaterThanOrEqual(18);
 expect(buttons!.y-(heading!.y+heading!.height)).toBeGreaterThanOrEqual(20);
 await section.screenshot({path:info.outputPath('section-9-spacing.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const count of [1,2,4,6,8,10])test(`section 9 dispatches exactly ${count} distinct images and displays every result`,async({page},info)=>{
 test.setTimeout(90000);
 const state=await mocks(page,{admin:true}),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles({name:'product.png',mimeType:'image/png',buffer:first});
 const section=form.locator('[data-order="9"]');
 await expect(section.getByRole('heading')).toHaveText('9생성 장수');
 await section.getByRole('button',{name:String(count),exact:true}).click();
 await expect(section.getByRole('button',{name:String(count),exact:true})).toHaveAttribute('aria-pressed','true');
 if(count===10)await section.screenshot({path:info.outputPath('section-9.png')});
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect.poll(()=>state.posts,{timeout:60000}).toBe(count);
 await expect(page.locator('.generation-ad-preview')).toBeVisible();
 if(count>1){
  await expect(page.locator('.result-picker button')).toHaveCount(count);
  await expect(page.locator('.result-picker img')).toHaveCount(count);
  await expect(page.locator('.result-picker button').last()).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'남은 이미지 생성 멈추기'})).toHaveCount(0);
 }
 expect(new Set(state.bodies.map(body=>body.projectId)).size).toBe(count);
 expect(new Set(state.bodies.map(body=>body.requestId)).size).toBe(count);
 for(const body of state.bodies){expect(body.request.productProfile.category).toBe('boxes');expect(body.source.sha256).toBe(createHash('sha256').update(first).digest('hex'));}
 expect(state.accepts).toBe(0);
 // A ready, unaccepted preview deliberately warns before leaving. Exercise the
 // real browser confirmation so reload recovery is tested rather than blocked.
 page.once('dialog',async dialog=>{expect(dialog.type()).toBe('beforeunload');await dialog.accept();});
 await page.reload();await expect(page.locator('.generation-ad-preview')).toBeVisible();
 expect(state.posts).toBe(count);expect(state.accepts).toBe(0);
});

test('multi-image choice obeys a budget block without dispatching any image',async({page})=>{
 const state=await mocks(page,{admin:true,enabled:false}),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles({name:'product.png',mimeType:'image/png',buffer:first});
 await form.locator('[data-order="9"]').getByRole('button',{name:'10',exact:true}).click();
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect(page.getByText('생성 예산이 부족합니다. 관리자에게 확인해주세요. 추가 결제로 해결되지 않습니다.')).toBeVisible();
 expect(state.posts).toBe(0);expect(state.accepts).toBe(0);
});

test('multi-image choice still requires explicit new-credit charge confirmation',async({page})=>{
 const state=await mocks(page,{v2:true}),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles({name:'product.png',mimeType:'image/png',buffer:first});
 await form.locator('[data-order="9"]').getByRole('button',{name:'2',exact:true}).click();
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const consent=page.getByRole('checkbox',{name:'이번 생성 10크레딧 차감을 확인했습니다.'});
 await expect(consent).toBeVisible();expect(state.posts).toBe(0);
 await consent.check();await page.getByRole('button',{name:'광고 생성 · 10크레딧',exact:true}).click();
 await expect.poll(()=>state.posts).toBe(1);
 await expect(page.locator('.result-picker img')).toHaveCount(1);
 await expect(consent).not.toBeChecked();expect(state.posts).toBe(1);
 await consent.check();await page.getByRole('button',{name:'광고 생성 · 10크레딧',exact:true}).click();
 await expect(page.locator('.result-picker img')).toHaveCount(2);expect(state.posts).toBe(2);expect(state.accepts).toBe(0);
});

