import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('protected-mobile-shell'));});
for(const width of [1440,390])test(`centered mobile shell at viewport ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:960});let writes=0;
 await page.route('**/api/**',r=>{if(new URL(r.request().url()).pathname==='/api/auth/session')return r.fallback();if(r.request().method()!=='GET')writes++;return r.fulfill({json:{jobs:[],email:{enabled:false},generation:{enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0}}});});
 for(const route of ['home','create','projects','login']){
  await page.goto('/#'+route);await expect(page.locator('.app-header')).toBeVisible();
  const root=await page.locator('#root').boundingBox();expect(root!.width).toBe(Math.min(width,430));expect(root!.x).toBe((width-root!.width)/2);
  await expect(page.locator('.app-sidebar')).not.toBeVisible();await expect(page.locator('.mobile-app-nav')).toBeVisible();
  const nav=await page.locator('.mobile-app-nav').boundingBox();expect(nav!.x).toBeCloseTo(root!.x,0);expect(nav!.width).toBeCloseTo(root!.width,0);
  const header=await page.locator('.app-header').boundingBox();expect(header!.x).toBeGreaterThanOrEqual(root!.x);expect(header!.x+header!.width).toBeLessThanOrEqual(root!.x+root!.width+.5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 }
 await page.goto('/#home');await page.getByRole('button',{name:'이용 요금',exact:true}).click();const dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});await expect(dialog).toBeVisible();const rect=await dialog.boundingBox();expect(rect!.width).toBeLessThanOrEqual(Math.min(width-24,406));expect(rect!.x).toBeCloseTo((width-rect!.width)/2,0);expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(writes).toBe(0);
 await page.screenshot({path:info.outputPath(`shell-${width}.png`)});
});
