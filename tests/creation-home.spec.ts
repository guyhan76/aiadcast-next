import sharp from 'sharp';
import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
for(const language of ['ko','en'] as const){
 test(`home opens both creation tools for members and exposes three destinations (${language})`,async({page})=>{
  const writes:string[]=[];
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/'))writes.push(r.url());});
  await protectedScreen(page,mockSession('home-locale-'+language));
  await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
  await page.goto('/');
  const heading=page.getByRole('heading',{level:1,name:language==='ko'?'어떤 광고를 만들까요?':'What would you like to create?',exact:true});
  const nav=page.locator('.mobile-app-nav');
  await expect(heading).toBeVisible();
  const choices=page.locator('.creation-choices');
  const labels=language==='ko'?['광고 이미지 만들기','광고 영상 만들기']:['Create an ad image','Create an ad video'];
  await expect(choices.getByRole('link')).toHaveCount(2);
  for (const link of await choices.getByRole('link').all()) {
   await expect(link).toHaveAccessibleDescription(/.+/);
   await expect(link.locator('img')).toHaveJSProperty('complete', true);
   expect(await link.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(nav.getByRole('link')).toHaveText(language==='ko'?['홈','내 프로젝트','사용 안내']:['Home','My projects','How it works']);
  await expect(nav.locator('[aria-current=page]')).toHaveAttribute('href','#home');
  for(const label of labels){
   await choices.getByRole('link',{name:label,exact:true}).click();
   await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
   await expect(choices).toHaveCount(0);
   await nav.locator('a[href="#home"]').click();
   await expect(heading).toBeVisible();
  }
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  for(const route of ['projects','guide']){
   await nav.locator('a[href="#'+route+'"]').click();
   await expect(nav.locator('[aria-current=page]')).toHaveAttribute('href','#'+route);
   await page.getByRole('button',{name:language==='ko'?'뒤로':'Back',exact:true}).click();
   await expect(heading).toBeVisible();
  }
  expect(writes).toEqual([]);
 });
}
test('home, repeated home taps, history and reload preserve the draft photo and text',async({page})=>{
 await protectedScreen(page,mockSession('home-unsaved'));
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.goto('/#home');
 const start=page.getByRole('link',{name:'광고 이미지 만들기',exact:true});
 await start.click();
 const form=page.locator('.create-page');
 const name=form.getByLabel('상품명',{exact:true});
 await name.fill('보존할 상품');
 await form.getByRole('textbox',{name:'추가 요청',exact:true}).fill('입력 내용 보존');
 const photo=await sharp({create:{width:40,height:40,channels:3,background:'#b97842'}}).png().toBuffer();
 await form.getByLabel('참조사진 추가').setInputFiles({name:'retained.png',mimeType:'image/png',buffer:photo});
 const image=form.locator('.reference-photos img').first();
 await expect(image).toBeVisible();
 const original=await image.getAttribute('src');
 const nav=page.locator('.mobile-app-nav');
 await nav.locator('a[href="#projects"]').click();
 await nav.locator('a[href="#home"]').click();
 await nav.locator('a[href="#home"]').click();
 await start.click();
 await page.getByRole('link',{name:'aiadcast 홈',exact:true}).filter({visible:true}).first().click();
 await expect(start).toBeVisible();
 await page.getByRole('button',{name:'뒤로',exact:true}).click();
 await expect(page).toHaveURL(/#create$/);
 await page.getByRole('button',{name:'앞으로',exact:true}).click();
 await expect(start).toBeVisible();
 await start.click();
 await expect(name).toHaveValue('보존할 상품');
 await page.reload();
 await expect(name).toHaveValue('보존할 상품');
 await expect(form.getByRole('textbox',{name:'추가 요청',exact:true})).toHaveValue('입력 내용 보존');
 await expect(image).toHaveAttribute('src',original!);
 await form.getByRole('button',{name:'새 광고',exact:true}).click();
 await expect(name).toHaveValue('');
 await expect(form.getByRole('textbox',{name:'추가 요청',exact:true})).toHaveValue('');
 await expect(image).toHaveCount(0);
 await page.reload();
 await expect(name).toHaveValue('');
 await expect(image).toHaveCount(0);
});
for(const language of ['ko','en'])test(`home keeps empty and failed reads distinct without creating an ad (${language})`,async({page})=>{
 const requests:string[]=[];await protectedScreen(page,mockSession('home-read-'+language));await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
 page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.method()+' '+new URL(r.url()).pathname);});
 await page.goto('/#home');const home=page.locator('.creation-home');await expect(home).toBeVisible();expect(requests.some(p=>/credits|recommendations|generations/.test(p))).toBe(false);
 const projects=page.locator('.mobile-app-nav a[href="#projects"]');await projects.click();await expect(page.locator('.project-empty')).toBeVisible();await page.goBack();await expect(home).toBeVisible();
 await page.evaluate(()=>{const getAll=IDBObjectStore.prototype.getAll;IDBObjectStore.prototype.getAll=function(...args:any[]){if(this.name==='projects')throw new DOMException('Mock unreadable store','UnknownError');return (getAll as any).apply(this,args);};});await projects.click();await expect(page.locator('.projects-page').getByRole('alert')).toBeVisible();await expect(page.locator('.project-empty')).toHaveCount(0);await page.goBack();await expect(home).toBeVisible();
 await page.route('**/api/account/credits',r=>r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}));await page.getByRole('button',{name:language==='ko'?'메뉴 열기':'Open menu',exact:true}).click();await page.locator('.workspace-menu').getByRole('link',{name:language==='ko'?'내 이용권':'My Credits',exact:true}).click();await expect(page.locator('.credits-page').getByRole('alert')).toBeVisible();await expect(page.locator('.credit-summary')).toContainText(language==='ko'?'미조회':'Not checked');await page.goBack();await expect(home).toBeVisible();expect(requests.filter(p=>p.startsWith('POST'))).toEqual([]);
});
test('signed-out home does not expose workspace or trigger creation',async({page})=>{
 const writes:string[]=[];await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','en'));await page.route('**/api/**',r=>{if(r.request().method()!=='GET')writes.push(r.request().url());return r.fulfill({json:{google:{enabled:true}}});});await page.goto('/#home');await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeEnabled();await expect(page.locator('.create-page')).toHaveCount(0);expect(writes).toEqual([]);
});
