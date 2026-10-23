import {test,expect,type Page} from '@playwright/test';
import {authenticatedSession} from './helpers/authenticated-session';
import sharp from 'sharp';
const photo=await sharp({create:{width:200,height:300,channels:4,background:'#abcdef'}}).png().toBuffer();
const session={token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'email-user-123',label:'test@example.com'}};
async function setup(page:Page){const state={approved:false,requests:[] as string[],order:undefined as any,paid:false};await page.route('**/api/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;state.requests.push(path);
 const reply=(data:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(path==='/api/auth/session')return req.headers().authorization==='Bearer '+session.token?reply({user:session.user}):reply({error:{code:'AUTH_REQUIRED'}},401);
 if(path==='/api/auth/logout')return reply({signedOut:true});
 if(path==='/api/account/capabilities')return reply({email:{enabled:true},checkout:{enabled:true,test:true,currency:'KRW'}});
 if(path==='/api/auth/email/request')return reply({requestId:'request-email-123',pollToken:'p'.repeat(43),expires:Date.now()+600000});
 if(path==='/api/auth/email/exchange')return reply(state.approved?{state:'verified',session}:{state:'pending'});
 if(path==='/api/auth/email/verify'){state.approved=true;return reply({verified:true});}
 if(path==='/api/status')return reply({mode:'invite-beta',commercialReady:false,generation:{enabled:false,reason:'GENERATION_DISABLED'},assistant:{available:false},wallet:{available:0,reserved:0,credits:{available:state.paid?180:0,reserved:0}},budget:{limitMicros:0}});
 if(path==='/api/checkout/orders'&&req.method()==='POST'){const b=req.postDataJSON();expect(b.pack).toBe('credits-v2-180');expect(b.agreed).toBe(true);expect(b.amount).toBeUndefined();state.order={id:'order-test-123',credits:180,amount:48900,unit:'credit-v2',currency:'KRW',state:'pending',pack:'credits-v2-180',test:true,created:Date.now(),checkoutUrl:'https://beta.example.com/#pay?orderId=order-test-123&ticket='+('t'.repeat(43))};return reply(state.order);}
 if(path==='/api/checkout/orders/order-test-123')return reply({...state.order,state:state.paid?'paid':'pending'});
 if(path==='/api/projects')return reply({projects:[]});
 return reply({error:{code:'NOT_FOUND'}},404);
 });return state;}
