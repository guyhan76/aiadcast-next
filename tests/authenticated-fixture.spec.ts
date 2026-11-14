import {test,expect} from '@playwright/test';
import {authenticatedSession,mockSession} from './helpers/authenticated-session';
test('authenticated fixture validates token and expiry, and never resurrects a logged-out session',async({page})=>{
 const server=mockSession('fixture-member-123');await authenticatedSession(page,server);
 await page.route('**/api/account/capabilities',r=>r.fulfill({json:{google:{enabled:false}}}));
 await page.goto('/');await expect(page.locator('.home-page')).toBeVisible();
 const request=(token:string)=>page.evaluate(async token=>{const r=await fetch('/api/auth/session',{headers:{Authorization:'Bearer '+token}});return {status:r.status,body:await r.json()};},token);
 expect(await request('b'.repeat(43))).toEqual({status:401,body:{error:{code:'AUTH_REQUIRED'}}});
 expect((await request(server.token)).body.user).toEqual(server.user);server.expires=0;expect((await request(server.token)).status).toBe(401);
 await page.evaluate(()=>sessionStorage.removeItem('aiadcast.beta-session'));await page.reload();await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
test('authenticated fixture cannot turn a forged local account into server ownership',async({page})=>{
 const server=mockSession('fixture-owner-123');await authenticatedSession(page,server);
 await page.route('**/api/account/capabilities',r=>r.fulfill({json:{google:{enabled:false}}}));
 await page.goto('/');await expect(page.locator('.home-page')).toBeVisible();
 await page.evaluate(()=>{const key='aiadcast.beta-session',s=JSON.parse(sessionStorage.getItem(key)!);s.user={id:'different-user-456',label:'Other',role:'admin'};sessionStorage.setItem(key,JSON.stringify(s));});
 await page.reload();await expect(page.getByRole('alert')).toContainText('로그인을 확인하지 못했습니다');await expect(page.locator('.home-page')).toHaveCount(0);await expect(page.locator('.create-page')).toHaveCount(0);
});
