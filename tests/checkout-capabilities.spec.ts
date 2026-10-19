import {test,expect} from './helpers/authenticated';
const capabilities=(enabled:boolean)=>({email:{enabled:false},checkout:{enabled,test:true,currency:'KRW'}});
test('checkout distinguishes pending capability from explicitly disconnected without creating an order',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let posts=0;
 await page.route(url=>url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/me',async route=>{if(route.request().method()==='POST')posts++;if(new URL(route.request().url()).pathname==='/api/account/capabilities'){await gate;return route.fulfill({json:capabilities(false)});}return route.fulfill({json:{}});});
 await page.goto('/#checkout');await expect(page.getByRole('button',{name:'결제 상태 확인 중…',exact:true})).toBeDisabled();
 await page.getByRole('radio',{name:/묶음형/}).check();release();
 await expect(page.getByRole('button',{name:'테스트 결제 미연결',exact:true})).toBeDisabled();await expect(page.locator('#checkout-availability')).toContainText('기다려도 결제가 시작되지 않습니다');
 await expect(page.getByRole('radio',{name:/묶음형/})).toBeChecked();expect(posts).toBe(0);
});
for(const failure of ['http','malformed','timeout'] as const)test(`checkout ${failure} failure allows explicit read-only retry and preserves selected pack`,async({page})=>{
 let recovered=false,posts=0;let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 if(failure==='timeout')await page.clock.install();
 await page.route(url=>url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/me',async route=>{
  if(route.request().method()==='POST')posts++;
  if(new URL(route.request().url()).pathname!=='/api/account/capabilities')return route.fulfill({json:{}});
  if(recovered)return route.fulfill({json:capabilities(true)});
  if(failure==='timeout'){await gate;return route.fulfill({json:capabilities(false)}).catch(()=>{});}
  return route.fulfill({status:failure==='http'?503:200,json:failure==='http'?{error:{code:'UNAVAILABLE'}}:{checkout:{enabled:'true'}}});
 });
 await page.goto('/#checkout');await page.getByRole('radio',{name:/묶음형/}).check();
 if(failure==='timeout')await page.clock.fastForward(11000);
 await expect(page.getByRole('button',{name:'결제 상태 확인 실패',exact:true})).toBeDisabled();await expect(page.locator('#checkout-availability')).toContainText('확인하지 못했습니다');
 recovered=true;release();await page.getByRole('button',{name:'결제 연결 다시 확인',exact:true}).click();
 await expect(page.getByRole('button',{name:'이메일로 로그인하고 계속',exact:true})).toBeEnabled();await expect(page.locator('#checkout-availability')).toContainText('Toss 테스트 결제');
 await expect(page.getByRole('radio',{name:/묶음형/})).toBeChecked();expect(posts).toBe(0);
});
