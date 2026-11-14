import {test,expect,type Page} from '@playwright/test';
const state='r'.repeat(43),proof='p'.repeat(43),origin='https://beta.example.com',pkg='com.selluplabs.aiadcast.next.demo';
const session={token:'z'.repeat(43),expires:Date.now()+86400000,user:{id:'legacy-member-id',label:'Existing',role:'member'}};
async function setup(page:Page,{native=false,cold=false,checkout=false,expired=false,lost=false}={}){
 const m={requested:false,approved:false,canceled:false,requests:0,completes:0,starts:0,hold:Promise.resolve()};
 await page.addInitScript(({native,cold,checkout,expired,origin,pkg,state,proof})=>{
  localStorage.setItem('aiadcast.ui-language','en');
  if(native){(window as any).__AIADCAST_API_ORIGIN__=origin;(window as any).__AIADCAST_GOOGLE_NATIVE__={version:1,packageId:pkg,pending:cold?{state,proof,expires:Date.now()+600000,origin,owner:'guest',native:true}:undefined};(window as any).AiadcastNative={postMessage:(raw:string)=>{if(JSON.parse(raw).type==='google-sign-in-clear')(window as any).__AIADCAST_GOOGLE_NATIVE__.pending=undefined;}};}
  if(!native&&!sessionStorage.getItem('fixture-seeded')){sessionStorage.setItem('fixture-seeded','1');sessionStorage.setItem('aiadcast.google-flow',JSON.stringify({state,proof,expires:Date.now()+600000}));if(cold)sessionStorage.setItem('aiadcast.google-link-pending',JSON.stringify({state,proof,expires:expired?1:Date.now()+600000,origin:location.origin}));}
  if(checkout){sessionStorage.setItem('aiadcast.login-destination',JSON.stringify({target:'checkout-return',origin:native?origin:location.origin,created:Date.now()}));localStorage.setItem('aiadcast.checkout-continuation',JSON.stringify({orderId:'link-order',userId:'legacy-member-id',origin:native?origin:location.origin,route:'create',created:Date.now()}));}
 },{native,cold,checkout,expired,origin,pkg,state,proof});
 await page.context().route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1'&&!u.pathname.startsWith('/api/'))return r.continue();return r.abort();});
 await page.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname,b=r.request().method()==='POST'?r.request().postDataJSON():null;
  if(p==='/api/account/capabilities')return r.fulfill({json:{google:{enabled:true},email:{enabled:true},checkout:{enabled:false,test:true,currency:'KRW'}}});
  if(p==='/api/auth/google/start'){m.starts++;expect(b.linkRecovery).toBe(true);return r.fulfill({json:{state,proof,expires:Date.now()+600000,native:true,url:'https://accounts.google.com/o/oauth2/v2/auth?mock=1'}});}
  if(lost&&p==='/api/auth/google/finish')return r.abort();
  if(lost&&p==='/api/auth/google/native-poll')return r.abort();
  if(p==='/api/auth/google/finish')return r.fulfill({json:{linkRequired:true,expires:Date.now()+600000}});
  if(p==='/api/auth/google/native-poll')return r.fulfill({json:{state:'link-required',expires:Date.now()+600000}});
  if(p.startsWith('/api/auth/google/link/')){expect(b.state).toBe(state);expect(b.proof).toBe(proof);
   if(p.endsWith('/cancel')){m.canceled=true;return r.fulfill({json:{canceled:true}});}
   if(m.canceled)return r.fulfill({status:401,json:{error:{code:'GOOGLE_LINK_INVALID'}}});
   if(p.endsWith('/request')){expect(b.consent).toBe(true);expect(b.email).toBeUndefined();m.requests++;m.requested=true;return r.fulfill({json:{state:'waiting',expires:Date.now()+600000}});}
   if(p.endsWith('/status'))return r.fulfill({json:{state:m.requested?'waiting':'confirmation',expires:Date.now()+600000}});
   if(p.endsWith('/complete')){m.completes++;await m.hold;return r.fulfill({json:m.approved?{state:'verified',session}:{state:'pending'}});}
  }
  if(p==='/api/auth/session')return r.fulfill({json:{user:session.user}});
  if(p==='/api/checkout/orders/link-order')return r.fulfill({json:{id:'link-order',state:'paid',credits:3,amount:6900,currency:'KRW',receipt:{verified:true,grantedCredits:3,balance:17}}});
  if(p==='/api/projects')return r.fulfill({json:{projects:[]}});
  return r.fulfill({json:{generation:{enabled:false},wallet:{available:17,reserved:0},budget:{limitMicros:0}}});
 });
 await page.goto(native||cold?'/':'/?google=1&state='+state+'&code=mock');
 if(native&&!cold)await page.getByRole('button',{name:'Continue with Google',exact:true}).click();
 return m;
}
for(const native of [false,true]){
 test(`${native?'native':'web'} ownership confirmation connects automatically without another Google exchange`,async({page})=>{
  const m=await setup(page,{native});const verify=page.getByRole('button',{name:'Verify account and connect Google'});await expect(verify).toBeVisible();expect(m.requests).toBe(0);
  await verify.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(page.getByRole('status')).toHaveText('Waiting for confirmation…');expect(m.requests).toBe(1);
  m.approved=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.home-page')).toBeVisible();expect(m.starts).toBe(native?1:0);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!).user.id)).toBe(session.user.id);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.google-link-pending'))).toBeNull();
 });
 test(`${native?'native':'web'} cold recovery resumes waiting and preserves validated checkout destination`,async({page})=>{
  const m=await setup(page,{native,cold:true,checkout:true});await page.getByRole('button',{name:'Verify account and connect Google'}).click();await page.reload();await expect(page.getByRole('status')).toHaveText('Waiting for confirmation…');expect(m.requests).toBe(1);m.approved=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page).toHaveURL(/#create$/);await expect(page.locator('.consumer-create')).toBeVisible();expect(m.starts).toBe(0);
 });
 test(`${native?'native':'web'} cancel blocks late completion and clears original proof`,async({page})=>{
  const m=await setup(page,{native});await page.getByRole('button',{name:'Verify account and connect Google'}).click();let release!:()=>void;m.hold=new Promise(r=>release=r);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>m.completes).toBeGreaterThan(0);await page.getByRole('button',{name:'Cancel and return'}).click();m.approved=true;release();await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.google-link-pending'))).toBeNull();
 });
}
test('logout boundary during pending ownership exchange cannot install a late session',async({page})=>{
 const m=await setup(page);await page.getByRole('button',{name:'Verify account and connect Google'}).click();let release!:()=>void;m.hold=new Promise(r=>release=r);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>m.completes).toBeGreaterThan(0);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'login'}})));m.approved=true;release();await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
test('expired local recovery offers fresh Google sign-in without sending mail',async({page})=>{
 const m=await setup(page,{cold:true,expired:true});await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();expect(m.requests).toBe(0);expect(m.completes).toBe(0);
});

for(const native of [false,true])test(`${native?'native':'web'} lost Google completion response recovers device-bound intent without re-exchange`,async({page})=>{
 const m=await setup(page,{native,lost:true});await page.getByRole('button',{name:'Verify account and connect Google'}).click();m.approved=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.home-page')).toBeVisible();expect(m.requests).toBe(1);expect(m.starts).toBe(native?1:0);
});

test('ownership recovery keeps the official logo and explicit Korean selection',async({page},info)=>{
 await setup(page,{cold:true});await expect(page.getByRole('button',{name:'Verify account and connect Google'})).toBeVisible();await page.screenshot({path:info.outputPath('link-confirm-en.png')});await page.getByRole('combobox',{name:'App language',exact:true}).selectOption('ko');await page.getByRole('button',{name:'계정 확인 후 Google 연결'}).click();await expect(page.getByRole('status')).toHaveText('확인을 기다리는 중…');await expect(page.locator('h1 svg')).toBeVisible();await page.screenshot({path:info.outputPath('link-wait-ko.png')});
});
