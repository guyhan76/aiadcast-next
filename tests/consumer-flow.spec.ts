import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {reloadDraft} from './helpers/workspace';
const first=await sharp({create:{width:340,height:250,channels:4,background:'#bc8552'}}).png().toBuffer();
const second=await sharp({create:{width:250,height:210,channels:4,background:'#bd8653'}}).png().toBuffer();
const ad=await sharp({create:{width:864,height:1536,channels:4,background:'#f2e6db'}}).png().toBuffer();
const hash=createHash('sha256').update(ad).digest('hex');
async function mocks(page:Page,{auth=false,enabled=true,admin=false}: {auth?:boolean;enabled?:boolean;admin?:boolean}={}){
 const adminWallet={available:0,reserved:0,kind:'test',unlimited:true};
 const state={posts:0,accepts:0,body:null as any,job:null as any};
 await page.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
 const send=(body:any,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(path==='/api/account/capabilities')return send({email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}});
 if(path==='/api/status')return auth?send({error:{code:'AUTH_REQUIRED'}},401):send({mode:'local-development',commercialReady:false,generation:{enabled,photoPurposes:true,model:'gpt-image-2.5-sunburst',reason:enabled?null:'BUDGET_NOT_AVAILABLE'},wallet:admin?adminWallet:{available:3,reserved:0,kind:'test'},budget:{limitMicros:1000000,spentMicros:0,heldMicros:0}});
 if(path==='/api/generations'&&request.method()==='POST'){state.posts++;state.body=request.postDataJSON();const body=state.body;
 state.job={...(admin?{creditPolicy:'admin-unlimited',creditCost:0}:{}),id:'consumer_fixture_1',projectId:body.projectId,requestIds:[body.requestId],state:'ready',mode:body.request.mode,sourceHash:body.source?.sha256??null,createdAt:'2026-10-13T00:00:00.000Z',model:'verification.fixture',artifactId:hash,...(body.request.mode==='creative'?{composition:'complete-ad',compositionKey:body.request.output.compositionKey}:{}),artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+ad.toString('base64'),width:864,height:1536,role:body.request.mode==='original'?'background':'creative'},marketingPlan:body.request.marketingPlan,errorCode:null};return send({job:state.job,wallet:admin?adminWallet:{available:2,reserved:1,kind:'test'}});}
 if(path.endsWith('/accept')){state.accepts++;state.job.state='accepted';return send({job:state.job,wallet:admin?adminWallet:{available:2,reserved:0,kind:'test'}});}
 if(path==='/api/generations/consumer_fixture_1')return send({job:state.job,wallet:admin?adminWallet:{available:2,reserved:1,kind:'test'}});
 if(path==='/api/generations')return send({jobs:state.job?[state.job]:[]});
 return send({error:{code:'TEST_ROUTE_UNAVAILABLE'}},404);
 });return state;
}
async function details(page:Page,service=true){await page.goto('/#create');const form=page.locator('.consumer-create');await form.getByLabel('산업 선택').selectOption(service?'lodging':'boxes');await form.getByLabel(service?'서비스명':'상품명',{exact:true}).fill(service?'숲속 숙소':'우체국3호박스');await form.getByRole('textbox',{name:'상세설명',exact:true}).fill(service?'숲 전망의 객실, 1박 120,000원':'B골, 크라프트재질, 튼튼하고 습기에 강하다. 빠른배송. 10개 19,800원');return form;}

