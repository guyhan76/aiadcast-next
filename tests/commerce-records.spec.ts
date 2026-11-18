import {test,expect} from '@playwright/test';
import {mockSession,protectedScreen} from './helpers/authenticated-session';

test('administrator finds a retained receipt and records its resolution',async({page})=>{
 const admin=mockSession('commerce-admin','admin');
 await protectedScreen(page,admin);
 const caseId='20261118-0001',now='2026-11-18T00:00:00Z';let resolved=false;
 const record={case_id:caseId,category:'refund',order_no:'GPA.123',received_at:now,description:'부분 환불 문의',
  erase_at:'2029-11-18T00:00:00Z',member_id:'fixture-buyer',member_name:'구매 회원',member_email:'customer@example.test',requested_krw:900,payout_bank:'예시은행',payout_last4:'7890'};
 const order={order_no:'GPA.123',product:'credits_30',ads:3,purchased_at:now,erase_at:'2031-11-18T00:00:00Z',
  paid:'2700000000000',refunded:'900000000000',estimated:'900000000000',currency:'KRW',checked_at:now,
  delivered:1,remaining:2,returned:0,refund_requests:[now],refunds:[{at:now,nanos:'900000000000'}]};
 await page.route('**/api/membership/records/lookup',r=>{
  const {key}=r.request().postDataJSON();return r.fulfill({json:key===caseId?
   {orders:[order],cases:[{...record,resolution:resolved?'환불 확인 완료':null,resolved_at:resolved?now:null}]}:{orders:[],cases:[]}});
 });
 await page.route('**/api/membership/records/resolve',r=>{
  expect(r.request().postDataJSON()).toMatchObject({caseId,resolution:'환불 확인 완료',outcome:'original',amountKrw:900,reference:'refund-123'});resolved=true;return r.fulfill({json:{caseId}});
 });
 await page.goto('/#admin');const panel=page.locator('details.commerce-records');await panel.locator('summary').click();
 await expect(panel.getByText('문의 대리 접수')).toHaveCount(0);await panel.getByLabel('접수번호',{exact:true}).fill(caseId);await panel.getByRole('button',{name:'조회',exact:true}).click();
 await expect(panel.getByText('구매 회원',{exact:true})).toBeVisible();await expect(panel.getByText('customer@example.test')).toBeVisible();await expect(panel.getByText(/끝 4자리 7890/)).toBeVisible();
 await panel.getByLabel('처리 단계').selectOption('resolve');await panel.getByLabel('처리 방식').selectOption('original');
 await panel.getByLabel('실제 환불 금액 (원)').fill('900');await panel.getByLabel('처리 증빙번호').fill('refund-123');
 await panel.getByLabel('환불 실행 일시 (한국시간)').fill('2026-11-18T09:00');
 await panel.getByLabel('처리 결과').fill('환불 확인 완료');await panel.getByRole('button',{name:'처리 완료 저장',exact:true}).click();
 await expect(panel.getByText('환불 확인 완료',{exact:true})).toBeVisible();
});

