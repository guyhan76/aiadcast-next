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
 const messages=await page.evaluate(()=>(window as any).nativeMessages);expect(messages.filter((m:any)=>m.type==='google-sign-in')).toHaveLength(1);expect(messages[0].url).not.toContain(proof);expect(messages[0].owner).toBe('guest');
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
