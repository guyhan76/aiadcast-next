import {authenticatedTest as test,expect} from './helpers/authenticated';
import sharp from 'sharp';
const photos=await Promise.all(['#bf8e52','#449966','#5577bb'].map(async(color,i)=>({name:`view-${i+1}.png`,mimeType:'image/png',buffer:await sharp({create:{width:400,height:300,channels:3,background:color}}).png().toBuffer()})));
test('a single multi-file selection keeps every view and exposes dimensions beside the preview',async({page})=>{
 await page.goto('/#create');const wizard=page.locator('.create-page');await wizard.getByLabel('산업 선택').selectOption('boxes');await wizard.getByRole('textbox',{name:'상세설명',exact:true}).fill('원본 사진과 입력 규격을 유지하는 시험 상품');
 await wizard.getByLabel('참조사진 추가',{exact:true}).setInputFiles(photos);
 await expect(wizard.locator('.reference-photos img')).toHaveCount(3);
 await expect(wizard.locator('.reference-heading')).toContainText('3 / 10');
 await wizard.getByLabel('상품명',{exact:true}).fill('우체국3호박스');
 await wizard.getByRole('button',{name:'규격 넣기',exact:true}).click();
 await wizard.getByLabel('규격 형식',{exact:true}).selectOption('rectangular');
 await wizard.getByLabel('규격 단위',{exact:true}).selectOption('mm');
 await wizard.getByLabel('가로 mm',{exact:true}).fill('340');
 await wizard.getByLabel('세로 mm',{exact:true}).fill('250');
 await wizard.getByLabel('높이 mm',{exact:true}).fill('210');

 await page.reload();await expect(wizard.locator('.reference-photos img')).toHaveCount(3);
 await wizard.getByRole('button',{name:'실사 그대로 사용',exact:true}).click();await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page).toHaveURL(/#studio$/);await page.goto('/#editor');
 const status=page.getByRole('region',{name:'규격 적용 확인',exact:true});
 await expect(status).toContainText('가로 340 mm × 세로 250 mm × 높이 210 mm');
 await expect(status).toContainText('원본 사진 형상 유지');await expect(status).toContainText('실물 비례: 검증 전');
 await status.getByRole('button',{name:'규격 수정',exact:true}).click();await page.locator('.editor-container').getByLabel('높이 mm',{exact:true}).fill('100');await expect(status).toContainText('높이 100 mm');
 await page.getByRole('button',{name:'원본과 결과 비교',exact:true}).click();
 // CI snapshot rendering can exceed the default 5s. Wait for the rendered
 // snapshot, then check its dimensions; do not mistake a loading dialog for a result.
 const comparison=page.getByRole('dialog',{name:'원본과 결과 비교'});
 await expect(comparison.getByRole('img',{name:'비교할 광고 결과',exact:true})).toBeVisible({timeout:15000});
 await expect(comparison.locator('.comparison-details')).toHaveText('가로 340 mm · 세로 250 mm · 높이 100 mm');
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:390,height:844});await status.screenshot({path:'/tmp/aiadcast-019-dimensions.png'});
});
test('a bad file in a new batch keeps both existing and valid new photos',async({page})=>{
 await page.goto('/#create');const wizard=page.locator('.create-page');await wizard.getByLabel('산업 선택').selectOption('boxes');await wizard.getByRole('textbox',{name:'상세설명',exact:true}).fill('원본 사진과 입력 규격을 유지하는 시험 상품');await wizard.getByLabel('참조사진 추가').setInputFiles(photos.slice(0,2));await expect(wizard.locator('.reference-photos img')).toHaveCount(2);
 await wizard.getByLabel('참조사진 추가').setInputFiles([photos[2],{name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not an image')}]);await expect(wizard.locator('.reference-photos [role=alert]')).toBeVisible();await expect(wizard.locator('.reference-photos img')).toHaveCount(3);
});
test('test server readiness requires valid responses and delegates preview configuration without secrets',async({page})=>{
 await page.addInitScript(()=>{(window as any).__AIADCAST_TEST_CONNECTION__=true;(window as any).nativeRequests=[];(window as any).AiadcastNative={postMessage:(value:string)=>{(window as any).nativeRequests.push(JSON.parse(value));window.dispatchEvent(new CustomEvent('aiadcast-test-connection',{detail:{status:'error'}}));}};});
 let ready=false;await page.route(url=>url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/me',route=>{expect(route.request().headers().authorization).toBeUndefined();const path=new URL(route.request().url()).pathname;return route.fulfill({contentType:'application/json',body:JSON.stringify(path==='/api/health'?{mode:'invite-beta',commercialReady:false}:path==='/api/status'?{mode:'invite-beta',commercialReady:false,generation:{enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0}}:{email:{enabled:ready},checkout:{enabled:ready,test:true,currency:'KRW'}})});});
 await page.goto('/#guide');await page.goto('/#guide');await page.locator('.account-drawer>summary').click();const panel=page.getByRole('region',{name:'가입·결제 테스트 연결'});await expect(panel).toContainText('응답 확인');await expect(panel.getByRole('button',{name:'회원가입 시험 시작'})).toBeDisabled();
 ready=true;await panel.getByRole('button',{name:'연결 상태 다시 확인'}).click();await expect(panel).toContainText('수신 시험 필요');await expect(panel).toContainText('승인 시험 필요');await expect(panel.getByRole('button',{name:'회원가입 시험 시작'})).toBeEnabled();
 await panel.getByLabel('테스트 서버 주소').fill('https://beta.example.com');await panel.getByRole('button',{name:'연결 주소 저장'}).click();await expect(panel.getByRole('alert')).toBeVisible();expect(await page.evaluate(()=>(window as any).nativeRequests)).toEqual([{type:'configure-test-server',origin:'https://beta.example.com'}]);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.setViewportSize({width:390,height:844});await panel.screenshot({path:'/tmp/aiadcast-019-connection.png'});
});
test('a session belonging to another origin is never sent to the newly selected test server',async({page})=>{
 await page.addInitScript(()=>{(window as any).__AIADCAST_API_ORIGIN__='https://new-server.example.com';sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'existing-user-123',label:'Private'},origin:'https://old-server.example.com'}));});
 const requests:string[]=[];await page.route('https://new-server.example.com/api/**',route=>{requests.push(route.request().url());expect(route.request().headers().authorization).toBeUndefined();return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(new URL(route.request().url()).pathname==='/api/status'?{mode:'invite-beta',commercialReady:false,generation:{enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0}}:{email:{enabled:true},checkout:{enabled:true,test:true,currency:'KRW'}})});});
 await page.goto('/#checkout');await expect(page.getByRole('button',{name:'이메일로 로그인하고 계속'})).toBeVisible();await expect(page.getByRole('heading',{name:'테스트 이용권이 추가되었습니다'})).toHaveCount(0);await expect.poll(()=>requests.some(url=>url.endsWith('/api/account/capabilities'))).toBe(true);
});
test('an unrelated JSON endpoint cannot crash the editor or enable signup and checkout',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.route(url=>url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/me',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({unrelated:'endpoint'})}));
 await page.goto('/#studio');await expect(page.getByRole('region',{name:'AI 광고 제작',exact:true})).toBeVisible();await page.goto('/#guide');await page.locator('.account-drawer>summary').click();const panel=page.getByRole('region',{name:'가입·결제 테스트 연결'});await expect(panel).toContainText('연결되지 않음');await expect(panel.getByRole('button',{name:'회원가입 시험 시작'})).toBeDisabled();expect(errors).toEqual([]);
});
