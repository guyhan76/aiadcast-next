import {test,expect} from './helpers/authenticated';
import sharp from 'sharp';

test('home names the six requested channels in both languages and discloses concept provenance',async({page})=>{
 await page.goto('/');const gallery=page.locator('.home-showcase');
 await expect(gallery.getByRole('tab')).toHaveCount(10);
 await expect(gallery.locator('.showcase-channels li')).toHaveText(['인스타그램','유튜브','홈페이지','블로그','포스터','홍보브로셔']);
 await expect(gallery.locator('.showcase-provenance')).toContainText('실제 앱 생성 사례는 준비 중입니다.');
 await page.getByRole('combobox',{name:'앱 언어'}).selectOption('en');
 await expect(gallery.locator('.showcase-channels li')).toHaveText(['Instagram','YouTube','Website','Blog','Poster','Promotional brochure']);
 await expect(gallery.locator('.showcase-provenance')).toContainText('Verified app-generated examples are being prepared.');
});

test('gallery preserves seven intrinsic image ratios without stretching or cropping',async({page})=>{
 // Synthetic layout fixtures only: these are never published as app-generated ads.
 for(const [width,height] of [[500,500],[400,500],[300,400],[360,640],[400,600],[640,360],[764,400]]){
  const bytes=await sharp({create:{width,height,channels:3,background:'#ccbbaa'}}).webp().toBuffer();
  await page.route('**/showcase-beauty-*.webp',r=>r.fulfill({contentType:'image/webp',body:bytes}));
  await page.goto('/');const photo=page.locator('.campaign-preview figure img');
  await expect.poll(()=>photo.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(width);
  const geometry=await photo.evaluate((img:HTMLImageElement)=>({width:img.clientWidth,height:img.clientHeight,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,fit:getComputedStyle(img).objectFit}));
  expect(geometry.naturalHeight).toBe(height);expect(geometry.fit).toBe('contain');expect(Math.abs(geometry.width/geometry.height-width/height)).toBeLessThan(.015);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.unroute('**/showcase-beauty-*.webp');
 }
});
