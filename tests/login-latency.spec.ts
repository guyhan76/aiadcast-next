import {test,expect,type Page} from '@playwright/test';
const origin='https://beta.example.com',state='s'.repeat(43),proof='p'.repeat(43);
const account={token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'latency-owner-123',label:'member@example.com'}};
async function setup(page:Page,native=true){
 const calls={starts:0,sessions:0,capabilities:0,finishes:0,polls:0};
 await page.context().route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'&&!new URL(r.request().url()).pathname.startsWith('/api/')?r.continue():r.abort());
 await page.addInitScript(({origin,native})=>{localStorage.setItem('aiadcast.ui-language','ko');if(native){(window as any).__AIADCAST_API_ORIGIN__=origin;(window as any).__AIADCAST_GOOGLE_NATIVE__={version:1,packageId:'com.selluplabs.aiadcast.next.preview'};(window as any).AiadcastNative={postMessage(){}};}},{origin,native});
 await page.route('**/api/**',r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/api/account/capabilities'){calls.capabilities++;return r.fulfill({json:{google:{enabled:true}}});}
  if(p==='/api/auth/google/start'){calls.starts++;return r.fulfill({json:{state,proof,expires:Date.now()+600000,url:'https://accounts.google.com/o/oauth2/v2/auth?state='+state}});}
  if(p==='/api/auth/google/native-poll'){calls.polls++;return r.fulfill({json:{state:'verified',session:account}});}
  if(p==='/api/auth/google/finish'){calls.finishes++;return r.fulfill({json:account});}
  if(p==='/api/auth/session'){calls.sessions++;return r.fulfill({json:{user:account.user}});}
  return r.fulfill({json:{projects:[],generation:{enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0}}});
 });return calls;
}
test('first click waits through a 35-second cold connection using GETs and sends one Google POST',async({page},info)=>{
 const calls=await setup(page);let release!:()=>void;
 await page.clock.install({time:Date.now()});
 const hold=new Promise<void>(r=>release=r);
 await page.route('**/api/account/capabilities',async r=>{calls.capabilities++;await hold;await r.fulfill({json:{google:{enabled:true}}}).catch(()=>{});});
 await page.goto('/');
 const button=page.getByRole('button',{name:'Google로 계속하기',exact:true});await expect(button).toBeEnabled();
 await expect(page.getByText('연결하고 있어요',{exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('immediate-google-button.png')});
 await button.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});
 await page.clock.fastForward(35000);expect(calls.starts).toBe(0);await expect(page.getByRole('button',{name:'Google 로그인 여는 중…',exact:true})).toBeDisabled();
 release();await page.clock.runFor(3000);
 await expect(page.locator('.home-page')).toBeVisible();expect(calls.starts).toBe(1);expect(calls.polls).toBe(1);expect(calls.sessions).toBe(0);
 // A reload loses the memory-only receipt and still checks the stored token.
 await page.reload();await expect(page.locator('.home-page')).toBeVisible();expect(calls.sessions).toBe(1);
});
test('verified web callback does not repeat authentication or wait on capabilities',async({page})=>{
 const calls=await setup(page,false);let release!:()=>void;const hold=new Promise<void>(r=>release=r);
 await page.route('**/api/account/capabilities',async r=>{await hold;await r.abort();});
 await page.addInitScript(({state,proof})=>sessionStorage.setItem('aiadcast.google-flow',JSON.stringify({state,proof,expires:Date.now()+600000})),{state,proof});
 await page.goto('/?google=1&state='+state+'&code=mock');await expect(page.locator('.home-page')).toBeVisible();expect(calls.finishes).toBe(1);expect(calls.sessions).toBe(0);release();
});
test('temporary discovery failure recovers the same click with GET-only retries',async({page})=>{
 const calls=await setup(page);await page.clock.install({time:Date.now()});let reads=0;await page.route('**/api/account/capabilities',r=>++reads<3?r.fulfill({status:503,contentType:'text/html',body:'Starting'}):r.fulfill({json:{google:{enabled:true}}}));
 await page.goto('/');await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'다시 연결',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();for(let i=0;i<20&&calls.starts===0;i++)await page.clock.runFor(500);await expect(page.locator('.home-page')).toBeVisible();expect(calls.starts).toBe(1);expect(reads).toBe(3);
});
test('slow Google start keeps one disabled button, coalesces clicks and never retries the POST automatically',async({page},info)=>{
 const calls=await setup(page);let release!:()=>void;const hold=new Promise<void>(r=>release=r);
 await page.route('**/api/auth/google/start',async r=>{calls.starts++;await hold;await r.fulfill({status:503,json:{error:{code:'GOOGLE_UNAVAILABLE'}}});});
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).evaluate((b:HTMLButtonElement)=>{b.click();b.click();});
 await expect(page.getByRole('button',{name:'Google 로그인 여는 중…',exact:true})).toBeDisabled();
 await page.screenshot({path:info.outputPath('single-login-action.png')});await expect.poll(()=>calls.starts).toBe(1);release();
 await expect(page.getByRole('alert')).toContainText('Google 로그인을 사용할 수 없습니다');await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();expect(calls.starts).toBe(1);expect(calls.sessions).toBe(0);
});
test('stored session still requires server validation and does not fetch unrelated capabilities',async({page})=>{
 const calls=await setup(page);await page.addInitScript(({account,origin})=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({...account,origin})),{account,origin});
 await page.route('**/api/auth/session',r=>{calls.sessions++;return r.fulfill({status:401,json:{error:{code:'AUTH_REQUIRED'}}});});
 await page.goto('/');await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();expect(calls.sessions).toBe(1);await expect(page.locator('.home-page')).toHaveCount(0);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
test('leaving sign-in during readiness prevents a late OAuth start',async({page})=>{
 const calls=await setup(page);let release!:()=>void;const hold=new Promise<void>(r=>release=r);
 await page.route('**/api/account/capabilities',async r=>{await hold;await r.fulfill({json:{google:{enabled:true}}});});
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect(page.getByRole('button',{name:'Google 로그인 여는 중…',exact:true})).toBeDisabled();await page.evaluate(()=>location.hash='account-recovery');release();await expect(page.getByLabel('이메일',{exact:true})).toBeVisible();await page.waitForTimeout(100);expect(calls.starts).toBe(0);expect(calls.polls).toBe(0);
});
test('readiness stops after six transient GET failures without starting OAuth',async({page})=>{
 const calls=await setup(page);let reads=0;await page.clock.install({time:Date.now()});await page.route('**/api/account/capabilities',r=>{reads++;return r.fulfill({status:503,json:{error:{code:'STARTING'}}});});
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();for(let i=0;i<40&&reads<6;i++)await page.clock.runFor(500);await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();expect(calls.starts).toBe(0);expect(reads).toBe(6);
});

