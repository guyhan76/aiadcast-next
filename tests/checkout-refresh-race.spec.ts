import {authenticatedSession} from './helpers/authenticated-session';
import {test,expect} from '@playwright/test';

test('manual payment refresh during the initial read is retained; balance alone never proves the order paid',async({page})=>{
 const session={token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'checkout-race-user',label:'fixture@example.com'}};
 const order={id:'race-order-123',pack:'bundle',credits:30,amount:49900,currency:'KRW',state:'pending',created:Date.now(),test:true,checkoutUrl:'https://fixture.invalid/pay'};
 await page.addInitScript(({session,order})=>{sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(session));sessionStorage.setItem('aiadcast.checkout-order:'+session.user.id,JSON.stringify(order));},{session,order});
 // Freeze automatic polling: only the user's explicit refresh can observe the new state.
 await page.clock.install();await page.clock.pauseAt(new Date());
 let releaseInitial!:()=>void,releasePaid!:()=>void,reads=0,posts=0;
 const initial=new Promise<void>(r=>releaseInitial=r),paid=new Promise<void>(r=>releasePaid=r);
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;if(request.method()==='POST')posts++;
  if(path==='/api/account/capabilities')return route.fulfill({json:{email:{enabled:true},checkout:{enabled:true,test:true,currency:'KRW'}}});
  if(path==='/api/checkout/orders/'+order.id){const n=++reads;if(n===1){await initial;return route.fulfill({json:order});}await paid;return route.fulfill({json:{...order,state:'paid'}});}
  if(path==='/api/status')return route.fulfill({json:{mode:'invite-beta',commercialReady:false,generation:{enabled:false,reason:'GENERATION_DISABLED'},wallet:{available:30,reserved:0},budget:{limitMicros:0}}});
  if(path==='/api/projects')return route.fulfill({json:{projects:[]}});
  return route.fulfill({json:{}});
 });await authenticatedSession(page,session,{seed:false});
 await page.goto('/#checkout');await expect.poll(()=>reads).toBe(1);
 const check=page.getByRole('button',{name:'결제 상태 확인',exact:true});
 await check.evaluate(button=>{button.click();button.click();button.click();});
 releaseInitial();await expect(page.locator('.credit-balance')).toContainText('30개');
 await expect.poll(()=>reads).toBe(2);
 await expect(page.getByRole('heading',{name:'이용권이 추가되었습니다'})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.checkout-order:checkout-race-user')!).state)).toBe('pending');
 releasePaid();await expect(page.getByRole('heading',{name:'이용권이 추가되었습니다'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.checkout-order:checkout-race-user')!).state)).toBe('paid');
 expect(posts).toBe(0);
});
