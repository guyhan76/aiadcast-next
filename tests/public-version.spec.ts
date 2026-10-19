import {test,expect,type Page} from '@playwright/test';
const native={versionName:'0.2.40-demo',versionCode:42,packageName:'com.selluplabs.aiadcast.next.demo'};
async function guest(page:Page){
 await page.addInitScript(native=>{(window as any).__AIADCAST_NATIVE_VERSION__=native;localStorage.setItem('aiadcast.ui-language','ko');},native);
 const calls:{path:string;method:string;authorization?:string}[]=[];
 await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;calls.push({path,method:r.request().method(),authorization:r.request().headers().authorization});return r.fulfill({status:path==='/api/version'?404:200,json:path==='/api/account/capabilities'?{email:{enabled:false},password:{enabled:true,test:true,adminReady:false},checkout:{enabled:false}}:path==='/api/auth/logout'?{signedOut:true}:{projects:[]}});});
 return calls;
}
test('version lives in the guide, with no test connection badge on ordinary screens',async({page})=>{
 const calls=await guest(page);
 for(const route of ['home','create','projects','guide','login']){
  await page.goto('/#'+route);const badge=page.getByRole('link',{name:'앱·서버 버전 보기'});
  await expect(page.locator('.account-drawer')).toHaveCount(0);
  await expect(badge).toHaveCount(route==='guide'?1:0);
  if(route==='guide'){await expect(badge).toHaveText('앱 0.2.40-demo · 42');for(const width of [320,390]){await page.setViewportSize({width,height:844});await badge.scrollIntoViewIfNeeded();await expect(badge).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}}
 }
 expect(calls.some(c=>c.path==='/api/account/credits')).toBe(false);
});
test('guest detail survives server failure without account reads and returns to the originating screen',async({page})=>{
 const calls=await guest(page);await page.goto('/#guide');const badge=page.getByRole('link',{name:'앱·서버 버전 보기'});await badge.click();
 const info=page.getByRole('region',{name:'앱·서버 버전',exact:true});await expect(info).toContainText('0.2.40-demo (code 42)');await expect(info).toContainText('확인 불가');await expect(info).not.toContainText('응답 확인');await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toHaveCount(0);
 expect(calls.filter(c=>c.path==='/api/version')).toEqual([{path:'/api/version',method:'GET',authorization:undefined}]);expect(calls.some(c=>c.path==='/api/account/credits')).toBe(false);expect(calls.every(c=>c.method==='GET')).toBe(true);
 await page.getByRole('link',{name:'돌아가기',exact:true}).click();await expect(page).toHaveURL(/#guide$/);
 await badge.click();await page.evaluate(()=>window.dispatchEvent(new Event('aiadcast-native-back',{cancelable:true})));await expect(page).toHaveURL(/#guide$/);
 await badge.click();await page.goBack();await expect(page).toHaveURL(/#guide$/);
});
test('session transitions preserve a single public badge and guest detail cannot retain prior account data',async({page})=>{
 const calls=await guest(page);await page.goto('/#guide');
 await page.evaluate(()=>{sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'public-version-user',label:'Private account label'}}));window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'home'}}));});
 await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toContainText('Private account label');await page.goto('/#guide');await expect(page.getByRole('link',{name:'앱·서버 버전 보기'})).toHaveCount(1);
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toHaveCount(0);
 await page.goto('/#guide');await expect(page.getByRole('link',{name:'앱·서버 버전 보기'})).toHaveCount(1);const after=calls.length;await page.getByRole('link',{name:'앱·서버 버전 보기'}).click();await expect(page.getByRole('region',{name:'앱·서버 버전',exact:true})).toContainText('0.2.40-demo');await expect(page.getByText('Private account label')).toHaveCount(0);expect(calls.slice(after).some(c=>c.path==='/api/account/credits')).toBe(false);
});
test('standalone payment and account screens do not repeat version badges',async({page})=>{
 await guest(page);
 for(const route of ['verify','pay','payment-return','checkout-return']){
  await page.goto('/#'+route);const badge=page.getByRole('link',{name:'앱·서버 버전 보기'});await expect(badge).toHaveCount(0);
 }
});
