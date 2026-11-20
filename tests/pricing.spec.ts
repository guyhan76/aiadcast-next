import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {openWorkspaceMenu} from './helpers/workspace-menu';

test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('protected-pricing'));});

test('Korean launch shows first ad free and approved image quantities at all viewport sizes',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('aiadcast.ui-language','ko');
  localStorage.setItem('aiadcast-pricing-language','en');
  localStorage.setItem('aiadcast-pricing-currency','USD');
 });
 await page.goto('/#home');
 await openWorkspaceMenu(page);
 await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});
 await expect(dialog.locator('.pack-price')).toHaveText(['무료','₩3,300','₩9,900']);
 await expect(dialog.getByRole('article',{name:'첫 광고 1장 무료'})).toBeVisible();
 await expect(dialog.getByRole('article',{name:'3장',exact:true})).toBeVisible();
 await expect(dialog.getByRole('article',{name:'10장',exact:true})).toBeVisible();
 await expect(dialog.getByText(/USD|29,800|48,900/)).toHaveCount(0);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await dialog.getByRole('link',{name:'이용권 선택',exact:true}).click();
 await expect(page.getByRole('heading',{name:'이용권 선택'})).toBeVisible();
});

test('old bundle and USD preferences fall back to available KRW packs without changing a pending order',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('aiadcast.ui-language','ko');
  sessionStorage.setItem('aiadcast.checkout-choice',JSON.stringify({selected:'credits-v2-180',currency:'USD'}));
 });
 await page.goto('/#checkout');
 await expect(page.locator('input[value="credits-v2-100"]')).toBeChecked();
 await expect(page.locator('.checkout-packs')).toContainText('10장');
 await expect(page.locator('.checkout-packs')).toContainText('3장');
 await expect(page.locator('.checkout-summary')).toContainText('₩9,900');
 await expect(page.getByText(/USD|48,900|29,800/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'테스트 결제 미연결'})).toBeDisabled();
});
