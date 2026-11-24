import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));await protectedScreen(page,mockSession('checkout-capability-user'));});
const capabilities=(enabled:boolean)=>({email:{enabled:false},checkout:{enabled,test:true,currency:'KRW'}});
test('checkout distinguishes pending capability from explicitly disconnected without creating an order',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let posts=0;
 await page.route('**/api/**',async route=>{if(new URL(route.request().url()).pathname==='/api/auth/session')return route.fallback();if(route.request().method()==='POST')posts++;if(new URL(route.request().url()).pathname==='/api/account/capabilities'){await gate;return route.fulfill({json:capabilities(false)});}return route.fulfill({json:{}});});
 await page.goto('/#checkout');await expect(page.getByRole('button',{name:'결제 연결 확인 중…',exact:true})).toBeDisabled();
 await page.getByRole('radio',{name:/비즈니스/}).check();release();
 await expect(page.getByRole('button',{name:'결제 준비 중',exact:true})).toBeDisabled();await expect(page.locator('#checkout-availability')).toContainText('결제 준비 중');
 await expect(page.getByRole('radio',{name:/비즈니스/})).toBeChecked();expect(posts).toBe(0);
});
for(const failure of ['http','malformed','timeout'] as const)test(`checkout ${failure} failure allows explicit read-only retry and preserves selected pack`,async({page})=>{
 let recovered=false,posts=0;let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 if(failure==='timeout')await page.clock.install();
 await page.route('**/api/**',async route=>{if(new URL(route.request().url()).pathname==='/api/auth/session')return route.fallback();
  if(route.request().method()==='POST')posts++;
  if(new URL(route.request().url()).pathname!=='/api/account/capabilities')return route.fulfill({json:{}});
  if(recovered)return route.fulfill({json:capabilities(true)});
  if(failure==='timeout'){await gate;return route.fulfill({json:capabilities(false)}).catch(()=>{});}
  return route.fulfill({status:failure==='http'?503:200,json:failure==='http'?{error:{code:'UNAVAILABLE'}}:{checkout:{enabled:'true'}}});
 });
 await page.goto('/#checkout');await page.getByRole('radio',{name:/비즈니스/}).check();
 if(failure==='timeout')await page.clock.fastForward(11000);
 await expect(page.getByRole('button',{name:'결제 연결 다시 확인',exact:true})).toBeEnabled();await expect(page.locator('#checkout-availability')).toContainText('결제 연결을 확인할 수 없습니다');
 recovered=true;release();await page.getByRole('button',{name:'결제 연결 다시 확인',exact:true}).click();
 await expect(page.getByRole('button',{name:'결제',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:/이용권 수량/}).check();await expect(page.getByRole('button',{name:'결제',exact:true})).toBeEnabled();await expect(page.locator('#checkout-availability')).toContainText('테스트 결제 · 실제 청구 없음');
 await expect(page.getByRole('radio',{name:/비즈니스/})).toBeChecked();expect(posts).toBe(0);
});

test('checkout displays the full payment and keeps detailed refund terms available',async({page})=>{
 await page.goto('/#checkout');
 const total=page.getByRole('region',{name:'결제 확인'});
 await expect(total).toContainText('₩33,900');
 await expect(total).toContainText('부가세 포함 · 자동결제 없음');
 const refund=page.locator('.checkout-refund');
 await expect(refund.locator('p')).toBeHidden();
 await refund.locator('summary').click();
 await expect(refund.locator('p')).toContainText('생성 실패·중복 결제');
 await page.getByRole('button',{name:'연간',exact:true}).click();
 await expect(total).toContainText('₩310,800');
 await page.getByRole('button',{name:'크레딧 추가',exact:true}).click();
 await expect(total).toContainText('100크레딧 충전');
 await expect(total).not.toContainText('자동결제');
});
