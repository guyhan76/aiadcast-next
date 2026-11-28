import {test,expect,type Page} from '@playwright/test';
const origin='https://beta.example.com',state='s'.repeat(43),proof='p'.repeat(43),pkg='com.selluplabs.aiadcast.next.demo';
const session={token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'native-google-user',label:'member@example.com',role:'member'}};
async function setup(page:Page,pending?:Record<string,unknown>){
 const mock={approved:false,polls:0,starts:0,hold:Promise.resolve()};
 await page.addInitScript(({origin,pkg,pending})=>{localStorage.setItem('aiadcast.ui-language','ko');(window as any).__AIADCAST_API_ORIGIN__=origin;(window as any).__AIADCAST_GOOGLE_NATIVE__={version:1,packageId:pkg,pending};(window as any).nativeMessages=[];(window as any).AiadcastNative={postMessage:(s:string)=>(window as any).nativeMessages.push(JSON.parse(s))};},{origin,pkg,pending});
 await page.context().route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1'&&!u.pathname.startsWith('/api/'))return r.continue();return r.abort();});
 await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname;
  if(path==='/api/account/capabilities')return r.fulfill({json:{google:{enabled:true},email:{enabled:true},checkout:{enabled:false,test:true,currency:'KRW'}}});
  if(path==='/api/auth/google/start'){mock.starts++;expect(r.request().postDataJSON().packageId).toBe(pkg);return r.fulfill({json:{state,proof,expires:Date.now()+600000,native:true,url:'https://accounts.google.com/o/oauth2/v2/auth?state='+state+'&prompt=select_account'}});}
  if(path==='/api/auth/google/native-poll'){mock.polls++;expect(r.request().postDataJSON()).toEqual({state,proof});await mock.hold;return r.fulfill({json:mock.approved?{state:'verified',session}:{state:'pending'}});}
  if(path==='/api/auth/session')return r.fulfill({json:{user:session.user}});
  return r.fulfill({json:{generation:{enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0},projects:[]}});
 });return mock;
}
test('Android bridge opens external Google once and fixed resume signal exchanges app-held proof',async({page})=>{
 const mock=await setup(page);await page.goto('/');const button=page.getByRole('button',{name:'Google로 계속하기'});await expect(button).toBeEnabled();await button.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(page.getByRole('button',{name:'취소',exact:true})).toBeVisible();expect(mock.starts).toBe(1);expect(new URL(page.url()).hostname).toBe('127.0.0.1');
 const messages=await page.evaluate(()=>(window as any).nativeMessages);expect(messages.filter((m:any)=>m.type==='google-sign-in')).toHaveLength(1);expect(messages.find((m:any)=>m.type==='google-sign-in').url).not.toContain(proof);expect(messages.find((m:any)=>m.type==='google-sign-in').owner).toBe('guest');
 mock.approved=true;await page.evaluate(()=>window.dispatchEvent(new Event('aiadcast-google-return')));await expect(page.locator('.home-page')).toBeVisible();expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!).user.id)).toBe(session.user.id);expect(await page.evaluate(()=>(window as any).nativeMessages.some((m:any)=>m.type==='google-sign-in-clear'&&m.state==='s'.repeat(43)))).toBe(true);
});
test('Android cancellation ignores a late approved response and keeps login closed',async({page})=>{
 const mock=await setup(page);let release!:()=>void;mock.hold=new Promise(r=>release=r);await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기'}).click();await expect.poll(()=>mock.polls).toBe(1);await page.getByRole('button',{name:'취소',exact:true}).click();mock.approved=true;release();await expect(page.getByRole('button',{name:'Google로 계속하기'})).toBeEnabled();await expect(page.locator('.home-page')).toHaveCount(0);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.google-flow'))).toBeNull();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
