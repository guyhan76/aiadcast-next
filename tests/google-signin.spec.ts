import {test,expect,type Page} from '@playwright/test';
const account={token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'google-user-123',label:'member@example.com',role:'member'}};
async function setup(page:Page,{signed=false,enabled=true}={}){
 let starts=0,finishes=0;await page.context().route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1')return r.abort();if(u.pathname.startsWith('/api/'))return r.fulfill({status:503,json:{error:{code:'UNMOCKED'}}});return r.continue();});
 await page.addInitScript(({account,signed})=>{localStorage.setItem('aiadcast.ui-language','ko');if(signed)sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(account));},{account,signed});
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;
  if(p==='/api/account/capabilities')return r.fulfill({json:{google:{enabled},email:{enabled:true},password:{enabled:true,test:true,adminReady:true,adminEmail:'owner@example.com'},checkout:{enabled:false,test:true,currency:'KRW'}}});
  if(p==='/api/auth/session')return r.fulfill({json:{user:account.user}});
  if(p==='/api/auth/google/start'){starts++;return r.fulfill({json:{state:'s'.repeat(43),proof:'p'.repeat(43),expires:Date.now()+600000,url:'https://accounts.google.com/o/oauth2/v2/auth?prompt=select_account'}});}
  if(p==='/api/auth/google/finish'){finishes++;return r.fulfill({json:account});}
  if(p==='/api/auth/logout')return r.fulfill({json:{signedOut:true}});
  if(p==='/api/projects')return r.fulfill({json:{projects:[]}});
  return r.fulfill({json:{generation:{enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0}}});
 });return {starts:()=>starts,finishes:()=>finishes};
}
test('guest launch and deep links show only Google sign-in; missing setup fails closed; private recovery stays accessible',async({page},info)=>{
 await setup(page,{enabled:false});await page.goto('/#create');await expect(page.getByRole('heading',{name:'aiadcast',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeDisabled();await expect(page.locator('.create-page')).toHaveCount(0);await expect(page.getByRole('textbox')).toHaveCount(0);await expect(page.getByRole('link')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('google-login-unconfigured.png')});await page.goto('/#account-recovery');await expect(page.getByRole('button',{name:'인증메일 받기'})).toBeVisible();await page.getByRole('button',{name:'기존 비밀번호로 로그인'}).click();await expect(page.getByRole('button',{name:'관리자 로그인'})).toBeVisible();
});
test('Google button coalesces clicks, retains browser-bound proof and asks Google for account selection',async({page},info)=>{
 const state=await setup(page);await page.goto('/');const button=page.getByRole('button',{name:'Google로 계속하기',exact:true});await expect(button).toBeEnabled();await page.screenshot({path:info.outputPath('google-login-ready.png')});
 await page.route('https://accounts.google.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Mock Google account chooser</h1>'}));await button.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(page).toHaveURL(/accounts.google.com.*select_account/);expect(state.starts()).toBe(1);
});
async function seedCallback(page:Page,state='s'.repeat(43)){
 await page.addInitScript(({state})=>sessionStorage.setItem('aiadcast.google-flow',JSON.stringify({state,proof:'p'.repeat(43),expires:Date.now()+600000})),{state});
}
test('verified callback enters home; logout and a fresh Google sign-in return to the same account',async({page})=>{
 const state=await setup(page);await seedCallback(page);await page.goto('/?google=1&state='+ 's'.repeat(43)+'&code=mock-code');await expect(page.locator('.home-page')).toBeVisible();expect(state.finishes()).toBe(1);await expect(page).toHaveURL(/#home$/);
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
 await page.goto('/?google=1&state='+ 's'.repeat(43)+'&code=fresh-code');await expect(page.locator('.home-page')).toBeVisible();expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!).user.id)).toBe(account.user.id);
});
test('valid existing session opens home; mismatched callback never calls token exchange',async({page})=>{
 const state=await setup(page,{signed:true});await page.goto('/');await expect(page.locator('.home-page')).toBeVisible();expect(state.starts()).toBe(0);
 await page.evaluate(()=>sessionStorage.removeItem('aiadcast.beta-session'));await seedCallback(page,'different');await page.goto('/?google=1&state=wrong&code=untrusted');await expect(page.getByRole('alert')).toContainText('다시 시작');expect(state.finishes()).toBe(0);
});
test('email collision offers explicit ownership recovery without issuing a session',async({page})=>{
 await setup(page);await seedCallback(page);await page.route('**/api/auth/google/finish',r=>r.fulfill({status:409,json:{error:{code:'GOOGLE_ACCOUNT_LINK_REQUIRED'}}}));await page.goto('/?google=1&state='+ 's'.repeat(43)+'&code=mock');await expect(page.getByRole('link',{name:'기존 계정 확인'})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();await page.getByRole('link',{name:'기존 계정 확인'}).click();await expect(page.getByRole('button',{name:'인증메일 받기'})).toBeVisible();
});
test('native shell does not attempt an unsupported embedded Google OAuth flow',async({page})=>{
 const state=await setup(page);await page.addInitScript(()=>(window as any).AiadcastNative={postMessage(){}});await page.goto('/');await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeDisabled();await expect(page.getByRole('status')).toContainText('이 앱의 Google 로그인 연결');expect(state.starts()).toBe(0);
});
test('logout/session boundary during a pending Google exchange cannot install its late session',async({page})=>{
 await setup(page);await seedCallback(page);let release!:()=>void,started=false;const gate=new Promise<void>(r=>release=r);await page.route('**/api/auth/google/finish',async r=>{started=true;await gate;await r.fulfill({json:account});});
 await page.goto('/?google=1&state='+ 's'.repeat(43)+'&code=mock');await expect.poll(()=>started).toBe(true);
 await page.evaluate(()=>{sessionStorage.removeItem('aiadcast.beta-session');window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'login'}}));});release();await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();await expect(page.locator('.home-page')).toHaveCount(0);
});
test('checkout return never opens the creator without an authenticated account',async({page})=>{
 await setup(page);let receipts=0;await page.route('**/api/checkout/receipt',r=>{receipts++;return r.fulfill({status:401,json:{error:{code:'CHECKOUT_TICKET_INVALID'}}});});
 await page.addInitScript(()=>sessionStorage.setItem('aiadcast.browser-checkout',JSON.stringify({orderId:'invalid-order',ticket:'invalid-ticket'})));
 await page.goto('/?checkout=return&orderId=invalid-order');await expect(page.getByRole('alert')).toBeVisible();expect(receipts).toBe(1);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
 await page.goto('/#create');await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeVisible();await expect(page.locator('.create-page')).toHaveCount(0);
});
