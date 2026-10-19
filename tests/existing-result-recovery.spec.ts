import {attachSubjectPhoto} from './helpers/subject-photo';
import {authenticatedTest as test,expect,type Page} from './helpers/authenticated';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {reloadDraft} from './helpers/workspace';
const first=await sharp({create:{width:340,height:250,channels:4,background:'#bc8552'}}).png().toBuffer();
const second=await sharp({create:{width:250,height:210,channels:4,background:'#bd8653'}}).png().toBuffer();
const ad=await sharp({create:{width:864,height:1536,channels:4,background:'#f2e6db'}}).png().toBuffer();
const hash=createHash('sha256').update(ad).digest('hex');
async function mocks(page:Page,{auth=false,enabled=true,admin=false,v2=false,running=false}: {auth?:boolean;enabled?:boolean;admin?:boolean;v2?:boolean;running?:boolean}={}){
 const adminWallet={available:0,reserved:0,kind:'test',unlimited:true};
 const state={posts:0,accepts:0,body:null as any,job:null as any};
 await page.route(url=>url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/me',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
 const send=(body:any,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(path==='/api/account/capabilities')return send({email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}});
 if(path==='/api/status')return auth?send({error:{code:'AUTH_REQUIRED'}},401):send({mode:'local-development',commercialReady:false,generation:{dimensionGeometry:true,...(v2?{creditQuote:{unit:'credit-v2',amount:10,policy:'delivered-2026-10-18'}}:{}),enabled,photoPurposes:true,model:'gpt-image-2.5-sunburst',reason:enabled?null:'BUDGET_NOT_AVAILABLE'},wallet:v2?{available:0,reserved:0,credits:{available:state.posts?20:30,reserved:0},kind:'test'}:admin?adminWallet:{available:3,reserved:0,kind:'test'},budget:{limitMicros:1000000,spentMicros:0,heldMicros:0}});
 if(path==='/api/generations'&&request.method()==='POST'){state.posts++;state.body=request.postDataJSON();const body=state.body;
 state.job={...(v2?{creditUnit:'credit-v2',creditPolicy:'delivered-2026-10-18',creditCaptured:true,creditCost:10}:{}),...(admin?{creditPolicy:'admin-unlimited',creditCost:0}:{}),id:'consumer_fixture_1',projectId:body.projectId,requestIds:[body.requestId],state:running?'running':'ready',mode:body.request.mode,sourceHash:body.source?.sha256??null,createdAt:'2026-10-13T00:00:00.000Z',model:'verification.fixture',artifactId:hash,...(body.request.mode==='creative'?{composition:'complete-ad',dimensionGeometry:body.request.dimensionGeometry,compositionKey:body.request.output.compositionKey}:{}),artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+ad.toString('base64'),width:864,height:1536,role:body.request.mode==='original'?'background':'creative'},marketingPlan:body.request.marketingPlan,errorCode:null};return send({job:state.job,wallet:v2?{available:0,reserved:0,credits:{available:20,reserved:0},kind:'test'}:admin?adminWallet:{available:2,reserved:1,kind:'test'}});}
 if(path.endsWith('/accept')){state.accepts++;state.job.state='accepted';return send({job:state.job,wallet:v2?{available:0,reserved:0,credits:{available:20,reserved:0},kind:'test'}:admin?adminWallet:{available:2,reserved:0,kind:'test'}});}
 if(path==='/api/generations/consumer_fixture_1')return send({job:state.job,wallet:v2?{available:0,reserved:0,credits:{available:20,reserved:0},kind:'test'}:admin?adminWallet:{available:2,reserved:1,kind:'test'}});
 if(path==='/api/generations')return send({jobs:state.job?[state.job]:[]});
 return send({error:{code:'TEST_ROUTE_UNAVAILABLE'}},404);
 });return state;
}
async function details(page:Page,service=true){await page.goto('/#create');const form=page.locator('.consumer-create');await form.getByLabel('산업 선택').selectOption(service?'lodging':'boxes');await form.getByLabel(service?'서비스명':'상품명',{exact:true}).fill(service?'숲속 숙소':'우체국3호박스');await form.getByRole('textbox',{name:'상세설명',exact:true}).fill(service?'숲 전망의 객실, 1박 120,000원':'B골, 크라프트재질, 튼튼하고 습기에 강하다. 빠른배송. 10개 19,800원');await attachSubjectPhoto(page);return form;}

