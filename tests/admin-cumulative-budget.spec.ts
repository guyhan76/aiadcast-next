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
