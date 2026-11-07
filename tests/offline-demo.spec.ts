import {test,expect,type Page} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('protected-offline-demo'));});import sharp from 'sharp';import fs from 'node:fs/promises';
const photo=await sharp({create:{width:300,height:300,channels:4,background:'#ffffff'}}).composite([{input:await sharp({create:{width:180,height:120,channels:4,background:'#284b77'}}).png().toBuffer(),left:60,top:80}]).png().toBuffer();
async function start(page:Page){await page.goto('/?support=1#guide');await page.locator('.account-drawer>summary').click();await page.getByRole('button',{name:'서버 없는 체험 시작',exact:true}).click();await expect(page.getByRole('heading',{name:'회원가입',exact:true})).toBeVisible();await page.locator('#account-email').fill('demo@example.com');await page.getByRole('button',{name:'체험 계정 만들기',exact:true}).click();await page.getByRole('button',{name:'체험 인증 완료하기',exact:true}).click();await expect(page.getByRole('button',{name:'체험 인증 완료하기',exact:true})).toHaveCount(0);await page.goto('/#checkout');}
test('without a server: signup, failed/canceled/successful checkout, review, rejection, PNG export and re-login',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await start(page);
 const calls:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url());});
 await page.getByRole('radio',{name:/기본형/}).check();await page.getByRole('checkbox',{name:/이용권 수량/}).check();await page.getByRole('button',{name:'결제',exact:true}).click();
 await page.getByRole('button',{name:'결제 실패 시험',exact:true}).click();await expect(page.getByRole('alert')).toContainText('이용권은 추가되지 않았습니다');await expect(page.locator('.credit-balance')).toContainText('0개');
 await page.getByRole('button',{name:'결제 취소 시험',exact:true}).click();await expect(page.locator('.credit-balance')).toContainText('0개');await page.getByRole('button',{name:'이용권 다시 선택',exact:true}).first().click();
 await page.getByRole('checkbox',{name:/이용권 수량/}).check();await page.getByRole('button',{name:'결제',exact:true}).click();await page.getByRole('button',{name:'결제 성공 시험',exact:true}).dblclick();await expect(page.getByRole('heading',{name:'체험 이용권이 추가되었습니다'})).toBeVisible();await expect(page.locator('.account-page')).toContainText('보유 100개');
 await page.locator('.account-page').getByRole('link',{name:'광고 만들기',exact:true}).click();await expect(page.locator('.consumer-create')).toBeVisible();
 // The advanced manual-composition route must not auto-request a second visual.
 await page.goto('/#editor');await page.locator('.editor-details>summary').click();await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'product.png',mimeType:'image/png',buffer:photo});await page.getByRole('textbox',{name:'상품·서비스명',exact:true}).fill('시험 상품');await page.getByRole('combobox',{name:'출력 비율',exact:true}).selectOption('4:5');

 const panel=page.getByRole('region',{name:'기기 내 체험 합성',exact:true});await expect(panel).toContainText('신규 크레딧 잔액: 100');await panel.getByRole('checkbox',{name:'이번 생성 10크레딧 차감을 확인했습니다.'}).check();await panel.getByRole('button',{name:'광고 생성 · 10크레딧',exact:true}).click();await expect(panel).toContainText('신규 크레딧 잔액: 90');await panel.getByRole('button',{name:'반려 · 자동 복원 없음',exact:true}).click();await expect(panel).toContainText('신규 크레딧 잔액: 90');
 await panel.getByRole('checkbox',{name:'이번 생성 10크레딧 차감을 확인했습니다.'}).check();await panel.getByRole('button',{name:'광고 생성 · 10크레딧',exact:true}).click();await expect(panel.getByRole('button',{name:/^(사용 확정|Accept)$/})).toBeEnabled();await panel.getByRole('button',{name:'사용 확정',exact:true}).click();await expect(panel).toContainText('신규 크레딧 잔액: 80');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();const download=await downloaded;const path=await download.path();const metadata=await sharp(await fs.readFile(path!)).metadata();expect(metadata.width).toBe(1080);expect(metadata.height).toBe(1350);
 await panel.getByRole('button',{name:'저장한 시안 다시 적용',exact:true}).click();await expect(panel).toContainText('신규 크레딧 잔액: 80');
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 expect(calls).toEqual([]);expect(errors).toEqual([]);
 await page.goto('/?support=1#guide');await page.locator('.account-drawer>summary').click();await page.getByRole('button',{name:'체험 계정 로그아웃'}).click();await page.locator('#account-email').fill('demo@example.com');await page.getByRole('button',{name:'체험 계정 만들기'}).click();await page.getByRole('button',{name:'체험 인증 완료하기'}).click();await expect(page.getByRole('button',{name:'체험 인증 완료하기'})).toHaveCount(0);await page.goto('/#checkout');await expect(page.locator('.account-page')).toContainText('보유 80개');
});
test('automatic outline check records only the chosen view and does not certify physical 3D',async({page})=>{
 let generationPosts=0;await page.route('**/api/**',route=>{if(new URL(route.request().url()).pathname==='/api/auth/session')return route.fallback();const path=new URL(route.request().url()).pathname;if(path==='/api/generations'&&route.request().method()==='POST')generationPosts++;return route.fulfill({contentType:'application/json',body:JSON.stringify(path==='/api/status'?{mode:'local-development',commercialReady:false,generation:{enabled:true,model:'test-fixture'},wallet:{available:10,reserved:0},budget:{limitMicros:1000000,spentMicros:0,heldMicros:0},assistant:{available:false}}:path==='/api/generations'?{jobs:[]}:{email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}})});});
 await page.goto('/#editor');await page.locator('.editor-details>summary').click();await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'front.png',mimeType:'image/png',buffer:photo});await page.getByRole('textbox',{name:'상품·서비스명',exact:true}).fill('정면 시험 상품');await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();for(const [axis,n] of [['가로','180'],['세로','100'],['높이','120']])await page.locator('.editor-container').getByLabel(axis+' mm',{exact:true}).fill(n);

 const panel=page.getByRole('region',{name:'상품 비례 자동 검사',exact:true});await panel.getByRole('combobox',{name:'사진 1 촬영면',exact:true}).selectOption('front');await expect(panel).toContainText('사진 근거 부족');await panel.getByRole('checkbox').check();await expect(panel).toContainText('이 사진의 두 축 비율 일치');await expect(panel).toContainText('일부 촬영면만 확인됨');await expect(panel).toContainText('사진 비례를 유지했습니다');
 const downloaded=page.waitForEvent('download');await panel.getByRole('button',{name:'자동 검사 기록 저장'}).click();const file=await (await downloaded).path();const report=JSON.parse(await fs.readFile(file!,'utf8'));expect(report.geometryVerified).toBe(false);expect(report.status).toBe('partially-checked');expect(report.missingPairs).toEqual(['depth:height','width:depth']);expect(report.sourceViews[0].assessment.error).toBeLessThan(.02);
 await panel.getByRole('combobox',{name:'사진 1 촬영면',exact:true}).selectOption('perspective');await expect(panel).toContainText('원근 사진은 비례 판정 보류');
 await panel.getByRole('combobox',{name:'사진 1 촬영면',exact:true}).selectOption('front');await page.getByRole('region',{name:'규격 적용 확인',exact:true}).getByRole('button',{name:'규격 수정',exact:true}).click();await page.locator('.editor-container').getByLabel('높이 mm',{exact:true}).fill('60');await expect(panel).toContainText('규격 대비 비례 차이 감지');const generation=page.getByRole('region',{name:'AI 광고 제작',exact:true});await generation.getByRole('button',{name:'AI 배경 요청 · 1개',exact:true}).click();await expect(generation.getByRole('alert')).toContainText('새 시안은 요청하지 않았습니다');expect(generationPosts).toBe(0);
});

test('offline demo validates issued sessions and cannot use a forged token for an existing account',async({page})=>{
 await start(page);
 const calls:string[]=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))calls.push(request.url());});
 const original=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!));
 await page.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!);s.token='z'.repeat(43);sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s));});
 await page.reload();await expect(page.locator('#account-email')).toBeVisible();
 expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
 await page.locator('#account-email').fill('demo@example.com');await page.getByRole('button',{name:'체험 계정 만들기',exact:true}).click();await page.getByRole('button',{name:'체험 인증 완료하기',exact:true}).click();
 await expect(page.locator('.app-header')).toBeVisible();
 const restored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!));
 expect(restored.user.id).toBe(original.user.id);expect(restored.origin).toBe('local-demo://device');
 await page.goto('/?support=1#guide');await page.locator('.account-drawer>summary').click();await page.getByRole('button',{name:'체험 계정 로그아웃',exact:true}).click();await expect(page.locator('#account-email')).toBeVisible();
 await page.evaluate(value=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(value)),restored);
 await page.reload();await expect(page.locator('#account-email')).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
 expect(calls).toEqual([]);
});

