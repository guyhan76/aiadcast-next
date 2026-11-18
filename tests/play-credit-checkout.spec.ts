import {test,expect,type Page} from '@playwright/test';
import {mockSession,protectedScreen} from './helpers/authenticated-session';

test('store build shows Play KRW prices, restores interrupted payments, and never opens web checkout',async({page})=>{
  await protectedScreen(page,mockSession('play-member'));
  let verifications=0,webOrders=0,receipts=0;
  await page.route('**/api/membership/records/receipt-seen',r=>{expect(r.request().postDataJSON()).toEqual({orderNo:'GPA.test'});receipts++;return r.fulfill({json:{deadline:'2026-11-25T14:59:59.999Z'}});});
  const account='a'.repeat(64),policyAccount='b'.repeat(64);
  await page.route('**/api/checkout/play/account',route=>route.fulfill({json:{enabled:true,accountId:account,policyAccountId:policyAccount}}));
  await page.route('**/api/checkout/play/verify',route=>{
    expect(route.request().postDataJSON()).toEqual({token:'play-test-token'});
    verifications++;
    return route.fulfill({json:{state:'paid',balance:100,grantedCredits:100,policyReceipt:{orderNo:'GPA.test',ads:10,paid:'9900000000000',currency:'KRW',purchasedAt:'2026-11-18T03:00:00Z'}}});
  });
  await page.route('**/api/checkout/orders',route=>{webOrders++;return route.abort();});
  await page.addInitScript(id=>{
    localStorage.setItem('aiadcast.ui-language','ko');
    Object.assign(window,{__AIADCAST_NATIVE_VERSION__:{versionName:'0.2.110',versionCode:112,packageName:'com.selluplabs.aiadcast.next'},
      AiadcastNative:{postMessage:(message:string)=>{
        const req=JSON.parse(message);
        const emit=(detail:object)=>window.dispatchEvent(new CustomEvent('aiadcast-play',{detail}));
        if(req.type==='play-catalog')emit({type:'catalog',products:[{id:'credits_100',price:'₩9,900'}]});
        if(req.type==='play-buy'){if(req.account!==id||req.product!=='credits_100')throw Error('Unexpected purchase');
          sessionStorage.setItem('pending-play','yes');emit({type:'pending',account:id});}
        if(req.type==='play-restore'&&sessionStorage.getItem('ready-play')){
          emit({type:'purchase',account:id,token:'play-test-token'});
        }
      }}});
  },policyAccount);
  await page.goto('/#checkout');
  const pay=page.getByRole('button',{name:'₩9,900 · Google Play 결제'});
  await expect(pay).toBeDisabled();
  await page.getByLabel('이용권 수량, 금액과 환불 조건을 확인했습니다').check();
  await pay.click();
  await expect(page.getByRole('status').filter({hasText:'결제 대기 중'})).toBeVisible();
  expect(verifications).toBe(0);
  await page.evaluate(()=>{if(!sessionStorage.getItem('pending-play'))throw Error('Missing pending purchase');sessionStorage.setItem('ready-play','yes');});
  await page.reload();
  await expect(page.getByRole('status').filter({hasText:'잔액 100 크레딧'})).toBeVisible();
  await expect(page.getByText('단순 변심 환불 신청 마감',{exact:true})).toBeVisible();expect(receipts).toBeGreaterThan(0);
  expect(verifications).toBeGreaterThan(0);expect(webOrders).toBe(0);
  await expect(page.getByText(/USD|표시 통화/)).toHaveCount(0);
});

test('an open wallet replaces an older read when Play restores a paid purchase',async({page})=>{
  await protectedScreen(page,mockSession('play-wallet-member'));
  const account='a'.repeat(64);
  await page.route('**/api/checkout/play/account',route=>route.fulfill({json:{enabled:true,accountId:account}}));
  await page.addInitScript(()=>{
    localStorage.setItem('aiadcast.ui-language','ko');
    Object.assign(window,{
      __AIADCAST_NATIVE_VERSION__:{versionName:'0.2.113',versionCode:115,packageName:'com.selluplabs.aiadcast.next'},
      AiadcastNative:{postMessage:(message:string)=>{
        if(JSON.parse(message).type==='play-restore')document.documentElement.dataset.playReady='yes';
      }},
    });
  });
  const wallet=(credits:number)=>({wallet:{kind:'customer-ads',available:0,reserved:0,credits:{available:credits,reserved:0}},sales:[],orders:[],grants:[]});
  let walletReads=0,verifications=0;
  let finishOldRead!:()=>void;
  const oldRead=new Promise<void>(done=>{finishOldRead=done;});
  await page.route('**/api/account/credits',async route=>{
    if(++walletReads===1){
      await oldRead;
      await route.fulfill({json:wallet(10)}).catch(()=>{ /* The pre-purchase request was aborted. */ });
      return;
    }
    await route.fulfill({json:wallet(190)});
  });
  await page.route('**/api/checkout/play/verify',route=>{
    expect(route.request().postDataJSON()).toEqual({token:'retired-pack-receipt'});
    verifications++;
    return route.fulfill({json:{state:'paid',grantedCredits:180,balance:190}});
  });
  try{
    await page.goto('/#credits');
    await expect.poll(()=>walletReads).toBe(1);
    await page.waitForFunction(()=>document.documentElement.dataset.playReady==='yes');
    await page.evaluate(id=>{
      const emit=(detail:object)=>window.dispatchEvent(new CustomEvent('aiadcast-play',{detail}));
      emit({type:'pending',account:id});
      emit({type:'purchase',account:'other-account',token:'other-receipt'});
      emit({type:'purchase',account:id,token:'retired-pack-receipt'});
      emit({type:'purchase',account:id,token:'retired-pack-receipt'});
    },account);
    const balance=page.locator('.credit-summary dd');
    await expect(balance).toHaveText('광고 19장');
    finishOldRead();
    await expect(balance).toHaveText('광고 19장');
    expect(walletReads).toBe(2);
    expect(verifications).toBe(1);
  }finally{finishOldRead();}
});

