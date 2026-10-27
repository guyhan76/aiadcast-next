import {openWorkspaceMenu,waitForSavedDraft} from './helpers/workspace-menu';
import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
const picture=await sharp({create:{width:40,height:60,channels:4,background:'#abcdef'}}).png().toBuffer();
const account=(name:string)=>({token:(name==='alpha'?'a':'b').repeat(43),expires:Date.now()+86400000,user:{id:'account-'+name,label:name}});
async function setup(page:Page){
 await page.addInitScript(s=>{if(!sessionStorage.getItem('fixture-seeded')){sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s));sessionStorage.setItem('fixture-seeded','1');}localStorage.setItem('aiadcast.ui-language','ko');},account('alpha'));
 const state={calls:0,status:200,wait:Promise.resolve(),loginDelayMs:0};
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session'){const token=route.request().headers().authorization;return route.fulfill({json:{user:account(token==='Bearer '+ 'b'.repeat(43)?'bravo':'alpha').user}});}
  if(path==='/api/account/capabilities')return route.fulfill({json:{email:{enabled:false},password:{enabled:true,test:true,adminReady:true,adminEmail:'owner@example.com'},checkout:{enabled:false,test:true,currency:'KRW'}}});
  if(path==='/api/auth/logout'){state.calls++;await state.wait;return route.fulfill({status:state.status,json:state.status===200?{signedOut:true}:{error:{code:state.status===401?'AUTH_REQUIRED':'UNAVAILABLE'}}});}
  if(path==='/api/auth/test/login'){if(state.loginDelayMs)await new Promise(r=>setTimeout(r,state.loginDelayMs));return route.fulfill({json:account(route.request().postDataJSON().email.startsWith('alpha')?'alpha':'bravo')});}
  if(path==='/api/status')return route.fulfill({json:{generation:{enabled:false,reason:'GENERATION_DISABLED'},wallet:{available:0,reserved:0},budget:{limitMicros:0},assistant:{available:false}}});
  if(path==='/api/projects')return route.fulfill({json:{projects:[]}});
  return route.fulfill({status:403,json:{error:{code:'ADMIN_REQUIRED'}}});
 });return state;
}
const bar=(page:Page)=>page.getByRole('region',{name:'내 계정 및 로그아웃',exact:true});
async function login(page:Page,name:string){
 await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeVisible();await page.goto('/#account-recovery');
 await page.getByLabel('이메일',{exact:true}).fill(name+'@example.com');await page.getByLabel('비밀번호',{exact:true}).fill('Fixture-password!');
 // Wait for authentication separately from rendering the restored account.
 // The five-second DOM assertion must not also time a valid slow HTTP exchange.
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/test/login'&&r.request().method()==='POST');
 await page.locator('form').getByRole('button',{name:'로그인하고 계속',exact:true}).click();const authenticated=await response;expect(authenticated.status()).toBe(200);expect((await authenticated.json()).user.label).toBe(name);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')??'null')?.user.label)).toBe(name);await openWorkspaceMenu(page);await expect(bar(page)).toContainText(name);
}
test('signed-in account and sign-out remain accessible in the menu and touch-sized on all main routes',async({page})=>{
 await setup(page);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});for(const route of ['home','create','projects','guide','studio','editor','checkout','admin']){
  await page.goto('/#'+route);await openWorkspaceMenu(page);await expect(bar(page).getByRole('link',{name:'내 계정',exact:true})).toBeVisible();const button=bar(page).getByRole('button',{name:'로그아웃',exact:true});await expect(button).toBeVisible();const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }}
});
test('cancel keeps session; confirmed double sign-out preserves private draft and restores it only for its owner',async({page})=>{
 const state=await setup(page);await page.goto('/#create');await page.getByLabel('상품명',{exact:true}).fill('alpha private product');await page.getByLabel('참조사진 추가').setInputFiles({name:'private.png',mimeType:'image/png',buffer:picture});
 await openWorkspaceMenu(page);page.once('dialog',d=>d.dismiss());await bar(page).getByRole('button',{name:'로그아웃',exact:true}).click();expect(state.calls).toBe(0);
 let release!:()=>void;state.wait=new Promise(r=>release=r);page.once('dialog',d=>{expect(d.message()).toContain('이 기기에 보관');return d.accept();});
 await bar(page).getByRole('button',{name:'로그아웃',exact:true}).evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect.poll(()=>state.calls).toBe(1);await expect(bar(page).getByRole('button')).toBeDisabled();release();
 await expect(page).toHaveURL(/#login$/);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();await expect(bar(page)).toHaveCount(0);
 await login(page,'bravo');await page.goto('/#create');await expect(page.getByLabel('상품명',{exact:true})).not.toHaveValue('alpha private product');await expect(page.locator('.reference-photos img')).toHaveCount(0);
 await page.goto('/#projects');await expect(page.getByText('alpha private product',{exact:true})).toHaveCount(0);
 await openWorkspaceMenu(page);page.once('dialog',d=>d.accept());await bar(page).getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page).toHaveURL(/#login$/);state.loginDelayMs=5500;await login(page,'alpha');await page.goto('/#create');await expect(page.getByLabel('상품명',{exact:true})).toHaveValue('alpha private product');await expect(page.locator('.reference-photos img')).toHaveCount(1);
});
test('server failure keeps authentication and an expired-session retry safely signs out',async({page})=>{
 const state=await setup(page);state.status=503;await page.goto('/#home');await openWorkspaceMenu(page);page.on('dialog',d=>d.accept());await bar(page).getByRole('button',{name:'로그아웃',exact:true}).click();await expect(bar(page).getByRole('alert')).toBeVisible();expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!).user.id)).toBe('account-alpha');
 state.status=401;await bar(page).getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page).toHaveURL(/#login$/);await expect(bar(page)).toHaveCount(0);expect(state.calls).toBe(2);
});
test('draft storage failure stops sign-out before its server request and permits retry without deleting projects',async({page})=>{
 const state=await setup(page);await page.goto('/#create');await page.getByLabel('상품명',{exact:true}).fill('keep unsaved edits');await waitForSavedDraft(page,'keep unsaved edits');
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;(window as any).failLogoutSave=true;IDBObjectStore.prototype.put=function(...args:any[]){if((window as any).failLogoutSave&&this.name==='drafts')throw new DOMException('fixture quota','QuotaExceededError');return put.apply(this,args as [any,IDBValidKey]);};});
 await openWorkspaceMenu(page);page.on('dialog',d=>d.accept());await bar(page).getByRole('button',{name:'로그아웃',exact:true}).click();await expect(bar(page).getByRole('alert')).toBeVisible();expect(state.calls).toBe(0);await expect(page.getByLabel('상품명',{exact:true})).toHaveValue('keep unsaved edits');
 await page.evaluate(()=>(window as any).failLogoutSave=false);await bar(page).getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page).toHaveURL(/#login$/);expect(state.calls).toBe(1);
});
