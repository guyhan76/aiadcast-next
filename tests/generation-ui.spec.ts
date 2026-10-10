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
type MockJob={id:string;projectId:string;requestIds:string[];state:string;mode:string;sourceHash:string|null;createdAt:string;model:string;artifactId:string;artifact:Record<string,unknown>|null;errorCode:null};
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
   state.job={id:'generation_fixture_1',projectId:body.projectId,requestIds:[body.requestId],state:'ready',mode:body.request.mode,sourceHash:body.source?.sha256??null,createdAt:'2026-10-10T01:00:00.000Z',model:'gpt-image-2.5-sunburst',artifactId:expectedArtifactHash,artifact:{id:expectedArtifactHash,sha256:corruptArtifact?'c'.repeat(64):expectedArtifactHash,dataUrl:'data:image/png;base64,'+generatedBytes.toString('base64'),width:600,height:400,role:body.request.mode==='original'?'background':'creative'},errorCode:null};
   if(dropResponse)return route.abort('failed');
   return respond({job:state.job,wallet:state.wallet});
  }
  if(url.pathname==='/api/generations'&&req.method()==='GET'){state.historyReads++;return respond({jobs:state.job?[state.job]:[]});}
  if(url.pathname==='/api/generations/generation_fixture_1')return respond({job:state.job,wallet:state.wallet});
  if(url.pathname.endsWith('/accept')){state.acceptPosts++;state.job!.state='accepted';state.wallet={available:9,reserved:0,kind:'test'};return respond({job:state.job,wallet:state.wallet});}
  if(url.pathname.endsWith('/reject')){state.rejectPosts++;state.job!.state='rejected';state.job!.artifact=null;state.wallet={available:10,reserved:0,kind:'test'};return respond({job:state.job,wallet:state.wallet});}
  return respond({error:{code:'TEST_ENDPOINT_NOT_CONFIGURED'}},404);
 });
 await page.goto('/#studio');
 await page.getByLabel('상품 사진 추가').setInputFiles(originalPhoto);
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
 await page.getByLabel('상품 사진 추가').setInputFiles({name:'different.png',mimeType:'image/png',buffer:replacementBytes});
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
 await panel.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true}).click();await panel.getByRole('checkbox',{name:'상품·배경·형태를 확인했습니다.',exact:true}).check();
 await panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('파일 검증에 실패');
 expect(state.acceptPosts).toBe(0);expect(state.generationPosts).toBe(1);expect((await backup(page)).generated).toBeUndefined();
});
