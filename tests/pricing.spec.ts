import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {openWorkspaceMenu} from './helpers/workspace-menu';
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('pricing'));});
test('plans show monthly grants, full annual charges and four independent top-ups',async({page})=>{
 await page.goto('/#home');await openWorkspaceMenu(page);
 await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'이용 요금'});
 await expect(dialog.getByRole('radio')).toHaveCount(3);
 await expect(dialog).toContainText('₩33,900');
 await dialog.getByRole('button',{name:'연간',exact:true}).click();
 for(const total of ['₩310,800','₩742,800','₩1,486,800'])await expect(dialog).toContainText(total);
 await dialog.getByRole('button',{name:'크레딧 추가',exact:true}).click();
 await expect(dialog.getByRole('radio')).toHaveCount(4);
 await dialog.locator('input[value="credits-v3-250"]').check();
 await dialog.getByRole('link',{name:'선택한 상품 보기'}).click();
 await expect(page.locator('input[value="credits-v3-250"]')).toBeChecked();
 await expect(page.locator('.checkout-summary')).toContainText('₩79,900');
});