test('existing account recovery keeps owned photos and checkout selection across sign-out and reload',async({page})=>{
 const state=await setup(page);await authenticatedSession(page,session);await page.goto('/#create');const wizard=page.locator('.create-page');
 await wizard.getByLabel('산업 선택').selectOption('boxes');await wizard.getByLabel('상품명',{exact:true}).fill('이어 만드는 광고');await wizard.getByLabel('참조사진 추가').setInputFiles({name:'product.png',mimeType:'image/png',buffer:photo});
 await wizard.locator('[data-order="2"] summary').click();await wizard.getByRole('textbox',{name:'회사명',exact:true}).fill('selluplabs');
 await page.locator('.app-header').getByRole('button',{name:'이용 요금',exact:true}).click();await page.getByRole('link',{name:'이용권 선택',exact:true}).click();await page.getByRole('radio',{name:/묶음형/}).check();
 page.once('dialog',d=>d.accept());await page.getByRole('region',{name:'내 계정 및 로그아웃',exact:true}).getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page).toHaveURL(/#login$/);await expect(page.locator('.create-page')).toHaveCount(0);await page.goto('/#account-recovery');await page.locator('.account-page').getByLabel('이메일',{exact:true}).fill('test@example.com');await page.getByRole('button',{name:'인증메일 받기'}).click();await expect(page.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();state.approved=true;await page.getByRole('button',{name:'인증 상태 확인'}).click();await expect(page).toHaveURL(/#home$/);await page.goto('/#checkout');
 await expect(page.getByRole('radio',{name:/묶음형/})).toBeChecked();await expect(page.getByRole('button',{name:'결제',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:/이용권 수량/}).check();await page.getByRole('button',{name:'결제',exact:true}).click();await expect(page.getByRole('link',{name:'결제창 열기',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('link',{name:'결제창 열기',exact:true})).toBeVisible();state.paid=true;await page.getByRole('button',{name:'결제 상태 확인'}).click();await expect(page.getByRole('heading',{name:'이용권이 추가되었습니다',exact:true})).toBeVisible();await page.locator('.account-page').getByRole('link',{name:'광고 만들기',exact:true}).click();
 await expect(wizard.getByRole('button',{name:'광고 생성',exact:true})).toBeVisible();await wizard.locator('[data-order="2"] summary').click();await expect(wizard.getByRole('textbox',{name:'회사명',exact:true})).toHaveValue('selluplabs');await expect(wizard.getByLabel('상품명',{exact:true})).toHaveValue('이어 만드는 광고');await expect(wizard.locator('.reference-photos img')).toHaveCount(1);
 expect(state.requests.filter(p=>p==='/api/checkout/orders')).toHaveLength(1);
});
test('email proof requires a deliberate confirmation; it never authenticates the mail browser',async({page})=>{
 const state=await setup(page);await page.goto('/#verify?token='+('v'.repeat(43)));await expect(page.getByRole('button',{name:'이메일 인증하기'})).toBeVisible();expect(state.requests).not.toContain('/api/auth/email/verify');await page.getByRole('button',{name:'이메일 인증하기'}).click();await expect(page.getByRole('heading',{name:'인증 완료'})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();expect(page.url()).not.toContain('token=');
});
test('cancelled checkout preserves the selected pack and does not grant credits',async({page})=>{
 await setup(page);await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),session);await page.goto('/#checkout');await page.getByRole('radio',{name:/묶음형/}).check();await page.getByRole('checkbox',{name:/이용권 수량/}).check();await page.getByRole('button',{name:'결제',exact:true}).click();await expect(page.getByRole('link',{name:'결제창 열기',exact:true})).toBeVisible();await page.getByText('결제를 취소했나요?',{exact:true}).click();await page.getByRole('button',{name:'이용권 다시 선택'}).click();await expect(page.getByRole('radio',{name:/묶음형/})).toBeChecked();await expect(page.getByRole('checkbox',{name:/이용권 수량/})).not.toBeChecked();await expect(page.getByRole('heading',{name:'이용권이 추가되었습니다',exact:true})).toHaveCount(0);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});
test('hosted payment uses the server quote and confirms a return before displaying success',async({page},info)=>{
 const grant={orderId:'order-browser-123',ticket:'t'.repeat(43)};let confirmation:any;
 await page.route('https://js.tosspayments.com/v2/standard',route=>route.fulfill({contentType:'text/javascript',body:'window.TossPayments=(key)=>({payment:({customerKey})=>({requestPayment:async(options)=>{window.testPayment={key,customerKey,options};}})});'}));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;const reply=(body:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/api/status')return reply({mode:'invite-beta',commercialReady:false,generation:{enabled:false,reason:'GENERATION_DISABLED'},assistant:{available:false},wallet:{available:0,reserved:0},budget:{limitMicros:0}});
  if(path==='/api/checkout/launch'){expect(route.request().postDataJSON()).toEqual(grant);return reply({id:grant.orderId,credits:3,amount:6900,clientKey:'test_ck_example',customerKey:'user-123',orderName:'aiadcast 3개 광고 테스트 이용권',successUrl:'https://beta.example.com/?checkout=return',failUrl:'https://beta.example.com/?checkout=return'});}
  if(path==='/api/checkout/receipt')return reply({id:grant.orderId,state:'paid',credits:3,receipt:{verified:true,grantedCredits:3,balance:3}});
  if(path==='/api/checkout/confirm'){confirmation=route.request().postDataJSON();return reply({state:'paid'});}
  return reply({error:{code:'UNAVAILABLE'}});
 });
 await page.goto('/#pay?orderId='+grant.orderId+'&ticket='+grant.ticket);await page.getByRole('button',{name:'결제',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).testPayment?.options?.amount)).toEqual({currency:'KRW',value:6900});expect(page.url()).not.toContain('ticket=');
 await page.goto('/?checkout=return&orderId='+grant.orderId+'&paymentKey=approved&amount=6900');await expect(page.getByRole('heading',{name:'결제 완료'})).toBeVisible();expect(confirmation).toEqual({...grant,paymentKey:'approved',amount:6900});expect(page.url()).not.toContain('paymentKey=');await expect(page.getByText('3개 지급 확인 · 현재 잔액')).toBeVisible();await expect(page.getByRole('link',{name:'광고 만들기 계속'})).toHaveAttribute('href','aiadcast-demo://checkout/return');expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();await page.reload();await expect(page.getByRole('heading',{name:'결제 완료'})).toBeVisible();await page.screenshot({path:info.outputPath('checkout-complete-mock.png'),fullPage:true});
});

