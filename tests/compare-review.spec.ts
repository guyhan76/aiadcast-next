import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const source=await sharp({create:{width:400,height:300,channels:3,background:'#bf8e52'}}).png().toBuffer();
test('comparison exports a fresh snapshot without changing the original or making paid requests',async({page})=>{
 const paid:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(generations|assistant)/.test(r.url()))paid.push(r.url());});
 await page.goto('/#editor');await page.locator('.editor-details > summary').click();
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
 // Chromium may defer canvas.toBlob after repeated viewport changes (~7s in
 // the cloud runner); wait for the completed render, not a fixed short delay.
 await expect(page.getByRole('dialog')).toContainText('Width 340 mm',{timeout:15000});
 expect(paid).toEqual([]);
});
test('unconfirmed box mapping cannot be exported as a finished comparison',async({page})=>{
 await page.goto('/#editor');await page.locator('.editor-details > summary').click();await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:source});
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await page.getByLabel('규격 박스 구성 사용',{exact:true}).check();
 await page.getByRole('button',{name:'원본과 결과 비교',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'원본과 결과 비교'});await expect(dialog.getByRole('alert')).toContainText('일곱');
 await expect(dialog.getByRole('button',{name:'비교 이미지 저장'})).toHaveCount(0);
});

test('optional numerical comparison exports exact image bytes and never passes perspective views',async({page})=>{
 const paid:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(generations|assistant)/.test(r.url()))paid.push(r.url());});
 await page.goto('/#editor');await page.locator('.editor-details > summary').click();
 await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:source});
 await page.getByRole('button',{name:'원본과 결과 비교',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'원본과 결과 비교'});
 await dialog.locator('.proportion-review > summary').click();
 await dialog.getByLabel('측정 범위',{exact:true}).fill('시험용 본체');
 await dialog.getByLabel('입력 규격과 두 사진에서 측정하는 부분이 같습니다.',{exact:true}).check();
 const panels=dialog.locator('.proportion-photo');
 for(let i=0;i<2;i++){
  await panels.nth(i).getByRole('combobox',{name:'촬영 방향',exact:true}).selectOption(i===0?'front':'perspective');
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


test('comparison handles Android back and Escape without leaving the editor',async({page})=>{
 await page.goto('/#editor');await page.locator('.editor-details > summary').click();
 await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:source});
 const open=page.getByRole('button',{name:'원본과 결과 비교',exact:true});await open.click();
 const dialog=page.getByRole('dialog',{name:'원본과 결과 비교'});
 await expect(dialog.getByRole('img',{name:'비교할 광고 결과'})).toBeVisible();
 expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
 expect(await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-back',{cancelable:true})))).toBe(false);
 await expect(dialog).not.toBeVisible();await expect(page).toHaveURL(/#editor$/);await expect(open).toBeFocused();
 expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await open.click();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');
 await expect(dialog).not.toBeVisible();await expect(open).toBeFocused();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-back',{cancelable:true})));
 await expect(page).toHaveURL(/#projects$/);
});

test('a swipe scrolls the mobile comparison while a tap marks exactly one point',async({page,isMobile})=>{
 test.skip(!isMobile,'Real touch gesture is exercised in the mobile project.');
 await page.goto('/#editor');await page.locator('.editor-details > summary').click();
 await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:source});
 await page.getByRole('button',{name:'원본과 결과 비교',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'원본과 결과 비교'});await dialog.locator('.proportion-review > summary').click();
 const panel=dialog.locator('.proportion-photo').first(),svg=panel.locator('svg');await svg.scrollIntoViewIfNeeded();
 const bounds=(await svg.boundingBox())!;const start={x:bounds.x+bounds.width*.5,y:bounds.y+bounds.height*.65};
 const session=await page.context().newCDPSession(page);const before=await dialog.evaluate(el=>el.scrollTop);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
 for(const dy of [20,40,70,100])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x,y:start.y-dy}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>dialog.evaluate(el=>el.scrollTop)).toBeGreaterThan(before);
 await expect(panel.locator('p').first()).toContainText('1/4');
 await svg.scrollIntoViewIfNeeded();await svg.tap();await expect(panel.locator('p').first()).toContainText('2/4');
 // A cancelled contact and a mouse-style drag must not create additional points.
 await svg.dispatchEvent('pointerdown',{pointerId:7,isPrimary:true,button:0,clientX:30,clientY:30});
 await svg.dispatchEvent('pointercancel',{pointerId:7,isPrimary:true});
 await svg.dispatchEvent('pointerup',{pointerId:7,isPrimary:true,clientX:30,clientY:30});
 await svg.dispatchEvent('pointerdown',{pointerId:8,isPrimary:true,button:0,clientX:30,clientY:30});
 await svg.dispatchEvent('pointermove',{pointerId:8,isPrimary:true,clientX:70,clientY:70});
 await svg.dispatchEvent('pointerup',{pointerId:8,isPrimary:true,clientX:30,clientY:30});
 await expect(panel.locator('p').first()).toContainText('2/4');
 await panel.getByRole('button',{name:'마지막 점 취소'}).click();await expect(panel.locator('p').first()).toContainText('1/4');
 await svg.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
 await expect(panel.locator('p').first()).toContainText('2/4');await session.detach();
});

