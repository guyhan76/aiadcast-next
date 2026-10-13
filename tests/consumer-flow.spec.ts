import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const first=await sharp({create:{width:340,height:250,channels:4,background:'#bc8552'}}).png().toBuffer();
const second=await sharp({create:{width:250,height:210,channels:4,background:'#bd8653'}}).png().toBuffer();
const ad=await sharp({create:{width:864,height:1536,channels:4,background:'#f2e6db'}}).png().toBuffer();
const hash=createHash('sha256').update(ad).digest('hex');
async function mocks(page:Page,{auth=false,enabled=true}: {auth?:boolean;enabled?:boolean}={}){
 const state={posts:0,accepts:0,body:null as any,job:null as any};
 await page.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
 const send=(body:any,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(path==='/api/account/capabilities')return send({email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}});
 if(path==='/api/status')return auth?send({error:{code:'AUTH_REQUIRED'}},401):send({mode:'local-development',commercialReady:false,generation:{enabled,model:'gpt-image-2.5-sunburst',reason:enabled?null:'BUDGET_NOT_AVAILABLE'},wallet:{available:3,reserved:0,kind:'test'},budget:{limitMicros:1000000,spentMicros:0,heldMicros:0}});
 if(path==='/api/generations'&&request.method()==='POST'){state.posts++;state.body=request.postDataJSON();const body=state.body;
 state.job={id:'consumer_fixture_1',projectId:body.projectId,requestIds:[body.requestId],state:'ready',mode:'creative',sourceHash:body.source?.sha256??null,createdAt:'2026-10-13T00:00:00.000Z',model:'verification.fixture',artifactId:hash,composition:'complete-ad',compositionKey:body.request.output.compositionKey,artifact:{id:hash,sha256:hash,dataUrl:'data:image/png;base64,'+ad.toString('base64'),width:864,height:1536,role:'creative'},marketingPlan:body.request.marketingPlan,errorCode:null};return send({job:state.job,wallet:{available:2,reserved:1,kind:'test'}});}
 if(path.endsWith('/accept')){state.accepts++;state.job.state='accepted';return send({job:state.job,wallet:{available:2,reserved:0,kind:'test'}});}
 if(path==='/api/generations/consumer_fixture_1')return send({job:state.job,wallet:{available:2,reserved:1,kind:'test'}});
 if(path==='/api/generations')return send({jobs:state.job?[state.job]:[]});
 return send({error:{code:'TEST_ROUTE_UNAVAILABLE'}},404);
 });return state;
}
async function details(page:Page,service=true){await page.goto('/#create');const form=page.locator('.consumer-create');await form.getByLabel('산업 선택').selectOption(service?'lodging':'boxes');await form.getByLabel(service?'서비스명':'상품명',{exact:true}).fill(service?'숲속 숙소':'우체국3호박스');await form.getByLabel('상세설명',{exact:true}).fill(service?'숲 전망의 객실, 1박 120,000원':'B골, 크라프트재질, 튼튼하고 습기에 강하다. 빠른배송. 10개 19,800원');return form;}

test('eight inputs submit actual generation request once and a complete accepted PNG can be saved',async({page})=>{
 const state=await mocks(page),form=await details(page,false);
 await form.locator('[data-order="2"] summary').click();await form.getByLabel('회사명',{exact:true}).fill('셀업랩스');await form.getByLabel('연락처',{exact:true}).fill('010-5635-6211');await form.getByLabel('이메일 주소').fill('selluplabs@gmail.com');
 await form.getByLabel('참조사진 추가').setInputFiles([{name:'front.png',mimeType:'image/png',buffer:first},{name:'side.png',mimeType:'image/png',buffer:second}]);
 await expect(form.locator('.reference-item')).toHaveCount(2);
 await form.getByRole('button',{name:'규격 넣기',exact:true}).click();await form.getByLabel('규격 단위').selectOption('mm');
 for(const [axis,value] of [['가로','340'],['세로','250'],['높이','210']])await form.getByLabel(axis+' mm',{exact:true}).fill(value);
 await form.getByRole('button',{name:'직접 입력',exact:true}).click();await form.getByLabel('광고 제목',{exact:true}).fill('보내는 마음까지, 든든하게.');await form.getByLabel('광고 설명',{exact:true}).fill('10개 19,800원 · 빠른배송');
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();
 const result=page.locator('.simple-ad-result');await expect(result.getByText('결과를 확인해주세요',{exact:true})).toBeVisible();await expect(result.locator('.generation-ad-preview')).toBeVisible();
 expect(state.posts).toBe(1);expect(state.body.references).toHaveLength(1);expect(state.body.request.copy.title).toBe('보내는 마음까지, 든든하게.');expect(state.body.request.creativeDirection.copyMode).toBe('manual');expect(state.body.request.output.format).toBe('9:16');expect(state.body.request.output.showDimensions).toBe(true);expect(state.body.request.specifications.map((s:any)=>s.value)).toEqual(['340','250','210']);
 await expect(result.locator('.automatic-proportion')).toHaveCount(0);await expect(result.locator('.editor-details')).toHaveCount(0);
 await result.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await result.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 const save=result.getByRole('button',{name:'이미지 저장',exact:true});await expect(save).toBeEnabled();const pending=page.waitForEvent('download');await save.click();expect((await pending).suggestedFilename()).toBe('aiadcast-9x16.png');expect(state.accepts).toBe(1);expect(state.posts).toBe(1);
 await result.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await expect(form.getByLabel('광고 제목',{exact:true})).toHaveValue('보내는 마음까지, 든든하게.');
});
test('photo-free service AI copy requests no dimensions and generates automatically after submit',async({page})=>{
 const state=await mocks(page),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.locator('.generation-ad-preview')).toBeVisible();expect(state.posts).toBe(1);expect(state.body.source).toBeNull();expect(state.body.request.specifications).toEqual([]);expect(state.body.request.output.showDimensions).toBe(false);expect(state.body.request.creativeDirection.copyMode).toBe('ai');
});
test('unauthenticated creation keeps details and offers visible login rather than a disabled unexplained generator',async({page})=>{
 const state=await mocks(page,{auth:true}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByRole('link',{name:'로그인하고 생성하기',exact:true})).toBeVisible();expect(state.posts).toBe(0);
 await page.getByRole('link',{name:'로그인하고 생성하기',exact:true}).click();await expect(page.getByRole('heading',{name:'테스트 로그인',exact:true})).toBeVisible();await expect(page.getByLabel('초대코드')).toBeVisible();await page.getByRole('link',{name:'돌아가기',exact:true}).click();await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();await expect(form.getByLabel('서비스명',{exact:true})).toHaveValue('숲속 숙소');
});
test('budget blockage gives a clear reason and never dispatches a provider request',async({page})=>{
 const state=await mocks(page,{enabled:false}),form=await details(page);await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText('테스트 생성 한도에 도달했습니다. 관리자에게 한도 확인을 요청해주세요.')).toBeVisible();expect(state.posts).toBe(0);
});
