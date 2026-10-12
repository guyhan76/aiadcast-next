import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const originalBytes=await sharp({create:{width:480,height:320,channels:4,background:{r:191,g:87,b:45,alpha:1}}}).png().toBuffer();
const replacementBytes=await sharp({create:{width:480,height:320,channels:4,background:{r:13,g:170,b:92,alpha:1}}}).png().toBuffer();
const generatedBytes=await sharp({create:{width:600,height:400,channels:4,background:{r:25,g:91,b:200,alpha:1}}}).png().toBuffer();
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const originalPhoto={name:'source.png',mimeType:'image/png',buffer:originalBytes};
const expectedArtifactHash=hash(generatedBytes);
type MockJob={id:string;projectId:string;requestIds:string[];state:string;mode:string;sourceHash:string|null;createdAt:string;model:string;artifactId:string;artifact:Record<string,unknown>|null;errorCode:null;marketingPlan:unknown};
async function mockApi(page:Page,{dropResponse=false,corruptArtifact=false}={}){
 const state={generationPosts:0,acceptPosts:0,rejectPosts:0,historyReads:0,lastBody:null as Record<string,any>|null,job:null as MockJob|null,wallet:{available:10,reserved:0,kind:'test'}};
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  const respond=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/api/status')return respond({mode:'local-development',commercialReady:false,generation:{enabled:true,model:'gpt-image-2.5-sunburst',reason:null},wallet:state.wallet,budget:{limitMicros:1000000,spentMicros:0,heldMicros:0},assistant:{available:false}});
  if(url.pathname==='/api/generations'&&req.method()==='POST'){
   state.generationPosts++;const body=req.postDataJSON();state.lastBody=body;
   state.wallet={available:9,reserved:1,kind:'test'};
   state.job={id:'generation_fixture_1',projectId:body.projectId,requestIds:[body.requestId],state:'ready',mode:body.request.mode,sourceHash:body.source?.sha256??null,createdAt:'2026-10-10T01:00:00.000Z',model:'gpt-image-2.5-sunburst',artifactId:expectedArtifactHash,artifact:{id:expectedArtifactHash,sha256:corruptArtifact?'c'.repeat(64):expectedArtifactHash,dataUrl:'data:image/png;base64,'+generatedBytes.toString('base64'),width:600,height:400,role:body.request.mode==='original'?'background':'creative'},errorCode:null,marketingPlan:body.request.marketingPlan};
   if(dropResponse)return route.abort('failed');
   return respond({job:state.job,wallet:state.wallet});
  }
  if(url.pathname==='/api/generations'&&req.method()==='GET'){state.historyReads++;return respond({jobs:state.job?[state.job]:[]});}
  if(url.pathname==='/api/generations/generation_fixture_1')return respond({job:state.job,wallet:state.wallet});
  if(url.pathname.endsWith('/accept')){state.acceptPosts++;state.job!.state='accepted';state.wallet={available:9,reserved:0,kind:'test'};return respond({job:state.job,wallet:state.wallet});}
  if(url.pathname.endsWith('/reject')){state.rejectPosts++;state.job!.state='rejected';state.job!.artifact=null;state.wallet={available:10,reserved:0,kind:'test'};return respond({job:state.job,wallet:state.wallet});}
  return respond({error:{code:'TEST_ENDPOINT_NOT_CONFIGURED'}},404);
 });
 await page.goto('/#studio');await page.locator('.editor-details > summary').click();
 await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles(originalPhoto);
 const panel=page.getByRole('region',{name:'AI 광고 제작',exact:true});
 await expect(panel).toHaveCount(1);
 await expect(panel.getByText('생성 테스트 연결됨',{exact:true})).toBeVisible();
 return {state,panel};
}
async function backup(page:Page){const event=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();return JSON.parse(await readFile((await (await event).path())!,'utf8'));}

