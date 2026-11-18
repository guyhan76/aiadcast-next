import {test,expect} from '@playwright/test';
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
