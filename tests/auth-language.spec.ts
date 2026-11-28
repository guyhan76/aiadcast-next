import {test,expect} from '@playwright/test';
test.use({locale:'ko-KR'});
test.beforeEach(async({page})=>{
 await page.context().route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1')return r.abort();if(!u.pathname.startsWith('/api/'))return r.continue();if(u.pathname==='/api/account/capabilities')return r.fulfill({json:{google:{enabled:true},email:{enabled:true},password:{enabled:true,test:true,adminReady:true,adminEmail:'owner@example.com'},checkout:{enabled:false,test:true,currency:'KRW'}}});return r.fulfill({status:400,json:{error:{code:'EMAIL_TOKEN_INVALID'}}});});
});
test('fresh Korean browser starts in English; explicit Korean and English choices persist',async({page},info)=>{
 await page.goto('/');await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeEnabled();await page.screenshot({path:info.outputPath('english-login.png')});
 await page.getByRole('combobox',{name:'App language',exact:true}).selectOption('ko');await page.reload();await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();await page.getByRole('combobox',{name:'앱 언어',exact:true}).selectOption('en');await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
});
test('recovery, admin password and invalid verification remain English without changing tokens',async({page})=>{
 await page.goto('/#account-recovery');await expect(page.getByRole('button',{name:'Send verification email',exact:true})).toBeVisible();await page.getByRole('button',{name:'Sign in with existing password'}).click();await page.getByRole('button',{name:'Administrator sign-in',exact:true}).click();await expect(page.getByRole('heading',{name:'Administrator sign-in'})).toBeVisible();
 await page.goto('/#verify?token=mock-invalid');await expect(page.getByRole('heading',{name:'Verify your email'})).toBeVisible();await page.getByRole('button',{name:'Verify email',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();expect(await page.getByRole('alert').innerText()).not.toMatch(/[가-힣]/);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
test('saved Korean preference survives the new English default',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));await page.goto('/#account-recovery');await expect(page.getByRole('button',{name:'인증메일 받기'})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang','ko');
});
test('existing-account collision explains ownership recovery in English without a session',async({page},info)=>{
 const state='s'.repeat(43);await page.addInitScript(state=>sessionStorage.setItem('aiadcast.google-flow',JSON.stringify({state,proof:'p'.repeat(43),expires:Date.now()+600000})),state);
 await page.route('**/api/auth/google/finish',r=>r.fulfill({status:409,json:{error:{code:'GOOGLE_ACCOUNT_LINK_REQUIRED'}}}));await page.goto('/?google=1&state='+state+'&code=mock');await expect(page.getByRole('alert')).toHaveText('Verify your existing account to connect Google.');await expect(page.getByRole('link',{name:'Verify existing account'})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();await page.screenshot({path:info.outputPath('english-recovery.png')});
});
