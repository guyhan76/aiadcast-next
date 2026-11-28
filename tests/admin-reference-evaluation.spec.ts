import {openWorkspaceMenu} from './helpers/workspace-menu';
import {test,expect} from '@playwright/test';
import {authenticatedSession,mockSession} from './helpers/authenticated-session';
test('historical photo analysis is absent and cannot mount or request analysis during admin navigation',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 let analysis=0,writes=0;
 await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;if(path.includes('evaluation')||path.includes('dimension-analysis'))analysis++;if(r.request().method()!=='GET')writes++;
 if(path==='/api/admin/overview')return r.fulfill({json:{readiness:{},budget:{limitMicros:0},users:[],jobs:[],orders:[],audit:[]}});
 if(path==='/api/admin/generations')return r.fulfill({json:{jobs:[],nextCursor:null}});return r.fulfill({status:404,json:{error:{code:'MOCK'}}});});
 await authenticatedSession(page,mockSession('photo-tools-admin','admin'));await page.goto('/#admin');await expect(page.locator('.admin-history')).toBeVisible();
 await expect(page.locator('.admin-reference-evaluation,.admin-advanced')).toHaveCount(0);await expect(page.locator('.admin-page input[type=file]')).toHaveCount(0);
 await page.getByRole('link',{name:'홈으로',exact:true}).click();await openWorkspaceMenu(page);await page.locator('.app-header').getByRole('link',{name:'관리자',exact:true}).click();await expect(page.locator('.admin-history')).toBeVisible();expect(analysis).toBe(0);expect(writes).toBe(0);
});
