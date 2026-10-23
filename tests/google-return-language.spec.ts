import {test,expect} from '@playwright/test';
import {googleReturnPage} from '../server/google-return-page.mjs';
const pkg='com.selluplabs.aiadcast.next.demo';
for(const language of ['en','ko'] as const){
 test(`native return uses original wordmark and ${language} copy`,async({page},info)=>{
  await page.route('**/*',r=>r.request().url().endsWith('/mock-native-return')?r.fulfill({contentType:'text/html',body:googleReturnPage(pkg+'://google/return',language)}):r.abort());
  await page.goto('/mock-native-return');await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.getByRole('link',{name:language==='ko'?'aiadcast로 돌아가기':'Return to aiadcast'})).toHaveAttribute('href',pkg+'://google/return');await expect(page.locator('h1 svg')).toBeVisible();expect(await page.locator('h1 svg g[fill="#E8722A"]').count()).toBe(1);expect(await page.locator('h1 svg g[fill="#1F1F1D"]').count()).toBe(1);expect(await page.locator('h1 polygon').getAttribute('fill')).toBe('#E8722A');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);await page.screenshot({path:info.outputPath('native-return-'+language+'.png')});
 });
 for(const native of [false,true])test(`${native?'Android':'web'} sends explicitly selected ${language} without changing auth proof`,async({page})=>{
  let sent:any;
  await page.addInitScript(({language,native,pkg})=>{localStorage.setItem('aiadcast.ui-language',language);if(native){(window as any).__AIADCAST_API_ORIGIN__='https://beta.example.com';(window as any).__AIADCAST_GOOGLE_NATIVE__={version:1,packageId:pkg};(window as any).AiadcastNative={postMessage(){}};}},{language,native,pkg});
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1'&&u.hostname!=='beta.example.com')return r.fulfill({contentType:'text/html',body:'Mock Google chooser'});if(!u.pathname.startsWith('/api/'))return r.continue();if(u.pathname==='/api/account/capabilities')return r.fulfill({json:{google:{enabled:true}}});if(u.pathname==='/api/auth/google/start'){sent=r.request().postDataJSON();return r.fulfill({json:{state:'s'.repeat(43),proof:'p'.repeat(43),expires:Date.now()+600000,...(native?{native:true}:{}),url:'https://accounts.google.com/o/oauth2/v2/auth?prompt=select_account'}});}if(u.pathname==='/api/auth/google/native-poll')return r.fulfill({json:{state:'pending'}});return r.fulfill({status:503,json:{error:{code:'UNMOCKED'}}});});
  await page.goto('/');await page.getByRole('button',{name:language==='ko'?'Google로 계속하기':'Continue with Google',exact:true}).click();await expect.poll(()=>sent).toEqual({language,...(native?{packageId:pkg}:{})});
 });
}
