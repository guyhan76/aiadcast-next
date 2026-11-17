import {test,expect} from '@playwright/test';
import {authenticatedSession,mockSession} from './helpers/authenticated-session';
for(const language of ['ko','en'])test(`cumulative budget is distinct from monthly summary with no allocation writes (${language})`,async({page})=>{
 let writes=0;
 await page.addInitScript(language=>localStorage.setItem('aiadcast.ui-language',language),language);
 await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;if(path==='/api/account/capabilities')return r.fulfill({json:{google:{enabled:false},email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}}});if(r.request().method()!=='GET')writes++;
 if(path==='/api/admin/overview')return r.fulfill({json:{readiness:{},budget:{limitMicros:1000000,allocatedMicros:1000000,spentMicros:546000,heldMicros:0},users:[{id:'owner',label:'Fixture administrator',role:'admin',disabled:false,wallet:{available:0,reserved:0,unlimited:true},budget:{limitMicros:1000000,spentMicros:546000,heldMicros:0},supplierBudget:{scope:'lifetime',limitMicros:100000000,spentMicros:99500001,heldMicros:0,availableMicros:499999},generation:{enabled:false,reason:'BUDGET_NOT_AVAILABLE'}}],jobs:[],orders:[],audit:[]}});
 if(path==='/api/admin/generations')return r.fulfill({json:{jobs:[],nextCursor:null}});
 return r.fulfill({status:404,json:{error:{code:'MOCK'}}});});
 await authenticatedSession(page,mockSession('budget-admin','admin'));await page.goto('/#admin');
 await page.locator('summary').filter({hasText:language==='ko'?'회원 목록':/^Members$/}).click();const table=page.locator('.admin-table-wrap');await expect(table).toContainText(language==='ko'?'누적 $100.0000':'Lifetime $100.0000');await expect(table).toContainText('$0.499999');await expect(table).toContainText('BUDGET_NOT_AVAILABLE');
 await page.getByText(language==='ko'?'회원 테스트 설정':'Member test settings',{exact:true}).click();await expect(page.getByRole('button',{name:language==='ko'?'배정액 적용':'Apply allocation',exact:true})).toHaveCount(0);await expect(page.locator('.admin-stats')).toContainText('$1.0000');
 for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 expect(writes).toBe(0);
});

test('shared launch budget shows one lifetime cap and free or purchased ad counts without member allocations',async({page})=>{
 let writes=0;
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 const shared={scope:'lifetime',shared:true,limitMicros:100000000,spentMicros:84000,heldMicros:500000,availableMicros:99416000};
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET')writes++;
  if(path==='/api/account/capabilities')return route.fulfill({json:{google:{enabled:false},email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}}});
  if(path==='/api/admin/overview')return route.fulfill({json:{readiness:{},budget:{...shared,allocatedMicros:0},users:[
   {id:'free-member',label:'무료 회원',role:'member',disabled:false,wallet:{available:0,reserved:0,credits:{available:10,reserved:0}},budget:{limitMicros:0,spentMicros:0,heldMicros:0},supplierBudget:shared,generation:{enabled:true,reason:null}},
   {id:'paid-member',label:'구매 회원',role:'member',disabled:false,wallet:{available:0,reserved:0,credits:{available:20,reserved:10}},budget:{limitMicros:0,spentMicros:84000,heldMicros:500000},supplierBudget:shared,generation:{enabled:true,reason:null}}
  ],jobs:[],orders:[],audit:[]}});
  if(path==='/api/admin/generations')return route.fulfill({json:{jobs:[],nextCursor:null}});
  return route.fulfill({status:404,json:{error:{code:'MOCK'}}});
 });
 await authenticatedSession(page,mockSession('budget-admin','admin'));await page.goto('/#admin');
 await expect(page.locator('.admin-stats')).toContainText('전체 생성 비용 한도');
 await expect(page.locator('.admin-stats')).toContainText('기간 제한 없이 전체 회원 공유');
 await expect(page.locator('.admin-stats')).toContainText('$100.0000');
 await page.locator('summary').filter({hasText:'회원 목록'}).click();
 const free=page.getByRole('row').filter({hasText:'무료 회원'}),paid=page.getByRole('row').filter({hasText:'구매 회원'});
 await expect(free).toContainText('광고 1장');await expect(paid).toContainText('광고 2장');await expect(paid).toContainText('예약 1장');
 await expect(free).toContainText('전체 공유 $100.0000');
 await page.getByText('회원 테스트 설정',{exact:true}).click();
 await expect(page.getByRole('button',{name:'배정액 적용',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'광고 1개 테스트 준비',exact:true})).toHaveCount(0);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 expect(writes).toBe(0);
});
