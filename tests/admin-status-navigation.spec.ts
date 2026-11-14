import {authenticatedSession,mockSession} from './helpers/authenticated-session';
import {test,expect,type Page,type Route} from '@playwright/test';
const referenceStatus={available:true,providerConfigured:true,generalAnalysisEnabled:false,limitCalls:10,limitMicros:300000,perCallHoldMicros:30000,references:[],budget:{ledgerExists:false,usedCalls:null,allowanceUsedMicros:null,knownCostMicros:null,unresolvedCalls:null,remainingCalls:10,request:null}};
const overview={readiness:{imageProviderConfigured:true,generationSwitch:true},budget:{limitMicros:5000000,allocatedMicros:5000000,spentMicros:527300,heldMicros:0},users:[],jobs:[],orders:[],audit:[]};
type Mode='ok'|'hold'|'fail'|'invalid'|'auth';
async function setup(page:Page){
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 let statusMode:Mode='ok',overviewMode:Mode='ok',gets=0,overviewGets=0,posts=0,aborted=0;
 const held:{route:Route;done:()=>void;body:unknown}[]=[];
 await page.addInitScript(()=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+3600000,user:{id:'admin-fixture',label:'Operator',role:'admin'}})));
 page.on('requestfailed',r=>{if(new URL(r.url()).pathname.startsWith('/api/admin/'))aborted++;});
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET'){posts++;return route.fulfill({status:500,json:{error:{code:'NO_MUTATION_EXPECTED'}}});}
  if(path==='/api/admin/overview'||path==='/api/admin/dimension-evaluation'){
   const isOverview=path.endsWith('/overview'),mode=isOverview?overviewMode:statusMode,body=isOverview?overview:referenceStatus;if(isOverview)overviewGets++;else gets++;
   if(mode==='hold')return new Promise<void>(done=>held.push({route,done,body}));
   if(mode==='fail'||mode==='auth')return route.fulfill({status:mode==='auth'?403:503,json:{error:{code:mode==='auth'?'ADMIN_REQUIRED':'UNAVAILABLE'}}});
   if(mode==='invalid')return route.fulfill({json:{unexpected:true}});
   return route.fulfill({json:body});
  }
  if(path==='/api/admin/generations')return route.fulfill({json:{jobs:[],nextCursor:null}});
  return route.fulfill({status:404,json:{error:{code:'FIXTURE_ROUTE_NOT_FOUND'}}});
 });
 await authenticatedSession(page,{...mockSession('admin-fixture','admin'),user:{id:'admin-fixture',label:'Operator',role:'admin'}},{seed:false});
 return {setStatus:(m:Mode)=>{statusMode=m;},setOverview:(m:Mode)=>{overviewMode=m;},gets:()=>gets,overviewGets:()=>overviewGets,posts:()=>posts,aborted:()=>aborted,async release(stale=false){for(const h of held.splice(0)){await h.route.fulfill({json:stale?{...referenceStatus,providerConfigured:false}:h.body}).catch(()=>{});h.done();}}};
}
const panel=(page:Page)=>page.getByRole('region',{name:'승인 원본 사진 분석'});
const feedback=(page:Page)=>panel(page).getByRole('status',{name:'참조 분석 상태 조회'});

test('overview timeout and authorization failure keep navigation available and never start reference analysis',async({page})=>{
 await page.clock.install();const s=await setup(page);s.setOverview('hold');await page.goto('/#admin');await expect(page.locator('.admin-heading').getByRole('button',{name:'새로고침',exact:true})).toBeDisabled();await expect(page.getByRole('link',{name:'홈으로',exact:true})).toBeVisible();await page.clock.fastForward(15001);await expect(page.locator('.admin-page').getByRole('alert')).toContainText('15초');expect(s.gets()).toBe(0);
 s.setOverview('auth');await page.locator('.admin-heading').getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.locator('.admin-page').getByRole('alert')).toContainText('관리자 로그인');expect(s.gets()).toBe(0);expect(s.posts()).toBe(0);
 s.setOverview('ok');await page.locator('.admin-heading').getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.locator('.admin-history')).toBeVisible();expect(s.gets()).toBe(0);await s.release();await expect(page.locator('.admin-stats')).toContainText('$5.0000');await expect(page.locator('.admin-stats')).toContainText('$0.5273');expect(s.posts()).toBe(0);
});
