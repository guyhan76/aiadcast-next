import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
const session={token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'checkout-user-123',label:'Mock member'}};
const order={id:'order-return-123',pack:'trial',credits:3,amount:6900,currency:'KRW',state:'paid',created:Date.now(),test:true,receipt:{verified:true,grantedCredits:3,balance:5}};
async function mocks(page:Page){const calls:string[]=[];await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;calls.push(path);const reply=(data:unknown,status=200)=>route.fulfill({contentType:'application/json',status,body:JSON.stringify(data)});if(path==='/api/account/capabilities')return reply({email:{enabled:true},checkout:{enabled:true,test:true,currency:'KRW'}});if(path==='/api/status')return reply({mode:'invite-beta',commercialReady:false,generation:{enabled:false,reason:'BUDGET_NOT_AVAILABLE'},wallet:{available:5,reserved:0},budget:{limitMicros:0}});if(path==='/api/checkout/orders/'+order.id)return reply(order);if(path==='/api/projects')return reply({projects:[]});return reply({error:{code:'NOT_FOUND'}},404);});return calls;}
async function context(page:Page,userId=session.user.id,age=0,route='create'){await page.evaluate(({userId,age,route,orderId})=>localStorage.setItem('aiadcast.checkout-continuation',JSON.stringify({userId,orderId,origin:location.origin,created:Date.now()-age,route})),{userId,age,route,orderId:order.id});}
test('native return verifies paid ledger, refreshes credits and resumes original photo/description/dimensions without generating',async({page},info)=>{
 const calls=await mocks(page);await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),session);await page.goto('/#create');
 const form=page.locator('.create-page');await form.getByLabel('산업 선택').selectOption('boxes');await form.getByLabel('상품명',{exact:true}).fill('복귀 검증 박스');
 const photo=await sharp({create:{width:200,height:300,channels:4,background:'#ddd'}}).png().toBuffer();await form.getByLabel('참조사진 추가').setInputFiles({name:'mock-box.png',mimeType:'image/png',buffer:photo});
 const textboxes=await form.locator('textarea').all();await textboxes[0].fill('사진과 설명을 유지하는 테스트 박스');
 await form.getByRole('button',{name:'규격 넣기',exact:true}).click();
 await form.getByRole('textbox',{name:'가로 cm',exact:true}).fill('34');await form.getByRole('textbox',{name:'세로 cm',exact:true}).fill('25');await form.getByRole('textbox',{name:'높이 cm',exact:true}).fill('21');await form.getByRole('radio',{name:'본제품에 직접 표시',exact:true}).check();
 const before=await form.locator('input,textarea,select').evaluateAll(nodes=>nodes.map(n=>({name:n.getAttribute('name'),value:(n as HTMLInputElement).value,type:(n as HTMLInputElement).type})).filter(n=>n.type!=='file'));
 await expect(page.getByText('입력 내용이 기기에 저장되었습니다.',{exact:true})).toBeVisible();await context(page);await page.locator('.app-header').getByRole('link',{name:'내 이용권'}).click();await page.locator('.credits-page').getByRole('link',{name:'광고 이미지 만들기',exact:true}).click();
 await expect(page).toHaveURL(/#create$/);await expect(page.getByText(/이용권 3개 지급 확인 · 현재 잔액 5개/)).toBeVisible();await expect(form.getByLabel('상품명',{exact:true})).toHaveValue('복귀 검증 박스');await expect(form.locator('.reference-photos img')).toHaveCount(1);
 const after=await form.locator('input,textarea,select').evaluateAll(nodes=>nodes.map(n=>({name:n.getAttribute('name'),value:(n as HTMLInputElement).value,type:(n as HTMLInputElement).type})).filter(n=>n.type!=='file'));expect(after).toEqual(before);expect(calls).toContain('/api/checkout/orders/'+order.id);expect(calls.some(p=>p.startsWith('/api/generations'))).toBe(false);
 await page.screenshot({path:info.outputPath('checkout-resumed-mock.png'),fullPage:true});
 await page.evaluate(()=>window.dispatchEvent(new Event('aiadcast-checkout-return')));await expect(page).toHaveURL(/#create$/);await expect(form.locator('.reference-photos img')).toHaveCount(1);
});
test('different account, missing context and expired context never inspect an order or overwrite work',async({page})=>{
 const calls=await mocks(page);await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),session);await page.goto('/');await context(page,'other-user-123');await page.goto('/#checkout-return');await expect(page.getByText('결제를 시작한 계정으로 로그인해주세요.',{exact:false})).toBeVisible();expect(calls).not.toContain('/api/checkout/orders/'+order.id);
 await context(page,session.user.id,86400001);await page.reload();await expect(page.getByText('복귀 정보가 없거나 만료되었습니다.',{exact:false})).toBeVisible();
 await page.evaluate(()=>localStorage.removeItem('aiadcast.checkout-continuation'));await page.reload();await expect(page.getByRole('link',{name:'내 이용권 확인'})).toBeVisible();expect(calls).not.toContain('/api/checkout/orders/'+order.id);
});
test('new draft starts input; unverified or canceled order cannot claim success or navigate to injected URL',async({page})=>{
 const calls=await mocks(page);await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),session);await page.goto('/');await context(page);await page.goto('/#checkout-return');await expect(page).toHaveURL(/#create$/);await expect(page.getByRole('textbox',{name:'상품명',exact:true})).toHaveValue('');
 await page.route('**/api/checkout/orders/'+order.id,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...order,state:'canceled',receipt:undefined})}));await page.goto('/#checkout-return');await expect(page.getByRole('button',{name:'지급 내역 다시 확인'})).toBeVisible();await expect(page).toHaveURL(/#checkout-return$/);
 await context(page,session.user.id,0,'https://evil.example');await page.reload();await expect(page.getByRole('link',{name:'내 이용권 확인'})).toBeVisible();expect(page.url()).not.toContain('evil');expect(calls.some(p=>p.startsWith('/api/generations'))).toBe(false);
});
test('cold return requires sign-in, then verifies the same account and restores the input route',async({page})=>{
 const calls=await mocks(page);await page.route('**/api/account/capabilities',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({email:{enabled:false},password:{enabled:true,test:true,adminReady:true,adminEmail:'owner@example.com'},checkout:{enabled:true,test:true,currency:'KRW'}})}));
 await page.route('**/api/auth/test/login',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(session)}));await page.goto('/');await context(page);await page.goto('/#checkout-return');await expect(page.getByRole('link',{name:'로그인',exact:true})).toBeVisible();expect(calls).not.toContain('/api/checkout/orders/'+order.id);
 await page.getByRole('link',{name:'로그인',exact:true}).click();await page.getByRole('textbox',{name:'이메일',exact:true}).fill('fixture@example.com');await page.getByLabel('비밀번호',{exact:true}).fill('Fixture-password!');await page.getByRole('button',{name:'로그인하고 계속'}).click();await expect(page).toHaveURL(/#create$/);await expect(page.getByText(/이용권 3개 지급 확인/)).toBeVisible();expect(calls).toContain('/api/checkout/orders/'+order.id);
});
test('older APK purchase can be selected from authenticated history without another payment',async({page})=>{
 const calls=await mocks(page);await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),session);await page.route('**/api/checkout/orders',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({orders:[order]})}));await page.goto('/#checkout-return');await page.getByRole('button',{name:'이전 결제 내역 확인'}).click();await page.getByRole('button',{name:/3개 주문 지급 확인하고 계속/}).click();await expect(page).toHaveURL(/#create$/);expect(calls).toContain('/api/checkout/orders/'+order.id);expect(calls).not.toContain('/api/checkout/confirm');
});
test('expired app authentication prompts same-account login without treating payment as failed',async({page})=>{
 await mocks(page);await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),session);await page.route('**/api/checkout/orders/'+order.id,r=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'AUTH_REQUIRED'}})}));await page.goto('/');await context(page);await page.goto('/#checkout-return');await expect(page.getByRole('link',{name:'로그인',exact:true})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();expect(await page.evaluate(()=>localStorage.getItem('aiadcast.checkout-continuation'))).toContain(order.id);
});

test('verified payment notice expires and does not follow users into the guide',async({page})=>{
 await page.clock.install();await mocks(page);await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),session);
 await page.goto('/');await context(page);await page.goto('/#checkout-return');await expect(page).toHaveURL(/#create$/);await expect(page.getByText(/이용권 3개 지급 확인/)).toBeVisible();
 await page.goto('/#guide');await expect(page.getByText(/이용권 3개 지급 확인/)).toHaveCount(0);await page.goto('/#create');await expect(page.getByText(/이용권 3개 지급 확인/)).toHaveCount(0);
 await page.goto('/#checkout-return');await expect(page).toHaveURL(/#create$/);await expect(page.getByText(/이용권 3개 지급 확인/)).toBeVisible();await page.clock.fastForward(60001);await expect(page.getByText(/이용권 3개 지급 확인/)).toHaveCount(0);
});