test('Android restart resumes only unexpired proof for the same server and owner',async({page})=>{
 const mock=await setup(page,{state,proof,expires:Date.now()+600000,origin,owner:'guest',native:true});mock.approved=true;await page.goto('/');await expect(page.locator('.home-page')).toBeVisible();expect(mock.starts).toBe(0);expect(mock.polls).toBe(1);
});
for(const mismatch of ['owner','origin','expiry'])test('Android restart rejects '+mismatch+' mismatch without transmitting saved proof',async({page})=>{
 const pending={state,proof,expires:Date.now()+600000,origin,owner:'guest',native:true};if(mismatch==='owner')pending.owner='other-user';if(mismatch==='origin')pending.origin='https://other.example.com';if(mismatch==='expiry')pending.expires=1;
 const mock=await setup(page,pending);await page.goto('/');await expect(page.getByRole('button',{name:'Google로 계속하기'})).toBeEnabled();await page.evaluate(()=>window.dispatchEvent(new Event('aiadcast-google-return')));expect(mock.polls).toBe(0);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
test('Android existing-account collision offers ownership recovery instead of an endless Google retry',async({page})=>{
 await setup(page);await page.route('**/api/auth/google/native-poll',r=>r.fulfill({status:409,json:{error:{code:'GOOGLE_ACCOUNT_LINK_REQUIRED'}}}));await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기'}).click();await expect(page.getByRole('link',{name:'기존 계정 확인'})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
for(const otherOwner of [false,true])test(`Android Google return ${otherOwner?'does not read another owner order':'continues the original verified checkout'}`,async({page})=>{
 const mock=await setup(page);let orders=0;
 await page.addInitScript(({origin,otherOwner})=>{const orderId='native-return-order';localStorage.setItem('aiadcast.checkout-continuation',JSON.stringify({orderId,userId:otherOwner?'different-user-456':'native-google-user',origin,route:'create',created:Date.now()}));sessionStorage.setItem('aiadcast.login-destination',JSON.stringify({target:'checkout-return',origin,created:Date.now()}));},{origin,otherOwner});
 await page.route('**/api/checkout/orders/native-return-order',r=>{orders++;return r.fulfill({json:{id:'native-return-order',state:'paid',credits:3,amount:6900,currency:'KRW',receipt:{verified:true,grantedCredits:3,balance:5}}});});
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect(page.getByRole('button',{name:'취소',exact:true})).toBeVisible();mock.approved=true;await page.evaluate(()=>window.dispatchEvent(new Event('aiadcast-google-return')));
 if(otherOwner){await expect(page.getByText('결제를 시작한 계정으로 로그인해주세요.',{exact:false})).toBeVisible();expect(orders).toBe(0);await expect(page.locator('.consumer-create')).toHaveCount(0);}
 else{await expect(page).toHaveURL(/#create$/);await expect(page.locator('.consumer-create')).toBeVisible();expect(orders).toBe(1);}
});

for(const language of ['en','ko'])test(`Chrome launch failure clears pending proof and permits retry in ${language}`,async({page})=>{
 const mock=await setup(page);await page.addInitScript(language=>localStorage.setItem('aiadcast.ui-language',language),language);
 let release!:()=>void;mock.hold=new Promise(r=>release=r);await page.goto('/');
 const button=page.getByRole('button',{name:language==='en'?'Continue with Google':'Google로 계속하기',exact:true});
 await button.click();await expect.poll(()=>mock.polls).toBe(1);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-google-open-failed',{detail:{code:'CHROME_UNAVAILABLE'}})));
 await expect(page.getByText(language==='en'?'Cannot open Chrome. Install or enable Chrome, then try again.':'Chrome을 열 수 없습니다. Chrome을 설치하거나 사용 설정한 뒤 다시 시도해주세요.',{exact:true})).toBeVisible();
 await expect(button).toBeEnabled();
 expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.google-flow'))).toBeNull();
 expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
 expect(await page.evaluate(()=>(window as any).nativeMessages.some((m:any)=>m.type==='google-sign-in-clear'&&m.state==='s'.repeat(43)))).toBe(true);
 mock.hold=Promise.resolve();await button.click();await expect.poll(()=>mock.starts).toBe(2);
 release();await expect(page.locator('.home-page')).toHaveCount(0);
});

for(const language of ['ko','en'])test(`return during an in-flight pending poll drains once without a second click (${language})`,async({page},info)=>{
 const m=await setup(page);await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
 await page.clock.install({time:Date.now()});let count=0,active=0,max=0,release!:()=>void;
 await page.route('**/api/auth/google/native-poll',async r=>{count++;active++;max=Math.max(max,active);if(count===1)await new Promise<void>(x=>release=x);active--;await r.fulfill({json:count===1?{state:'pending'}:{state:'verified',session}});});
 await page.goto('/');await page.getByRole('button',{name:language==='ko'?'Google로 계속하기':'Continue with Google',exact:true}).click();await expect.poll(()=>count).toBe(1);
 await expect(page.getByRole('status')).toHaveText(language==='ko'?'Google에서 계정을 선택한 뒤 앱으로 돌아와 주세요.':'Choose your account in Google, then return to the app.');
 await page.evaluate(()=>{for(let i=0;i<8;i++){window.dispatchEvent(new Event('aiadcast-google-return'));window.dispatchEvent(new Event('focus'));}});
 await expect(page.getByRole('status')).toHaveText(language==='ko'?'로그인을 확인하고 있어요':'Finishing sign-in…');
 await expect(page.getByRole('button',{name:language==='ko'?'취소':'Cancel',exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('native-return-checking.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);release();await page.clock.runFor(30);await expect(page.locator('.home-page')).toBeVisible();expect(count).toBe(2);expect(max).toBe(1);expect(m.starts).toBe(1);
});
for(const status of [503,429])test(`temporary ${status} preserves proof and automatically recovers`,async({page})=>{
 const m=await setup(page);await page.clock.install({time:Date.now()});let count=0;
 await page.route('**/api/auth/google/native-poll',r=>{count++;return count===1?r.fulfill({status,json:{error:{code:'TEMPORARY'}}}):r.fulfill({json:{state:'verified',session}});});
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect.poll(()=>count).toBe(1);await expect(page.getByRole('alert')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.google-flow')!).state)).toBe(state);await page.clock.runFor(3100);await expect(page.locator('.home-page')).toBeVisible();expect(count).toBe(2);expect(m.starts).toBe(1);
});
test('three transient errors pause and manual status retry keeps the same proof',async({page})=>{
 const m=await setup(page);await page.clock.install({time:Date.now()});let count=0,ok=false;
 await page.route('**/api/auth/google/native-poll',r=>{count++;expect(r.request().postDataJSON()).toEqual({state,proof});return ok?r.fulfill({json:{state:'verified',session}}):r.abort('failed');});
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect.poll(()=>count).toBe(1);await page.clock.runFor(3100);await expect.poll(()=>count).toBe(2);await page.clock.runFor(6100);await expect.poll(()=>count).toBe(3);
 const retry=page.getByRole('button',{name:'로그인 다시 확인',exact:true});await expect(retry).toBeVisible();await page.evaluate(()=>{for(let i=0;i<5;i++)window.dispatchEvent(new Event('focus'));});await page.clock.fastForward(20000);expect(count).toBe(3);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.google-flow'))).not.toBeNull();
 ok=true;await retry.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(page.locator('.home-page')).toBeVisible();expect(count).toBe(4);expect(m.starts).toBe(1);
});
for(const status of [401,403])test(`definitive ${status} terminates without automatic authentication retry`,async({page})=>{
 const m=await setup(page);await page.clock.install({time:Date.now()});let count=0;
 await page.route('**/api/auth/google/native-poll',r=>{count++;return r.fulfill({status,json:{error:{code:status===401?'AUTH_REQUIRED':'FORBIDDEN'}}});});
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await page.clock.fastForward(60000);expect(count).toBe(1);expect(m.starts).toBe(1);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.google-flow'))).toBeNull();
});
test('pending flow stops at total wait limit without clearing valid proof or silently restarting',async({page})=>{
 const m=await setup(page);await page.clock.install({time:Date.now()});await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect.poll(()=>m.polls).toBe(1);await page.clock.fastForward(120001);await expect(page.getByRole('button',{name:'로그인 다시 확인',exact:true})).toBeVisible();const n=m.polls;await page.clock.fastForward(60000);expect(m.polls).toBe(n);expect(m.starts).toBe(1);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.google-flow'))).not.toBeNull();
});
test('expired proof cannot accept a late verified response',async({page})=>{
 const now=Date.now();const m=await setup(page,{state,proof,expires:now+10000,origin,owner:'guest',native:true});let release!:()=>void;m.hold=new Promise(r=>release=r);m.approved=true;await page.clock.install({time:now});await page.goto('/');await expect.poll(()=>m.polls).toBe(1);await page.clock.fastForward(10001);release();await expect(page.getByRole('alert')).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
for(const boundary of ['logout','origin','route'])test(`late native response cannot cross ${boundary} boundary`,async({page})=>{
 const m=await setup(page);let release!:()=>void;m.hold=new Promise(r=>release=r);m.approved=true;await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect.poll(()=>m.polls).toBe(1);
 await page.evaluate(boundary=>{if(boundary==='logout')window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'login'}}));else if(boundary==='origin')(window as any).__AIADCAST_API_ORIGIN__='https://different.example.com';else location.hash='account-recovery';},boundary);
 release();await expect(page.locator('.home-page')).toHaveCount(0);await page.waitForTimeout(100);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});

test('stalled native poll times out then recovers once without restarting Google',async({page})=>{
 const m=await setup(page);await page.clock.install({time:Date.now()});let count=0,release!:()=>void;
 await page.route('**/api/auth/google/native-poll',async r=>{count++;if(count===1){await new Promise<void>(x=>release=x);return r.fulfill({json:{state:'pending'}});}return r.fulfill({json:{state:'verified',session}});});
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect.poll(()=>count).toBe(1);await page.clock.fastForward(15001);await page.clock.runFor(3100);await expect(page.locator('.home-page')).toBeVisible();release();expect(m.starts).toBe(1);expect(count).toBe(2);
});
test('offline return resumes only existing proof after online',async({page})=>{
 const m=await setup(page);await page.clock.install({time:Date.now()});await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect.poll(()=>m.polls).toBe(1);
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('aiadcast-google-return'));});await page.clock.runFor(3100);expect(m.polls).toBe(1);m.approved=true;
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});await expect(page.locator('.home-page')).toBeVisible();expect(m.starts).toBe(1);expect(m.polls).toBe(2);
});
test('late Google start after navigating back cannot open external authentication',async({page})=>{
 await setup(page);let release!:()=>void,starts=0;
 await page.route('**/api/auth/google/start',async r=>{starts++;await new Promise<void>(x=>release=x);return r.fulfill({json:{state,proof,expires:Date.now()+600000,url:'https://accounts.google.com/o/oauth2/v2/auth?state='+state}});});
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect.poll(()=>starts).toBe(1);await page.evaluate(()=>location.hash='account-recovery');release();await page.waitForTimeout(100);expect(await page.evaluate(()=>(window as any).nativeMessages.filter((m:any)=>m.type==='google-sign-in'))).toHaveLength(0);
});

test('late native approval cannot replace a newly selected account',async({page})=>{
 const m=await setup(page);let release!:()=>void;m.hold=new Promise(r=>release=r);m.approved=true;
 await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect.poll(()=>m.polls).toBe(1);
 const other={...session,token:'b'.repeat(43),origin,user:{...session.user,id:'other-owner-123'}};
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:other.user}}));await page.evaluate(other=>{sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(other));window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'home'}}));},other);
 await expect(page.locator('.home-page')).toBeVisible();release();await page.waitForTimeout(100);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!).user.id)).toBe(other.user.id);
});
test('malformed verified session is rejected without a new OAuth exchange',async({page})=>{
 const m=await setup(page);await page.route('**/api/auth/google/native-poll',r=>r.fulfill({json:{state:'verified',session:{...session,expires:0}}}));await page.goto('/');await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();expect(m.starts).toBe(1);
});