test('eight inputs submit actual generation request once and a complete accepted PNG can be saved',async({page})=>{
 const state=await mocks(page),form=await details(page,false);
 await form.locator('[data-order="2"] summary').click();await form.getByLabel('회사명',{exact:true}).fill('테스트 업체');await form.getByLabel('연락처',{exact:true}).fill('010-0000-0000');await form.getByRole('textbox',{name:'이메일 주소',exact:true}).fill('example@example.com');
 await form.getByLabel('참조사진 추가').setInputFiles([{name:'front.png',mimeType:'image/png',buffer:first},{name:'side.png',mimeType:'image/png',buffer:second}]);
 await expect(form.locator('.reference-item')).toHaveCount(2);
 await form.getByRole('button',{name:'규격 넣기',exact:true}).click();await form.getByLabel('규격 단위').selectOption('mm');
 for(const [axis,value] of [['가로','340'],['세로','250'],['높이','210']])await form.getByLabel(axis+' mm',{exact:true}).fill(value);
 await form.getByRole('button',{name:'직접 입력',exact:true}).click();await form.getByRole('textbox',{name:'광고 제목',exact:true}).fill('보내는 마음까지, 든든하게.');await form.getByRole('textbox',{name:'광고 설명',exact:true}).fill('10개 19,800원 · 빠른배송');
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const result=page.locator('.simple-ad-result');await expect(result.getByText('결과를 확인해주세요',{exact:true})).toBeVisible();await expect(result.locator('.generation-ad-preview')).toBeVisible();
 await expect(result.getByRole('heading',{name:'이 광고의 제작 의도',exact:true})).toBeVisible();await expect(result.getByRole('heading',{name:'추천 채널',exact:true})).toBeVisible();await expect(result.locator('.marketing-keywords li')).toHaveCount(state.body.request.marketingPlan.keywordCount);
 expect(state.posts).toBe(1);expect(state.body.references).toHaveLength(1);expect(state.body.request.copy.title).toBe('보내는 마음까지, 든든하게.');expect(state.body.request.creativeDirection.copyMode).toBe('manual');expect(state.body.request.output.format).toBe('9:16');expect(state.body.request.output.showDimensions).toBe(true);expect(state.body.request.specifications.map((s:any)=>s.value)).toEqual(['340','250','210']);
 await expect(result.locator('.automatic-proportion')).toHaveCount(0);await expect(result.locator('.editor-details')).toHaveCount(0);
 await result.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await result.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 await expect(result.locator('.marketing-summary')).toHaveCount(1);await expect(result.locator('.accepted-ad .marketing-summary')).toBeVisible();
 const save=result.getByRole('button',{name:'이미지 저장',exact:true});await expect(save).toBeEnabled();const pending=page.waitForEvent('download');await save.click();expect((await pending).suggestedFilename()).toBe('aiadcast-9x16.png');expect(state.accepts).toBe(1);expect(state.posts).toBe(1);
 await result.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await expect(form.getByRole('textbox',{name:'광고 제목',exact:true})).toHaveValue('보내는 마음까지, 든든하게.');
});
test('photo-free service AI copy requests no dimensions and generates automatically after submit',async({page})=>{
 const state=await mocks(page),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(state.posts).toBe(1);expect(state.body.source).toBeNull();expect(state.body.request.specifications).toEqual([]);expect(state.body.request.output.showDimensions).toBe(false);expect(state.body.request.creativeDirection.copyMode).toBe('ai');
});
test('unauthenticated creation keeps details and offers visible login rather than a disabled unexplained generator',async({page})=>{
 const state=await mocks(page,{auth:true}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByRole('link',{name:'로그인하고 생성하기',exact:true})).toBeVisible();expect(state.posts).toBe(0);
 await page.getByRole('link',{name:'로그인하고 생성하기',exact:true}).click();await expect(page.getByRole('heading',{name:'테스트 로그인',exact:true})).toBeVisible();await expect(page.getByLabel('초대코드')).toBeVisible();await page.getByRole('link',{name:'돌아가기',exact:true}).click();await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await expect(form.getByLabel('서비스명',{exact:true})).toHaveValue('숲속 숙소');
});
test('budget blockage gives a clear reason and never dispatches a provider request',async({page})=>{
 const state=await mocks(page,{enabled:false}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText('이용권과 별도로 이미지 생성용 예산의 사용·보류액 또는 생성 전 예약금 때문에 지금 생성할 수 없습니다. 관리자에게 남은 예산을 확인해주세요.')).toBeVisible();expect(state.posts).toBe(0);
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

test('original photo choice reaches review acceptance and download without opening the advanced editor',async({page})=>{
 const state=await mocks(page),form=await details(page,false);
 await form.getByLabel('참조사진 추가').setInputFiles({name:'actual.png',mimeType:'image/png',buffer:first});
 await expect(form.locator('.reference-item')).toHaveCount(1);
 await form.getByRole('button',{name:'실사 그대로 사용',exact:true}).click();
 await form.getByRole('button',{name:'직접 입력',exact:true}).click();await form.getByRole('textbox',{name:'광고 제목',exact:true}).fill('확정 문구');
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();const result=page.locator('.simple-ad-result');
 await expect(result.locator('.generation-ad-preview')).toBeVisible();expect(state.body.request.mode).toBe('original');
 await expect(page.locator('.editor-container')).toHaveCount(0);
 await result.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await result.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 const save=result.getByRole('button',{name:'이미지 저장',exact:true});await expect(save).toBeEnabled();
 const download=page.waitForEvent('download');await save.click();expect((await download).suggestedFilename()).toBe('aiadcast-9x16.png');expect(state.posts).toBe(1);
 await result.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await expect(form.getByRole('button',{name:'실사 그대로 사용',exact:true})).toHaveAttribute('aria-pressed','true');await expect(form.getByRole('textbox',{name:'광고 설명',exact:true})).toHaveValue('');
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
 await expect(page.locator('.workspace-save-state')).toHaveText('입력 내용이 기기에 저장되었습니다.');
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
 await expect(page.locator('.workspace-save-state')).toHaveText('입력 내용이 기기에 저장되었습니다.');
 await expect(page.getByRole('alert')).toHaveCount(0);
 await reloadDraft(page);await expect(form.getByLabel('서비스명',{exact:true})).toHaveValue('저장 실패 시 지킬 이름');
 await expect(form.getByRole('textbox',{name:'상세설명',exact:true})).toHaveValue('저장 공간 복구 후 다시 저장');
});

test('server-confirmed administrator at zero credits can review and save without a credit charge',async({page})=>{
 const state=await mocks(page,{admin:true}),form=await details(page);
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect(page.getByText('관리자 테스트 · 이용권 차감 없음',{exact:true})).toBeVisible();
 await expect(page.locator('.generation-ad-preview')).toBeVisible();
 await page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();
 await page.getByRole('button',{name:'사용 확정 · 이용권 차감 없음',exact:true}).click();
 await expect(page.getByRole('button',{name:'이미지 저장',exact:true})).toBeEnabled();
 expect(state.posts).toBe(1);expect(state.accepts).toBe(1);expect(state.job.creditCost).toBe(0);
 await expect(page.getByRole('button',{name:'다른 시안 생성 · 관리자 테스트',exact:true})).toBeEnabled();
 await expect(page.locator('.admin-test-mode')).toContainText('실제 API 사용 비용과 서버 예산 한도는 적용됩니다.');
});

test('result guidance stays readable before and after acceptance without altering the generation brief',async({page},info)=>{
 const state=await mocks(page),form=await details(page,false);
 await form.getByLabel('상품명',{exact:true}).fill('튼튼한 이사용 골판지박스');
 await form.getByLabel('참조사진 추가',{exact:true}).setInputFiles({name:'box.png',mimeType:'image/png',buffer:first});
 await form.getByRole('button',{name:'규격 넣기',exact:true}).click();await form.getByLabel('규격 단위').selectOption('mm');
 for(const [axis,value] of [['가로','450'],['세로','350'],['높이','400']])await form.getByLabel(axis+' mm',{exact:true}).fill(value);
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const summary=page.locator('.marketing-summary'),evidence=summary.locator('details');
 await expect(summary).toBeVisible();
 const originalPlan=structuredClone(state.body.request.marketingPlan);
 expect(originalPlan.geometryVerified).toBe(false);
 expect(state.body.request.specifications.map((s:any)=>s.value)).toEqual(['450','350','400']);
 expect(originalPlan.target.label).toContain('450 mm');
 for(const stage of ['review','accepted']){
  if(stage==='accepted'){
   await page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();
   await page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
   await expect(page.locator('.accepted-ad .marketing-summary')).toBeVisible();
  }
  await expect(evidence).not.toHaveAttribute('open','');
  await expect(summary.locator('.marketing-intent')).not.toContainText('450');
  await expect(summary.locator('.marketing-audience')).not.toContainText('450');
  expect((await summary.locator('.marketing-intent').innerText()).length).toBeLessThan(100);
  await expect(summary.locator('.marketing-keywords li')).toHaveText(originalPlan.keywords);
  await expect(summary.locator('.marketing-channels li')).toHaveCount(originalPlan.channels.length);
  for(const width of [320,360,390,412,1440]){
   await page.setViewportSize({width,height:900});
   const layout=await summary.evaluate(el=>{
    const rect=(node:Element)=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,top:r.top,bottom:r.bottom};};
    return {width:document.documentElement.scrollWidth,box:rect(el),paragraphs:[...el.querySelectorAll(':scope > p,.marketing-section p')].map(p=>getComputedStyle(p).textAlign),title:rect(el.querySelector('h3')!),meta:rect(el.querySelector('small')!),channels:[...el.querySelectorAll('.marketing-channels li')].map(rect),keywords:[...el.querySelectorAll('.marketing-keywords li')].map(rect)};
   });
   expect(layout.width).toBeLessThanOrEqual(width);expect(layout.paragraphs.every(v=>v==='left')).toBe(true);
   expect(layout.meta.top).toBeGreaterThanOrEqual(layout.title.bottom);
   for(const row of [...layout.channels,...layout.keywords]){expect(row.x).toBeGreaterThanOrEqual(layout.box.x);expect(row.right).toBeLessThanOrEqual(layout.box.right);}
   if(width<600)for(let i=1;i<layout.channels.length;i++){expect(layout.channels[i].x).toBe(layout.channels[0].x);expect(layout.channels[i].top).toBeGreaterThanOrEqual(layout.channels[i-1].bottom);}
   expect(layout.keywords[0].top).toBe(layout.keywords[1].top);
  }
  await evidence.locator('summary').click();await expect(evidence).toContainText(originalPlan.intent);await expect(evidence).toContainText(originalPlan.target.reason);await evidence.locator('summary').click();
 }
 await page.setViewportSize({width:360,height:900});await summary.screenshot({path:info.outputPath('result-guidance-360.png')});
 await page.getByLabel('앱 언어',{exact:true}).selectOption('en');await expect(summary.getByRole('heading',{name:'Suggested channels',exact:true})).toBeVisible();
 await expect(summary.locator('.marketing-keywords li')).toHaveText(originalPlan.keywords);
 expect(state.body.request.marketingPlan).toEqual(originalPlan);expect(state.posts).toBe(1);expect(state.accepts).toBe(1);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save image',exact:true}).click();
 expect(await sharp((await(await download).path())!).metadata()).toMatchObject({width:1080,height:1920});
 expect(state.posts).toBe(1);expect(state.accepts).toBe(1);
});