test('original background review preserves source bytes and accepted reapply does not charge twice',async({page})=>{
 const {state,panel}=await mockApi(page);
 await panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true}).click();
 await expect(panel.getByText('결과를 확인해주세요',{exact:true})).toBeVisible();
 const accept=panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true});await expect(accept).toBeDisabled();
 await panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true}).check();await accept.click();
 await expect(panel.getByText('사용 확정한 시안',{exact:true})).toBeVisible();
 const saved=await backup(page);
 expect(Buffer.from(saved.product.data.split(',')[1],'base64')).toEqual(originalBytes);expect(saved.product.sha256).toBe(hash(originalBytes));
 expect(saved.background.image.sha256).toBe(expectedArtifactHash);expect(saved.generated.asset.sha256).toBe(expectedArtifactHash);expect(saved.generated.role).toBe('background');
 expect(saved.generated.sourceHash).toBe(saved.product.sha256);expect(state.lastBody!.source.data).toBe(saved.product.data);
 await panel.getByRole('button',{name:'저장한 시안 다시 적용',exact:true}).click();
 await expect(panel.getByRole('button',{name:'저장한 시안 다시 적용',exact:true})).toBeEnabled();
 expect(state.generationPosts).toBe(1);expect(state.acceptPosts).toBe(1);expect((await backup(page)).product.data).toBe(saved.product.data);
});

test('accepted creative enables PNG with generated pixels while preserving the original for later edits',async({page})=>{
 const {state,panel}=await mockApi(page);
 await page.getByRole('radio',{name:'새로운 광고 이미지 만들기',exact:true}).check();
 await expect(page.getByRole('button',{name:'AI 시안 확인 후 저장',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'AI 새 시안 요청 · 1개',exact:true}).click();
 await panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true}).check();
 await panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 const exportButton=page.getByRole('button',{name:'PNG 내보내기',exact:true});await expect(exportButton).toBeEnabled();
 const event=page.waitForEvent('download');await exportButton.click();const bytes=await readFile((await (await event).path())!);
 const pixel=await sharp(bytes).extract({left:540,top:1010,width:1,height:1}).removeAlpha().raw().toBuffer();expect([...pixel]).toEqual([25,91,200]);
 const saved=await backup(page);expect(saved.generated.role).toBe('creative');expect(saved.generated.asset.sha256).toBe(expectedArtifactHash);expect(Buffer.from(saved.product.data.split(',')[1],'base64')).toEqual(originalBytes);
 await page.getByLabel('출력 비율').selectOption('4:5');await expect(exportButton).toBeEnabled();expect(state.acceptPosts).toBe(1);
});

test('changing the source while reviewing makes the old visual inapplicable',async({page})=>{
 const {state,panel}=await mockApi(page);
 await panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true}).click();
 await panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true}).check();
 await page.getByRole('button',{name:'1 사진 삭제',exact:true}).click();await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'different.png',mimeType:'image/png',buffer:replacementBytes});
 await expect(panel.getByRole('alert')).toContainText('적용할 수 없습니다');
 await expect(panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true})).toBeDisabled();
 const saved=await backup(page);expect(saved.product.sha256).toBe(hash(replacementBytes));expect(saved.generated).toBeUndefined();expect(state.acceptPosts).toBe(0);
});

test('a lost POST response is recovered through requestIds without another generation POST',async({page})=>{
 const {state,panel}=await mockApi(page,{dropResponse:true});
 await panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('자동으로 다시 생성하지 않습니다');
 await expect(panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'연결 상태 확인',exact:true}).click();
 await expect(panel.getByText('결과를 확인해주세요',{exact:true})).toBeVisible();
 expect(state.historyReads).toBe(1);expect(state.generationPosts).toBe(1);expect(state.acceptPosts).toBe(0);
 await panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true}).check();await panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 await expect(panel.getByText('사용 확정한 시안',{exact:true})).toBeVisible();expect(state.generationPosts).toBe(1);expect(state.acceptPosts).toBe(1);
});

test('rejecting a ready visual restores the test credit without applying the artifact',async({page})=>{
 const {state,panel}=await mockApi(page);
 await panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true}).click();await expect(panel.locator('.generation-status')).toContainText('테스트 이용권 9');
 await panel.getByRole('button',{name:'반려 · 이용권 복원',exact:true}).click();
 await expect(panel.getByText('반려 · 이용권 복원',{exact:true})).toBeVisible();await expect(panel.locator('.generation-status')).toContainText('테스트 이용권 10');
 await expect(panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true})).toBeEnabled();
 const saved=await backup(page);expect(saved.generated).toBeUndefined();expect(saved.background.image).toBeNull();expect(state.rejectPosts).toBe(1);expect(state.acceptPosts).toBe(0);
});

