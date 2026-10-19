import {test,expect} from './helpers/authenticated';
async function setup(page:any,previewDelay=0){
 await page.addInitScript(()=>{sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'owner-fixture',label:'Owner',role:'admin'}}));localStorage.setItem('aiadcast.ui-language','ko');});
 const state={previews:0,applies:0,applied:false,conflict:false};const budget={limitMicros:0,spentMicros:0,heldMicros:0};
 await page.route(url=>url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/me',async(route:any)=>{const path=new URL(route.request().url()).pathname;
  if(path==='/api/admin/overview')return route.fulfill({json:{demoSupportAvailable:true,budget:{...budget,limitMicros:5000000,allocatedMicros:5000000},readiness:{},users:[{id:'member-fixture',label:'한동석',email:'guyhan76@gmail.com',role:'member',disabled:false,projects:0,wallet:{available:state.applied?3:1,reserved:0},budget:{...budget,limitMicros:state.applied?1000000:0},generation:{dimensionGeometry:true,enabled:state.applied,reason:'BUDGET_NOT_AVAILABLE'}}],jobs:[],orders:[],audit:[]}});
  const quote={applied:state.applied,email:'guyhan76@gmail.com',quoteToken:'fixture-quote',addedCredits:2,totalMicros:5000000,memberLimitMicros:1000000,ownerLimitMicros:4000000,spentMicros:527300,heldMicros:100000,wallet:{available:state.applied?3:1,reserved:0}};
  if(path==='/api/admin/demo-support-preview'){if(state.previews===1&&previewDelay)await new Promise(resolve=>setTimeout(resolve,previewDelay));state.previews++;return route.fulfill({json:quote});}
  if(path==='/api/admin/demo-support'){state.applies++;const body=route.request().postDataJSON();expect(body.email).toBe('guyhan76@gmail.com');expect(body.quoteToken).toBe('fixture-quote');expect(body.requestId).toBeTruthy();if(state.conflict)return route.fulfill({status:409,json:{error:{code:'DEMO_SUPPORT_QUOTE_CHANGED'}}});state.applied=true;return route.fulfill({json:{...quote,applied:true,wallet:{available:3,reserved:0}}});}
  return route.fulfill({status:403,json:{error:{code:'NOT_AVAILABLE'}}});
 });await page.goto('/#admin');return state;
}
test('review shows exact member and existing five-dollar redistribution; cancel and double click do not duplicate',async({page})=>{
 const state=await setup(page),panel=page.getByRole('region',{name:'10월 회원 시연 지원'});
 await expect(panel.getByRole('button',{name:'조회한 시연 지원 적용',exact:true})).toHaveCount(0);await panel.getByRole('button',{name:'지원 적용 전 조회',exact:true}).click();expect(state.applies).toBe(0);
 await expect(panel).toContainText('guyhan76@gmail.com');await expect(panel).toContainText('추가 수량 2');await expect(panel).toContainText('$5.0000');await expect(panel).toContainText('$4.0000');await expect(panel).toContainText('$1.0000');
 page.once('dialog',d=>d.dismiss());await panel.getByRole('button',{name:'조회한 시연 지원 적용',exact:true}).click();expect(state.applies).toBe(0);
 page.on('dialog',d=>d.accept());await panel.getByRole('button',{name:'조회한 시연 지원 적용',exact:true}).evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(panel.getByRole('status')).toHaveText('시연 지원 적용됨 · 중복 지급 없음');expect(state.applies).toBe(1);await panel.getByRole('button',{name:'지원 적용 전 조회',exact:true}).click();await expect(panel.getByRole('button',{name:'조회한 시연 지원 적용',exact:true})).toHaveCount(0);expect(state.applies).toBe(1);
});
test('changed cost quote reports conflict without false success and permits fresh review',async({page})=>{
 const state=await setup(page,100);state.conflict=true;const panel=page.getByRole('region',{name:'10월 회원 시연 지원'});await panel.getByRole('button',{name:'지원 적용 전 조회',exact:true}).click();page.on('dialog',d=>d.accept());await panel.getByRole('button',{name:'조회한 시연 지원 적용',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('조회 이후 잔액이나 비용이 바뀌었습니다');await expect(panel.getByRole('status')).toHaveCount(0);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/demo-support-preview'&&r.request().method()==='POST');await panel.getByRole('button',{name:'지원 적용 전 조회',exact:true}).click();expect((await response).status()).toBe(200);await expect(panel.getByRole('button',{name:'조회한 시연 지원 적용',exact:true})).toBeEnabled();expect(state.previews).toBe(2);expect(state.applied).toBe(false);
});
