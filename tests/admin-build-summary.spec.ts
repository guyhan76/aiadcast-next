import {test,expect} from '@playwright/test';
import {authenticatedSession,mockSession} from './helpers/authenticated-session';
for(const language of ['ko','en'])test(`admin separates authentic build sources and excludes historical tools (${language})`,async({page})=>{
 let historicalReads=0,writes=0;
 await page.addInitScript(language=>{localStorage.setItem('aiadcast.ui-language',language);(window as any).__AIADCAST_NATIVE_VERSION__={versionName:'0.2.64-demo',versionCode:66,packageName:'com.selluplabs.aiadcast.next.demo'};},language);
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/account/capabilities')return route.fulfill({json:{google:{enabled:false},email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}}});if(route.request().method()!=='GET'){writes++;return route.fulfill({status:500,json:{}});}if(path==='/api/version')return route.fulfill({json:{schemaVersion:1,service:'aiadcast-next',version:'0.1.0',commit:'b'.repeat(40)}});if(path==='/api/admin/overview')return route.fulfill({json:{readiness:{},budget:{limitMicros:15000000,allocatedMicros:15000000,spentMicros:3973900,heldMicros:1500000},users:[],jobs:[],orders:[],audit:[]}});if(path.includes('evaluation'))historicalReads++;return route.fulfill({status:404,json:{error:{code:'MOCK'}}});});
 await authenticatedSession(page,mockSession('build-admin','admin'));await page.goto('/#admin');
 const version=page.locator('.app-version-info');await expect(version.locator('.version-summary')).toContainText('0.2.64-demo');await expect(version.locator('.version-summary')).toContainText(language==='ko'?'서버 연결 확인':'Server connected');
 await expect(version.locator('details')).not.toHaveAttribute('open');expect(historicalReads).toBe(0);await expect(page.locator('.admin-stats')).toContainText('$1.5000');
 await version.locator('summary').click();await expect(version).toContainText('0.1.0');await expect(version).toContainText('b'.repeat(40));const metadata=await (await page.request.get('/web-build.json')).json();expect(metadata.commit).toMatch(/^[a-f0-9]{40}$/);expect(metadata.commit).not.toBe('b'.repeat(40));await expect(version).toContainText(metadata.commit);expect(metadata.version).not.toBe('unknown');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await version.locator('summary').click();await expect(page.locator('.admin-advanced')).toHaveCount(0);expect(historicalReads).toBe(0);expect(writes).toBe(0);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`/tmp/admin-summary-${language}.png`});
});
