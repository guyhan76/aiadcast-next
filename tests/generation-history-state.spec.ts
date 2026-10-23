import {authenticatedSession,mockSession} from './helpers/authenticated-session';
import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {newProject} from '../src/model';
const bytes=await sharp({create:{width:480,height:640,channels:4,background:'#145c92'}}).png().toBuffer();
const hash=createHash('sha256').update(bytes).digest('hex'),data='data:image/png;base64,'+bytes.toString('base64');
const missing='이 프로젝트에서 저장된 완료 이미지를 찾지 못했습니다.';
const progress='광고 시안을 제작하고 있습니다. 잠시만 기다려 주세요.';
async function setup(page:Page){
 const p=newProject();p.presentation='campaign';p.generation.mode='creative';p.dimensions.visible=false;p.dimensions.lines=false;p.productName='상자';
 p.product={name:'reference.png',data,width:480,height:640,sha256:hash};
 const state={posts:0,otherWrites:0,fail:false,providerFailed:false,finish:false,holdHistory:false,held:0,job:null as any,releaseHistory:()=>{}};
 const wallet={available:3,reserved:0,kind:'test'};
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const send=(json:unknown,status=200)=>route.fulfill({json,status});
  if(path==='/api/status')return send({generation:{enabled:true,photoPurposes:true},wallet,budget:{limitMicros:1000000,spentMicros:0,heldMicros:0}});
  if(path==='/api/generations'&&req.method()==='POST'){
   state.posts++;if(state.fail)return send({error:{code:'BUDGET_NOT_AVAILABLE'}},409);
   const body=req.postDataJSON();state.job={id:'new-ad',projectId:p.id,requestIds:[body.requestId],state:'running',mode:body.request.mode,sourceHash:body.source.sha256,createdAt:'2026-10-20T00:00:00Z',model:'mock',composition:'complete-ad',compositionKey:body.request.output.compositionKey,marketingPlan:body.request.marketingPlan,artifact:null};
   return send({job:state.job,wallet});
  }
  if(req.method()!=='GET'){state.otherWrites++;return send({error:{code:'FORBIDDEN_TEST_WRITE'}},500);}
  if(path==='/api/generations/new-ad')return send({wallet,job:state.providerFailed?{...state.job,state:'failed',errorCode:'PROVIDER_FAILED'}:state.finish?{...state.job,state:'ready',artifactId:hash,artifact:{id:hash,sha256:hash,dataUrl:data,width:480,height:640,role:'creative'}}:state.job});
  if(path==='/api/generations'){
   if(state.holdHistory){state.held++;await new Promise<void>(resolve=>{state.releaseHistory=resolve;});}
   return send({jobs:[]});
  }
  return send({email:{enabled:false},checkout:{enabled:false}});
 });
 await authenticatedSession(page,mockSession('history-user-123'));
 await page.goto('/#home');await expect(page.locator('.app-header')).toBeVisible();
 await page.evaluate(async p=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>{const tx=r.result.transaction('drafts','readwrite');tx.objectStore('drafts').put({editor:p,returnPage:'studio'},'history-user-123');tx.oncomplete=()=>{r.result.close();resolve();};tx.onerror=()=>reject(tx.error);};}),p);
 await page.evaluate(()=>history.replaceState(null,'','/#studio'));await page.reload();
 await expect(page.getByText(missing,{exact:true})).toBeVisible();
 await page.locator('.new-ad-options > summary').click();
 await expect(page.locator('.generate-button')).toBeEnabled();
 return state;
}
for(const late of [false,true])test(`new generation clears ${late?'late pending':'already displayed'} historical lookup`,async({page})=>{
 const state=await setup(page);
 if(late){state.holdHistory=true;await page.getByRole('button',{name:'과거 결과 다시 확인',exact:true}).click();await expect.poll(()=>state.held).toBe(1);}
 await page.locator('.generate-button').click();await expect(page.getByText(progress,{exact:true})).toBeVisible();
 if(late){state.holdHistory=false;state.releaseHistory();}
 await expect(page.locator('.historical-ad')).toHaveCount(0);await expect(page.getByText(missing,{exact:true})).toHaveCount(0);
 state.finish=true;await expect(page.locator('.generation-ad-preview')).toBeVisible();
 await expect(page.locator('.historical-ad')).toHaveCount(0);expect(state.posts).toBe(1);expect(state.otherWrites).toBe(0);
});
test('auto request stays in generation mode after its intent is consumed',async({page})=>{
 const state=await setup(page);await page.getByRole('button',{name:'입력 내용 수정',exact:true}).click();
 const form=page.locator('.consumer-create');await form.getByLabel('산업 선택').selectOption('boxes');await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('튼튼한 종이 상자');
 await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.getByText(progress,{exact:true})).toBeVisible();await expect(page.locator('.historical-ad')).toHaveCount(0);
 state.finish=true;await expect(page.locator('.generation-ad-preview')).toBeVisible();await expect(page.getByText(missing,{exact:true})).toHaveCount(0);expect(state.posts).toBe(1);expect(state.otherWrites).toBe(0);
});
test('actual missing historical result remains retryable without generation',async({page})=>{
 const state=await setup(page);await page.getByRole('button',{name:'과거 결과 다시 확인',exact:true}).click();await expect(page.getByText(missing,{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'과거 결과 다시 확인',exact:true})).toBeEnabled();expect(state.posts).toBe(0);expect(state.otherWrites).toBe(0);
});
test('real generation failure stays visible without a historical missing-image error',async({page})=>{
 const state=await setup(page);state.fail=true;await page.locator('.generate-button').click();await expect(page.locator('.generation-panel').getByRole('alert')).toContainText('테스트 비용 한도에 도달했습니다.');await expect(page.locator('.historical-ad')).toHaveCount(0);await expect(page.getByText(progress,{exact:true})).toHaveCount(0);expect(state.posts).toBe(1);expect(state.otherWrites).toBe(0);
});

test('provider job failure replaces progress and keeps the failure status',async({page})=>{
 const state=await setup(page);await page.locator('.generate-button').click();await expect(page.getByText(progress,{exact:true})).toBeVisible();state.providerFailed=true;
 await expect(page.locator('.generation-result').getByRole('status')).toHaveText('실패 · 이용권 복원');await expect(page.getByText(progress,{exact:true})).toHaveCount(0);await expect(page.locator('.historical-ad')).toHaveCount(0);expect(state.posts).toBe(1);expect(state.otherWrites).toBe(0);
});
