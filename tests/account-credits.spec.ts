import {openWorkspaceMenu,waitForSavedDraft} from './helpers/workspace-menu';
// Korean UI scenarios explicitly select Korean; English cases override this choice.
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));});
import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
const spacePhoto=await sharp({create:{width:80,height:60,channels:4,background:'#bca987'}}).png().toBuffer();
const session={token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'credits-user-123',label:'Mock member'}};
const snapshot={wallet:{available:34,reserved:2,kind:'test-credits'},orders:[{id:'order-1',credits:30,amount:39000,currency:'KRW',test:true,created:Date.now(),state:'paid'}],grants:[{id:'grant-1',credits:3,created:Date.now(),state:'completed'}]};
async function setup(page:Page){const writes:string[]=[];await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),session);await page.route('**/api/**',r=>{if(r.request().method()!=='GET')writes.push(r.request().url());const path=new URL(r.request().url()).pathname;return r.fulfill({contentType:'application/json',body:JSON.stringify(path==='/api/auth/session'?{user:session.user}:path==='/api/account/credits'?snapshot:path==='/api/generations'?{jobs:[]}:path==='/api/account/capabilities'?{email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}}:{projects:[]})});});return writes;}
test('header opens current credits and separate purchase action; purchase history is visible without technical or administrator details',async({page},info)=>{const writes=await setup(page);await page.goto('/');await openWorkspaceMenu(page);await page.locator('.app-header').getByRole('link',{name:'내 이용권',exact:true}).click();await expect(page).toHaveURL(/#credits$/);const panel=page.locator('.credits-page');await expect(panel.getByRole('heading',{name:'내 크레딧',exact:true})).toBeVisible();await expect(panel.locator('.credit-summary')).toContainText('34개');await expect(panel).not.toContainText('예약 중');await expect(panel).not.toContainText('API');const purchase=panel.locator('.wallet-history li').filter({hasText:'30개 기존 이용권'});await expect(purchase.getByText('결제 완료',{exact:true})).toBeVisible();await expect(panel.getByText('3개 · 지급 완료')).toHaveCount(0);await expect(panel.getByRole('status')).toContainText('조회 완료');await page.screenshot({path:info.outputPath('credits-34-mock.png'),fullPage:true});await panel.getByRole('link',{name:'크레딧 충전'}).click();await expect(page).toHaveURL(/#checkout$/);expect(writes).toEqual([]);});
test('refresh visibly waits, coalesces taps and distinguishes empty history from failed unknown balance',async({page})=>{const writes=await setup(page);await page.goto('/#credits');await expect(page.locator('.credit-summary')).toContainText('34개');let count=0;let release:()=>void=()=>{};const wait=new Promise<void>(r=>release=r);await page.route('**/api/account/credits',async r=>{count++;await wait;await r.fulfill({status:503,contentType:'application/json',body:'{}'});});await page.getByRole('button',{name:'이용권 다시 조회'}).click();await expect(page.getByRole('button',{name:'조회 중…',exact:true})).toBeDisabled();await expect(page.locator('.credit-summary')).toContainText('미조회');release();await expect(page.getByRole('alert')).toContainText('확인하지 못했습니다');expect(count).toBe(1);await expect(page.getByText('조회된 구매 내역이 없습니다.')).toHaveCount(0);await page.route('**/api/account/credits',r=>r.fulfill({json:{wallet:{available:34,reserved:0},orders:[],grants:[]}}));await page.getByRole('button',{name:'이용권 다시 조회'}).click();await expect(page.getByText('조회된 구매 내역이 없습니다.')).toBeVisible();expect(writes).toEqual([]);});
test('malformed purchase and expired authentication cannot become a false zero or crash',async({page})=>{await setup(page);await page.goto('/#create');await page.getByLabel('상품명',{exact:true}).fill('Private expired-account draft');await waitForSavedDraft(page);await page.route('**/api/account/credits',r=>r.fulfill({json:{...snapshot,orders:[{...snapshot.orders[0],amount:undefined}]}}));await openWorkspaceMenu(page);await page.locator('.app-header').getByRole('link',{name:'내 이용권',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.credit-summary')).toContainText('미조회');await page.route('**/api/account/credits',r=>r.fulfill({status:401,json:{error:{code:'AUTH_REQUIRED'}}}));await page.getByRole('button',{name:'이용권 다시 조회'}).click();await expect(page).toHaveURL(/#login$/);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();await expect(page.locator('.account-bar')).toHaveCount(0);await page.evaluate(()=>location.hash='create');await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeVisible();await expect(page.getByLabel('상품명',{exact:true})).toHaveCount(0);const drafts=await page.evaluate(()=>new Promise<{owner:string|undefined;guest:string|undefined}>((resolve,reject)=>{const request=indexedDB.open('aiadcast-workspace-drafts',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts'),store=tx.objectStore('drafts'),owner=store.get('credits-user-123'),guest=store.get('guest');tx.oncomplete=()=>{resolve({owner:owner.result?.wizard?.project.productName,guest:guest.result?.wizard?.project.productName});db.close();};tx.onerror=()=>reject(tx.error);};}));expect(drafts.owner).toBe('Private expired-account draft');expect(drafts.guest).not.toBe('Private expired-account draft');});
test('credit lookup times out and can retry without mutating wallet',async({page})=>{const writes=await setup(page);await page.clock.install();await page.route('**/api/account/credits',()=>{});await page.goto('/#credits');await expect(page.getByRole('button',{name:'이용권 다시 조회',exact:true})).toBeDisabled();await page.clock.fastForward(15001);await expect(page.getByRole('alert')).toContainText('15초');await expect(page.getByRole('button',{name:'이용권 다시 조회'})).toBeEnabled();expect(writes).toEqual([]);});
test('zero API allocation stays blocked after a GET-only refresh',async({page},info)=>{
 const writes=await setup(page);let checks=0,hold=false,release:()=>void=()=>{};
 await page.route('**/api/status',async r=>{checks++;if(hold)await new Promise<void>(resolve=>release=resolve);await r.fulfill({json:{mode:'invite-beta',commercialReady:false,generation:{batchVersion:1,enabled:false,reason:'BUDGET_NOT_AVAILABLE'},wallet:{available:34,reserved:0},budget:{limitMicros:0,spentMicros:0,heldMicros:0}}});});
 await page.goto('/#create');await page.getByRole('button',{name:'서비스',exact:true}).click();await page.getByRole('combobox',{name:'분야',exact:true}).selectOption('travel');await page.getByRole('combobox',{name:'세부 업종',exact:true}).selectOption('lodging');await page.getByRole('textbox',{name:'서비스명',exact:true}).fill('숲속 숙소');await page.getByRole('textbox',{name:'상세설명',exact:true}).fill('숲 전망의 객실');await page.getByLabel('참조사진 추가').setInputFiles({name:'space.png',mimeType:'image/png',buffer:spacePhoto});await page.getByRole('button',{name:'광고 생성',exact:true}).click();
 const blocked=page.getByText(/추가 결제로 해결되지 않습니다/);await expect(blocked).toBeVisible();const before=checks;hold=true;await page.getByRole('button',{name:'광고 생성',exact:true}).click();await expect.poll(()=>checks).toBe(before+1);await expect(page.getByRole('button',{name:'준비 중…',exact:true})).toBeDisabled();release();await expect(blocked).toBeVisible();expect(writes).toEqual([]);await page.screenshot({path:info.outputPath('budget-zero-rechecked-mock.png'),fullPage:true});
});
test('failed image readiness can recover without sending a generation request',async({page})=>{
 const writes=await setup(page);await page.clock.install();await page.route('**/api/status',r=>r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}));await page.goto('/#create');await page.getByRole('button',{name:'서비스',exact:true}).click();await page.getByRole('combobox',{name:'분야',exact:true}).selectOption('travel');await page.getByRole('combobox',{name:'세부 업종',exact:true}).selectOption('lodging');await page.getByRole('textbox',{name:'서비스명',exact:true}).fill('보존할 숙소');await page.getByRole('textbox',{name:'상세설명',exact:true}).fill('보존할 설명');await page.getByLabel('참조사진 추가').setInputFiles({name:'space.png',mimeType:'image/png',buffer:spacePhoto});await page.getByRole('button',{name:'광고 생성',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('접수 상태를 확인하지 못했습니다');
 await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,batchVersion:1},wallet:{available:34,reserved:0,credits:{available:0,reserved:0}},budget:{limitMicros:1000000}}}));
 await page.getByRole('button',{name:'광고 생성',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'광고 생성 확인'});
 await expect(dialog).toBeVisible();expect(writes).toEqual([]);
 await dialog.getByRole('button',{name:'취소'}).click();
 await expect(page.getByLabel('서비스명',{exact:true})).toHaveValue('보존할 숙소');

});

