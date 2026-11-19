import {expect,test} from '@playwright/test';
import {mockSession,protectedScreen} from './helpers/authenticated-session';
for(const plan of ['free','standard'])test('24-hour downloads and confirmed withdrawal for '+plan,async({page})=>{
 const member=mockSession('membership-browser');
 await protectedScreen(page,member);
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 const refund=plan==='standard', receipt='202611190001', refundReceipt='20261119-0002';
 let withdrawals=0, downloadRequests=0;
 await page.route('**/api/membership',r=>r.fulfill({json:{plan,storage:'device',downloadWindowHours:24}}));
 await page.route('**/api/membership/downloads',r=>{
  downloadRequests++;
  return r.fulfill({json:{downloads:Array.from({length:7},(_,i)=>({id:'delivery-'+i,name:i===6?'마지막 광고':'같은 이름으로 만든 광고',expiresAt:new Date(Date.now()+7200000).toISOString(),reviewRequired:false}))}});
 });
 await page.route('**/api/projects',r=>r.fulfill({json:{projects:[{id:'member-project-fixture',name:'보관함 검증',revision:1,expiresAt:'2026-12-15T00:00:00Z'}]}}));
 await page.route('**/api/membership/withdraw',r=>{
  expect(r.request().headers().authorization).toBe('Bearer '+member.token);
  expect(r.request().postDataJSON()).toEqual({confirm:'delete-my-account',...(refund?{requestRefund:true}:{})});
  withdrawals++;return r.fulfill({json:{receipt,state:'requested',cases:refund?[refundReceipt]:[]}});
 });
 await page.goto('/#projects');
 const library=page.locator('.projects-page');
 await expect(library.getByRole('heading',{name:'내 프로젝트'})).toBeVisible();
 await expect(library.getByRole('button',{name:'다운로드',exact:true})).toHaveCount(0);
 await expect(library.getByLabel('프로젝트 검색')).toBeVisible();
 await expect(library.locator('.delivery-preview')).toHaveCount(5);
 await expect(library.getByRole('button',{name:'원본 저장',exact:true})).toHaveCount(5);
 await expect(library.getByRole('button',{name:'정밀 편집',exact:true})).toHaveCount(5);
 expect(downloadRequests).toBeGreaterThan(0);
 await library.getByRole('button',{name:'광고 더 보기'}).click();
 await expect(library.locator('.delivery-preview')).toHaveCount(7);
 await expect(library.getByText('마지막 광고')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

 await expect(page.getByRole('button',{name:/보관함 검증/})).toBeVisible();
 await page.getByRole('button',{name:/메뉴 열기|Open menu/}).click();
 await expect(page.getByRole('link',{name:'개인정보처리방침',exact:true})).toHaveAttribute('href','https://www.selluplabs.com/privacy/');
 await expect(page.getByRole('link',{name:'자료 보관 안내',exact:true})).toHaveAttribute('href','/account-deletion.html');
 await page.getByRole('button',{name:/^회원탈퇴$|^Delete account$/}).click();
 const dialog=page.getByRole('dialog',{name:'회원 탈퇴'});
 await expect(dialog.getByRole('link',{name:'개인정보처리방침'})).toHaveCount(0);
 await expect(dialog.getByRole('link',{name:'삭제 범위와 보관 기간'})).toBeHidden();
 await dialog.getByText('탈퇴 전 확인사항',{exact:true}).click();
 await expect(dialog.getByRole('link',{name:'삭제 범위와 보관 기간'})).toBeVisible();
 await dialog.getByRole('checkbox').check();
 await dialog.getByRole('button',{name:'취소'}).click();
 expect(withdrawals).toBe(0);
 await page.getByRole('button',{name:/^회원탈퇴$|^Delete account$/}).click();
 await expect(dialog.getByRole('checkbox')).not.toBeChecked();
 if(refund)await dialog.getByRole('checkbox').check();
 const alert=page.waitForEvent('dialog');
 const submit=dialog.getByRole('button',{name:'탈퇴하기'}).click();
 const notice=await alert;
 expect(notice.message()).toBe('탈퇴 요청을 접수했습니다.\n삭제 처리번호 '+receipt+(refund?'\n환불 접수번호 '+refundReceipt:''));
 await notice.accept();await submit;
 await expect.poll(()=>withdrawals).toBe(1);
 await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});

test('policy links are discoverable without repeated footers',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.goto('/#login');
 await expect(page.getByRole('link',{name:'개인정보처리방침',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/자료 보관|탈퇴/})).toHaveCount(0);
 await protectedScreen(page,mockSession('clean-pages'));
 for(const route of ['home','create','projects','guide','editor']){
  await page.goto('/?member=clean#'+route);
  await expect(page.locator('.compact-workspace-header')).toBeVisible();
  await expect(page.locator('footer:visible')).toHaveCount(0);
  await expect(page.getByRole('link',{name:/자료 보관|회원탈퇴/})).toHaveCount(0);
 }
});
