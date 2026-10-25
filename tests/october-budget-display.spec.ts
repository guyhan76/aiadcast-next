import {test,expect} from '@playwright/test';
import {authenticatedSession,mockSession} from './helpers/authenticated-session';
for(const ownerUsd of [5,100])for(const language of ['ko','en'])test(`October effective budget includes exceptions without changing account state (${language}, ${ownerUsd})`,async({page})=>{
 await page.addInitScript(language=>localStorage.setItem('aiadcast.ui-language',language),language);
 await page.route('**/api/**',route=>route.fulfill({status:404,json:{error:{code:'FIXTURE_ROUTE_UNAVAILABLE'}}}));
 await authenticatedSession(page,mockSession('owner-fixture','admin'));
 let writes=0;
 await page.route('**/api/admin/overview',route=>{if(route.request().method()!=='GET')writes++;return route.fulfill({json:{readiness:{},octoberApproval:{eligible:true,active:true,baselineTotalMicros:1000000},budget:{limitMicros:(ownerUsd+10)*1000000,allocatedMicros:(ownerUsd+10)*1000000,spentMicros:3973900,heldMicros:1500000},users:[{id:'owner-fixture',label:'Owner',role:'admin',disabled:false,projects:0,wallet:{available:0,reserved:0,unlimited:true},budget:{limitMicros:ownerUsd*1000000,spentMicros:2121900,heldMicros:1500000},generation:{enabled:true,reason:null}}],jobs:[],orders:[],audit:[]}});});
 await page.goto('/#admin');const section=page.locator('.october-budget');await expect(section.locator('strong')).toHaveText((language==='ko'?'현재 10월 전체 한도':'Current October total cap')+` $${ownerUsd+10}.0000`);
 await expect(section).toContainText('2026-11-01');await expect(section).toContainText('$1.0000');await expect(section).not.toContainText(language==='ko'?'10월 총 $5 적용됨':'October total $5 applied');
 await expect(page.getByText(language==='ko'?`이 계정의 10월 배정 $${ownerUsd}.0000. 기본 배정액은 변경하지 않습니다.`:`This account’s October allocation $${ownerUsd}.0000. The baseline allocation is unchanged.`,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(writes).toBe(0);
});
