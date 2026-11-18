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
  received_at:at,resolved_at:closed?at:null,resolution:closed?'이체 확인':null,bank_requested:true,payout_bank:saved?'예시은행':null,payout_last4:saved?'7890':null,
  events:closed?[{kind:'member',at,detail:'환불계좌 보완',bank:'예시은행',last4:'7890',event_key:'entered',has_account:true},{kind:'closed',at,detail:'이체 확인',outcome:'transfer',amount:1200,reference:'transfer-100',processed_at:at,bank:'예시은행',last4:'6789',event_key:'sent',has_account:true}]:[]}]}}));
 await page.route('**/api/membership/records/history-account',r=>{
  const {caseId:id,eventKey}=r.request().postDataJSON();expect(id).toBe(caseId);
  return r.fulfill({json:{bank:'예시은행',holder:eventKey==='entered'?'신청 예금주':'이체 예금주',number:eventKey==='entered'?'001234567890':'000123456789'}});
 });
 await page.route('**/api/membership/records/details',r=>{expect(r.request().postDataJSON()).toMatchObject({caseId,payout:{bank:'예시은행',holder:'예시회원',number:'001234567890'}});saved=true;return r.fulfill({json:{saved:true}});});
 await page.goto('/#credits');const panel=page.locator('details.commerce-records');await panel.locator('summary').first().click();
 await panel.getByRole('button',{name:'환불계좌 등록'}).click();const form=panel.locator('.case-card form');
 await form.getByLabel('은행명').fill('예시은행');await form.getByLabel('예금주').fill('예시회원');await form.getByLabel('계좌번호').fill('001234567890');
 await form.getByRole('button',{name:'보완 내용 저장'}).click();await expect(panel.getByText('예시은행 · 끝 4자리 7890')).toBeVisible();
 closed=true;await page.reload();await panel.locator('summary').first().click();
 await expect(panel.getByText('계좌 환불 · 1,200원')).toBeVisible();await expect(panel.getByText('처리 증빙번호 transfer-100')).toBeVisible();await expect(panel.getByText(/환불 실행 일시/)).toBeVisible();
 await expect(panel.getByText('001234567890')).toHaveCount(0);
 const entered=panel.getByRole('region',{name:'신청자가 등록한 환불계좌'}),paid=panel.getByRole('region',{name:'이체 확인 계좌'});
 for(const [section,holder,account] of [[entered,'신청 예금주','001234567890'],[paid,'이체 예금주','000123456789']] as const){
  await section.getByRole('button',{name:'계좌 상세 보기'}).click();
  for(const value of ['예시은행',holder,account,'1,200원'])await expect(section.getByText(value,{exact:true})).toBeVisible();
  await section.getByRole('button',{name:'계좌 상세 숨기기'}).click();await expect(section.getByText(account)).toHaveCount(0);
 }
});

