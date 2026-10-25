import {authenticatedSession,mockSession} from './helpers/authenticated-session';
import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Mock only: production exact hash is independently enforced server-side.
const bytes=await sharp({create:{width:1080,height:1920,channels:3,background:'#c0dbdf'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
const proposal={located:true,product:[.1,.2,.4,.35],axes:{width:[[.12,.5],[.36,.5]],depth:[[.36,.5],[.48,.4]],height:[[.48,.4],[.48,.22]]},protectedText:[],existingAnnotations:[],inset:[.65,.35,.3,.4]};
test('single box UI is explicit, preserves original, recovers lost response by GET and cannot request a second call',async({page})=>{
 let posts=0,result:any=null;
 await page.addInitScript(()=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+3600000,user:{id:'admin-fixture',label:'Operator',role:'admin'}})));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,send=(json:any)=>route.fulfill({json});
  if(path==='/api/admin/overview')return send({readiness:{},budget:{limitMicros:5000000,spentMicros:527300,heldMicros:0,allocatedMicros:5000000},users:[],jobs:[],orders:[],audit:[]});
  if(path==='/api/admin/single-box-evaluation'){
   if(route.request().method()==='POST'){posts++;const body=route.request().postDataJSON();expect(body.source.sha256).toBe(hash);expect(Buffer.from(body.source.data.split(',')[1],'base64')).toEqual(bytes);result={requestId:body.requestId,sourceHash:hash,state:'ready',verified:false,proposal};return route.abort();}
   return send({available:!result,providerConfigured:true,generalAnalysisEnabled:false,limitCalls:1,limitMicros:30000,perCallHoldMicros:30000,references:[{name:'22986.png',bytes:bytes.length,sha256:hash,label:'모의 박스',basis:'outer-body',dimensions:{width:'450',depth:'300',height:'400'}}],budget:{ledgerExists:!!result,usedCalls:result?1:null,allowanceUsedMicros:result?30000:null,knownCostMicros:result?1000:null,unresolvedCalls:0,remainingCalls:result?0:1,request:result}});
  }return send({available:false,references:[]});
 });await authenticatedSession(page,{...mockSession('admin-fixture','admin'),user:{id:'admin-fixture',label:'Operator',role:'admin'}},{seed:false});
 await page.goto('/#admin');await page.locator('.admin-advanced > summary').click();expect(posts).toBe(0);await page.getByRole('button',{name:'최신 박스 광고 1회 분석 열기',exact:true}).click();
 const panel=page.getByRole('region',{name:'최신 박스 단일 승인 분석'}),select=()=>panel.getByLabel('승인 박스 원본 PNG 선택').setInputFiles({name:'22986.png',mimeType:'image/png',buffer:bytes});
 await expect(panel).toContainText('최대 1회·US$0.03');await select();const original=page.waitForEvent('download');await panel.getByRole('button',{name:'원본 파일 그대로 저장'}).click();expect(await readFile((await(await original).path())!)).toEqual(bytes);
 await panel.getByRole('button',{name:'분석 1회 요청 (최대 $0.03 예약)',exact:true}).click();await expect(panel).toContainText('처리 결과가 미확인');await panel.getByRole('button',{name:'상태를 재확인',exact:true}).click();
 const save=panel.getByRole('button',{name:'사진 축소본·치수선 PNG 저장 (제안 검토 필요)',exact:true});await expect(save).toBeEnabled();expect(posts).toBe(1);await expect(panel.getByRole('button',{name:'새 분석 1회 요청 (한도 사용)',exact:true})).toBeDisabled();
 const event=page.waitForEvent('download');await save.click();const composed=await readFile((await(await event).path())!);expect(composed.equals(bytes)).toBe(false);expect((await sharp(composed).metadata()).width).toBe(1080);
 await page.reload();await page.locator('.admin-advanced > summary').click();await page.getByRole('button',{name:'최신 박스 광고 1회 분석 열기',exact:true}).click();await expect(panel).toContainText('결과를 복구했습니다');await select();await expect(save).toBeEnabled();expect(posts).toBe(1);
});
