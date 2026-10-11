import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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

test('optional numerical comparison exports exact image bytes and never passes perspective views',async({page})=>{
 const paid:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(generations|assistant)/.test(r.url()))paid.push(r.url());});
 await page.goto('/#studio');await page.locator('.editor-details > summary').click();
 await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:source});
 await page.getByRole('button',{name:'원본과 결과 비교',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'원본과 결과 비교'});
 await dialog.locator('.proportion-review > summary').click();
 await dialog.getByLabel('측정 범위',{exact:true}).fill('시험용 본체');
 await dialog.getByLabel('입력 규격과 두 사진에서 측정하는 부분이 같습니다.',{exact:true}).check();
 const panels=dialog.locator('.proportion-photo');
 for(let i=0;i<2;i++){
  await panels.nth(i).getByLabel('촬영 방향',{exact:true}).selectOption(i===0?'front':'perspective');
  const svg=panels.nth(i).locator('svg');const size=await svg.boundingBox();expect(size).not.toBeNull();
  for(const [x,y] of [[.2,.5],[.8,.5],[.5,.2],[.5,.8]])await svg.click({position:{x:size!.width*x,y:size!.height*y}});
 }
 await expect(dialog.locator('.proportion-review')).toContainText('사선 사진은 정면 비례로 판정하지 않습니다.');
 const event=page.waitForEvent('download');await dialog.getByRole('button',{name:'사진·규격·비교 기록 저장',exact:true}).click();
 const evidence=JSON.parse(await readFile((await (await event).path())!,'utf8'));
 expect(evidence.result.status).toBe('unverified');expect(evidence.geometryVerified).toBe(false);expect(evidence.identityVerified).toBe(false);
 const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 expect(Buffer.from(evidence.images.source.data.split(',')[1],'base64')).toEqual(source);
 expect(evidence.context.source.sha256).toBe(hash(source));
 expect(evidence.context.result.sha256).toBe(hash(Buffer.from(evidence.images.result.data.split(',')[1],'base64')));
 expect(evidence.measurement.result.points).toHaveLength(4);expect(paid).toEqual([]);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}
});

