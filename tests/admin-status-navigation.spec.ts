import {test,expect,type Page,type Route} from '@playwright/test';
const referenceStatus={available:true,providerConfigured:true,generalAnalysisEnabled:false,limitCalls:10,limitMicros:300000,perCallHoldMicros:30000,references:[],budget:{ledgerExists:false,usedCalls:null,allowanceUsedMicros:null,knownCostMicros:null,unresolvedCalls:null,remainingCalls:10,request:null}};
const overview={readiness:{imageProviderConfigured:true,generationSwitch:true},budget:{limitMicros:5000000,allocatedMicros:5000000,spentMicros:527300,heldMicros:0},users:[],jobs:[],orders:[],audit:[]};
type Mode='ok'|'hold'|'fail'|'invalid'|'auth';
async function setup(page:Page){
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
  return route.fulfill({status:404,json:{error:{code:'FIXTURE_ROUTE_NOT_FOUND'}}});
 });
 return {setStatus:(m:Mode)=>{statusMode=m;},setOverview:(m:Mode)=>{overviewMode=m;},gets:()=>gets,overviewGets:()=>overviewGets,posts:()=>posts,aborted:()=>aborted,async release(stale=false){for(const h of held.splice(0)){await h.route.fulfill({json:stale?{...referenceStatus,providerConfigured:false}:h.body}).catch(()=>{});h.done();}}};
}
const panel=(page:Page)=>page.getByRole('region',{name:'승인 원본 사진 분석'});
const feedback=(page:Page)=>panel(page).getByRole('status',{name:'참조 분석 상태 조회'});

test('reference GET has local progress, coalesces repeated clicks and confirms unchanged results with time',async({page},info)=>{
 const s=await setup(page);await page.goto('/#admin');await expect(feedback(page)).toContainText('상태 확인 완료');expect(s.gets()).toBe(1);
 const initialTime=await feedback(page).locator('time').getAttribute('datetime');s.setStatus('hold');
 await panel(page).getByRole('button',{name:'상태를 재확인',exact:true}).evaluate(b=>{(b as HTMLButtonElement).click();(b as HTMLButtonElement).click();(b as HTMLButtonElement).click();});
 await expect.poll(s.gets).toBe(2);await expect(panel(page).getByRole('button',{name:'상태 확인 중…'})).toBeDisabled();await expect(feedback(page)).toContainText('서버 상태를 조회');
 await expect(page.locator('.admin-heading').getByRole('button',{name:'새로고침',exact:true})).toBeEnabled();
 await s.release();await expect(feedback(page)).toContainText('변경 없음');expect(await feedback(page).locator('time').getAttribute('datetime')).not.toBe(initialTime);
 await expect(panel(page).getByText(/공통 원장 아직 없음/)).toBeVisible();expect(s.posts()).toBe(0);await expect(page.locator('.admin-stats')).toContainText('$5.0000');await expect(page.locator('.admin-stats')).toContainText('$0.5273');
 await panel(page).screenshot({path:info.outputPath('reference-status-confirmed-local.png')});
});

test('failed, malformed, unauthorized and timed out status GETs release controls and allow read-only retry',async({page})=>{
 await page.clock.install();const s=await setup(page);await page.goto('/#admin');await expect(feedback(page)).toContainText('상태 확인 완료');
 for(const mode of ['fail','invalid','auth'] as Mode[]){s.setStatus(mode);await panel(page).getByRole('button',{name:'상태를 재확인',exact:true}).click();await expect(panel(page).getByRole('alert')).toContainText(mode==='auth'?'관리자 로그인':'상태 조회에 실패');await expect(panel(page).getByRole('button',{name:'상태를 재확인',exact:true})).toBeEnabled();s.setStatus('ok');await panel(page).getByRole('button',{name:'상태를 재확인',exact:true}).click();await expect(panel(page).getByRole('alert')).toHaveCount(0);await expect(feedback(page)).toContainText('변경 없음');}
 s.setStatus('hold');const before=s.gets();await panel(page).getByRole('button',{name:'상태를 재확인',exact:true}).click();await expect.poll(s.gets).toBe(before+1);await page.clock.fastForward(15001);await expect(panel(page).getByRole('alert')).toContainText('15초');await expect.poll(s.aborted).toBeGreaterThan(0);
 s.setStatus('ok');await panel(page).getByRole('button',{name:'상태를 재확인',exact:true}).click();await expect(panel(page).getByRole('alert')).toHaveCount(0);await s.release(true);await expect(panel(page).getByText(/서버 기존 키: 설정됨/)).toBeVisible();expect(s.posts()).toBe(0);
});

test('top navigation cancels stale GETs, returns to the previous app page and falls back home on direct entry',async({page},info)=>{
 const s=await setup(page);await page.goto('/#guide');await page.locator('.app-header').getByRole('link',{name:'관리자',exact:true}).click();await expect(feedback(page)).toContainText('상태 확인 완료');
 s.setStatus('hold');s.setOverview('hold');await panel(page).getByRole('button',{name:'상태를 재확인',exact:true}).click();await page.locator('.admin-heading').getByRole('button',{name:'새로고침',exact:true}).click();await expect.poll(s.gets).toBe(2);await expect.poll(s.overviewGets).toBe(2);
 await page.getByRole('navigation',{name:'관리자 화면 이동'}).getByRole('link',{name:'← 뒤로가기'}).click();await expect(page).toHaveURL(/#guide$/);await expect.poll(s.aborted).toBe(2);
 s.setStatus('ok');s.setOverview('ok');await page.locator('.app-header').getByRole('link',{name:'관리자',exact:true}).click();await expect(feedback(page)).toContainText('상태 확인 완료');await s.release(true);await expect(panel(page).getByText(/서버 기존 키: 설정됨/)).toBeVisible();
 await page.reload();await expect(feedback(page)).toContainText('상태 확인 완료');await expect(page.getByRole('navigation',{name:'관리자 화면 이동'}).getByRole('link',{name:'← 뒤로가기'})).toHaveAttribute('href','#home');await expect(page.locator('.mobile-app-nav')).toHaveCount(1);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});await expect(page.getByRole('link',{name:'홈으로',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.locator('.admin-navigation').screenshot({path:info.outputPath('admin-top-navigation-mobile-local.png')});await page.getByRole('link',{name:'홈으로',exact:true}).click();await expect(page).toHaveURL(/#home$/);expect(s.posts()).toBe(0);
});

test('overview timeout and authorization failure keep navigation available and never start reference analysis',async({page})=>{
 await page.clock.install();const s=await setup(page);s.setOverview('hold');await page.goto('/#admin');await expect(page.locator('.admin-heading').getByRole('button',{name:'새로고침',exact:true})).toBeDisabled();await expect(page.getByRole('link',{name:'홈으로',exact:true})).toBeVisible();await page.clock.fastForward(15001);await expect(page.locator('.admin-page').getByRole('alert')).toContainText('15초');expect(s.gets()).toBe(0);
 s.setOverview('auth');await page.locator('.admin-heading').getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.locator('.admin-page').getByRole('alert')).toContainText('관리자 로그인');expect(s.gets()).toBe(0);expect(s.posts()).toBe(0);
 s.setOverview('ok');await page.locator('.admin-heading').getByRole('button',{name:'새로고침',exact:true}).click();await expect(feedback(page)).toContainText('상태 확인 완료');await s.release();await expect(page.locator('.admin-stats')).toContainText('$5.0000');await expect(page.locator('.admin-stats')).toContainText('$0.5273');expect(s.posts()).toBe(0);
});
