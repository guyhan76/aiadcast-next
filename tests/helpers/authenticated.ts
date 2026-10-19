import {test as base,expect,type Page} from '@playwright/test';
// Editor regressions now run as signed-in users. Guest/auth-boundary tests opt out.
// This mocks the existing read-only auth endpoint, not a production bypass flag.
export const test=base.extend<{signedInEditor:boolean}>({
 signedInEditor:[false,{option:true}],
 page:async({page,signedInEditor},use)=>{
  if(signedInEditor)await page.addInitScript(()=>{if(!sessionStorage.getItem('editor-fixture-initialized')){if(!sessionStorage.getItem('aiadcast.beta-session'))sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'e'.repeat(43),expires:Date.now()+86400000,user:{id:'editor-fixture-user',label:'Editor fixture'}}));sessionStorage.setItem('editor-fixture-initialized','1');}});
  await page.route('**/api/auth/me',async r=>{let s;try{s=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')??'null'));}catch(e){if(!/Execution context was destroyed|Target page, context or browser has been closed/.test(String(e)))throw e;await r.abort().catch(()=>{});return;}const valid=s&&s.expires>Date.now()&&r.request().headers().authorization===`Bearer ${s.token}`;await r.fulfill({status:valid?200:401,json:valid?{user:s.user}:{error:{code:'AUTH_REQUIRED'}}});});
  await use(page);
 },
});
export const authenticatedTest=test.extend({signedInEditor:true});
export {expect};export type {Page};export type {Route} from '@playwright/test';
