import {test,expect,type Page} from '@playwright/test';
const native={versionName:'0.2.40-demo',versionCode:42,packageName:'com.selluplabs.aiadcast.next.demo'};
async function guest(page:Page){
 await page.addInitScript(native=>{(window as any).__AIADCAST_NATIVE_VERSION__=native;localStorage.setItem('aiadcast.ui-language','ko');},native);
 const calls:{path:string;method:string;authorization?:string}[]=[];
 await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;calls.push({path,method:r.request().method(),authorization:r.request().headers().authorization});return r.fulfill({status:path==='/api/version'?404:200,json:path==='/api/account/capabilities'?{email:{enabled:false},password:{enabled:true,test:true,adminReady:false},checkout:{enabled:false}}:path==='/api/auth/logout'?{signedOut:true}:{projects:[]}});});
 return calls;
}
test('app version is only in guide and account diagnostics are absent on ordinary screens',async({page})=>{
 const calls=await guest(page);
 for(const route of ['home','create','projects','guide','login','credits']){
  await page.goto('/#'+route);const badge=page.locator('[aria-label="앱 버전"]');
  await expect(page.locator('.account-drawer')).toHaveCount(0);await expect(page.getByRole('region',{name:'앱·서버 버전',exact:true})).toHaveCount(0);
  await expect(badge).toHaveCount(route==='guide'?1:0);
  if(route==='guide'){await expect(badge).toHaveText('앱 0.2.40-demo · 42');for(const width of [320,390]){await page.setViewportSize({width,height:844});await badge.scrollIntoViewIfNeeded();await expect(badge).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}}
 }
 expect(calls.some(c=>c.path==='/api/account/credits'||c.path==='/api/version')).toBe(false);
});
test('guest guide version does not depend on a server response or query a private account',async({page})=>{
 const calls=await guest(page);await page.goto('/#guide');await expect(page.locator('[aria-label="앱 버전"]')).toHaveText('앱 0.2.40-demo · 42');
 await page.goto('/#credits');await expect(page.getByRole('region',{name:'앱·서버 버전',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toHaveCount(0);
 expect(calls.some(c=>c.path==='/api/version'||c.path==='/api/account/credits')).toBe(false);expect(calls.every(c=>c.method==='GET')).toBe(true);
 await page.getByRole('link',{name:'돌아가기',exact:true}).click();await expect(page).toHaveURL(/#guide$/);
 await page.goto('/#credits');await page.evaluate(()=>window.dispatchEvent(new Event('aiadcast-native-back',{cancelable:true})));await expect(page).toHaveURL(/#guide$/);
 await page.goto('/#credits');await page.goBack();await expect(page).toHaveURL(/#guide$/);
});
test('sign-out clears private identity while the guide keeps installed app information',async({page})=>{
 const calls=await guest(page);await page.goto('/#guide');
 await page.evaluate(()=>{sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'public-version-user',label:'Private account label'}}));window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'home'}}));});
 await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toContainText('Private account label');
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toHaveCount(0);
 await page.goto('/#guide');await expect(page.locator('[aria-label="앱 버전"]')).toHaveText('앱 0.2.40-demo · 42');await expect(page.getByText('Private account label')).toHaveCount(0);expect(calls.some(c=>c.path==='/api/account/credits')).toBe(false);
});
test('standalone payment and account screens do not repeat version badges',async({page})=>{
 await guest(page);for(const route of ['verify','pay','payment-return','checkout-return']){await page.goto('/#'+route);await expect(page.locator('[aria-label="앱 버전"]')).toHaveCount(0);}
});
