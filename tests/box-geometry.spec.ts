import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('protected-box-geometry'));});
import {mkdir} from 'node:fs/promises';
test('box shape follows dimensions and remains explicitly unverified',async({page},testInfo)=>{
 await page.goto('/#editor');await page.locator('.editor-details > summary').click();
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();
 for(const [axis,value] of [['가로','340'],['세로','250'],['높이','210']])await page.getByLabel(`${axis} mm`,{exact:true}).fill(value);
 await page.getByRole('region',{name:'이미지 편집 도구',exact:true}).locator('.box-geometry > summary').click();
 const preview=page.locator('.editor-details .box-geometry');
 await expect(preview).toContainText('원본 인쇄 미적용');
 await expect(preview.locator('[data-dimension="height"]')).toContainText('높이 210 mm');
 await mkdir('release/dimension-study',{recursive:true});
 await preview.screenshot({path:`release/dimension-study/postbox-3-${testInfo.project.name}.png`});
 const initial=await preview.locator('[data-face="front"]').getAttribute('points');
 await page.getByLabel('높이 mm',{exact:true}).fill('100');
 await expect(preview.locator('[data-face="front"]')).not.toHaveAttribute('points',initial!);
 await expect(preview.locator('[data-dimension="height"]')).toContainText('높이 100 mm');
 await page.getByRole('radio',{name:'표시 안 함',exact:true}).check();
 await expect(preview.locator('svg')).toBeVisible(); // Display preference doesn't erase the numerical reference.
 await page.getByLabel('가로 mm',{exact:true}).fill('');
 await expect(preview.locator('svg')).toHaveCount(0);
 await expect(preview).toContainText('모두 올바르게');
 await page.getByLabel('가로 mm',{exact:true}).fill('340');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await page.getByLabel('앱 언어',{exact:true}).selectOption('en');
 await expect(preview).toContainText('Physical verification pending');
 await expect(preview.locator('[data-dimension="width"]')).toContainText('Width 340 mm');
 await page.getByRole('combobox',{name:'Dimension type',exact:true}).selectOption('none');
 await expect(preview).toHaveCount(0);
});
