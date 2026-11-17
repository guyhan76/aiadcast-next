import {test,expect} from '@playwright/test';
import {mockSession,protectedScreen} from './helpers/authenticated-session';

test('store build shows Play KRW prices, restores interrupted payments, and never opens web checkout',async({page})=>{
  await protectedScreen(page,mockSession('play-member'));
  let verifications=0,webOrders=0;
  const account='a'.repeat(64);
  await page.route('**/api/checkout/play/account',route=>route.fulfill({json:{enabled:true,accountId:account}}));
  await page.route('**/api/checkout/play/verify',route=>{
    expect(route.request().postDataJSON()).toEqual({token:'play-test-token'});
    verifications++;
    return route.fulfill({json:{state:'paid',balance:100,grantedCredits:100}});
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
  },account);
  await page.goto('/#checkout');
  await page.getByRole('button',{name:'₩9,900 · Google Play 결제'}).click();
  await expect(page.getByRole('status').filter({hasText:'결제 대기 중'})).toBeVisible();
  expect(verifications).toBe(0);
  await page.evaluate(()=>{if(!sessionStorage.getItem('pending-play'))throw Error('Missing pending purchase');sessionStorage.setItem('ready-play','yes');});
  await page.reload();
  await expect(page.getByRole('status').filter({hasText:'잔액 100 크레딧'})).toBeVisible();
  expect(verifications).toBeGreaterThan(0);expect(webOrders).toBe(0);
  await expect(page.getByText(/USD|표시 통화/)).toHaveCount(0);
});
