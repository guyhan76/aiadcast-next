import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('showcase preserves sample pixels, labels illustrative dimensions and resets product-specific overlays',async({page},info)=>{
 await page.clock.install();await page.goto('/');const gallery=page.locator('.home-showcase'),figure=gallery.locator('.campaign-preview figure');
 const dir=`artifacts/showcase/capabilities-${info.project.name}`;await mkdir(dir,{recursive:true});await figure.screenshot({path:`${dir}/creative.png`});
 let paidRequests=0;page.on('request',r=>{if(r.method()==='POST'&&/generation|analysis/.test(r.url()))paidRequests++;});
 const source=await figure.locator('img').getAttribute('src');
 await gallery.getByRole('button',{name:'원본 사진 활용',exact:true}).click();
 await expect(figure).toHaveAttribute('data-treatment','original');await expect(figure.locator('img')).toHaveAttribute('src',source!);await expect(figure.locator('img')).toHaveCSS('object-fit','contain');
 await figure.screenshot({path:`${dir}/original.png`});
 await gallery.getByRole('button',{name:'사진 규격 예시',exact:true}).click();
 await expect(figure).toHaveAttribute('data-campaign','luxury');await expect(figure.locator('[data-axis]')).toHaveCount(3);
 await expect(figure.getByText('예시 규격 · 실측 아님')).toBeVisible();await expect(figure.getByText('사진 규격 구성 시연 · 자동 분석 아님')).toBeVisible();
 expect(await figure.locator('svg image').getAttribute('href')).toBe(await figure.locator('img').getAttribute('src'));
 await expect(figure.locator('.showcase-dimension-inset svg')).toHaveCSS('overflow','hidden');
 await figure.screenshot({path:`${dir}/dimensions.png`});
 await expect(gallery.locator('.showcase-media-example')).toHaveCount(3);for(const [name,ratio] of [['story',9/16],['square',1],['wide',16/9]] as const){const b=await gallery.locator(`.${name} .media-sample-art`).boundingBox();expect(b!.width/b!.height).toBeCloseTo(ratio,1);}
 await gallery.getByRole('button',{name:'자동 넘김 시작',exact:true}).click();await page.mouse.move(0,0);await page.clock.runFor(5000);
 await expect(figure).toHaveAttribute('data-campaign','fashion');await expect(figure).toHaveAttribute('data-treatment','creative');await expect(figure.locator('[data-axis]')).toHaveCount(0);
 expect(paidRequests).toBe(0);
});

test('showcase treatment controls remain usable at 320px in both languages',async({page})=>{
 await page.setViewportSize({width:320,height:900});await page.goto('/');const gallery=page.locator('.home-showcase');
 for(const locale of ['ko','en']){await page.getByRole('combobox',{name:/^(앱 언어|App language)$/}).selectOption(locale);const buttons=gallery.locator('.showcase-treatments button');for(let i=0;i<3;i++){await buttons.nth(i).click();const box=await buttons.nth(i).boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x+box!.width).toBeLessThanOrEqual(320);}expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);await expect(gallery.getByRole('tab')).toHaveCount(10);}
});
