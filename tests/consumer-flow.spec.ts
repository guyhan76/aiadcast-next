import {waitForSavedDraft} from './helpers/workspace-menu';
// Korean UI scenarios explicitly select Korean; English cases override this choice.
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));});
import {authenticatedSession,mockSession} from './helpers/authenticated-session';
import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {reloadDraft} from './helpers/workspace';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
const first=await sharp({create:{width:340,height:250,channels:4,background:'#bc8552'}}).png().toBuffer();
const second=await sharp({create:{width:250,height:210,channels:4,background:'#bd8653'}}).png().toBuffer();
const ad=await sharp({create:{width:864,height:1536,channels:4,background:'#f2e6db'}}).png().toBuffer();
const hash=createHash('sha256').update(ad).digest('hex');
async function mocks(page:Page,{auth=false,enabled=true,admin=false,v2=false,uncertain=false}: {auth?:boolean;enabled?:boolean;admin?:boolean;v2?:boolean;uncertain?:boolean}={}){
 const adminWallet={available:0,reserved:0,kind:'test',unlimited:true};
 const state={posts:0,accepts:0,recommendationRequests:0,body:null as any,job:null as any,jobs:[] as any[]};
 await page.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
 if(path.includes('/recommendations'))state.recommendationRequests++;
 const send=(body:any,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(path==='/api/account/capabilities')return send({email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}});
 if(path==='/api/status')return auth?send({error:{code:'AUTH_REQUIRED'}},401):send({mode:'local-development',commercialReady:false,generation:{...(v2?{creditQuote:{unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'}}:{}),enabled,aiDimensionDisplay:true,photoPurposes:true,model:'gpt-image-2.5-sunburst',reason:enabled?null:'BUDGET_NOT_AVAILABLE'},wallet:v2?{available:0,reserved:0,credits:{available:state.posts?20:30,reserved:0},kind:'test'}:admin?adminWallet:{available:3,reserved:0,kind:'test'},budget:{limitMicros:1000000,spentMicros:0,heldMicros:0}});
 if(path==='/api/generations'&&request.method()==='POST'){state.posts++;state.body=request.postDataJSON();const body=state.body;
 state.job={...(v2?{creditUnit:'credit-v2',creditPolicy:'delivered-2026-10-18',creditCaptured:true,creditCost:10}:{}),...(admin?{creditPolicy:'admin-unlimited',creditCost:0}:{}),id:`consumer_fixture_${state.posts}`,projectId:body.projectId,requestIds:[body.requestId],state:'ready',mode:body.request.mode,sourceHash:body.source?.sha256??null,createdAt:'2026-10-13T00:00:00.000Z',model:'verification.fixture',artifactId:hash,dimensionDisplay:normalizeGenerationRequest(body.request).dimensionDisplay,...(body.request.mode==='creative'?{composition:'complete-ad',compositionKey:body.request.output.compositionKey}:{}),artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+ad.toString('base64'),width:864,height:1536,role:body.request.mode==='original'?'background':'creative'},marketingPlan:body.request.marketingPlan,errorCode:null};if(uncertain){state.job.state='uncertain';state.job.artifact=null;state.job.errorCode='PROVIDER_UNCERTAIN';}state.jobs.push(state.job);return send({job:state.job,wallet:v2?{available:0,reserved:0,credits:{available:20,reserved:0},kind:'test'}:admin?adminWallet:{available:2,reserved:1,kind:'test'}});}
 if(path.endsWith('/accept')){state.accepts++;state.job.state='accepted';state.job.dimensionReview=request.postDataJSON().dimensionReview;return send({job:state.job,wallet:v2?{available:0,reserved:0,credits:{available:20,reserved:0},kind:'test'}:admin?adminWallet:{available:2,reserved:0,kind:'test'}});}
 if(/^\/api\/generations\/consumer_fixture_\d+$/.test(path))return send({job:state.jobs.find(j=>path.endsWith('/'+j.id)),wallet:v2?{available:0,reserved:0,credits:{available:20,reserved:0},kind:'test'}:admin?adminWallet:{available:2,reserved:1,kind:'test'}});
 if(path==='/api/generations')return send({jobs:state.jobs.filter(j=>j.projectId===new URL(request.url()).searchParams.get('projectId'))});
 return send({error:{code:'TEST_ROUTE_UNAVAILABLE'}},404);
 });await authenticatedSession(page,mockSession(admin?'admin-budget-test':'consumer-user-123',admin?'admin':'member'),{seed:!auth});return state;
}
async function details(page:Page,service=true){await page.goto('/#create');const form=page.locator('.consumer-create');await form.getByLabel('산업 선택').selectOption(service?'lodging':'boxes');await form.getByLabel(service?'서비스명':'상품명',{exact:true}).fill(service?'숲속 숙소':'우체국3호박스');await form.getByRole('textbox',{name:'상세설명',exact:true}).fill(service?'숲 전망의 객실, 1박 120,000원':'B골, 크라프트재질, 튼튼하고 습기에 강하다. 빠른배송. 10개 19,800원');return form;}

test('eight inputs submit actual generation request once and a complete accepted PNG can be saved',async({page})=>{
 const state=await mocks(page),form=await details(page,false);
 await form.locator('[data-order="2"] summary').click();await form.getByLabel('회사명',{exact:true}).fill('테스트 업체');await form.getByLabel('연락처',{exact:true}).fill('010-0000-0000');await form.getByRole('textbox',{name:'이메일 주소',exact:true}).fill('example@example.com');
 await form.getByLabel('참조사진 추가').setInputFiles([{name:'front.png',mimeType:'image/png',buffer:first},{name:'side.png',mimeType:'image/png',buffer:second}]);
 await expect(form.locator('.reference-item')).toHaveCount(2);
 await form.getByRole('button',{name:'규격 넣기',exact:true}).click();await form.getByLabel('규격 단위').selectOption('mm');
 for(const [axis,value] of [['가로','340'],['세로','250'],['높이','210']])await form.getByLabel(axis+' mm',{exact:true}).fill(value);await form.getByRole('radio',{name:'본제품에 직접 표시',exact:true}).check();
 await form.getByRole('button',{name:'직접 입력',exact:true}).click();await form.getByRole('textbox',{name:'광고 제목',exact:true}).fill('보내는 마음까지, 든든하게.');await form.getByRole('textbox',{name:'광고 설명',exact:true}).fill('10개 19,800원 · 빠른배송');
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const result=page.locator('.simple-ad-result');await expect(result.getByText('결과를 확인해주세요',{exact:true})).toBeVisible();await expect(result.locator('.generation-ad-preview')).toBeVisible();
 await expect(result.locator('.marketing-analysis,.ai-recommendation')).toHaveCount(0);expect(state.recommendationRequests).toBe(0);
 expect(state.posts).toBe(1);expect(state.body.references).toHaveLength(1);expect(state.body.request.copy.title).toBe('보내는 마음까지, 든든하게.');expect(state.body.request.creativeDirection.copyMode).toBe('manual');expect(state.body.request.output.format).toBe('9:16');expect(state.body.request.output.showDimensions).toBe(true);expect(state.body.request.specifications.map((s:any)=>s.value)).toEqual(['340','250','210']);
 await expect(result.locator('.automatic-proportion')).toHaveCount(0);await expect(result.locator('.editor-details')).toHaveCount(0);
 await expect(result.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();await result.getByRole('button',{name:'사용 확정',exact:true}).click();
 await expect(result.locator('.marketing-summary,.ai-recommendation')).toHaveCount(0);expect(state.recommendationRequests).toBe(0);
 const save=result.getByRole('button',{name:'이미지 저장 · 공유',exact:true});await expect(save).toBeEnabled();const pending=page.waitForEvent('download');await save.click();expect((await pending).suggestedFilename()).toBe('aiadcast-9x16.png');expect(state.accepts).toBe(1);expect(state.posts).toBe(1);
 await result.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await expect(form.getByRole('textbox',{name:'광고 제목',exact:true})).toHaveValue('보내는 마음까지, 든든하게.');
});
test('photo-free service submission rejects without generation or charge, then preserves a photo-backed dimension-free brief',async({page})=>{
 const state=await mocks(page),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(form.getByRole('alert')).toContainText('사진');await expect(page).toHaveURL(/#create$/);expect(state.posts).toBe(0);expect(state.accepts).toBe(0);expect(state.job).toBeNull();
 await form.getByLabel('참조사진 추가').setInputFiles({name:'space.png',mimeType:'image/png',buffer:first});await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(state.posts).toBe(1);expect(state.body.source.sha256).toBe(createHash('sha256').update(first).digest('hex'));expect(state.body.request.specifications).toEqual([]);expect(state.body.request.output.showDimensions).toBe(false);expect(state.body.request.creativeDirection.copyMode).toBe('ai');
});
test('unauthenticated creation requires Google sign-in and never dispatches generation',async({page})=>{
 const state=await mocks(page,{auth:true});await page.goto('/#create');await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeVisible();await expect(page.locator('.consumer-create')).toHaveCount(0);expect(state.posts).toBe(0);
 await expect(page.getByRole('textbox')).toHaveCount(0);await page.reload();await expect(page.locator('.consumer-create')).toHaveCount(0);expect(state.posts).toBe(0);
});
test('budget blockage gives a clear reason and never dispatches a provider request',async({page})=>{
 const state=await mocks(page,{enabled:false}),form=await details(page);await form.getByLabel('참조사진 추가').setInputFiles({name:'space.png',mimeType:'image/png',buffer:first});await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText('생성 예산이 부족합니다. 관리자에게 확인해주세요. 추가 결제로 해결되지 않습니다.')).toBeVisible();expect(state.posts).toBe(0);
});

test('photo purpose survives draft reload and travels with the correct uploaded image',async({page},info)=>{
 const state=await mocks(page),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles([{name:'actual.png',mimeType:'image/png',buffer:first},{name:'design.png',mimeType:'image/png',buffer:second}]);
 await expect(form.locator('.reference-item')).toHaveCount(2);
 await form.getByLabel('2 사진 용도',{exact:true}).selectOption('style');
 await reloadDraft(page);await expect(form.getByLabel('2 사진 용도',{exact:true})).toHaveValue('style');
 await expect(form.getByLabel('1 사진 용도',{exact:true})).toHaveValue('subject');
 await form.locator('[data-order="3"]').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('photo-options.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();
 expect(state.body.request.source.purpose).toBe('subject');expect(state.body.request.references[0].purpose).toBe('style');
 expect(state.body.source.sha256).toBe(createHash('sha256').update(first).digest('hex'));
 expect(state.body.references[0].sha256).toBe(createHash('sha256').update(second).digest('hex'));
});

test('photo-backed creative request preserves source and reaches review and download without the retired original selector',async({page})=>{
 const state=await mocks(page),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles({name:'actual.png',mimeType:'image/png',buffer:first});
 await expect(form.locator('.reference-item')).toHaveCount(1);
 await expect(form.getByRole('button',{name:'실사 그대로 사용',exact:true})).toHaveCount(0);
 await form.getByRole('button',{name:'직접 입력',exact:true}).click();await form.getByRole('textbox',{name:'광고 제목',exact:true}).fill('확정 문구');
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();const result=page.locator('.simple-ad-result');
 await expect(result.locator('.generation-ad-preview')).toBeVisible();expect(state.body.request.mode).toBe('creative');expect(state.body.source.sha256).toBe(createHash('sha256').update(first).digest('hex'));expect(state.body.request.copy.title).toBe('확정 문구');
 await expect(page.locator('.editor-container')).toHaveCount(0);
 await expect(result.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();await result.getByRole('button',{name:'사용 확정',exact:true}).click();
 const save=result.getByRole('button',{name:'이미지 저장 · 공유',exact:true});await expect(save).toBeEnabled();
 const download=page.waitForEvent('download');await save.click();expect((await download).suggestedFilename()).toBe('aiadcast-9x16.png');expect(state.posts).toBe(1);
 await result.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await expect(form.getByRole('button',{name:'실사 그대로 사용',exact:true})).toHaveCount(0);await expect(form.locator('.reference-item')).toHaveCount(1);await expect(form.getByRole('textbox',{name:'광고 설명',exact:true})).toHaveValue('');
});

test('photo size overflow shows a prominent red notice, retains valid previews and sends the attached original bytes',async({page})=>{
 const state=await mocks(page),form=await details(page,false);
 const front=Buffer.concat([first,Buffer.alloc(6*1024*1024-first.length)]),side=Buffer.concat([second,Buffer.alloc(6*1024*1024-second.length)]);
 await form.getByLabel('참조사진 추가').setInputFiles([{name:'front-6MB.png',mimeType:'image/png',buffer:front},{name:'side-6MB.png',mimeType:'image/png',buffer:side}]);
 const warning=form.locator('.reference-import-error'),title=warning.locator('.reference-error-title');
 await expect(warning).toBeVisible();await expect(title).toContainText('참조사진 전체 용량이 10MB를 초과했습니다.');
 await expect(title).toHaveCSS('color','rgb(185, 28, 28)');await expect(title.locator('strong')).toHaveCSS('font-weight','800');
 expect(await title.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(20);
 await warning.screenshot({path:test.info().outputPath('photo-size-warning.png')});
 await expect(warning).toContainText('side-6MB.png');await expect(form.locator('.reference-item')).toHaveCount(1);await expect(form.locator('.reference-heading')).toContainText('1 / 10');
 await expect(form.locator('.reference-file-info')).toContainText('6.0 / 10MB');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();
 expect(state.posts).toBe(1);expect(state.body.source.sha256).toBe(createHash('sha256').update(front).digest('hex'));expect(state.body.references).toHaveLength(0);
 expect(Buffer.from(state.body.source.data.split(',')[1],'base64').equals(front)).toBe(true);
});
test('when no photo fits, submitting repeats the red size reason and returns focus to attachments',async({page})=>{
 const state=await mocks(page),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles({name:'too-large.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)});
 await expect(form.locator('.reference-import-error')).toContainText('10MB를 초과');await expect(form.locator('.reference-item')).toHaveCount(0);
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect(form.locator('.photo-upload-error')).toContainText('10MB를 초과');await expect(form.locator('.photo-upload-error')).toHaveCSS('color','rgb(185, 28, 28)');
 await expect(form.locator('[data-order="3"]')).toBeFocused();expect(state.posts).toBe(0);
});

// Reload without a timer or storage polling: the last visible photo edit must survive.
test('large photo drafts retain original bytes through immediate role changes and reloads',async({page})=>{
 const state=await mocks(page),form=await details(page,false);
 const large=Buffer.concat([first,Buffer.alloc(4*1024*1024-first.length)]);
 await form.getByLabel('참조사진 추가').setInputFiles([{name:'large.png',mimeType:'image/png',buffer:large},{name:'design.png',mimeType:'image/png',buffer:second}]);
 await expect(form.locator('.reference-item')).toHaveCount(2);
 for(const purpose of ['style','subject','style']){
  await form.getByLabel('2 사진 용도',{exact:true}).selectOption(purpose);
  await reloadDraft(page);await expect(form.getByLabel('2 사진 용도',{exact:true})).toHaveValue(purpose);
  await expect(form.locator('.reference-item img')).toHaveCount(2);
 }
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();
 expect(state.posts).toBe(1);expect(Buffer.from(state.body.source.data.split(',')[1],'base64')).toEqual(large);
 expect(state.body.request.references[0].purpose).toBe('style');expect(state.body.references[0].sha256).toBe(createHash('sha256').update(second).digest('hex'));
});

test('draft storage failure stays visible and protects unsaved input until a successful retry',async({page})=>{
 await mocks(page);const form=await details(page);
 await waitForSavedDraft(page);
 await page.evaluate(()=>{
  const put=IDBObjectStore.prototype.put;
  (window as any).failDraft=true;
  IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(this.name==='drafts'&&(window as any).failDraft)throw new DOMException('Full','QuotaExceededError');return put.apply(this,args);};
 });
 await form.getByLabel('서비스명',{exact:true}).fill('저장 실패 시 지킬 이름');
 await expect(page.getByRole('alert')).toContainText('기기에 보관하지 못했습니다');
 expect(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})).toBe(true);
 await page.evaluate(()=>{(window as any).failDraft=false;});
 await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('저장 공간 복구 후 다시 저장');
 await waitForSavedDraft(page);
 await expect(page.getByRole('alert')).toHaveCount(0);
 await reloadDraft(page);await expect(form.getByLabel('서비스명',{exact:true})).toHaveValue('저장 실패 시 지킬 이름');
 await expect(form.getByRole('textbox',{name:'상세설명',exact:true})).toHaveValue('저장 공간 복구 후 다시 저장');
});

test('server-confirmed administrator at zero credits can review and save without a credit charge',async({page})=>{
 const state=await mocks(page,{admin:true}),form=await details(page);await form.getByLabel('참조사진 추가').setInputFiles({name:'space.png',mimeType:'image/png',buffer:first});
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect(page.getByText('관리자 · 이용권 차감 없음',{exact:true})).toBeVisible();
 await expect(page.locator('.generation-ad-preview')).toBeVisible();
 await expect(page.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();
 await page.getByRole('button',{name:'사용 확정',exact:true}).click();
 await expect(page.getByRole('button',{name:'이미지 저장 · 공유',exact:true})).toBeEnabled();
 expect(state.posts).toBe(1);expect(state.accepts).toBe(1);expect(state.job.creditCost).toBe(0);
 await expect(page.locator('.simple-ad-result')).not.toContainText('API 비용');expect(state.recommendationRequests).toBe(0);
});

test('budget-blocked administrator gets concise guidance without operating figures or generation',async({page},info)=>{
 const state=await mocks(page,{admin:true,enabled:false});let writes=0;
 await page.addInitScript(()=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+3600000,user:{id:'admin-budget-test',label:'Operator',role:'admin'}})));
 await page.route('**/api/status',route=>route.fulfill({json:{mode:'invite-beta',commercialReady:false,generation:{enabled:false,reason:'BUDGET_NOT_AVAILABLE',model:'fixture',perRequestReservationUsd:.5},wallet:{available:0,reserved:0,unlimited:true,kind:'admin-test-unlimited'},budget:{limitMicros:500000,spentMicros:50000,heldMicros:200000}}}));
 page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/api/'))writes++;});
 const form=await details(page);await form.getByLabel('참조사진 추가').setInputFiles({name:'space.png',mimeType:'image/png',buffer:first});await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const panel=page.locator('.generation-panel');await expect(panel).toContainText('생성 예산이 부족합니다. 관리자에게 확인해주세요. 추가 결제로 해결되지 않습니다.');
 await expect(panel.getByRole('note',{name:'이 계정의 생성 예산'})).toHaveCount(0);await expect(panel.getByText('생성 예산이 부족합니다. 관리자에게 확인해주세요. 추가 결제로 해결되지 않습니다.',{exact:true})).toBeVisible();await expect(panel.getByRole('link',{name:'관리자 설정 확인'})).toBeVisible();
 await expect(panel).not.toContainText('관리자에게 한도 확인을 요청해주세요.');await expect(panel.getByRole('link',{name:'관리자 설정 확인'})).toHaveAttribute('href','#admin');
 await panel.getByRole('button',{name:'다시 확인',exact:true}).click();await expect(panel.locator('.admin-budget-details')).toHaveCount(0);expect(state.posts).toBe(0);expect(writes).toBe(0);
 await page.setViewportSize({width:390,height:844});await panel.screenshot({path:info.outputPath('admin-budget-mobile-mock.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('new credits require explicit ten-credit confirmation before auto creation and accepting never charges again',async({page})=>{
 const state=await mocks(page,{v2:true}),form=await details(page);await form.getByLabel('참조사진 추가').setInputFiles({name:'space.png',mimeType:'image/png',buffer:first});
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const panel=page.getByRole('region',{name:'AI 광고 제작',exact:true});
 await expect(panel.getByText(/신규 크레딧 잔액: 30/)).toBeVisible();
 await expect(panel.getByRole('button',{name:'광고 생성 · 10크레딧'})).toBeDisabled();expect(state.posts).toBe(0);
 await panel.getByRole('checkbox',{name:'이번 생성 10크레딧 차감을 확인했습니다.'}).check();
 await panel.getByRole('button',{name:'광고 생성 · 10크레딧'}).click();
 await expect(panel.getByText(/신규 크레딧 잔액: 20/)).toBeVisible();expect(state.posts).toBe(1);expect(state.body.creditQuote).toEqual({unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'});
 await expect(panel.getByRole('button',{name:'반려 · 자동 복원 없음'})).toBeVisible();
 await expect(panel.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();await panel.getByRole('button',{name:'사용 확정'}).click();
 await expect.poll(()=>state.accepts).toBe(1);expect(state.posts).toBe(1);
 await expect(page.locator('.accepted-ad').getByRole('button',{name:'이미지 저장 · 공유',exact:true})).toBeEnabled();expect(state.recommendationRequests).toBe(0);
});
test('English photo creation reviews and saves a complete ad without duplicate requests',async({page})=>{
 const state=await mocks(page);await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','en'));await page.goto('/#create');const form=page.locator('.consumer-create');
 await form.getByLabel('Choose an industry').selectOption('lodging');await form.getByRole('textbox',{name:'Service name',exact:true}).fill('Forest stay');await form.getByRole('textbox',{name:'Description',exact:true}).fill('Quiet rooms surrounded by trees');await form.locator('input[type=file]').first().setInputFiles({name:'room.png',mimeType:'image/png',buffer:first});await expect(form.locator('.reference-item img')).toBeVisible();await form.getByRole('button',{name:'Generate ad',exact:true}).click();
 const result=page.locator('.simple-ad-result');await expect(result.locator('.generation-ad-preview')).toBeVisible();expect(state.posts).toBe(1);expect(state.body.request.output.locale).toBe('en');expect(state.body.request.output.showDimensions).toBe(false);
 await expect(result.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();await result.getByRole('button',{name:'Accept',exact:true}).click();await expect(result.locator('.accepted-ad')).toBeVisible();const pending=page.waitForEvent('download');await result.getByRole('button',{name:'Save / share image',exact:true}).click();expect(await sharp((await(await pending).path())!).metadata()).toMatchObject({format:'png',width:1080,height:1920});expect(state.accepts).toBe(1);expect(state.posts).toBe(1);
});

for(const admin of [true,false])test(`edited unaccepted result generates a fresh request for ${admin?'admin':'member'}`,async({page})=>{
 const state=await mocks(page,{admin}),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles({name:'actual.png',mimeType:'image/png',buffer:first});
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const result=page.locator('.simple-ad-result');await expect(result.locator('.generation-ad-preview')).toBeVisible();
 const firstBody=structuredClone(state.body),firstJob=structuredClone(state.job);
 await result.getByRole('button',{name:'입력 내용 수정',exact:true}).click();
 await page.getByRole('button',{name:'저장하지 않고 나가기',exact:true}).click();
 await expect(form.locator('.reference-item')).toHaveCount(1);
 await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('수정한 상품 정보, 20개 29,800원');
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect.poll(()=>state.posts,{timeout:5000}).toBe(2);
 await expect(result.locator('.generation-ad-preview')).toBeVisible();
 expect(state.body.requestId).not.toBe(firstBody.requestId);expect(state.body.source).toEqual(firstBody.source);
 expect(state.body.request.output.compositionKey).not.toBe(firstBody.request.output.compositionKey);
 expect(state.jobs).toHaveLength(2);expect(state.jobs[0]).toEqual(firstJob);expect(state.jobs[1].id).not.toBe(firstJob.id);expect(state.accepts).toBe(0);
});

for(const prior of ['ready','running','uncertain'])test(`edit resubmission does not duplicate ${prior==='ready'?'unchanged ready':prior} work`,async({page})=>{
 const state=await mocks(page,{admin:true}),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles({name:'actual.png',mimeType:'image/png',buffer:first});
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();const result=page.locator('.simple-ad-result');await expect(result.locator('.generation-ad-preview')).toBeVisible();
 await result.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await page.getByRole('button',{name:'저장하지 않고 나가기',exact:true}).click();
 state.job.state=prior;if(prior!=='ready')await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('수정한 요청');
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 if(prior==='ready'||prior==='uncertain')await expect(result.locator('.generate-button')).toHaveCount(0);else await expect(result.locator('.generate-button')).toBeDisabled();await expect(result.locator('.generation-result')).toBeVisible();
 expect(state.posts).toBe(1);expect(state.accepts).toBe(0);
});

test('edited delivered credit result requires new charge consent and coalesces duplicate clicks',async({page})=>{
 const state=await mocks(page,{v2:true}),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles({name:'actual.png',mimeType:'image/png',buffer:first});
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();const result=page.locator('.simple-ad-result');
 const consent=result.getByRole('checkbox',{name:'이번 생성 10크레딧 차감을 확인했습니다.',exact:true});
 await consent.check();await result.locator('.generate-button').click();await expect(result.locator('.generation-ad-preview')).toBeVisible();
 const original=structuredClone(state.job);
 await result.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await page.getByRole('button',{name:'저장하지 않고 나가기',exact:true}).click();
 await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('수정한 광고 내용');await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect(consent).not.toBeChecked();await expect(result.locator('.generate-button')).toBeDisabled();expect(state.posts).toBe(1);
 await consent.check();await result.locator('.generate-button').evaluate((b:HTMLButtonElement)=>{b.click();b.click();});
 await expect.poll(()=>state.posts).toBe(2);await expect(result.locator('.generation-ad-preview')).toBeVisible();
 expect(state.jobs[0]).toEqual(original);expect(state.accepts).toBe(0);expect(state.body.creditQuote.amount).toBe(10);
});

for(const adLocale of ['ko','en'])for(const ui of ['ko','en'])test(`result analysis UI ${ui} with ad ${adLocale} is collapsed, localized and read-only`,async({page})=>{
 const state=await mocks(page),form=await details(page,false);
 await form.getByLabel('산업 선택').selectOption('fashion');await form.getByLabel('상품명',{exact:true}).fill('ACME');
 await form.getByLabel('참조사진 추가').setInputFiles({name:'shirt.png',mimeType:'image/png',buffer:first});
 await form.getByRole('combobox',{name:/^광고 문구 언어/}).selectOption(adLocale);
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();const result=page.locator('.simple-ad-result');await expect(result.locator('.generation-ad-preview')).toBeVisible();
 const stored=JSON.stringify(state.job.marketingPlan);
 await page.getByRole('combobox',{name:'앱 언어',exact:true}).selectOption(ui);
 const analysis=result.locator('.marketing-analysis');await expect(analysis).not.toHaveAttribute('open','');await expect(analysis.locator('.marketing-summary')).toBeHidden();
 if(adLocale===ui){for(const width of [320,768]){await page.setViewportSize({width,height:900});await result.scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath(`result-${ui}-${width}.png`),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
 await analysis.locator(':scope > summary').click();await expect(analysis.locator('.marketing-channels li')).toHaveCount(3);
 await expect(analysis.locator('.marketing-evidence')).toHaveCount(0);await expect(analysis).toContainText(ui==='ko'?'AI 이미지 분석이나 검색량 검증 결과는 아닙니다':'not AI image analysis or verified search volumes');
 await expect(analysis.locator('.marketing-keywords li')).toHaveCount(4);await expect(analysis.locator('.marketing-keywords')).toContainText(adLocale==='ko'?'의류':'clothing');
 expect(state.posts).toBe(1);expect(JSON.stringify(state.job.marketingPlan)).toBe(stored);expect(state.accepts).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const language of ['ko','en'] as const)test(`photo guidance and visible creative request preserve separate facts (${language})`,async({page})=>{
 const state=await mocks(page);await page.addInitScript(language=>localStorage.setItem('aiadcast.ui-language',language),language);await page.goto('/#create');
 const form=page.locator('.consumer-create'),ko=language==='ko';await form.getByLabel(ko?'산업 선택':'Choose an industry').selectOption('boxes');
 const description=form.getByRole('textbox',{name:ko?'상세설명':'Description',exact:true}),note=form.getByRole('textbox',{name:ko?'추가 요청':'Additional requests',exact:true});
 await expect(note).toBeVisible();await expect(note).toBeEditable();expect(await note.evaluate(el=>!!el.closest('details'))).toBe(false);
 expect(await description.evaluate(el=>el.closest('label')?.nextElementSibling?.contains(document.querySelector('[data-order="5"] textarea[maxlength="600"]')))).toBe(true);
 await description.fill('Cotton hoodie, navy');await note.fill('Warm studio lighting');
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:test.info().project.name==='mobile'?390:1440,height:900});await note.evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:`/tmp/uncertain-form-${language}-${test.info().project.name}.png`});
 await expect(form.locator('.photo-usage')).toHaveText(ko?'상품·서비스 사진을 첨부해주세요.':'Attach photos of your product or service.');
 await expect(form.locator('.reference-file-info')).toContainText('10MB');
 await form.getByLabel(ko?'상품명':'Product name',{exact:true}).fill('Hoodie');await form.getByLabel(ko?'참조사진 추가':'Add reference photos').setInputFiles({name:'product.png',mimeType:'image/png',buffer:first});
 await form.getByRole('button',{name:ko?'광고 생성':'Generate ad',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();
 expect(state.body.request.creativeDirection.additionalInstructions).toBe('Warm studio lighting');expect(JSON.stringify(state.body.request.attributes)).toContain('Cotton hoodie, navy');
 await page.getByRole('button',{name:ko?'입력 내용 수정':'Edit details',exact:true}).click();await page.getByRole('button',{name:ko?'저장하지 않고 나가기':'Leave without saving',exact:true}).click();await expect(description).toHaveValue('Cotton hoodie, navy');await expect(note).toHaveValue('Warm studio lighting');
});
for(const admin of [false,true])test(`persisted uncertain result never redispatches after edit or reload (${admin?'admin':'member'})`,async({page})=>{
 const state=await mocks(page,{admin,uncertain:true}),form=await details(page,false);await form.getByLabel('참조사진 추가').setInputFiles({name:'product.png',mimeType:'image/png',buffer:first});
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText(admin?'결과 미확인 · 이용권 변동 없음':'결과 미확인 · 이용권 복원',{exact:true})).toBeVisible();
 await expect(page.locator('.generate-button')).toHaveCount(0);await expect(page.locator('.generation-ad-preview')).toHaveCount(0);expect(state.posts).toBe(1);
 await reloadDraft(page);await expect(page.getByText(admin?'결과 미확인 · 이용권 변동 없음':'결과 미확인 · 이용권 복원',{exact:true})).toBeVisible();expect(state.posts).toBe(1);
 await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('Changed product facts');await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect(page.getByText(admin?'결과 미확인 · 이용권 변동 없음':'결과 미확인 · 이용권 복원',{exact:true})).toBeVisible();expect(state.posts).toBe(1);expect(state.accepts).toBe(0);
});

for(const language of ['ko','en'] as const)test(`storage preflight rejection is explicit and does not leave an uncertain request (${language})`,async({page})=>{
 await mocks(page);await page.addInitScript(language=>localStorage.setItem('aiadcast.ui-language',language),language);
 let posts=0;await page.route('**/api/generations',route=>{if(route.request().method()!=='POST')return route.fallback();posts++;return route.fulfill({status:413,contentType:'application/json',body:JSON.stringify({error:{code:'STORAGE_CAPACITY_UNAVAILABLE'}})});});
 await page.goto('/#create');const ko=language==='ko',form=page.locator('.consumer-create');
 await form.getByLabel(ko?'산업 선택':'Choose an industry').selectOption('boxes');await form.getByLabel(ko?'상품명':'Product name',{exact:true}).fill('Hoodie');
 await form.getByRole('textbox',{name:ko?'상세설명':'Description',exact:true}).fill('Cotton hoodie');
 await form.getByLabel(ko?'참조사진 추가':'Add reference photos').setInputFiles({name:'product.png',mimeType:'image/png',buffer:first});
 await form.getByRole('button',{name:ko?'광고 생성':'Generate ad',exact:true}).click();
 await expect(page.getByText(ko?'저장 공간이 부족해 생성을 시작하지 않았습니다. 관리자에게 문의해주세요. 입력 내용은 보관했습니다.':'Generation did not start because storage is full. Contact the administrator. Your inputs are preserved.',{exact:true})).toBeVisible();
 expect(posts).toBe(1);expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('pending-generation.')))).toEqual([]);
 await expect(page.locator('.generation-ad-preview')).toHaveCount(0);
 await page.getByRole('button',{name:ko?'입력 내용 수정':'Edit details',exact:true}).click();
 await expect(form.getByRole('textbox',{name:ko?'상세설명':'Description',exact:true})).toHaveValue('Cotton hoodie');await expect(form.locator('.reference-item')).toHaveCount(1);expect(posts).toBe(1);
});

