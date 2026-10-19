import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
const account={token:'l'.repeat(43),expires:Date.now()+86400000,user:{id:'login-gate-user',label:'Signed in owner'}};
async function setup(page:Page,options:{session?:typeof account;delay?:Promise<void>;failure?:number}={}){
 await page.addInitScript(s=>{localStorage.setItem('aiadcast.ui-language','ko');if(s&&!sessionStorage.getItem('gate-fixture-seeded'))sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s));sessionStorage.setItem('gate-fixture-seeded','1');(window as any).__AIADCAST_NATIVE_VERSION__={versionName:'0.2.41-demo',versionCode:43,packageName:'com.selluplabs.aiadcast.next.demo'};},options.session);
 const calls:string[]=[];await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname;calls.push(path);if(path==='/api/auth/me'){await options.delay;if(options.failure)return r.fulfill({status:options.failure,json:{error:{code:'AUTH_REQUIRED'}}});return r.fulfill({json:{user:account.user}});}
 if(path==='/api/account/capabilities')return r.fulfill({json:{email:{enabled:false},password:{enabled:true,test:true,adminReady:false,adminEmail:''},checkout:{enabled:false,test:true,currency:'KRW'}}});
 if(path==='/api/auth/test/login'){options.failure=0;return r.fulfill({json:account});}if(path==='/api/auth/logout')return r.fulfill({json:{signedOut:true}});
 if(path==='/api/status')return r.fulfill({json:{generation:{dimensionGeometry:true,enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0}}});return r.fulfill({json:{projects:[]}});
 });return calls;
}
async function signIn(page:Page){await page.getByRole('button',{name:'로그인하고 계속',exact:true}).click();await page.getByLabel('이메일',{exact:true}).fill('owner@example.com');await page.getByLabel('비밀번호',{exact:true}).fill('fixture-password');await page.locator('form').getByRole('button',{name:'로그인하고 계속',exact:true}).click();}
test('all guest entry points and direct hashes stop before private inputs and preserve public access',async({page})=>{
 const calls=await setup(page);await page.goto('/');await page.getByRole('button',{name:'내 광고 만들기',exact:true}).click();await expect(page.getByRole('region',{name:'로그인 안내'})).toBeVisible();await expect(page.locator('.consumer-create')).toHaveCount(0);
 for(const route of ['create','projects','editor','studio']){await page.goto('/#'+route);await expect(page.getByRole('region',{name:'로그인 안내'})).toContainText('로그인 후');await expect(page.locator('.projects-page,.editor-container,.consumer-create')).toHaveCount(0);await expect(page.getByRole('link',{name:'앱·서버 버전 보기'})).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new Event('aiadcast-native-back',{cancelable:true})));await expect(page).toHaveURL(/#home$/);}
 for(const route of ['home','portfolio','guide','credits']){await page.goto('/#'+route);await expect(page.getByRole('region',{name:'로그인 안내'})).toHaveCount(0);}
 expect(calls.some(p=>p==='/api/projects'||p==='/api/generations'||p==='/api/account/credits')).toBe(false);
});
for(const target of ['create','projects'])test(`login resumes ${target} and cancel/back never loops or bypasses the gate`,async({page})=>{
 await setup(page);await page.goto('/#'+target);await page.getByRole('button',{name:'로그인하고 계속'}).click();await page.getByRole('link',{name:'돌아가기',exact:true}).click();await expect(page).toHaveURL(/#home$/);
 await page.goto('/#'+target);await page.evaluate(()=>window.dispatchEvent(new Event('aiadcast-native-back',{cancelable:true})));await expect(page).toHaveURL(/#home$/);
 await page.goto('/#'+target);await signIn(page);await expect(page).toHaveURL(new RegExp('#'+target+'$'));await expect(page.getByRole('region',{name:'로그인 안내'})).toHaveCount(0);await expect(page.locator(target==='create'?'.consumer-create':'.projects-page')).toBeVisible();
});
test('unknown and failed authentication never reveal a protected form and retry resumes safely',async({page})=>{
 let release!:()=>void;const delay=new Promise<void>(r=>release=r);const options={session:account,delay,failure:503};await setup(page,options);await page.goto('/#create');await expect(page.getByRole('region',{name:'로그인 안내'})).toContainText('확인 중');await expect(page.locator('.consumer-create')).toHaveCount(0);release();await expect(page.getByRole('button',{name:'로그인 상태 다시 확인'})).toBeVisible();await expect(page.locator('.consumer-create')).toHaveCount(0);options.failure=0;await page.getByRole('button',{name:'로그인 상태 다시 확인'}).click();await expect(page.locator('.consumer-create')).toBeVisible();
});
test('expired sessions cannot open projects and a successful login restores only their own saved draft',async({page})=>{
 await setup(page,{session:account});await page.goto('/#create');await page.getByLabel('상품명',{exact:true}).fill('보존할 상품');await expect(page.locator('.workspace-save-state')).toContainText('저장되었습니다');
 await page.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!);s.expires=Date.now()-1;sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s));});await page.goto('/#projects');await expect(page.getByRole('region',{name:'로그인 안내'})).toContainText('만료');await expect(page.locator('.projects-page')).toHaveCount(0);
 await signIn(page);await expect(page).toHaveURL(/#projects$/);await page.goto('/#create');await expect(page.getByLabel('상품명',{exact:true})).toHaveValue('보존할 상품');
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toHaveCount(0);await page.goto('/#projects');await expect(page.getByRole('region',{name:'로그인 안내'})).toBeVisible();await expect(page.getByText('보존할 상품',{exact:true})).toHaveCount(0);
});
test('navigation tabs and browser back keep guests outside the workspace',async({page})=>{
 await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/#home');
 for(const name of ['광고 만들기','내 프로젝트']){await page.locator('.mobile-app-nav').getByRole('link',{name,exact:true}).click();await expect(page.getByRole('region',{name:'로그인 안내'})).toBeVisible();await page.getByRole('button',{name:'로그인하고 계속'}).click();await page.goBack();await expect(page.getByRole('region',{name:'로그인 안내'})).toBeVisible();await expect(page.locator('.consumer-create,.projects-page')).toHaveCount(0);await page.getByRole('link',{name:'돌아가기',exact:true}).click();await expect(page).toHaveURL(/#home$/);}
});
test('a session validated for another user never exposes the saved account workspace',async({page})=>{
 await setup(page,{session:account});await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'different-user',label:'Other account'}}}));await page.goto('/#projects');await expect(page.getByRole('button',{name:'로그인 상태 다시 확인'})).toBeVisible();await expect(page.locator('.projects-page,.consumer-create')).toHaveCount(0);
});