test('a budget block distinguishes an existing running request without claiming a new dispatch',async({page})=>{
 const state=await mocks(page,{running:true}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();const panel=page.locator('.generation-panel');await expect(panel.getByText('시안 제작 중',{exact:true})).toBeVisible();expect(state.posts).toBe(1);
 await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:false,reason:'BUDGET_NOT_AVAILABLE',perRequestReservationUsd:.5},wallet:{available:2,reserved:1,kind:'test'},budget:{limitMicros:1000000,spentMicros:600000,heldMicros:500000}}}));
 await page.reload();await expect(panel.getByText('기존 생성 요청 처리 중 · 새 생성은 예산으로 차단됨',{exact:true})).toBeVisible();await expect(panel.getByText('시안 제작 중',{exact:true})).toHaveCount(0);expect(state.posts).toBe(1);expect(state.job.state).toBe('running');
});

for(const missing of [false,true])test(`existing ready result recovers despite failed status with pending missing=${missing}`,async({page})=>{
 const state=await mocks(page,{running:true}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText('시안 제작 중',{exact:true})).toBeVisible();
 state.job.state='ready';
 if(missing)await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.includes('pending-generation.'))localStorage.removeItem(k);});
 await page.route('**/api/status',r=>r.fulfill({status:503,json:{error:{code:'STATUS_UNAVAILABLE'}}}));
 await page.reload();await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(state.posts).toBe(1);expect(state.accepts).toBe(0);
 await page.getByRole('button',{name:'기존 결과 다시 확인',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(state.posts).toBe(1);
 await page.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();await expect(page.getByRole('button',{name:'이미지 저장 · 공유',exact:true})).toBeEnabled();expect(state.accepts).toBe(1);expect(state.posts).toBe(1);
});

test('failed history prevents automatic and manual duplicate generation until a successful retry',async({page})=>{
 const state=await mocks(page);await page.route('**/api/generations?*',r=>r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}));const form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect(page.getByText(/기존 작업을 확인하지 못했습니다/)).toBeVisible();await expect(page.locator('.generate-button')).toBeDisabled();expect(state.posts).toBe(0);
 await page.unroute('**/api/generations?*');await page.getByRole('button',{name:'기존 결과 다시 확인',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(state.posts).toBe(1);
});

test('recovery authentication failure never starts or accepts a job',async({page})=>{
 const state=await mocks(page,{running:true}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText('시안 제작 중',{exact:true})).toBeVisible();state.job.state='ready';
 await page.route('**/api/generations/consumer_fixture_1',r=>r.fulfill({status:401,json:{error:{code:'AUTH_REQUIRED'}}}));await page.reload();
 await expect(page.locator('.generation-ad-preview')).toHaveCount(0);await expect(page.getByText(/로그인 인증을 확인하지 못했습니다|만료/).first()).toBeVisible();expect(state.posts).toBe(1);expect(state.accepts).toBe(0);
});

test('history cannot recover another project and mismatched complete-ad inputs cannot be accepted',async({page})=>{
 const state=await mocks(page,{running:true}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText('시안 제작 중',{exact:true})).toBeVisible();state.job.state='ready';state.job.compositionKey='different-inputs';
 await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.includes('pending-generation.'))localStorage.removeItem(k);});await page.reload();
 await expect(page.getByText(/사진·상품 설정 또는 완성 광고의 문구/)).toBeVisible();await expect(page.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true})).toBeDisabled();expect(state.posts).toBe(1);expect(state.accepts).toBe(0);
 state.job.projectId='another-project';await page.reload();await expect(page.locator('.generation-ad-preview')).toHaveCount(0);await expect(page.getByText(/기존 작업을 확인하지 못했습니다/)).toBeVisible();expect(state.posts).toBe(1);
});

test('ready retrieval does not wait for a stalled status request',async({page})=>{
 const state=await mocks(page,{running:true}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText('시안 제작 중',{exact:true})).toBeVisible();state.job.state='ready';
 let release:()=>void=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/status',async r=>{await held;await r.fulfill({status:503,json:{error:{code:'STATUS_UNAVAILABLE'}}}).catch(()=>{});});
 try{await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.generation-ad-preview')).toBeVisible({timeout:5000});expect(state.posts).toBe(1);expect(state.accepts).toBe(0);}finally{release();}
});

test('ambiguous history blocks new creation and cannot select an arbitrary ready result',async({page})=>{
 const state=await mocks(page,{running:true}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText('시안 제작 중',{exact:true})).toBeVisible();state.job.state='ready';
 await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.includes('pending-generation.'))localStorage.removeItem(k);});
 await page.route('**/api/generations?*',r=>r.fulfill({json:{jobs:[state.job,{...state.job,id:'second-job'}]}}));await page.reload();await expect(page.getByText(/기존 작업을 확인하지 못했습니다/)).toBeVisible();await expect(page.locator('.generate-button')).toBeDisabled();await expect(page.locator('.generation-ad-preview')).toHaveCount(0);expect(state.posts).toBe(1);expect(state.accepts).toBe(0);
});
