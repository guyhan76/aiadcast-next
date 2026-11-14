import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {protectedScreen,mockSession} from './helpers/authenticated-session';

test('supplied wordmark outlines and orange fills survive protected and standalone routes; guest login uses aiadcast',async({page},info)=>{
 await page.route('**/api/**',r=>r.fulfill({json:{google:{enabled:false},email:{enabled:false},checkout:{enabled:false}}}));
 await page.goto('/#login');await expect(page.getByRole('heading',{name:'aiadcast',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeDisabled();
 const source=await readFile('src/assets/aiadcast-wordmark.svg','utf8');
 await protectedScreen(page,mockSession('brand-fixture'));
 await page.goto('/?fixture=brand#home');
 const expected=await page.evaluate(svg=>{const doc=new DOMParser().parseFromString(svg,'image/svg+xml');return [...doc.querySelectorAll('path')].map(p=>[p.getAttribute('d'),p.getAttribute('transform'),p.parentElement?.getAttribute('fill')]);},source);
 for(const route of ['home','create','projects','guide','login','signup','checkout','admin','editor','pay','payment-return']){
  await page.goto('/?fixture=brand#'+route);const logos=page.locator('.brand-lockup');await expect(logos.first()).toBeAttached();
  for(const logo of await logos.all()){
   await expect(logo).toHaveAttribute('aria-label','aiadcast');await expect(logo.locator('svg')).toHaveAttribute('viewBox','83.43 83.43 1013.14 174.6');
   expect(await logo.locator('path').evaluateAll(paths=>paths.map(p=>[p.getAttribute('d'),p.getAttribute('transform'),p.parentElement?.getAttribute('fill')]))).toEqual(expected);
   await expect(logo.locator('g[fill="#E8722A"] path')).toHaveCount(2);
  }
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--brand-orange').trim())).toBe('#b65a35');
  if(route==='editor')await page.locator('.wordmark').screenshot({path:info.outputPath('supplied-editor-logo.png')});
 }
 await page.goto('/?fixture=brand#verify');await expect(page.getByRole('heading',{name:'이메일 인증',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'이메일 인증하기',exact:true})).toBeDisabled();
});
