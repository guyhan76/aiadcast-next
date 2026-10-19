import {authenticatedTest as test,expect,type Page} from './helpers/authenticated';
const email={email:{enabled:true},checkout:{enabled:false,test:true,currency:'KRW'}};
// Shape used by the existing db15 server; no new API fields required.
const password={...email,email:{enabled:false},password:{enabled:true,test:true,adminReady:true,adminEmail:'owner@example.com'}};
async function base(page:Page){
 const writes:string[]=[];
 await page.route(url=>url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/me',r=>{if(r.request().method()!=='GET')writes.push(new URL(r.request().url()).pathname);return r.fulfill({json:{projects:[],generation:{enabled:false},assistant:{available:false},wallet:{available:0,reserved:0}}});});
 return writes;
}
async function noForm(page:Page){await expect(page.locator('.account-page input')).toHaveCount(0);await expect(page.getByRole('button',{name:'인증메일 받기',exact:true})).toHaveCount(0);await expect(page.getByText('이메일 인증 연결 준비 중입니다.',{exact:true})).toHaveCount(0);}
for(const mode of ['login','signup'])test(`slow ${mode} shows neutral loading then legacy password mode`,async({page})=>{
 const writes=await base(page);let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/account/capabilities',async r=>{await pending;await r.fulfill({json:password});});
 await page.goto('/#'+mode);await expect(page.getByRole('status')).toHaveText('로그인 방식을 확인하고 있습니다…');await noForm(page);
 release();await expect(page.getByLabel('비밀번호',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:mode==='login'?'로그인하고 계속':'가입하고 시작하기',exact:true})).toBeVisible();await expect(page.getByText(/테스트 모드 · 이메일 인증을 생략합니다/)).toBeVisible();expect(writes).toEqual([]);
});
for(const failure of ['offline','http','malformed','invalid-password','timeout'])test(`${failure} never falls back to another auth mode and can retry`,async({page})=>{
 const writes=await base(page);let calls=0;
 if(failure==='timeout')await page.clock.install();
 await page.route('**/api/account/capabilities',async r=>{
  calls++;if(calls>1)return r.fulfill({json:password});
  if(failure==='offline')return r.abort('internetdisconnected');
  if(failure==='http')return r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}});
  if(failure==='malformed')return r.fulfill({json:{}});
  if(failure==='invalid-password')return r.fulfill({json:{...email,password:{enabled:'true'}}});
  // Keep the response pending until the client's real timeout aborts it.
 });
 await page.goto('/#login');
 if(failure==='timeout'){await expect(page.getByRole('status')).toBeVisible();await noForm(page);await page.clock.fastForward(10001);}
 await expect(page.getByRole('alert')).toContainText('로그인 방식을 확인하지 못했습니다.');await noForm(page);
 await page.getByRole('button',{name:'로그인 방식 다시 확인'}).click();await expect(page.getByLabel('비밀번호',{exact:true})).toBeVisible();expect(calls).toBe(2);expect(writes).toEqual([]);
});
for(const enabled of [true,false])test(`old server without password capability preserves ${enabled?'email':'invitation'} mode`,async({page})=>{
 await base(page);await page.route('**/api/account/capabilities',r=>r.fulfill({json:{...email,email:{enabled}}}));await page.goto('/#login');
 if(enabled){await expect(page.getByRole('button',{name:'인증메일 받기'})).toBeEnabled();await expect(page.getByLabel('이메일',{exact:true})).toBeVisible();}
 else await expect(page.getByLabel('초대코드',{exact:true})).toBeVisible();
 await expect(page.getByLabel('비밀번호',{exact:true})).toHaveCount(0);
});
test('saved email verification does not poll before mode discovery or in password mode',async({page})=>{
 const writes=await base(page);await page.clock.install();await page.addInitScript(()=>sessionStorage.setItem('aiadcast.email-request:guest',JSON.stringify({requestId:'old-email',pollToken:'p'.repeat(43),expires:Date.now()+600000})));
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);await page.route('**/api/account/capabilities',async r=>{await pending;await r.fulfill({json:password});});
 await page.goto('/#login');await expect(page.getByRole('status')).toBeVisible();await page.clock.fastForward(4000);expect(writes).toEqual([]);release();await expect(page.getByLabel('비밀번호',{exact:true})).toBeVisible();await page.clock.fastForward(4000);expect(writes).toEqual([]);
});
