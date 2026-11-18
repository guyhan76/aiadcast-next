import {test,expect} from '@playwright/test';
import {mockSession,protectedScreen} from './helpers/authenticated-session';

test('administrator finds a retained receipt and records its resolution',async({page})=>{
 const admin=mockSession('commerce-admin','admin');
 await protectedScreen(page,admin);
 const caseId='CS-receipt',now='2026-11-18T00:00:00Z';let resolved=false;
 const record={case_id:caseId,category:'refund',order_no:'GPA.123',received_at:now,description:'부분 환불 문의',
  erase_at:'2029-11-18T00:00:00Z'};
 const order={order_no:'GPA.123',product:'credits_30',ads:3,purchased_at:now,erase_at:'2031-11-18T00:00:00Z',
  paid:'2700000000000',refunded:'900000000000',estimated:'900000000000',currency:'KRW',checked_at:now,
  delivered:1,remaining:2,returned:0,refund_requests:[now],refunds:[{at:now,nanos:'900000000000'}]};
 await page.route('**/api/membership/records/lookup',r=>{
  const {key}=r.request().postDataJSON();return r.fulfill({json:key===caseId?
   {orders:[order],cases:[{...record,resolution:resolved?'환불 확인 완료':null,resolved_at:resolved?now:null}]}:{orders:[],cases:[]}});
 });
 await page.route('**/api/membership/records/resolve',r=>{
  expect(r.request().postDataJSON()).toEqual({caseId,resolution:'환불 확인 완료'});resolved=true;return r.fulfill({json:{caseId}});
 });
 await page.goto('/#admin');const panel=page.locator('details.commerce-records');await panel.locator('summary').click();
 await panel.getByLabel('주문번호 또는 접수번호').fill(caseId);await panel.getByRole('button',{name:'조회',exact:true}).click();
 await expect(panel.getByRole('heading',{name:'주문 GPA.123',exact:true})).toBeVisible();await expect(panel.getByText('₩2,700')).toBeVisible();
 await panel.getByLabel('처리 결과').fill('환불 확인 완료');await panel.getByRole('button',{name:'처리 완료',exact:true}).click();
 await expect(panel.getByText(/처리 결과 · 환불 확인 완료/)).toBeVisible();
});
