import {authenticatedTest as test,expect} from './helpers/authenticated';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('../src/assets/aiadcast-wordmark.svg',import.meta.url),'utf8');
test('all app wordmarks reuse official outlines and identical orange ai/triangle without recoloring controls',async({page},info)=>{
 await page.route(url=>url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/me',route=>route.fulfill({status:new URL(route.request().url()).pathname==='/api/account/capabilities'?200:401,contentType:'application/json',body:JSON.stringify({email:{enabled:false},checkout:{enabled:false},error:{code:'AUTH_REQUIRED'}})}));
 for(const route of ['home','create','projects','guide','login','signup','checkout','credits','checkout-return','admin','editor','verify','pay','payment-return']){
  await page.goto('/#'+route);const logos=page.locator('.brand-lockup');await expect(logos.first()).toBeAttached();
  for(const logo of await logos.all()){
   await expect(logo).toHaveAttribute('aria-label','aiadcast');await expect(logo.locator('svg')).toHaveCount(1);
   await expect(logo.locator('svg > g > g').nth(0)).toHaveCSS('fill','rgb(232, 114, 42)');
   await expect(logo.locator('svg > g > g').nth(1)).toHaveCSS('fill','rgb(31, 31, 29)');
   await expect(logo.locator('polygon')).toHaveCSS('fill','rgb(232, 114, 42)');
   expect(await logo.evaluate((el,source)=>{const expected=new DOMParser().parseFromString(source,'image/svg+xml');const details=(root:ParentNode)=>Array.from(root.querySelectorAll('path,polygon,g')).map(n=>({tag:n.tagName,d:n.getAttribute('d'),points:n.getAttribute('points'),fill:n.getAttribute('fill'),transform:n.getAttribute('transform')}));return JSON.stringify(details(el))===JSON.stringify(details(expected));},original)).toBe(true);
  }
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--brand-orange').trim())).toBe('#b65a35');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual((await page.viewportSize())!.width);
  if(['home','editor','verify','credits'].includes(route))await page.screenshot({path:info.outputPath('official-'+route+'-logo.png'),fullPage:true});
 }
});
