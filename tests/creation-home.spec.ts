import sharp from 'sharp';
import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
for(const language of ['ko','en'] as const){
 test(`simple home ${language} has real image entry and honest video status without paid calls`,async({page},info)=>{
  const writes:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/'))writes.push(r.url());});
  await protectedScreen(page,mockSession('home-locale-'+language));await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
  await page.goto('/#home');const home=page.locator('.creation-home');
  const image=home.getByRole('button',{name:language==='ko'?'광고 이미지 만들기':'Create an ad image',exact:true});
  await expect(image).toBeVisible();await expect(home.getByText(language==='ko'?'준비 중':'Coming soon',{exact:true})).toBeVisible();await expect(home.locator('button')).toHaveCount(1);await expect(page.locator('.home-showcase')).toHaveCount(0);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
  await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});await page.screenshot({path:info.outputPath('home-'+language+'.png'),fullPage:true});
  await home.getByRole('link',{name:language==='ko'?'내 프로젝트':'My projects',exact:true}).click();await expect(page).toHaveURL(/#projects$/);await page.getByRole('button',{name:language==='ko'?'뒤로':'Back',exact:true}).click();await expect(home).toBeVisible();
  await home.getByRole('link',{name:language==='ko'?'내 이용권':'My Credits',exact:true}).click();await expect(page).toHaveURL(/#credits$/);await page.getByRole('button',{name:language==='ko'?'뒤로':'Back',exact:true}).click();await expect(home).toBeVisible();
  await image.evaluate((el:HTMLButtonElement)=>{el.click();el.click();});await expect(page).toHaveURL(/#create$/);expect(writes).toEqual([]);
 });
}
test('home entry preserves unsaved inputs, photos and history on repeat clicks and reload',async({page})=>{
 await protectedScreen(page,mockSession('home-unsaved'));await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.goto('/#create');const form=page.locator('.create-page');await form.getByLabel('산업 선택').selectOption('boxes');await form.getByLabel('상품명',{exact:true}).fill('보존할 상품');await form.getByRole('textbox',{name:'추가 요청',exact:true}).fill('입력 내용 보존');
 const photo=await sharp({create:{width:40,height:40,channels:3,background:'#b97842'}}).png().toBuffer();await form.getByLabel('참조사진 추가').setInputFiles({name:'retained.png',mimeType:'image/png',buffer:photo});const originalPhoto=await form.locator('img').first().getAttribute('src');
 await page.getByRole('link',{name:'aiadcast 홈',exact:true}).filter({visible:true}).first().click();await expect(page.locator('.creation-home')).toBeVisible();
 await page.locator('.creation-home').getByRole('button',{name:'광고 이미지 만들기',exact:true}).evaluate((el:HTMLButtonElement)=>{el.click();el.click();});await expect(form.getByLabel('상품명',{exact:true})).toHaveValue('보존할 상품');
 await page.getByRole('button',{name:'뒤로',exact:true}).click();await expect(page.locator('.creation-home')).toBeVisible();await page.getByRole('button',{name:'앞으로',exact:true}).click();await expect(form.getByRole('textbox',{name:'추가 요청',exact:true})).toHaveValue('입력 내용 보존');await page.reload();await expect(form.getByLabel('상품명',{exact:true})).toHaveValue('보존할 상품');await expect(form.locator('img').first()).toBeVisible();await expect(form.locator('img').first()).toHaveAttribute('src',originalPhoto!);
});
