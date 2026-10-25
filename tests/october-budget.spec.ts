import {test,expect} from '@playwright/test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BetaStore} from '../server/beta-store.mjs';
import {GenerationService} from '../server/generation-service.mjs';
import {createBetaServer} from '../server/beta-server.mjs';

test('owner applies the fixed October cap once through real HTTP and it expires at UTC month rollover',async({page},info)=>{
 let time=Date.parse('2026-10-18T00:00:00Z');const now=()=>time;
 const dir=mkdtempSync(join(tmpdir(),'october-browser-')),store=new BetaStore(dir,{monthlyBudgetMicros:1000000,now});
 const services=new Map<string,GenerationService>(),origin='https://beta.example.com';let providerCalls=0;
 const app=createBetaServer({store,publicUrl:origin,now,accounts:{password:{enabled:true,adminEmail:'owner@example.com',adminPassword:'Fixture-private-owner-2026!'}},serviceFactory:u=>{
  const service=new GenerationService({databasePath:join(dir,u.id+'.sqlite'),managedBudgetIncrease:true,budgetMicros:u.budget,budgetForPeriod:p=>store.effectiveBudget(u.id,p),testCredits:0,enabled:true,providerConfigured:true,now,adapter:{generate:async()=>{providerCalls++;throw Error('No generation requested in this test');}}});services.set(u.id,service);return service;
 }});
 const owner=store.db.prepare('SELECT user_id FROM email_identities WHERE email=?').get('owner@example.com').user_id;store.setAllocation(owner,1000000);
 const invite=store.issueInvite(owner);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const port=(app.server.address() as {port:number}).port;
 let activations=0;
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname==='/api/admin/october-budget'){activations++;expect(req.postDataJSON()).toEqual({});}const response=await route.fetch({url:'http://127.0.0.1:'+port+url.pathname+url.search,headers:{...req.headers(),origin}});await route.fulfill({response});});
 try{
  await page.clock.install({time:new Date(time)});await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),store.login(invite.invite));await page.goto('/#home');
  await page.locator('.app-header').getByRole('link',{name:'관리자',exact:true}).click();
  await expect.poll(()=>services.has(owner)).toBe(true);const service=services.get(owner)!;
  service.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',1000000,527300,100000);
  await page.locator('.admin-page').getByRole('button',{name:'새로고침',exact:true}).click();
  const panel=page.getByRole('region',{name:'10월 한도 승인'}),apply=panel.getByRole('button',{name:'10월 한도 총 $5 적용',exact:true});await expect(apply).toBeVisible();expect(activations).toBe(0);
  await expect(page.locator('.admin-stats')).toContainText('$1.0000');await expect(panel).toContainText('2026-11-01 00:00 UTC');
  await apply.click();await expect(panel).toContainText('현재 10월 전체 한도 $5.0000');await expect(apply).toHaveCount(0);expect(activations).toBe(1);
  await expect(page.locator('.admin-stats')).toContainText('배정 $5.0000');await expect(page.locator('.admin-stats')).toContainText('$0.5273');await expect(page.locator('.admin-stats')).toContainText('보류 $0.1000');
  expect(store.cap).toBe(1000000);expect(service.status().budget.availableMicros).toBe(4372700);expect(providerCalls).toBe(0);
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
  await page.setViewportSize({width:390,height:844});await panel.screenshot({path:info.outputPath('october-budget-active-mobile-local.png')});
  await page.reload();await expect(panel).toContainText('현재 10월 전체 한도 $5.0000');expect(activations).toBe(1);
  // Keep this test session valid across the simulated clock jump; authentication expiry has separate tests.
  store.db.prepare('UPDATE sessions SET expires=?').run(Date.parse('2026-11-02T00:00:00Z'));
  time=Date.parse('2026-11-01T00:00:00Z');
  await page.locator('.admin-page').getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.locator('.admin-stats')).toContainText('배정 $1.0000');await expect(panel).toHaveCount(0);
  expect(service.ledger.budget('2026-10').spent_micros).toBe(527300);expect(service.ledger.budget('2026-10').held_micros).toBe(100000);expect(providerCalls).toBe(0);
 }finally{await app.close();store.close();rmSync(dir,{recursive:true,force:true});}
});
