import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,allowed=true){
 let generations=0,trialReads=0,finishes=0;const session={token:'t'.repeat(43),expires:Date.now()+86400000,user:{id:'trial-login-owner',label:'Fixture',role:'admin'}};
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname,auth=r.request().headers().authorization==='Bearer '+session.token,reply=(json:unknown,status=200)=>r.fulfill({json,status});
  if(p==='/api/generations'&&r.request().method()==='POST')generations++;
  if(p==='/api/account/capabilities')return reply({google:{enabled:true},email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}});
  if(p==='/api/auth/session')return auth?reply({user:session.user}):reply({error:{code:'AUTH_REQUIRED'}},401);
  if(p==='/api/auth/google/start')return reply({state:'trial-state',proof:'mock-proof',expires:Date.now()+600000,url:'https://accounts.google.com/o/oauth2/v2/auth?state=trial-state'});
  if(p==='/api/auth/google/finish'){finishes++;return reply(session);}
  if(p==='/api/admin/exact-text-trial'){trialReads++;return !auth?reply({error:{code:'AUTH_REQUIRED'}},401):allowed?reply({version:2,preparation:true,generationEnabled:false,reason:'PAID_TRIAL_NOT_APPROVED'}):reply({error:{code:'EXACT_TEXT_TRIAL_FORBIDDEN'}},403);}
  if(p==='/api/projects')return reply({projects:[]});return reply({error:{code:'MOCK_ONLY'}},503);
 });
 await page.route('https://accounts.google.com/**',r=>r.fulfill({contentType:'text/html',body:'<button id="finish">Finish mock Google login</button>'}));
 async function google(){await page.getByRole('button',{name:'Google로 계속하기'}).click();await page.locator('#finish').waitFor();await page.goto('http://127.0.0.1:4180/?google=1&state=trial-state&code=mock-code');}
 return {session,google,counts:()=>({generations,trialReads,finishes})};
}
test('same-tab Google sign-in returns to trial once, without generation; back/forward do not resubmit',async({page})=>{
 const s=await setup(page);await page.goto('/exact-text-trial');await expect(page.getByRole('button',{name:'로그인하고 시험으로 돌아오기'})).toBeVisible();expect(s.counts().trialReads).toBe(0);
 await page.getByRole('button',{name:'로그인하고 시험으로 돌아오기'}).evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(page).toHaveURL(/\/#login$/);await s.google();await expect(page).toHaveURL(/\/exact-text-trial$/);await expect(page.locator('input[type=file]')).toBeVisible();expect(s.counts().finishes).toBe(1);
 await page.getByRole('link',{name:'앱으로 돌아가기'}).click();await page.goBack();await expect(page.locator('input[type=file]')).toBeVisible();await page.goForward();expect(s.counts().finishes).toBe(1);expect(s.counts().generations).toBe(0);
 expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.login-destination'))).toBeNull();
});
test('server 401 clears expired session and offers same-tab login, never loops automatically',async({page})=>{
 const s=await setup(page);await page.addInitScript(()=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'z'.repeat(43),expires:Date.now()+600000,user:{id:'old-session-user',label:'Old'}})));await page.goto('/exact-text-trial');await expect(page.getByRole('button',{name:'로그인하고 시험으로 돌아오기'})).toBeVisible();expect(s.counts().trialReads).toBe(1);await expect(page).toHaveURL(/\/exact-text-trial#login$/);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();expect(s.counts().finishes).toBe(0);expect(s.counts().generations).toBe(0);
});
test('non-owner Google session stops at 403 instead of another login',async({page})=>{const s=await setup(page,false);await page.goto('/exact-text-trial');await page.getByRole('button',{name:'로그인하고 시험으로 돌아오기'}).click();await s.google();await expect(page.getByText('HTTP 403 · EXACT_TEXT_TRIAL_FORBIDDEN')).toBeVisible();await expect(page.getByRole('button',{name:'로그인하고 시험으로 돌아오기'})).toHaveCount(0);expect(s.counts().finishes).toBe(1);expect(s.counts().generations).toBe(0);});
test('cancelled login and untrusted destinations cannot redirect; normal login returns home',async({page})=>{const s=await setup(page);await page.goto('/exact-text-trial');await page.getByRole('button',{name:'로그인하고 시험으로 돌아오기'}).click();await page.goBack();await expect(page.getByRole('button',{name:'로그인하고 시험으로 돌아오기'})).toBeVisible();await page.getByRole('link',{name:'앱으로 돌아가기'}).click();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.login-destination'))).toBeNull();await page.evaluate(()=>sessionStorage.setItem('aiadcast.login-destination',JSON.stringify({target:'https://untrusted.invalid/',origin:location.origin,created:Date.now()})));await s.google();await expect(page).toHaveURL(/\/#home$/);expect(s.counts().generations).toBe(0);});
