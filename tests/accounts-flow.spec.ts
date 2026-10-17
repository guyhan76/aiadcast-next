import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
const photo=await sharp({create:{width:200,height:300,channels:4,background:'#abcdef'}}).png().toBuffer();
const session={token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'email-user-123',label:'test@example.com'}};
async function setup(page:Page){const state={approved:false,requests:[] as string[],order:undefined as any,paid:false};await page.route('**/api/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;state.requests.push(path);
 const reply=(data:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(path==='/api/account/capabilities')return reply({email:{enabled:true},checkout:{enabled:true,test:true,currency:'KRW'}});
 if(path==='/api/auth/email/request')return reply({requestId:'request-email-123',pollToken:'p'.repeat(43),expires:Date.now()+600000});
 if(path==='/api/auth/email/exchange')return reply(state.approved?{state:'verified',session}:{state:'pending'});
 if(path==='/api/auth/email/verify'){state.approved=true;return reply({verified:true});}
 if(path==='/api/status')return reply({mode:'invite-beta',commercialReady:false,generation:{enabled:false,reason:'GENERATION_DISABLED'},assistant:{available:false},wallet:{available:state.paid?30:0,reserved:0},budget:{limitMicros:0}});
 if(path==='/api/checkout/orders'&&req.method()==='POST'){const b=req.postDataJSON();expect(b.pack).toBe('bundle');expect(b.agreed).toBe(true);expect(b.amount).toBeUndefined();state.order={id:'order-test-123',credits:30,amount:49900,currency:'KRW',state:'pending',pack:'bundle',test:true,created:Date.now(),checkoutUrl:'https://beta.example.com/#pay?orderId=order-test-123&ticket='+('t'.repeat(43))};return reply(state.order);}
 if(path==='/api/checkout/orders/order-test-123')return reply({...state.order,state:state.paid?'paid':'pending'});
 if(path==='/api/projects')return reply({projects:[]});
 return reply({error:{code:'NOT_FOUND'}},404);
 });return state;}
