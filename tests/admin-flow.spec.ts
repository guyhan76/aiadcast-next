import {test,expect} from '@playwright/test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {BetaStore} from '../server/beta-store.mjs';
import {createBetaServer} from '../server/beta-server.mjs';
import {GenerationService} from '../server/generation-service.mjs';

// Real local HTTP/auth/SQLite, captured mail, and an injected image-provider fixture.
// This test is deliberately not evidence of live OpenAI or email-provider success.
test('server signup, operator allocation, generation review and PNG export work together',async({page,browser})=>{
 const dir=mkdtempSync(join(tmpdir(),'aiadcast-admin-browser-')),store=new BetaStore(dir,{monthlyBudgetMicros:1_000_000});
 const invite=store.provision({label:'Operator',credits:0});store.setRole(invite.userId,'admin');
 const mail:{email:string;url:string}[]=[],origin='https://beta.example.com',services=new Map<string,GenerationService>();let calls=0;
 const bytes=await sharp({create:{width:864,height:1536,channels:4,background:'#c0dbdf'}}).png().toBuffer();
 const app=createBetaServer({store,publicUrl:origin,accounts:{sendMail:async m=>{mail.push(m);}},serviceFactory:u=>{
  const s=new GenerationService({databasePath:join(dir,u.id+'.sqlite'),managedBudgetIncrease:true,budgetMicros:u.budget,testCredits:u.credits,enabled:true,providerConfigured:true,adapter:{generate:async()=>{calls++;return {bytes,width:864,height:1536,mime:'image/png',sha256:createHash('sha256').update(bytes).digest('hex'),cost:{microUsd:1000},usage:{input_tokens:20,output_tokens:20},model:'gpt-image-2.5-sunburst',role:'creative',quality:'high',size:'864x1536'};}}});services.set(u.id,s);return s;
 }});
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const port=(app.server.address() as {port:number}).port;
 const member=await browser.newContext({baseURL:'http://127.0.0.1:4180',viewport:{width:390,height:844}}),shop=await member.newPage(),proof=await member.newPage();
 const proxy=async(p:typeof page)=>{await p.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url());const response=await route.fetch({url:'http://127.0.0.1:'+port+url.pathname+url.search,headers:{...request.headers(),origin}});await route.fulfill({response});});};
 try{
  await Promise.all([proxy(page),proxy(shop),proxy(proof)]);
  await page.goto('/#guide');await page.locator('.account-drawer>summary').click();await page.getByRole('button',{name:'테스트 로그인',exact:true}).click();await page.getByLabel('초대코드',{exact:true}).fill(invite.invite);await page.locator('.beta-account-panel').getByRole('button',{name:'로그인',exact:true}).click();
  await page.locator('.app-header').getByRole('link',{name:'관리자',exact:true}).click();await expect(page.locator('.admin-page').getByRole('heading',{name:'회원 목록',exact:true})).toBeVisible();
  await shop.goto('/#signup');await shop.locator('.account-page').getByLabel('이메일',{exact:true}).fill('member@example.com');await shop.getByRole('button',{name:'인증메일 받기',exact:true}).click();await expect(shop.getByRole('heading',{name:'메일함을 확인해주세요'})).toBeVisible();
  await expect.poll(()=>mail.length).toBe(1);const token=new URLSearchParams(new URL(mail[0].url).hash.split('?')[1]).get('token');
  await proof.goto('/#verify?token='+token);await proof.getByRole('button',{name:'이메일 인증하기',exact:true}).click();await expect(proof.getByRole('heading',{name:'인증 완료'})).toBeVisible();expect(await proof.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
  await shop.getByRole('button',{name:'인증 상태 확인',exact:true}).click();await expect(shop).toHaveURL(/#home$/);
  await page.locator('.admin-page').getByRole('button',{name:'새로고침',exact:true}).click();await page.getByLabel('대상 회원',{exact:true}).selectOption({label:'member@example.com'});await page.getByRole('button',{name:'테스트 이용권 지급',exact:true}).click();await expect(page.locator('.admin-notice')).toContainText('지급했습니다');
  await page.getByLabel('월 공급사 배정액 USD',{exact:true}).fill('0.5');await page.getByRole('button',{name:'배정액 적용',exact:true}).click();await expect(page.locator('.admin-notice')).toContainText('배정을 적용했습니다');
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}await page.setViewportSize({width:390,height:844});
  await shop.goto('/#create');const wizard=shop.locator('.create-page');await wizard.getByLabel('산업 선택').selectOption('lodging');await wizard.getByRole('textbox',{name:'상세설명',exact:true}).fill('편안한 호텔 객실');await wizard.getByLabel('서비스명',{exact:true}).fill('테스트 호텔');await wizard.getByRole('button',{name:/9:16/}).click();await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();
  const panel=shop.locator('.generation-panel');await expect(panel.getByText('결과를 확인해주세요',{exact:true})).toBeVisible();await panel.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();await expect(shop.getByRole('heading',{name:'사용 확정한 광고',exact:true})).toBeVisible();
  const download=shop.waitForEvent('download');await shop.getByRole('button',{name:'이미지 저장',exact:true}).click();const exported=await sharp((await(await download).path())!).metadata();expect(exported.width).toBe(1080);expect(exported.height).toBe(1920);expect(calls).toBe(1);
  await page.locator('.admin-page').getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.getByRole('cell',{name:'accepted',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'$0.0010',exact:true})).toBeVisible();
  const user=store.db.prepare("SELECT * FROM users WHERE label='member@example.com'").get();expect(services.get(user.id)!.wallet().available).toBe(0);expect(services.get(user.id)!.wallet().reserved).toBe(0);
 }finally{await member.close();await app.close();store.close();rmSync(dir,{recursive:true,force:true});}
});
