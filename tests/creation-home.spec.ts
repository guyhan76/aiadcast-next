import {selectConsumerIndustry} from './helpers/industry';
import sharp from 'sharp';
import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
for(const language of ['ko','en'] as const){
 test(`simple home ${language} has real image entry and honest video status without paid calls`,async({page},info)=>{
  const writes:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/'))writes.push(r.url());});
  await protectedScreen(page,mockSession('home-locale-'+language));await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
  await page.goto('/#home');const home=page.locator('.creation-home');
  const image=home.getByRole('button',{name:language==='ko'?'광고 이미지 만들기':'Create an ad image',exact:true});
  await expect(home.getByRole('heading',{level:1,name:language==='ko'?'어떤 광고를 만들까요?':'What would you like to create?',exact:true})).toBeVisible();await expect(home.locator('p')).toHaveCount(0);await expect(home.locator('.creation-home-video button,.creation-home-video a')).toHaveCount(0);await expect(image).toBeVisible();await expect(home.getByText(language==='ko'?'준비 중':'Coming soon',{exact:true})).toBeVisible();await expect(home.locator('button')).toHaveCount(1);await expect(page.locator('.home-showcase')).toHaveCount(0);
  for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await expect(home.locator('img')).toHaveCount(0);await expect(home.getByRole('link')).toHaveCount(0);expect((await image.boundingBox())!.height).toBeGreaterThanOrEqual(44);expect(await home.locator('h1,button,h2,.creation-home-video>span').allTextContents()).toEqual(language==='ko'?['어떤 광고를 만들까요?','광고 이미지 만들기','광고 영상 만들기','준비 중']:['What would you like to create?','Create an ad image','Create an ad video','Coming soon']);await page.screenshot({path:info.outputPath('home-'+language+'-'+width+'.png'),fullPage:true});}
  await page.setViewportSize({width:info.project.name==='mobile'?375:1440,height:900});await page.screenshot({path:info.outputPath('home-'+language+'.png'),fullPage:true});
  await image.focus();await expect(image).toBeFocused();expect(await image.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');await page.keyboard.press('Tab');await expect(page.locator('.mobile-app-nav a').first()).toBeFocused();
  await page.locator('.mobile-app-nav a[href="#projects"]').click();await expect(page).toHaveURL(/#projects$/);await page.getByRole('button',{name:language==='ko'?'뒤로':'Back',exact:true}).click();await expect(home).toBeVisible();
  await page.getByRole('button',{name:language==='ko'?'메뉴 열기':'Open menu',exact:true}).click();await page.locator('.workspace-menu').getByRole('link',{name:language==='ko'?'내 이용권':'My Credits',exact:true}).click();await expect(page).toHaveURL(/#credits$/);await page.getByRole('button',{name:language==='ko'?'뒤로':'Back',exact:true}).click();await expect(home).toBeVisible();
  await image.evaluate((el:HTMLButtonElement)=>{el.click();el.click();});await expect(page).toHaveURL(/#create$/);expect(writes).toEqual([]);
 });
}
test('home entry preserves unsaved inputs, photos and history on repeat clicks and reload',async({page})=>{
 await protectedScreen(page,mockSession('home-unsaved'));await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.goto('/#create');const form=page.locator('.create-page');await selectConsumerIndustry(form,'boxes');await form.getByLabel('상품명',{exact:true}).fill('보존할 상품');await form.getByRole('textbox',{name:'추가 요청',exact:true}).fill('입력 내용 보존');
 const photo=await sharp({create:{width:40,height:40,channels:3,background:'#b97842'}}).png().toBuffer();await form.getByLabel('참조사진 추가').setInputFiles({name:'retained.png',mimeType:'image/png',buffer:photo});const originalPhoto=await form.locator('img').first().getAttribute('src');
 await page.getByRole('link',{name:'aiadcast 홈',exact:true}).filter({visible:true}).first().click();await expect(page.locator('.creation-home')).toBeVisible();
 await page.locator('.creation-home').getByRole('button',{name:'광고 이미지 만들기',exact:true}).evaluate((el:HTMLButtonElement)=>{el.click();el.click();});await expect(form.getByLabel('상품명',{exact:true})).toHaveValue('보존할 상품');
 await page.getByRole('button',{name:'뒤로',exact:true}).click();await expect(page.locator('.creation-home')).toBeVisible();await page.getByRole('button',{name:'앞으로',exact:true}).click();await expect(form.getByRole('textbox',{name:'추가 요청',exact:true})).toHaveValue('입력 내용 보존');await page.reload();await expect(form.getByLabel('상품명',{exact:true})).toHaveValue('보존할 상품');await expect(form.locator('img').first()).toBeVisible();await expect(form.locator('img').first()).toHaveAttribute('src',originalPhoto!);
});
for(const language of ['ko','en'])test(`home keeps empty and failed reads distinct without querying balances in advance (${language})`,async({page})=>{
 const requests:string[]=[];await protectedScreen(page,mockSession('home-read-'+language));await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
 page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.method()+' '+new URL(r.url()).pathname);});
 await page.goto('/#home');const home=page.locator('.creation-home');await expect(home).toBeVisible();expect(requests.some(p=>/credits|recommendations|generations|status/.test(p))).toBe(false);
 const projects=page.locator('.mobile-app-nav a[href="#projects"]');await projects.click();await expect(page.locator('.project-empty')).toBeVisible();await page.goBack();await expect(home).toBeVisible();
 await page.evaluate(()=>{const getAll=IDBObjectStore.prototype.getAll;IDBObjectStore.prototype.getAll=function(...args:any[]){if(this.name==='projects')throw new DOMException('Mock unreadable store','UnknownError');return (getAll as any).apply(this,args);};});await projects.click();await expect(page.locator('.projects-page').getByRole('alert')).toBeVisible();await expect(page.locator('.project-empty')).toHaveCount(0);await page.goBack();await expect(home).toBeVisible();
 await page.route('**/api/account/credits',r=>r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}));await page.getByRole('button',{name:language==='ko'?'메뉴 열기':'Open menu',exact:true}).click();await page.locator('.workspace-menu').getByRole('link',{name:language==='ko'?'내 이용권':'My Credits',exact:true}).click();await expect(page.locator('.credits-page').getByRole('alert')).toBeVisible();await expect(page.locator('.credit-summary')).toContainText(language==='ko'?'미조회':'Not checked');await page.goBack();await expect(home).toBeVisible();expect(requests.filter(p=>p.startsWith('POST'))).toEqual([]);
});
test('signed-out home does not expose workspace or trigger creation',async({page})=>{
 const writes:string[]=[];await page.route('**/api/**',r=>{if(r.request().method()!=='GET')writes.push(r.request().url());return r.fulfill({json:{google:{enabled:true}}});});await page.goto('/#home');await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeEnabled();await expect(page.locator('.creation-home')).toHaveCount(0);expect(writes).toEqual([]);
});