async function interruptedCheckout(page: Page) {
  const member = mockSession('member-with-interrupted-purchase');
  const account = 'd'.repeat(64);
  await protectedScreen(page, member);
  await page.route('**/api/checkout/play/account', route => route.fulfill({
    json: {enabled: true, accountId: account, policyAccountId: account}
  }));
  await page.addInitScript(account => {
    localStorage.setItem('aiadcast.ui-language', 'ko');
    Object.assign(window, {
      __AIADCAST_NATIVE_VERSION__: {versionName: '0.2.113', versionCode: 115, packageName: 'com.selluplabs.aiadcast.next'},
      AiadcastNative: {postMessage(message: string) {
        const request = JSON.parse(message);
        const emit = (detail: object) => window.dispatchEvent(new CustomEvent('aiadcast-play', {detail}));
        if (request.type === 'play-catalog') emit({type: 'catalog', products: [{id: 'credits_30', price: '₩3,300'}]});
        // The server consumed the purchase, so Play has nothing left to restore.
        if (request.type === 'play-restore') {
          const ui = document.documentElement.dataset;
          ui.restores = String(Number(ui.restores || 0) + 1);
        }
        if (request.type === 'play-buy') {
          const ui = document.documentElement.dataset;
          ui.buys = String(Number(ui.buys || 0) + 1);
          emit({type: 'purchase', account, token: 'interrupted-play-receipt'});
        }
      }}
    });
  }, account);
  return member;
}

async function buyThreeAds(page: Page) {
  await page.goto('/#checkout');
  await expect(page.locator('html')).toHaveAttribute('data-restores', /[1-9]/);
  await page.getByLabel('이용권 수량, 금액과 환불 조건을 확인했습니다').check();
  await page.getByRole('button', {name: '₩3,300 · Google Play 결제'}).click();
}

test('retry confirms a consumed purchase after the verification response is lost', async ({page}) => {
  const member = await interruptedCheckout(page);
  let requests = 0;
  await page.route('**/api/checkout/play/verify', async route => {
    expect(route.request().headers().authorization).toBe('Bearer ' + member.token);
    expect(route.request().postDataJSON()).toEqual({token: 'interrupted-play-receipt'});
    if (++requests === 1) return route.abort('connectionreset');
    return route.fulfill({json: {state: 'paid', balance: 30, grantedCredits: 30}});
  });
  await buyThreeAds(page);
  await expect(page.getByRole('status').filter({hasText: '구매 확인이 지연'})).toBeVisible();
  await page.getByRole('button', {name: '구매 내역 다시 확인'}).click();
  await expect(page.getByRole('status').filter({hasText: '광고 3장'})).toBeVisible();
  const before = await page.locator('html').getAttribute('data-restores');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => page.locator('html').getAttribute('data-restores')).not.toBe(before);
  expect(requests).toBe(2);
  await expect(page.locator('html')).toHaveAttribute('data-buys', '1');
});

test('another signed-in member never retries a previous member’s interrupted purchase', async ({page}) => {
  const first = await interruptedCheckout(page);
  const second = mockSession('member-after-account-switch', 'member', 'b');
  const owners: string[] = [];
  await page.route('**/api/auth/session', route => route.fulfill({json: {
    user: route.request().headers().authorization === 'Bearer ' + second.token ? second.user : first.user
  }}));
  await page.route('**/api/checkout/play/verify', route => {
    owners.push(route.request().headers().authorization);
    return route.abort('connectionreset');
  });
  await buyThreeAds(page);
  await expect(page.getByRole('status').filter({hasText: '구매 확인이 지연'})).toBeVisible();
  const before = await page.locator('html').getAttribute('data-restores');
  await page.evaluate(session => {
    sessionStorage.setItem('aiadcast.beta-session', JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('aiadcast-session-change', {detail: {returnPage: 'checkout'}}));
  }, second);
  await expect.poll(() => page.locator('html').getAttribute('data-restores')).not.toBe(before);
  expect(owners).toEqual(['Bearer ' + first.token]);
});

test('a refused receipt is not replayed on reconnect', async ({page}) => {
  await interruptedCheckout(page);
  let requests = 0;
  await page.route('**/api/checkout/play/verify', route => {
    requests++;
    return route.fulfill({status: 409, json: {error: {code: 'PLAY_PURCHASE_NOT_ELIGIBLE'}}});
  });
  await buyThreeAds(page);
  await expect(page.getByRole('status').filter({hasText: '구매 계정과 주문 상태'})).toBeVisible();
  const before = await page.locator('html').getAttribute('data-restores');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => page.locator('html').getAttribute('data-restores')).not.toBe(before);
  expect(requests).toBe(1);
});
