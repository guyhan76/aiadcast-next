import {expect,test} from '@playwright/test';
import {mockSession,protectedScreen} from './helpers/authenticated-session';
for(const plan of ['free','standard'])test('24-hour downloads and confirmed withdrawal for '+plan,async({page})=>{
 const member=mockSession('membership-browser');
 await protectedScreen(page,member);
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 let withdrawals=0;
 await page.route('**/api/membership',r=>r.fulfill({json:{plan,storage:'device',downloadWindowHours:24}}));
 await page.route('**/api/membership/downloads',r=>r.fulfill({json:{downloads:[{id:'delivery-fixture',name:'새 광고',expiresAt:'2026-12-15T10:00:00Z',reviewRequired:false}]}}));
 await page.route('**/api/projects',r=>r.fulfill({json:{projects:[{id:'member-project-fixture',name:'보관함 검증',revision:1,expiresAt:'2026-12-15T00:00:00Z'}]}}));
 await page.route('**/api/membership/withdraw',r=>{
  expect(r.request().headers().authorization).toBe('Bearer '+member.token);
  expect(r.request().postDataJSON()).toEqual({confirm:'delete-my-account'});
  withdrawals++;return r.fulfill({json:{receipt:'fixture-receipt',state:'requested'}});
 });
 await page.goto('/#projects');
 await expect(page.getByText(/생성 완료 후 24시간/)).toBeVisible();
 await expect(page.getByRole('button',{name:'원본 저장',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/보관함 검증/})).toBeVisible();
 await page.getByRole('button',{name:/메뉴 열기|Open menu/}).click();
 await page.getByRole('button',{name:/^회원탈퇴$|^Delete account$/}).click();
 await page.getByRole('button',{name:/^취소$|^Cancel$/}).click();
 expect(withdrawals).toBe(0);
 await page.getByRole('button',{name:/^회원탈퇴$|^Delete account$/}).click();
 await page.getByRole('button',{name:/모든 프로젝트 삭제 및 탈퇴|Delete all projects and my account/}).click();
 await expect.poll(()=>withdrawals).toBe(1);
 await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