test('available new credits stay separate from legacy tickets and malformed balances remain unknown',async({page})=>{
 const writes=await setup(page);await page.route('**/api/account/credits',r=>r.fulfill({json:{...snapshot,wallet:{available:2,reserved:1,credits:{available:100,reserved:10}}}}));await page.goto('/#credits');const panel=page.locator('.credits-page');await expect(panel.locator('.credit-summary')).toContainText('100 크레딧');await expect(panel.locator('.wallet-legacy')).toContainText('2개');await expect(panel).not.toContainText('예약 중');await expect(panel).not.toContainText('102');
 await page.route('**/api/account/credits',r=>r.fulfill({json:{...snapshot,wallet:{available:2,reserved:1,credits:{available:-1,reserved:10}}}}));await panel.getByRole('button',{name:'이용권 다시 조회'}).click();await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.locator('.credit-summary')).toContainText('미조회');expect(writes).toEqual([]);
});
test('create image without a pending checkout resumes the saved draft without a payment or generation request',async({page})=>{
 const writes=await setup(page);await page.goto('/#create');await page.getByRole('textbox',{name:'상품명',exact:true}).fill('이어 만들 상품');await waitForSavedDraft(page);await openWorkspaceMenu(page);await page.locator('.app-header').getByRole('link',{name:'내 이용권',exact:true}).click();await page.locator('.credits-page').getByRole('link',{name:'광고 이미지 만들기',exact:true}).click();await expect(page).toHaveURL(/#create$/);await expect(page.getByRole('textbox',{name:'상품명',exact:true})).toHaveValue('이어 만들 상품');expect(writes).toEqual([]);
});
test('wallet shows payment outcomes and opens the creator directly with an unfinished checkout',async({page})=>{
 const writes=await setup(page),orderReads:string[]=[];
 await page.addInitScript(userId=>localStorage.setItem('aiadcast.checkout-continuation',JSON.stringify({userId,orderId:'unresolved-order',origin:location.origin,created:Date.now(),route:'create'})),session.user.id);
 await page.route('**/api/checkout/orders/*',route=>{orderReads.push(route.request().url());return route.fulfill({status:503});});
 await page.route('**/api/account/credits',route=>route.fulfill({json:{...snapshot,orders:[
  {...snapshot.orders[0],id:'paid-order',state:'paid'},
  {...snapshot.orders[0],id:'unresolved-order',state:'pending',providerStatus:'NO_APPROVAL'},
  {...snapshot.orders[0],id:'lookup-denied-order',state:'pending',providerStatus:'LOOKUP_DENIED'}
 ]}}));
 await page.goto('/#credits');
 const history=page.locator('.wallet-history');
 await expect(history.getByText('결제 완료',{exact:true})).toBeVisible();
 await expect(history.getByText('승인 내역 없음',{exact:true})).toBeVisible();
 await expect(history.getByText('승인 조회 불가',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'광고 이미지 만들기',exact:true}).click();
 await expect(page).toHaveURL(/#create$/);
 await expect(page.getByRole('textbox',{name:'상품명',exact:true})).toBeVisible();
 expect(orderReads).toEqual([]);expect(writes).toEqual([]);
});

test('plans screen opens both ad creators and cancels only the scheduled switch',async({page})=>{
 const writes=await setup(page);
 const cancellations:unknown[]=[];
 let selection:object|null={sourceId:'monthly-fixture',effectiveAt:Date.now()+86400000,due:false,pack:'plan-ultra-annual',amount:1402800};
 await page.route('**/api/checkout/annual-switch',route=>{
  if(route.request().method()==='POST'){
   cancellations.push(route.request().postDataJSON());
   selection=null;
  }
  return route.fulfill({json:{selection}});
 });
 await page.goto('/#checkout');
 const form=page.locator('.checkout-page');
 await expect(form.getByText('구독과 추가 구매 크레딧을 이미지와 영상에 함께 사용하세요.')).toHaveCount(0);
 const cancel=form.getByRole('button',{name:'전환 예약 취소',exact:true});
 await expect(cancel).toBeVisible();
 await expect(cancel).toHaveCSS('background-color','rgb(0, 0, 0)');
 await expect(cancel).toHaveCSS('color','rgb(255, 255, 255)');
 await expect(cancel).toHaveCSS('justify-content','center');
 expect(await cancel.evaluate(button=>Math.abs(button.getBoundingClientRect().width-button.parentElement!.clientWidth))).toBeLessThanOrEqual(1);
 await cancel.click();
 await expect(cancel).toHaveCount(0);
 expect(cancellations).toEqual([expect.objectContaining({sourceId:'monthly-fixture',pack:null,amount:null})]);
 await form.getByRole('link',{name:'광고 이미지 만들기',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'상품명',exact:true})).toBeVisible();
 await page.goto('/#checkout');
 await form.getByRole('link',{name:'광고 영상 만들기',exact:true}).click();
 await expect(page.getByRole('heading',{name:'광고 영상 만들기',exact:true})).toBeVisible();
 expect(writes).toEqual([]);
});