test('email login keeps photos, wizard step and checkout selection across reload and account remount',async({page})=>{
 const state=await setup(page);await page.goto('/#create');const wizard=page.locator('.create-page');
 await wizard.getByLabel('산업 선택').selectOption('boxes');await wizard.getByLabel('상품명',{exact:true}).fill('이어 만드는 광고');await wizard.getByLabel('참조사진 추가').setInputFiles({name:'product.png',mimeType:'image/png',buffer:photo});
 await wizard.locator('[data-order="2"] summary').click();await wizard.getByRole('textbox',{name:'회사명',exact:true}).fill('selluplabs');
 await page.locator('.app-header').getByRole('button',{name:'이용 요금',exact:true}).click();await page.getByRole('link',{name:'이용권 선택',exact:true}).click();await page.getByRole('radio',{name:/묶음형/}).check();
 await page.getByRole('button',{name:'이메일로 로그인하고 계속'}).click();await page.locator('.account-page').getByLabel('이메일',{exact:true}).fill('test@example.com');await page.getByRole('button',{name:'인증메일 받기'}).click();await expect(page.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();state.approved=true;await page.getByRole('button',{name:'인증 상태 확인'}).click();await expect(page).toHaveURL(/#checkout$/);
 await expect(page.getByRole('radio',{name:/묶음형/})).toBeChecked();await expect(page.getByRole('button',{name:'테스트 결제 준비'})).toBeDisabled();await page.getByRole('checkbox',{name:/이용권 수량/}).check();await page.getByRole('button',{name:'테스트 결제 준비'}).click();await expect(page.getByRole('link',{name:'테스트 결제창 열기'})).toBeVisible();
 await page.reload();await expect(page.getByRole('link',{name:'테스트 결제창 열기'})).toBeVisible();state.paid=true;await page.getByRole('button',{name:'결제 상태 확인'}).click();await expect(page.getByRole('heading',{name:'테스트 이용권이 추가되었습니다'})).toBeVisible();await page.locator('.account-page').getByRole('link',{name:'광고 만들기',exact:true}).click();
 await expect(wizard.getByRole('button',{name:'광고 생성',exact:true})).toBeVisible();await wizard.locator('[data-order="2"] summary').click();await expect(wizard.getByRole('textbox',{name:'회사명',exact:true})).toHaveValue('selluplabs');await expect(wizard.getByLabel('상품명',{exact:true})).toHaveValue('이어 만드는 광고');await expect(wizard.locator('.reference-photos img')).toHaveCount(1);
 expect(state.requests.filter(p=>p==='/api/checkout/orders')).toHaveLength(1);
});
test('email proof requires a deliberate confirmation; it never authenticates the mail browser',async({page})=>{
 const state=await setup(page);await page.goto('/#verify?token='+('v'.repeat(43)));await expect(page.getByRole('button',{name:'이메일 인증하기'})).toBeVisible();expect(state.requests).not.toContain('/api/auth/email/verify');await page.getByRole('button',{name:'이메일 인증하기'}).click();await expect(page.getByRole('heading',{name:'인증 완료'})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();expect(page.url()).not.toContain('token=');
});
test('cancelled checkout preserves the selected pack and does not grant credits',async({page})=>{
 await setup(page);await page.addInitScript(s=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s)),session);await page.goto('/#checkout');await page.getByRole('radio',{name:/묶음형/}).check();await page.getByRole('checkbox',{name:/이용권 수량/}).check();await page.getByRole('button',{name:'테스트 결제 준비'}).click();await expect(page.getByRole('link',{name:'테스트 결제창 열기'})).toBeVisible();await page.getByText('결제를 취소했나요?',{exact:true}).click();await page.getByRole('button',{name:'이용권 다시 선택'}).click();await expect(page.getByRole('radio',{name:/묶음형/})).toBeChecked();await expect(page.getByRole('checkbox',{name:/이용권 수량/})).not.toBeChecked();await expect(page.getByRole('heading',{name:'테스트 이용권이 추가되었습니다'})).toHaveCount(0);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});
test('hosted payment uses the server quote and confirms a return before displaying success',async({page})=>{
 const grant={orderId:'order-browser-123',ticket:'t'.repeat(43)};let confirmation:any;
 await page.route('https://js.tosspayments.com/v2/standard',route=>route.fulfill({contentType:'text/javascript',body:'window.TossPayments=(key)=>({payment:({customerKey})=>({requestPayment:async(options)=>{window.testPayment={key,customerKey,options};}})});'}));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;const reply=(body:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/api/status')return reply({mode:'invite-beta',commercialReady:false,generation:{enabled:false,reason:'GENERATION_DISABLED'},assistant:{available:false},wallet:{available:0,reserved:0},budget:{limitMicros:0}});
  if(path==='/api/checkout/launch'){expect(route.request().postDataJSON()).toEqual(grant);return reply({id:grant.orderId,credits:3,amount:6900,clientKey:'test_ck_example',customerKey:'user-123',orderName:'aiadcast 3개 광고 테스트 이용권',successUrl:'https://beta.example.com/?checkout=return',failUrl:'https://beta.example.com/?checkout=return'});}
  if(path==='/api/checkout/confirm'){confirmation=route.request().postDataJSON();return reply({state:'paid'});}
  return reply({error:{code:'UNAVAILABLE'}});
 });
 await page.goto('/#pay?orderId='+grant.orderId+'&ticket='+grant.ticket);await page.getByRole('button',{name:'테스트 결제하기',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).testPayment?.options?.amount)).toEqual({currency:'KRW',value:6900});expect(page.url()).not.toContain('ticket=');
 await page.goto('/?checkout=return&orderId='+grant.orderId+'&paymentKey=approved&amount=6900');await expect(page.getByRole('heading',{name:'테스트 결제 완료'})).toBeVisible();expect(confirmation).toEqual({...grant,paymentKey:'approved',amount:6900});expect(page.url()).not.toContain('paymentKey=');
});
