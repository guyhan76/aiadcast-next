import {authenticatedTest as test,expect} from './helpers/authenticated';
test('consumer sees the eight inputs in order with compact optional fields on all widths',async({page})=>{
 await page.goto('/#create');const form=page.locator('.consumer-create');
 await expect(form.getByRole('heading',{level:1,name:'광고 만들기',exact:true})).toBeVisible();
 expect(await form.locator('.creation-section').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-order')))).toEqual(['1','2','3','4','5','6','7','8']);
 await expect(page.locator('.account-drawer')).toHaveCount(0);await expect(page.locator('.automatic-proportion')).toHaveCount(0);await expect(page.locator('.editor-container')).toHaveCount(0);
 await expect(form.getByLabel('산업 선택')).toBeVisible();await expect(form.getByRole('button',{name:'AI가 만들기',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(form.getByRole('button',{name:'9:16',exact:false})).toHaveAttribute('aria-pressed','true');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(await form.getByLabel('상품명',{exact:true}).evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);}
 await form.getByLabel('산업 선택').selectOption('boxes');await form.getByRole('button',{name:'규격 넣기',exact:true}).click();
 await form.getByLabel('규격 형식').selectOption('cylindrical');await expect(form.getByLabel('지름 cm',{exact:true})).toBeVisible();await expect(form.getByLabel('높이 cm',{exact:true})).toBeVisible();await expect(form.getByLabel('세로 cm',{exact:true})).toHaveCount(0);
 await form.getByLabel('산업 선택').selectOption('lodging');await expect(form.getByLabel('규격 형식')).toHaveCount(0);await expect(form.getByText('서비스 광고는 규격 없이 만듭니다.')).toBeVisible();
 await form.locator('[data-order="2"] summary').click();await form.getByLabel('이메일 주소',{exact:true}).fill('hello@brand.com');
 await form.locator('[data-order="8"] summary').click();await expect(form.getByLabel('출력 비율').locator('option')).toHaveCount(7);
 await expect(form.getByRole('button',{name:'광고 생성',exact:true})).toBeEnabled();
 await page.screenshot({path:test.info().outputPath('simple-form.png'),fullPage:true});
});
