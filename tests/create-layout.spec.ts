import {test,expect} from '@playwright/test';

test('creation essentials and expanded optional fields stay readable on narrow screens',async({page})=>{
 await page.goto('/#create');
 const wizard=page.locator('.create-page'),subject=wizard.locator('.ad-subject-kind');
 await expect(wizard.getByRole('heading',{level:1,name:'광고 만들기',exact:true})).toHaveCount(1);
 await expect(subject.locator('legend')).toHaveText('광고 대상');
 await expect(wizard.getByText('사진과 설명으로 광고를 시작하세요.',{exact:true})).toHaveCount(0);
 await expect(wizard.locator('.brand-footer-settings')).toHaveCount(0);
 await expect(wizard.locator('.create-industry-settings')).not.toHaveAttribute('open');
 await expect(wizard.locator('.create-purpose-settings')).not.toHaveAttribute('open');
 await expect(wizard.getByLabel('상품명',{exact:true})).toHaveAttribute('placeholder','예: 바이탈 골드 콜라겐 토너 150ml 2개');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  const upload=await wizard.getByRole('button',{name:'사진 추가',exact:true}).boundingBox(),area=await wizard.locator('.reference-photos').boundingBox();
  expect(upload).not.toBeNull();expect(area).not.toBeNull();
  expect(upload!.height).toBeGreaterThanOrEqual(190);
  expect(upload!.width).toBeGreaterThanOrEqual(area!.width-2);
  expect(Math.abs(upload!.x+upload!.width/2-area!.x-area!.width/2)).toBeLessThan(1);
  await expect(wizard.locator('.reference-file-info')).toBeVisible();
  await expect(wizard.locator('.reference-file-info')).toContainText('PNG · JPG · WebP');
  await expect(wizard.locator('.reference-file-info')).toContainText('최대 10장');
  expect(await wizard.getByLabel('상품명',{exact:true}).evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
 await wizard.locator('.create-industry-settings>summary').click();
 await wizard.locator('.create-purpose-settings>summary').click();
 await wizard.getByLabel('업종',{exact:true}).selectOption('packaging');
 await wizard.getByLabel('규격 형식',{exact:true}).selectOption('cylindrical');
 await expect(wizard.getByLabel('지름 (mm)',{exact:true})).toBeVisible();
 await expect(wizard.getByLabel('높이 (mm)',{exact:true})).toBeVisible();
 await expect(wizard.getByLabel('세로 (mm)',{exact:true})).toHaveCount(0);
 const request=wizard.getByRole('textbox',{name:'요청사항',exact:true});await request.fill('금색 인쇄를 강조');
 await expect(wizard.locator('.create-note-heading')).toContainText('9 / 600');
 const purpose=wizard.locator('.creative-purpose-card').nth(1);await purpose.click();await expect(purpose).toHaveAttribute('aria-pressed','true');
 const description=await wizard.locator('.creative-purpose-help').textContent();expect(description?.length).toBeGreaterThan(0);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 await subject.getByRole('button',{name:'서비스',exact:true}).click();
 await expect(wizard.getByLabel('규격 형식',{exact:true})).toHaveCount(0);
 await wizard.getByLabel('업종',{exact:true}).selectOption('yoga');
 await wizard.getByLabel('서비스명',{exact:true}).fill('스튜디오 블룸');
 await wizard.getByRole('button',{name:'다음',exact:true}).click();
 await expect(wizard.locator('.brand-footer-settings')).toHaveCount(1);
 await wizard.locator('.brand-footer-settings>summary').click();
 await wizard.getByRole('textbox',{name:'이메일',exact:true}).fill('hello@brand.com');await wizard.getByRole('checkbox',{name:'이메일',exact:true}).uncheck();
 await wizard.getByRole('button',{name:'이전',exact:true}).click();
 await wizard.locator('.create-purpose-settings>summary').click();await expect(wizard.getByRole('textbox',{name:'요청사항',exact:true})).toHaveValue('금색 인쇄를 강조');
 await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.locator('.brand-footer-settings>summary').click();
 await expect(wizard.getByRole('textbox',{name:'이메일',exact:true})).toHaveValue('hello@brand.com');await expect(wizard.getByRole('checkbox',{name:'이메일',exact:true})).not.toBeChecked();
 await wizard.locator('.create-other-ratios>summary').click();await expect(wizard.getByLabel('출력 비율',{exact:true}).locator('option')).toHaveCount(7);
 const footer=page.locator('.app-footer');
 expect(await footer.locator('.brand-lockup b').evaluate(element=>getComputedStyle(element).color)).toBe(await page.locator('.app-header .brand-lockup b').evaluate(element=>getComputedStyle(element).color));
 expect(await footer.locator('.brand-lockup').evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(28);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});