test('member requests the entire paid balance without typing an amount, order or bank',async({page})=>{
 await protectedScreen(page,mockSession('balance-refund-member'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 const balance={paidOrders:2,krw:12600,items:[{orderNo:'a',amountKrw:6600},{orderNo:'b',amountKrw:6000}]};
 await page.route('**/api/membership/records/mine',r=>r.fulfill({json:{orders:[],cases:[],refundBalance:balance}}));
 await page.route('**/api/membership/records/cases',r=>{
  expect(r.request().postDataJSON()).toMatchObject({category:'refund',balanceRefund:true,orderNo:null});
  expect(r.request().postDataJSON()).not.toHaveProperty('requestedKrw');return r.fulfill({json:{caseId:'20261118-0004'}});
 });
 await page.goto('/#credits');const panel=page.locator('details.commerce-records');await panel.locator('summary').first().click();
 await panel.getByLabel('유형').selectOption('refund');await expect(panel.getByText('12,600원')).toBeVisible();
 await expect(panel.getByLabel('환불 방법')).toHaveCount(0);await expect(panel.getByLabel('은행명')).toHaveCount(0);
 await panel.getByRole('button',{name:'환불 검토 요청하기'}).click();await expect(panel.locator('.case-confirmation strong')).toHaveText('20261118-0004');
});

test('expired ordinary refund keeps credits and allows a documented exception',async({page})=>{
 await protectedScreen(page,mockSession('expired-refund-member'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 const refundBalance={paidOrders:1,items:[],krw:0,expired:[{orderNo:'paid',deadline:'2026-11-25T14:59:59.999Z'}]};
 await page.route('**/api/membership/records/mine',r=>r.fulfill({json:{orders:[],cases:[],refundBalance}}));
 await page.route('**/api/membership/records/cases',r=>{
  expect(r.request().postDataJSON()).toMatchObject({refundReason:'exception',description:'결제가 두 번 되었습니다.'});
  return r.fulfill({json:{caseId:'20261118-0007'}});
 });
 await page.goto('/#credits');const panel=page.locator('details.commerce-records');await panel.locator('summary').first().click();
 await panel.getByLabel('유형').selectOption('refund');const submit=panel.getByRole('button',{name:'환불 검토 요청하기'});
 await expect(submit).toBeDisabled();await expect(panel.getByText(/남은 이용권은 계속 사용할 수 있습니다/)).toBeVisible();
 await panel.getByLabel('환불 사유').selectOption('exception');await panel.getByLabel('접수 내용').fill('결제가 두 번 되었습니다.');
 await submit.click();await expect(panel.locator('.case-confirmation strong')).toHaveText('20261118-0007');
});

test('admin supplements a legacy transfer from a receipt without changing the refund amount',async({page})=>{
 await protectedScreen(page,mockSession('payout-history-admin','admin'));let saved=false;
 const caseId='20261118-0001',at='2026-11-18T07:00:00Z',reference='transfer-legacy';
 const legacy={kind:'member',at,detail:'환불계좌 예시은행 끝 4자리 5968 보완'};
 const paid={kind:'closed',at,detail:'이체 완료',outcome:'transfer',amount:9900,reference};
 await page.route('**/api/membership/records/lookup',r=>r.fulfill({json:{orders:[],cases:[{case_id:caseId,category:'refund',received_at:at,resolution:'이체 완료',erase_at:at,events:saved?[legacy,paid,{kind:'transfer_account',at,detail:'증빙 보완',actor:'담당자',amount:9900,reference,event_key:'proof',has_account:true,bank:'예시은행',last4:'5968'}]:[legacy,paid]}]}}));
 await page.route('**/api/membership/records/transfer-account',r=>{expect(r.request().postDataJSON()).toMatchObject({caseId,reference,payout:{bank:'예시은행',holder:'테스트 예금주',number:'000000005968'}});saved=true;return r.fulfill({json:{saved:true}});});
 await page.goto('/#admin');const panel=page.locator('details.commerce-records');await panel.locator('summary').first().click();
 const entry=panel.getByRole('region',{name:'신청자가 등록한 환불계좌'});await expect(entry.getByText('보관 기록 없음')).toBeVisible();await expect(entry.getByText('9,900원')).toBeVisible();
 await panel.getByRole('button',{name:'이체확인증으로 계좌 보완'}).click();
 await panel.getByLabel('은행명').fill('예시은행');await panel.getByLabel('계좌번호').fill('000000005968');await panel.getByLabel('예금주').fill('테스트 예금주');
 await panel.getByLabel('이체확인증의 증빙번호').fill(reference);await panel.getByRole('button',{name:'계좌 증빙 저장'}).click();
 await expect(panel.getByText('이체 계좌 증빙 보완',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'이체확인증으로 계좌 보완'})).toHaveCount(0);
});

test('admin records the actual transfer destination even when it differs from the applicant account',async({page})=>{
 await protectedScreen(page,mockSession('actual-destination-admin','admin'));
 const caseId='20261118-0003',at='2026-11-18T01:00:00Z';let settled=false;
 await page.route('**/api/membership/records/lookup',r=>r.fulfill({json:{orders:[],cases:[{case_id:caseId,category:'refund',received_at:at,erase_at:at,payout_bank:'예시은행',payout_last4:'0000',resolution:settled?'이체 완료':null,events:[]}]}}));
 await page.route('**/api/membership/records/payout',r=>r.fulfill({json:{bank:'예시은행',number:'00010000000',holder:'신청인'}}));
 await page.route('**/api/membership/records/resolve',r=>{expect(r.request().postDataJSON()).toMatchObject({caseId,outcome:'transfer',amountKrw:9900,reference:'proof-001',transferPayout:{bank:'예시은행',number:'00010001111',holder:'이체 예금주'}});settled=true;return r.fulfill({json:{caseId}});});
 await page.goto('/#admin');const panel=page.locator('details.commerce-records');await panel.locator('summary').first().click();
 await panel.getByLabel('처리 단계').selectOption('resolve');await panel.getByLabel('처리 방식').selectOption('transfer');
 await panel.getByRole('button',{name:'신청자가 등록한 계좌 불러오기'}).click();
 await expect(panel.getByLabel('계좌번호',{exact:true})).toHaveValue('00010000000');
 await panel.getByLabel('계좌번호',{exact:true}).fill('00010001111');await panel.getByLabel('예금주').fill('이체 예금주');
 await panel.getByLabel('실제 환불 금액').fill('9900');await panel.getByLabel('환불 실행 일시').fill('2026-11-18T10:00');
 await panel.getByLabel('처리 증빙번호').fill('proof-001');await panel.getByLabel('처리 결과').fill('이체 완료');
 await panel.getByRole('button',{name:'처리 완료 저장'}).click();await expect(panel.locator('.case-state')).toHaveText('처리 완료');
});