test('budget-blocked administrator sees own allocation and holds without generating or changing budget',async({page},info)=>{
 const state=await mocks(page,{admin:true,enabled:false});let writes=0;
 await page.addInitScript(()=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+3600000,user:{id:'admin-budget-test',label:'Operator',role:'admin'}})));
 await page.route('**/api/status',route=>route.fulfill({json:{mode:'invite-beta',commercialReady:false,generation:{enabled:false,reason:'BUDGET_NOT_AVAILABLE',model:'fixture',perRequestReservationUsd:.5},wallet:{available:0,reserved:0,unlimited:true,kind:'admin-test-unlimited'},budget:{limitMicros:500000,spentMicros:50000,heldMicros:200000}}}));
 page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/api/'))writes++;});
 const form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const panel=page.locator('.generation-panel');await expect(panel).toContainText('관리자 이용권은 차감되지 않지만 이미지 생성용 예산이 부족합니다.');
 const budget=panel.getByRole('note',{name:'이 계정의 생성 예산'});await expect(budget).toContainText('월 배정 $0.5000 · 사용 $0.0500 · 보류 $0.2000 · 남은 예산 $0.2500');await expect(budget).toContainText('생성 전 예약금 $0.5000');await expect(budget).toContainText('실제 1회 요금과는 다릅니다.');
 await expect(panel).not.toContainText('관리자에게 한도 확인을 요청해주세요.');await expect(panel.getByRole('link',{name:'관리자 설정 확인'})).toHaveAttribute('href','#admin');
 await panel.getByRole('button',{name:'다시 확인',exact:true}).click();await expect(budget).toContainText('보류 $0.2000');expect(state.posts).toBe(0);expect(writes).toBe(0);
 await page.setViewportSize({width:390,height:844});await panel.screenshot({path:info.outputPath('admin-budget-mobile-mock.png')});
 await page.goto('/#guide');await page.evaluate(()=>document.fonts.ready);await page.locator('.app-footer').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('orange-header-footer-mobile.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