test('artifact hash mismatch is detected before accepting a charge',async({page})=>{
 const {state,panel}=await mockApi(page,{corruptArtifact:true});
 await panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('파일 검증에 실패');
 await expect(panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true})).toBeDisabled();
 await expect(panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true})).toBeDisabled();
 expect(state.acceptPosts).toBe(0);expect(state.generationPosts).toBe(1);expect((await backup(page)).generated).toBeUndefined();
});

test('complete ad preview is composed before charging and matches PNG after local dimension edits',async({page})=>{
 const {state,panel}=await mockApi(page);const p=await backup(page);
 p.presentation='campaign';p.generation.mode='creative';p.productName='우체국3호박스';p.productProfile={category:'boxes',specType:'rectangular',material:'크라프트재질로 내구성이 튼튼하고 습기에 강하다. 택배물류 박스에 표준규격. 우체국박스로 믿을 수 있는 든든함. 빠른배송. B골 크라프트재질. 10개 19,800원'};
 p.dimensions={...p.dimensions,width:'340',depth:'250',height:'210',displayUnit:'mm',visible:true};
 p.copy.ko={title:p.productName,description:'박스와 브랜드의 분위기',company:'셀업랩스',contact:'010-5635-6211',email:'selluplabs@gmail.com',website:'https://aiadcast-next.onrender.com'};
 page.on('dialog',d=>d.accept());await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'postal-box.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await panel.getByRole('button',{name:'AI 새 시안 요청 · 1개',exact:true}).click();
 const preview=panel.getByRole('img',{name:'광고카피와 상품 정보가 합성된 광고 미리보기',exact:true});await expect(preview).toBeVisible();
 const first=await preview.getAttribute('src');expect(first).not.toBe(state.job!.artifact!.dataUrl);
 expect(await sharp(Buffer.from(first!.split(',')[1],'base64')).metadata()).toMatchObject({width:1080,height:1920});
 expect(state.generationPosts).toBe(1);expect(state.acceptPosts).toBe(0);
 const spec=panel.getByRole('checkbox',{name:'광고에 규격 표시',exact:false});await spec.uncheck();await expect(preview).not.toHaveAttribute('src',first!);
 await spec.check();await expect(preview).toHaveAttribute('src',first!);expect(state.generationPosts).toBe(1);expect(state.acceptPosts).toBe(0);
 await panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true}).check();await panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 const saved=await backup(page);expect(saved.copy.ko.description).toContain('10개 19,800원');expect(saved.copy.ko.contact).toBe('010-5635-6211');
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();const bytes=await readFile((await(await event).path())!);
 expect(bytes).toEqual(Buffer.from(first!.split(',')[1],'base64'));expect(state.acceptPosts).toBe(1);expect(state.generationPosts).toBe(1);
});



test('result shows and exports the generation plan, retaining it after product name changes',async({page})=>{
 const {state,panel}=await mockApi(page);
 await panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true}).click();
 const summary=panel.getByRole('region',{name:'광고 제작 의도와 활용 정보'});
 await expect(summary).toBeVisible();await expect(summary).toContainText('생성 당시 기획');
 await expect(summary.locator('.marketing-keywords li')).toHaveCount(6);
 await expect(summary.locator('.marketing-channels li')).toHaveCount(2);
 await panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true}).check();
 await panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 const saved=await backup(page);expect(saved.generated.marketingPlan).toEqual(state.lastBody!.request.marketingPlan);
 const originalName=saved.generated.marketingPlan.input.name;saved.productName='변경 후 상품명';
 page.on('dialog',d=>d.accept());await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'changed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await page.locator('#publishing-tools > summary').click();
 const publishing=page.getByRole('region',{name:'광고 활용 가이드',exact:true});
 await expect(publishing).toContainText('생성 당시 정보');
 await expect(publishing.locator('.marketing-summary')).not.toContainText('변경 후 상품명');
 expect((await backup(page)).generated.marketingPlan.input.name).toBe(originalName);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:390,height:844});await publishing.locator('.marketing-summary').screenshot({path:'/tmp/aiadcast-patent-summary.png'});
 expect(state.generationPosts).toBe(1);expect(state.acceptPosts).toBe(1);
});
