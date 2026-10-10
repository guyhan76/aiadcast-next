import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
const source=await sharp({create:{width:400,height:300,channels:3,background:'#bf8e52'}}).png().toBuffer();
test('comparison exports a fresh snapshot without changing the original or making paid requests',async({page})=>{
 const paid:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(generations|assistant)/.test(r.url()))paid.push(r.url());});
 await page.goto('/#studio');await page.locator('.editor-details > summary').click();
 const open=page.getByRole('button',{name:'원본과 결과 비교',exact:true});await expect(open).toBeDisabled();
 await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:source});
 await expect(open).toBeEnabled();await open.click();
 const dialog=page.getByRole('dialog',{name:'원본과 결과 비교'});
 await expect(dialog.getByRole('img',{name:'비교할 광고 결과'})).toBeVisible();
 expect(await dialog.getByRole('img',{name:'비교할 원본 상품 사진'}).getAttribute('src')).toBe(`data:image/png;base64,${source.toString('base64')}`);
 const before=await dialog.getByRole('img',{name:'비교할 광고 결과'}).getAttribute('src');
 await expect(dialog.locator('.comparison-details')).toContainText('300 mm');
 await expect(dialog).toContainText('실측 검증 결과가 아닙니다');
 const event=page.waitForEvent('download');await dialog.getByRole('button',{name:'비교 이미지 저장'}).click();
 const bytes=await readFile((await (await event).path())!);const meta=await sharp(bytes).metadata();expect([meta.width,meta.height]).toEqual([1800,1600]);
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await page.getByLabel('가로 mm',{exact:true}).fill('340');
 await open.click();await expect(dialog.locator('.comparison-details')).toContainText('340 mm');
 expect(await dialog.getByRole('img',{name:'비교할 광고 결과'}).getAttribute('src')).not.toBe(before);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.getByLabel('앱 언어',{exact:true}).selectOption('en');await page.getByRole('button',{name:'Compare source and result',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Width 340 mm');
 expect(paid).toEqual([]);
});
test('unconfirmed box mapping cannot be exported as a finished comparison',async({page})=>{
 await page.goto('/#studio');await page.locator('.editor-details > summary').click();await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:source});
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await page.getByLabel('규격 박스 구성 사용',{exact:true}).check();
 await page.getByRole('button',{name:'원본과 결과 비교',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'원본과 결과 비교'});await expect(dialog.getByRole('alert')).toContainText('일곱');
 await expect(dialog.getByRole('button',{name:'비교 이미지 저장'})).toHaveCount(0);
});
