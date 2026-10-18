import {test,expect} from '@playwright/test';

test('all app wordmarks use orange ai across normal, editor and standalone account routes',async({page},info)=>{
 await page.route('**/api/**',route=>route.fulfill({status:new URL(route.request().url()).pathname==='/api/account/capabilities'?200:401,contentType:'application/json',body:JSON.stringify({email:{enabled:false},checkout:{enabled:false},error:{code:'AUTH_REQUIRED'}})}));
 for(const route of ['home','create','projects','guide','login','signup','checkout','admin','editor','verify','pay','payment-return']){
  await page.goto('/#'+route);const logos=page.locator('.brand-lockup,.wordmark');await expect(logos.first()).toBeAttached();
  for(const logo of await logos.all()){
   await expect(logo.locator('b')).toHaveText('ai');await expect(logo.locator('b')).toHaveCSS('color','rgb(255, 138, 0)');
   await expect(logo).toHaveCSS('color','rgb(23, 23, 23)');await expect(logo.locator('i')).toHaveCSS('border-left-color','rgb(182, 90, 53)');
  }
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--brand-orange').trim())).toBe('#b65a35');
  if(route==='editor'||route==='verify')await page.locator(route==='editor'?'.wordmark':'.account-brand').screenshot({path:info.outputPath('orange-'+route+'-logo.png')});
 }
});
