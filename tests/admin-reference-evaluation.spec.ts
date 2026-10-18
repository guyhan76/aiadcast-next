import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Synthetic local fixture, never a claim about the two approved originals.
const bytes=await sharp({create:{width:300,height:400,channels:3,background:'#c0dbdf'}}).jpeg().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
const proposal={located:true,product:[.1,.2,.4,.35],axes:{width:[[.12,.5],[.36,.5]],depth:[[.36,.5],[.48,.4]],height:[[.48,.4],[.48,.22]]},protectedText:[],existingAnnotations:[],inset:[.65,.35,.3,.4]};
async function setup(page:Page,{lost=false}={}){
 let posts=0,result:any=null;
 await page.addInitScript(()=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+3600000,user:{id:'admin-fixture',label:'Operator',role:'admin'}})));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,send=(body:any)=>route.fulfill({json:body});
  if(path==='/api/admin/overview')return send({readiness:{},budget:{limitMicros:0,spentMicros:0,heldMicros:0,allocatedMicros:0},users:[],jobs:[],orders:[],audit:[]});
  if(path==='/api/admin/dimension-evaluation'){
   if(route.request().method()==='POST'){posts++;const body=route.request().postDataJSON();expect(body.source.sha256).toBe(hash);expect(Buffer.from(body.source.data.split(',')[1],'base64')).toEqual(bytes);result={requestId:body.requestId,sourceHash:hash,state:'ready',verified:false,proposal};if(lost)return route.abort();return send(result);}
   return send({available:true,providerConfigured:true,generalAnalysisEnabled:false,limitCalls:10,limitMicros:300000,perCallHoldMicros:30000,references:[{name:'22932.jpg',bytes:bytes.length,sha256:hash,label:'로컬 테스트 박스',basis:'outer-body',dimensions:{width:'300',depth:'200',height:'100'}}],budget:{ledgerExists:!!result,usedCalls:result?1:null,allowanceUsedMicros:result?30000:null,knownCostMicros:result?1000:null,unresolvedCalls:result?0:null,remainingCalls:result?9:10,request:result}});
  }
  return route.fulfill({status:404,json:{error:{code:'FIXTURE_ROUTE_NOT_FOUND'}}});
 });
 await page.goto('/#admin');await expect(page.getByRole('heading',{name:'승인 원본 사진 분석',exact:true})).toBeVisible();
 return {posts:()=>posts,select:()=>page.getByLabel('승인 원본 JPG 선택').setInputFiles({name:'22932.jpg',mimeType:'image/jpeg',buffer:bytes})};
}
test('administrator reference analysis preserves original bytes, distinct overlay pixels and refresh without another call',async({page},testInfo)=>{
 const s=await setup(page);await expect(page.getByText(/공통 원장 아직 없음/)).toBeVisible();expect(s.posts()).toBe(0);
 await s.select();await expect(page.getByText(/원본 일치 확인/)).toBeVisible();
 const original=page.waitForEvent('download');await page.getByRole('button',{name:'원본 파일 그대로 저장'}).click();expect(await readFile((await(await original).path())!)).toEqual(bytes);
 await page.getByRole('button',{name:'분석 1회 요청 (최대 $0.03 예약)',exact:true}).dblclick();await expect(page.getByRole('button',{name:'진단 PNG 저장 (기존 표시 포함)'})).toBeEnabled();expect(s.posts()).toBe(1);
 await page.locator('.admin-reference-evaluation').screenshot({path:testInfo.outputPath('admin-reference-mock.png')});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'진단 PNG 저장 (기존 표시 포함)'}).click();const diagnostic=await readFile((await(await download).path())!);const meta=await sharp(diagnostic).metadata();expect([meta.width,meta.height]).toEqual([300,400]);
 const pixel=async(b:Buffer,left:number,top:number)=>Array.from(await sharp(b).extract({left,top,width:1,height:1}).removeAlpha().raw().toBuffer());
 expect(await pixel(diagnostic,10,10)).toEqual(await pixel(bytes,10,10));expect(await pixel(diagnostic,60,200)).toEqual([255,0,184]);
 await page.reload();await expect(page.getByText(/결과를 복구했습니다/)).toBeVisible();expect(s.posts()).toBe(1);await s.select();await expect(page.getByRole('button',{name:'진단 PNG 저장 (기존 표시 포함)'})).toBeEnabled();expect(s.posts()).toBe(1);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});
test('unknown response is recovered by GET only and mismatched source cannot be submitted',async({page})=>{
 const s=await setup(page,{lost:true});await page.getByLabel('승인 원본 JPG 선택').setInputFiles({name:'22932.jpg',mimeType:'image/jpeg',buffer:Buffer.from('different')});await expect(page.getByRole('alert')).toContainText('원본');expect(s.posts()).toBe(0);
 await s.select();await page.getByRole('button',{name:'분석 1회 요청 (최대 $0.03 예약)',exact:true}).click();await expect(page.getByText(/처리 결과가 미확인/)).toBeVisible();await page.getByRole('button',{name:'상태를 재확인',exact:true}).click();await expect(page.getByText(/처리 결과가 미확인/)).toHaveCount(0);await expect(page.getByRole('button',{name:'진단 PNG 저장 (기존 표시 포함)'})).toBeEnabled();expect(s.posts()).toBe(1);await page.reload();await expect(page.getByText(/결과를 복구했습니다/)).toBeVisible();expect(s.posts()).toBe(1);
});