test('comparison PNG and evidence reach the native bridge with honest save states',async({page},testInfo)=>{
 const bridge=await readFile('native/android-download-bridge.js','utf8');
 await page.addInitScript({content:'window.nativeMessages=[];window.AiadcastNative={postMessage(value){window.nativeMessages.push(JSON.parse(value));}};'+bridge});
 await page.goto('/#editor');await page.locator('.editor-details > summary').click();
 await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'source.png',mimeType:'image/png',buffer:source});
 await page.getByRole('button',{name:'원본과 결과 비교',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'원본과 결과 비교'}),save=dialog.getByRole('button',{name:'비교 이미지 저장',exact:true}),status=dialog.locator('.comparison-export-status');
 const emit=async(status:string)=>page.evaluate(status=>window.dispatchEvent(new CustomEvent('aiadcast-native-export',{detail:{status}})),status);
 await save.click();await expect(save).toBeDisabled();await expect(status).toContainText('위치를 선택');
 await expect.poll(()=>page.evaluate(()=>(window as any).nativeMessages.length)).toBe(1);
 const png=await page.evaluate(()=>(window as any).nativeMessages[0]);
 expect(png.mime).toBe('image/png');const meta=await sharp(Buffer.from(png.base64,'base64')).metadata();expect([meta.width,meta.height]).toEqual([1800,1600]);
 await emit('cancelled');await expect(status).toContainText('취소');await expect(save).toBeEnabled();
 await save.click();await expect(status).toContainText('위치를 선택');await emit('saved');await expect(status).toContainText('저장했습니다');
 await save.click();await expect(status).toContainText('위치를 선택');await emit('share-opened');await expect(status).toContainText('전송 완료 여부는 해당 앱');
 await save.click();await expect(status).toContainText('위치를 선택');await emit('error');await expect(dialog.getByRole('alert')).toContainText('저장하지 못했습니다');await expect(save).toBeEnabled();
 await dialog.locator('.proportion-review > summary').click();
 await dialog.getByRole('button',{name:'사진·규격·비교 기록 저장',exact:true}).click();
 await expect(status).toContainText('위치를 선택');await expect.poll(()=>page.evaluate(()=>(window as any).nativeMessages.length)).toBe(5);
 const json=await page.evaluate(()=>(window as any).nativeMessages[4]);expect(json.mime).toBe('application/json');
 const evidence=JSON.parse(Buffer.from(json.base64,'base64').toString('utf8'));expect(evidence.status).toBe('unverified');expect(evidence.images.source.sha256).toBe(createHash('sha256').update(source).digest('hex'));
 expect(await status.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
 await emit('saved');await expect(status).toContainText('저장했습니다');
 await dialog.screenshot({path:testInfo.outputPath('comparison-save.png')});
});
