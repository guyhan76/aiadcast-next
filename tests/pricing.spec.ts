import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('protected-pricing'));});

test('approved packs keep currency independent of guide and ad languages, without checkout',async({page})=>{
 await page.goto('/#editor');await page.locator('.editor-details > summary').click();
 await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});
 for(const price of ['₩9,900','₩29,800','₩48,900'])await expect(dialog.getByText(price,{exact:true})).toBeVisible();
 await expect(dialog.getByText('생성·재생성 1회 = 10크레딧',{exact:true})).toBeVisible();
 await expect(dialog.getByText(/고급 제작|3크레딧|100개/)).toHaveCount(0);
 await dialog.getByRole('button',{name:'English',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Pricing',exact:true});
 await expect(dialog).toHaveAttribute('lang','en');
 for(const price of ['₩9,900','₩29,800','₩48,900'])await expect(dialog.getByText(price,{exact:true})).toBeVisible();
 await expect(dialog.getByText('KRW prices include Korean VAT.',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'USD · $',exact:true}).click();
 await expect(dialog.locator('.pack-price')).toHaveText(['$7.90','$21.99','$35.99']);
 await expect(dialog.getByText('USD prices exclude applicable local sales tax.',{exact:true})).toBeVisible();
 await expect(dialog.getByText('Demo · No real charge')).toBeVisible();
 await expect(dialog.getByRole('button',{name:/buy|purchase|pay/i})).toHaveCount(0);
 await expect(dialog.getByText(/Reels exports are still images/)).toBeVisible();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await dialog.getByRole('button',{name:'Close pricing'}).click();
 await page.getByRole('button',{name:/문구·언어/}).click();
 await expect(page.getByRole('button',{name:'한국어',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Pricing',exact:true});
 await expect(dialog.locator('.pack-price').first()).toHaveText('$7.90');
 await dialog.getByRole('button',{name:'한국어',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});
 await expect(dialog.locator('.pack-price').first()).toHaveText('US$7.90');
 await expect(dialog.getByText('달러 가격은 해당 지역 판매세 별도 기준입니다.',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'요금 안내 닫기'}).click();
 await page.evaluate(()=>location.hash='home');await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});
 await expect(dialog.locator('.pack-price').first()).toHaveText('US$7.90');
 await dialog.getByRole('button',{name:'KRW · 원',exact:true}).click();
 await expect(dialog.getByText('₩9,900',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'요금 안내 닫기'}).click();
 await page.evaluate(()=>location.hash='studio');await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'이용 요금',exact:true}).getByText('₩9,900',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'요금 안내 닫기'}).click();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
});