test('member submits without an order number and sees a prominent receipt',async({page})=>{
 await protectedScreen(page,mockSession('wallet-receipt-member'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.route('**/api/account/credits',r=>r.fulfill({json:{wallet:{available:26,reserved:0,credits:{available:100,reserved:0}},orders:[],grants:[]}}));
 await page.route('**/api/membership/records/mine',r=>r.fulfill({json:{orders:[],cases:[]}}));
 await page.route('**/api/membership/records/cases',r=>{
  const b=r.request().postDataJSON();expect(b.orderNo).toBeNull();expect(b.description).toBe('문의드립니다.');
  return r.fulfill({json:{caseId:'20261118-0001'}});
 });
 await page.goto('/#credits');
 await expect(page.locator('.wallet-legacy')).toContainText('26개');
 for(const item of [page.getByRole('button',{name:'이용권 다시 조회'}),page.getByRole('link',{name:'광고 이미지 만들기',exact:true})]){
  await expect(item).toBeVisible();expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 }
 const panel=page.locator('details.commerce-records');
 await panel.locator('summary').first().click();await expect(panel.getByLabel(/주문번호/)).toHaveCount(0);
 await panel.getByLabel('접수 내용').fill('문의드립니다.');await panel.getByRole('button',{name:'접수하기',exact:true}).click();
 await expect(panel.locator('.case-confirmation')).toBeFocused();await expect(panel.locator('.case-confirmation strong')).toHaveText('20261118-0001');
});

test('pending payment shows one status and retries the original receipt without a new payment',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('aiadcast.ui-language','ko');
  sessionStorage.setItem('aiadcast.browser-checkout',JSON.stringify({orderId:'wallet-payment',ticket:'fixture-ticket'}));
 });
 let reads=0;const calls:string[]=[];
 await page.route('**/api/**',r=>{
  const pathname=new URL(r.request().url()).pathname;
  if(r.request().method()==='POST')calls.push(pathname);
  if(pathname==='/api/checkout/receipt'){
   if(++reads===1)return r.fulfill({status:409,json:{error:{code:'PAYMENT_UNCERTAIN'}}});
   return r.fulfill({json:{id:'wallet-payment',amount:9900,credits:100,unit:'credit-v2',state:'paid',receipt:{verified:true,grantedCredits:100,balance:110}}});
  }
  return r.fulfill({json:{}});
 });
 await page.goto('/#payment-return');const panel=page.locator('.payment-status-page');
 await expect(panel.getByRole('heading',{name:'결제 승인 확인'})).toBeVisible();await expect(panel.getByRole('status')).toContainText('다시 결제하지');
 await panel.getByRole('button',{name:'승인 결과 다시 확인'}).click();
 await expect(panel.getByRole('heading',{name:'결제 완료'})).toBeVisible();
 await expect(panel.locator('.payment-facts')).toContainText('9,900원');await expect(panel.locator('.payment-facts')).toContainText('110 크레딧');
 expect(calls).toEqual(['/api/checkout/receipt','/api/checkout/receipt']);
});

test('member supplements a refund destination and can read the dated final result after reload',async({page})=>{
 await protectedScreen(page,mockSession('payout-case-member'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 const caseId='20261118-0002',at='2026-11-18T02:00:00Z';let saved=false,closed=false;
 await page.route('**/api/account/credits',r=>r.fulfill({json:{wallet:{available:0,reserved:0},orders:[],grants:[]}}));
 await page.route('**/api/membership/records/mine',r=>r.fulfill({json:{orders:[],cases:[{case_id:caseId,category:'refund',order_no:null,description:'이용권 환불 문의',
  received_at:at,resolved_at:closed?at:null,resolution:closed?'이체 확인':null,payout_bank:saved?'예시은행':null,payout_last4:saved?'7890':null,
  events:closed?[{kind:'closed',at,detail:'이체 확인',outcome:'transfer',amount:1200,reference:'transfer-100',processed_at:at}]:[]}]}}));
 await page.route('**/api/membership/records/details',r=>{expect(r.request().postDataJSON()).toMatchObject({caseId,requestedKrw:1200,payout:{bank:'예시은행',holder:'예시회원',number:'001234567890'}});saved=true;return r.fulfill({json:{saved:true}});});
 await page.goto('/#credits');const panel=page.locator('details.commerce-records');await panel.locator('summary').first().click();
 await panel.getByRole('button',{name:'환불 정보 보완'}).click();const form=panel.locator('.case-card form');await form.getByLabel('환불 방법').selectOption('transfer');
 await form.getByLabel('환불 요청 금액',{exact:false}).fill('1200');await form.getByLabel('은행명').fill('예시은행');await form.getByLabel('예금주').fill('예시회원');await form.getByLabel('계좌번호').fill('001234567890');
 await form.getByRole('button',{name:'보완 내용 저장'}).click();await expect(panel.getByText('예시은행 · 끝 4자리 7890')).toBeVisible();
 closed=true;await page.reload();await panel.locator('summary').first().click();
 await expect(panel.getByText('계좌 환불 · 1,200원')).toBeVisible();await expect(panel.getByText('처리 증빙번호 transfer-100')).toBeVisible();await expect(panel.getByText(/환불 실행 일시/)).toBeVisible();
 await expect(panel.getByText('001234567890')).toHaveCount(0);
});
