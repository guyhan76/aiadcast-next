import {test,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import campaigns from '../src/assets/lookbook-campaigns.json';

test('single-file preview embeds all ten campaign photos',async({page})=>{
 const html=await readFile('release/aiadcast-studio.html','utf8');
 await page.route('**/standalone.html',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('/standalone.html');
 const gallery=page.locator('.home-showcase');await expect(gallery.getByRole('tab')).toHaveCount(10);
 for(const campaign of campaigns){
  await gallery.getByRole('tab',{name:campaign.label[0],exact:true}).click();
  const photo=gallery.locator('figure img');await expect(photo).toHaveAttribute('src',/^data:image\/webp;base64,/);
  await expect.poll(()=>photo.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(1000);
 }
});

test('ten unbranded campaigns keep readable exact copy in both languages and export review previews',async({page},testInfo)=>{
 test.setTimeout(90000);
 await page.goto('/');await page.evaluate(()=>document.fonts.ready);
 const gallery=page.locator('.home-showcase');
 await expect(gallery.getByRole('tab')).toHaveCount(10);
 await expect(gallery.locator('.campaign-category-group').nth(0).getByRole('tab')).toHaveCount(5);
 await expect(gallery.locator('.campaign-category-group').nth(1).getByRole('tab')).toHaveCount(5);
 for(const locale of ['ko','en'] as const){
  await page.locator('.ui-language-switch select').selectOption(locale);
  await page.evaluate(()=>document.fonts.ready);
  const dir=`artifacts/showcase/${testInfo.project.name}-${locale}`;await mkdir(dir,{recursive:true});
  for(const campaign of campaigns){
   const label=campaign.label[locale==='ko'?0:1];await gallery.getByRole('tab',{name:label,exact:true}).click();
   const poster=gallery.locator(`figure[data-campaign="${campaign.key}"]`);
   await expect(poster.locator('img')).toHaveJSProperty('complete',true);
   await expect(poster.locator('h2')).toHaveText(campaign.title[locale==='ko'?0:1].join(''));
   await expect(poster.locator('.cover-detail')).toHaveText(campaign.detail[locale==='ko'?0:1]);
   const tabGeometry=await gallery.getByRole('tab',{name:label,exact:true}).evaluate(el=>el.scrollWidth<=el.clientWidth+1);expect(tabGeometry).toBe(true);
   const geometry=await poster.evaluate(el=>{
    const box=el.getBoundingClientRect();return [...el.querySelectorAll('.cover-headline span,.cover-headline h2,.cover-detail')].every(node=>{const b=node.getBoundingClientRect();return b.left>=box.left&&b.right<=box.right+1&&b.top>=box.top&&b.bottom<=box.bottom;});
   });expect(geometry).toBe(true);
   await poster.screenshot({path:`${dir}/${campaign.key}.png`});
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }
 await page.locator('.ui-language-switch select').selectOption('ko');
 await gallery.getByRole('tab',{name:'화장품',exact:true}).click();
 await page.screenshot({path:`artifacts/showcase/${testInfo.project.name}-home.png`,fullPage:true});
});

test('keyboard, previous/next and enlarged inspection preserve selected campaign and return focus',async({page})=>{
 await page.goto('/');const gallery=page.locator('.home-showcase');
 await gallery.getByRole('tab',{name:'화장품',exact:true}).focus();await page.keyboard.press('ArrowRight');
 await expect(gallery.getByRole('tab',{name:'패션소품',exact:true})).toBeFocused();
 await gallery.getByRole('button',{name:'다음 광고',exact:true}).click();await expect(gallery.getByRole('tab',{name:'패션',exact:true})).toHaveAttribute('aria-selected','true');
 await gallery.getByRole('button',{name:'이전 광고',exact:true}).click();
 const enlarge=gallery.getByRole('button',{name:'패션소품 광고 확대 보기',exact:true});await enlarge.click();
 const dialog=page.getByRole('dialog',{name:'패션소품 광고',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'확대',exact:true}).click();await expect(dialog.locator('.image-review-content')).toHaveClass(/zoomed/);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(enlarge).toBeFocused();
});


test('export complete Korean posters for enlarged review',async({browser},testInfo)=>{
 test.skip(testInfo.project.name!=='desktop','Export once at desktop resolution');test.setTimeout(90000);
 const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:2,locale:'ko-KR',reducedMotion:'reduce'});
 try{
  const page=await context.newPage();await page.goto('http://127.0.0.1:4180/');await page.evaluate(()=>document.fonts.ready);
  const gallery=page.locator('.home-showcase');await mkdir('artifacts/showcase/posters',{recursive:true});
  for(const campaign of campaigns){
   await gallery.getByRole('tab',{name:campaign.label[0],exact:true}).click();
   const poster=gallery.locator(`figure[data-campaign="${campaign.key}"]`);
   await expect.poll(()=>poster.locator('img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(1000);
   await poster.screenshot({path:`artifacts/showcase/posters/${campaign.key}.png`});
  }
 }finally{await context.close();}
});
