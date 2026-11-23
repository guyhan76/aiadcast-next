import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {openWorkspaceMenu} from './helpers/workspace-menu';
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('pricing-test'));});
test('plans show monthly grants, full annual charges and four independent top-ups',async({page})=>{
 await page.goto('/#home');await openWorkspaceMenu(page);
 await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'이용 요금'});
 await expect(dialog.getByRole('radio')).toHaveCount(3);
 await expect(dialog).toContainText('₩33,900');
 await dialog.getByRole('button',{name:'연간',exact:true}).click();
 for(const total of ['₩310,800','₩742,800','₩1,402,800'])await expect(dialog).toContainText(total);
 await dialog.getByRole('button',{name:'크레딧 추가',exact:true}).click();
 await expect(dialog.getByRole('radio')).toHaveCount(4);
 await dialog.locator('input[value="credits-v3-250"]').check();
 await dialog.getByRole('link',{name:'선택한 상품 보기'}).click();
 await expect(page.locator('input[value="credits-v3-250"]')).toBeChecked();
 await expect(page.locator('.checkout-summary')).toContainText('₩79,900');
});

test('mobile plans tab opens the offer selector and purchase summary',async({page})=>{
 await page.setViewportSize({width:360,height:800});
 await page.goto('/#home');
 const nav=page.getByRole('navigation',{name:'모바일 메뉴'});
 await expect(nav.getByRole('link')).toHaveText(['홈','내 프로젝트','이용권 안내','사용 안내']);
 const plans=nav.getByRole('link',{name:'이용권 안내'});
 await plans.click();
 await expect(plans).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('radio')).toHaveCount(3);
 await page.getByRole('button',{name:'연간',exact:true}).click();
 await page.locator('input[value="plan-ultra-annual"]').check();
 await expect(page.locator('.checkout-summary')).toContainText('₩1,402,800');
 await page.getByRole('button',{name:'크레딧 추가',exact:true}).click();
 await page.locator('input[value="credits-v3-500"]').check();
 await expect(page.locator('.checkout-summary')).toContainText('₩149,900');
});
