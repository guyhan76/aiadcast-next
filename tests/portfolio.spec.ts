import {test,expect} from '@playwright/test';

test('home links to ten unique concept entries, with honest source and industry empty states',async({page})=>{
 const posts:string[]=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await page.goto('/');await expect(page.locator('.home-showcase').getByRole('tab')).toHaveCount(10);
 await page.getByRole('link',{name:'전체 포트폴리오 보기'}).click();await expect(page).toHaveURL(/#portfolio$/);
 const portfolio=page.locator('.portfolio-page');await expect(portfolio.getByRole('heading',{name:'산업별 포트폴리오',exact:true})).toBeVisible();
 await expect(portfolio.locator('.portfolio-card')).toHaveCount(10);expect(new Set(await portfolio.locator('.portfolio-card').evaluateAll(els=>els.map(e=>e.getAttribute('data-portfolio-id')))).size).toBe(10);
 await expect(portfolio.getByLabel('업종',{exact:true}).locator('option')).toHaveCount(13);
 await expect(portfolio.locator('.portfolio-source-note')).toContainText('실제 앱 생성 0개');
 await portfolio.getByLabel('사례 출처').selectOption('app-result');await expect(portfolio.locator('.portfolio-card')).toHaveCount(0);await expect(portfolio.getByRole('heading',{name:'조건에 맞는 공개 사례가 아직 없습니다'})).toBeVisible();
 await portfolio.getByRole('button',{name:'전체 사례 보기'}).click();await portfolio.getByLabel('업종',{exact:true}).selectOption('packaging');await expect(portfolio.locator('.portfolio-card')).toHaveCount(0);
 await portfolio.getByLabel('업종',{exact:true}).selectOption('fashion');await expect(portfolio.locator('.portfolio-card')).toHaveCount(2);await expect(portfolio.locator('.portfolio-card-info strong')).toHaveText(['디자인 콘셉트','디자인 콘셉트']);await expect(portfolio.locator('.portfolio-card-info')).toContainText(['9:16','9:16']);
 await portfolio.getByLabel('이미지 형태').selectOption('landscape');await expect(portfolio.locator('.portfolio-card')).toHaveCount(0);await portfolio.getByRole('button',{name:'전체 사례 보기'}).click();await expect(portfolio.locator('.portfolio-card')).toHaveCount(10);expect(posts).toEqual([]);
});

test('full image inspection preserves ratio, closes before native navigation, and returns home',async({page})=>{
 await page.goto('/#portfolio');const portfolio=page.locator('.portfolio-page');await portfolio.getByLabel('업종',{exact:true}).selectOption('medical');
 await expect(portfolio.locator('.portfolio-card-info')).toContainText('가상 서비스 예시 · 실제 효능이나 보장 내용이 아닙니다.');
 const open=portfolio.getByRole('button',{name:'병원 이미지 전체 보기'});await open.click();const dialog=page.getByRole('dialog',{name:'병원 이미지 전체 보기'});await expect(dialog).toBeVisible();
 const photo=dialog.locator('figure img');await expect.poll(()=>photo.evaluate((i:HTMLImageElement)=>i.naturalHeight)).toBe(1920);const size=await photo.evaluate((i:HTMLImageElement)=>({w:i.clientWidth,h:i.clientHeight,fit:getComputedStyle(i).objectFit}));expect(size.w/size.h).toBeCloseTo(9/16,2);expect(size.fit).toBe('contain');
 await dialog.getByRole('button',{name:'확대',exact:true}).click();await expect(dialog.locator('.image-review-content')).toHaveClass(/zoomed/);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-back',{cancelable:true})));await expect(dialog).toHaveCount(0);await expect(page).toHaveURL(/#portfolio$/);await expect(open).toBeFocused();
 await open.click();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-back',{cancelable:true})));await expect(page).toHaveURL(/#home$/);await expect(page.locator('.home-page')).toBeVisible();
 await page.getByRole('link',{name:'전체 포트폴리오 보기'}).click();await page.goBack();await expect(page).toHaveURL(/#home$/);await page.goForward();await expect(page).toHaveURL(/#portfolio$/);await page.getByRole('link',{name:'홈으로',exact:true}).click();await expect(page).toHaveURL(/#home$/);
});

test('portfolio supports narrow screens and English without changing category identity',async({page},testInfo)=>{
 await page.goto('/#portfolio');const portfolio=page.locator('.portfolio-page');await portfolio.getByLabel('업종',{exact:true}).selectOption('travel');await expect(portfolio.locator('.portfolio-card')).toHaveCount(2);
 await page.getByRole('combobox',{name:'앱 언어'}).selectOption('en');await expect(portfolio.getByRole('heading',{name:'Portfolio by industry'})).toBeVisible();await expect(portfolio.getByLabel('Industry',{exact:true})).toHaveValue('travel');await expect(portfolio.locator('.portfolio-card-info strong')).toHaveText(['Design concept','Design concept']);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await portfolio.getByLabel('Industry',{exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);if(width===390)await page.screenshot({path:testInfo.outputPath('portfolio-mobile.png'),fullPage:true});}
});
