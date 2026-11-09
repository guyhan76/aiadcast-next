import {test,expect,type Page} from '@playwright/test';
import {mockSession,protectedScreen} from './helpers/authenticated-session';
async function setup(page:Page,language='ko'){
 const session=mockSession('startup-owner');await protectedScreen(page,session);await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
 const state={mode:'fail',reads:0,writes:0,release:()=>{}};
 await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET'){state.writes++;return r.fulfill({status:503,json:{error:{code:'UNEXPECTED_WRITE'}}});}
 if(path==='/api/account/capabilities')return r.fulfill({json:{google:{enabled:true}}});
 if(path!=='/api/auth/session')return r.fallback();state.reads++;
 if(state.mode==='hold'){await new Promise<void>(resolve=>state.release=resolve);}
 if(state.mode==='fail')return r.abort('failed');
 return r.fulfill({json:{user:session.user}});
 });return {state,session};
}
for(const language of ['ko','en'])test(`startup failure offers GET-only retry and preserves session (${language})`,async({page},info)=>{
 const {state,session}=await setup(page,language);await page.goto('/');const retry=page.getByRole('button',{name:language==='ko'?'다시 연결':'Reconnect',exact:true});await expect(retry).toBeEnabled();await page.screenshot({path:info.outputPath('startup-reconnect.png')});expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!).token)).toBe(session.token);
 state.mode='ok';await retry.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(page.locator('.home-page')).toBeVisible();expect(state.reads).toBe(4);expect(state.writes).toBe(0);
});
for(const language of ['ko','en'])test(`stalled startup exits loading after 15 seconds and ignores the late response (${language})`,async({page},info)=>{
 const {state,session}=await setup(page,language);state.mode='hold';await page.clock.install({time:Date.now()});await page.goto('/');await expect.poll(()=>state.reads).toBe(1);await page.clock.fastForward(16000);
 const retry=page.getByRole('button',{name:language==='ko'?'다시 연결':'Reconnect',exact:true});await expect(retry).toBeEnabled();await expect(page.getByText(language==='ko'?'로그인을 확인하고 있어요':'Finishing sign-in…',{exact:true})).not.toBeVisible();
 state.release();await expect(page.locator('.home-page')).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!).token)).toBe(session.token);
 state.mode='ok';await retry.click();await expect(page.locator('.home-page')).toBeVisible();expect(state.writes).toBe(0);
});
test('automatic retry budget includes focus storms and never loops',async({page})=>{
 const {state}=await setup(page);await page.goto('/');await expect.poll(()=>state.reads).toBe(1);
 await page.evaluate(()=>{for(let i=0;i<10;i++){window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));}});
 await expect(page.getByRole('button',{name:'다시 연결',exact:true})).toBeEnabled({timeout:10000});expect(state.reads).toBe(3);
 await page.evaluate(()=>{for(let i=0;i<10;i++)window.dispatchEvent(new Event('focus'));});expect(state.reads).toBe(3);expect(state.writes).toBe(0);
});
test('offline waiting resumes a GET cycle when online',async({page})=>{
 const {state}=await setup(page);await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));await page.goto('/');
 await expect(page.getByRole('button',{name:'다시 연결',exact:true})).toBeEnabled();expect(state.reads).toBe(1);state.mode='ok';
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
 await expect(page.locator('.home-page')).toBeVisible();expect(state.reads).toBe(2);expect(state.writes).toBe(0);
});
for(const language of ['ko','en'])test('temporary startup failure automatically succeeds without another click '+language,async({page})=>{
 const {state}=await setup(page,language);await page.clock.install({time:Date.now()});await page.goto('/');await expect.poll(()=>state.reads).toBe(1);
 await expect(page.getByRole('status')).toHaveText(language==='ko'?'로그인을 확인하고 있어요':'Finishing sign-in…');await expect(page.getByRole('alert')).toHaveCount(0);
 state.mode='ok';await page.clock.fastForward(1100);await expect(page.locator('.home-page')).toBeVisible();expect(state.reads).toBe(2);expect(state.writes).toBe(0);
});
for(const status of [401,403])test('authentication errors do not schedule automatic retries '+status,async({page})=>{
 const {state}=await setup(page);await page.clock.install({time:Date.now()});await page.route('**/api/auth/session',r=>{state.reads++;return r.fulfill({status,json:{error:{code:status===401?'AUTH_REQUIRED':'FORBIDDEN'}}});});
 await page.goto('/');await expect.poll(()=>state.reads).toBe(1);await page.clock.fastForward(60000);expect(state.reads).toBe(1);expect(state.writes).toBe(0);await expect(page.locator('.home-page')).toHaveCount(0);
});
test('logout during bootstrap cannot restore the late session or start generation',async({page},info)=>{
 const {state}=await setup(page);state.mode='hold';await page.goto('/');await expect.poll(()=>state.reads).toBe(1);
 await page.evaluate(()=>{sessionStorage.removeItem('aiadcast.beta-session');window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'login'}}));});state.release();
 await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();await expect(page.locator('.home-page')).toHaveCount(0);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();expect(state.writes).toBe(0);
});
test('a late old-account response cannot replace the new session',async({page},info)=>{
 const {state}=await setup(page);state.mode='hold';await page.goto('/');await expect.poll(()=>state.reads).toBe(1);const replacement=mockSession('replacement-owner','member','b');
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:replacement.user}}));await page.evaluate(s=>{sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s));window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'home'}}));},replacement);await expect(page.locator('.home-page')).toBeVisible();state.release();expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!).user.id)).toBe(replacement.user.id);expect(state.writes).toBe(0);
});
test('logout cancels scheduled retry without reviving the old session',async({page})=>{
 const {state}=await setup(page);await page.clock.install({time:Date.now()});await page.goto('/');await expect.poll(()=>state.reads).toBe(1);
 await page.evaluate(()=>{sessionStorage.removeItem('aiadcast.beta-session');window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage:'login'}}));});
 // Let the fresh guest capability response settle before advancing all timers.
 await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();await page.clock.fastForward(60000);await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();expect(state.reads).toBe(1);expect(state.writes).toBe(0);
});
test('back forward and reload retain the route without replaying generation',async({page})=>{
 const {state}=await setup(page);await page.clock.install({time:Date.now()});await page.goto('/#create');await expect.poll(()=>state.reads).toBe(1);
 await page.evaluate(()=>{location.hash='projects';});await page.goBack();await expect(page).toHaveURL(/#create$/);await page.goForward();await expect(page).toHaveURL(/#projects$/);
 state.mode='ok';await page.clock.fastForward(1100);await expect(page.locator('.projects-page')).toBeVisible();expect(state.reads).toBe(2);
 await page.reload();await expect(page.locator('.projects-page')).toBeVisible();expect(state.reads).toBe(3);expect(state.writes).toBe(0);
});
test('background or offline time cannot renew the initial connection deadline',async({page})=>{
 const {state}=await setup(page);await page.clock.install({time:Date.now()});await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));await page.goto('/');await expect.poll(()=>state.reads).toBe(1);await expect(page.getByRole('button',{name:'다시 연결',exact:true})).toBeEnabled();await page.clock.fastForward(16000);state.mode='ok';
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});await expect(page.getByRole('alert')).toHaveText('연결이 지연되고 있습니다. 다시 연결해주세요.');expect(state.reads).toBe(1);await page.getByRole('button',{name:'다시 연결',exact:true}).click();await expect(page.locator('.home-page')).toBeVisible();expect(state.reads).toBe(2);expect(state.writes).toBe(0);
});