test('header login also returns to the requested projects page',async({page})=>{await setup(page);await page.goto('/#projects');await page.locator('.app-header').getByRole('link',{name:'로그인',exact:true}).click();await page.getByLabel('이메일',{exact:true}).fill('owner@example.com');await page.getByLabel('비밀번호',{exact:true}).fill('fixture-password');await page.locator('form').getByRole('button',{name:'로그인하고 계속',exact:true}).click();await expect(page).toHaveURL(/#projects$/);await expect(page.locator('.projects-page')).toBeVisible();});

test('foreground session checks and reauthentication preserve attached photos and input',async({page})=>{
 const options={session:account,delay:Promise.resolve(),failure:0},calls=await setup(page,options);await page.goto('/#create');
 await page.getByLabel('상품명',{exact:true}).fill('사진 보존');const photo=await sharp({create:{width:340,height:250,channels:4,background:'#bc8552'}}).png().toBuffer();await page.getByLabel('참조사진 추가').setInputFiles({name:'original.png',mimeType:'image/png',buffer:photo});await expect(page.locator('.reference-item')).toHaveCount(1);await expect(page.locator('.workspace-save-state')).toContainText('저장되었습니다');
 let release!:()=>void;options.delay=new Promise<void>(r=>release=r);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('region',{name:'로그인 안내'})).toContainText('확인 중');await expect(page.locator('.consumer-create')).not.toBeVisible();release();await expect(page.locator('.consumer-create')).toBeVisible();await expect(page.locator('.reference-item')).toHaveCount(1);
 options.failure=401;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('region',{name:'로그인 안내'})).toContainText('만료');await signIn(page);await expect(page.getByLabel('상품명',{exact:true})).toHaveValue('사진 보존');await expect(page.locator('.reference-item')).toHaveCount(1);expect(calls.filter(p=>p==='/api/generations')).toHaveLength(0);
});