test('private email recovery with test login enabled preserves the existing administrator password path',async({page})=>{
 await setup(page);await page.route('**/api/account/capabilities',r=>r.fulfill({json:{email:{enabled:true},password:{enabled:true,test:true,adminReady:true,adminEmail:'owner@example.com'},checkout:{enabled:false,test:true,currency:'KRW'}}}));
 await page.goto('/#account-recovery');await expect(page.getByRole('button',{name:'인증메일 받기'})).toBeVisible();await expect(page.getByLabel('비밀번호',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'기존 비밀번호로 로그인'}).click();await page.getByRole('button',{name:'관리자 로그인',exact:true}).click();await expect(page.getByLabel('이메일',{exact:true})).toHaveValue('owner@example.com');await expect(page.getByRole('button',{name:'로그인하고 계속'})).toBeEnabled();
 await page.getByRole('button',{name:'이메일로 로그인',exact:true}).click();await expect(page.getByRole('button',{name:'인증메일 받기'})).toBeVisible();
});
test('email mobile return signs into original tab and logout cannot restore previous proof',async({page})=>{
 const state=await setup(page);await page.goto('/#account-recovery');await page.getByLabel('이메일',{exact:true}).fill('test@example.com');await page.getByRole('button',{name:'인증메일 받기'}).click();await expect(page.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();state.approved=true;await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
 await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toContainText('test@example.com');
 await page.route('**/api/auth/logout',r=>r.fulfill({json:{signedOut:true}}));page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toHaveCount(0);
 const exchanges=state.requests.filter(x=>x==='/api/auth/email/exchange').length;await page.goto('/#account-recovery');await expect(page.getByRole('button',{name:'인증메일 받기'})).toBeVisible();await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));});
 expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.email-request:guest'))).toBeNull();expect(state.requests.filter(x=>x==='/api/auth/email/exchange')).toHaveLength(exchanges);
});
test('email duplicate submits send once and expired request can be replaced without accepting its old proof',async({page})=>{
 await setup(page);let sends=0,exchanges=0;await page.route('**/api/auth/email/request',async r=>{sends++;await r.fulfill({json:{requestId:'email-'+sends,pollToken:'p'.repeat(43),expires:Date.now()+(sends===1?1000:600000)}});});
 await page.route('**/api/auth/email/exchange',r=>{exchanges++;return r.fulfill({json:{state:'pending'}});});await page.goto('/#account-recovery');await page.clock.install();await page.getByLabel('이메일',{exact:true}).fill('test@example.com');
 await page.locator('.account-page form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await expect(page.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();expect(sends).toBe(1);
 const before=exchanges,expires=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.email-request:guest')!).expires);await page.clock.setFixedTime(new Date(expires+1));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('인증 시간이 지났습니다. 다시 요청해주세요.',{exact:true})).toBeVisible();expect(exchanges).toBe(before);
 await page.getByRole('button',{name:'인증메일 받기'}).click();await expect(page.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();expect(sends).toBe(2);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.email-request:guest')!).requestId)).toBe('email-2');
});
test('email pending response after leaving login cannot install a session',async({page})=>{
 await setup(page);let release=()=>{},started=false;await page.route('**/api/auth/email/exchange',async r=>{started=true;await new Promise<void>(resolve=>release=resolve);await r.fulfill({json:{state:'verified',session}});});
 await page.goto('/#account-recovery');await page.getByLabel('이메일',{exact:true}).fill('test@example.com');await page.getByRole('button',{name:'인증메일 받기'}).click();await page.getByRole('button',{name:'인증 상태 확인'}).click();await expect.poll(()=>started).toBe(true);await page.getByRole('link',{name:'광고 편집 계속하기'}).click();await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeVisible();await expect(page.locator('.create-page')).toHaveCount(0);const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/email/exchange'));release();await response;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(page.getByRole('region',{name:'내 계정 및 로그아웃'})).toHaveCount(0);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});

test('email delivery failure retains input and retries only on user action; verify double-click sends once',async({page})=>{
 await setup(page);let sends=0,verifies=0;await page.route('**/api/auth/email/request',r=>{sends++;return sends===1?r.fulfill({status:503,json:{error:{code:'EMAIL_SEND_FAILED'}}}):r.fulfill({json:{requestId:'retry-request',pollToken:'p'.repeat(43),expires:Date.now()+600000}});});
 await page.goto('/#account-recovery');await page.getByLabel('이메일',{exact:true}).fill('test@example.com');await page.getByRole('button',{name:'인증메일 받기'}).click();await expect(page.locator('.account-page').getByRole('alert')).toBeVisible();await expect(page.getByLabel('이메일',{exact:true})).toHaveValue('test@example.com');expect(sends).toBe(1);
 await page.getByRole('button',{name:'인증메일 받기'}).click();await expect(page.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();expect(sends).toBe(2);
 await page.route('**/api/auth/email/verify',r=>{verifies++;return r.fulfill({json:{verified:true}});});await page.goto('/#verify?token='+('v'.repeat(43)));
 await page.getByRole('button',{name:'이메일 인증하기'}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});await expect(page.getByRole('heading',{name:'인증 완료'})).toBeVisible();expect(verifies).toBe(1);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});

test('email server-expired proof stops automatic polling and offers a fresh request',async({page})=>{
 await setup(page);let exchanges=0;await page.route('**/api/auth/email/exchange',r=>{exchanges++;return r.fulfill({status:401,json:{error:{code:'EMAIL_REQUEST_INVALID'}}});});await page.goto('/#account-recovery');await page.getByLabel('이메일',{exact:true}).fill('test@example.com');await page.getByRole('button',{name:'인증메일 받기'}).click();await page.getByRole('button',{name:'인증 상태 확인'}).click();await expect(page.getByRole('button',{name:'인증메일 받기'})).toBeVisible();const count=exchanges;
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));});expect(exchanges).toBe(count);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.email-request:guest'))).toBeNull();await expect(page.getByLabel('이메일',{exact:true})).toHaveValue('test@example.com');
});
