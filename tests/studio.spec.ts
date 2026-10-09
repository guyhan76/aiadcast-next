import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
const pixels=await sharp({create:{width:600,height:200,channels:4,background:'#b97b4e'}}).png().toBuffer();
const photo={name:'reference.png',mimeType:'image/png',buffer:pixels};
async function brief(page:import('@playwright/test').Page){const next=page.waitForEvent('download');await page.getByRole('button',{name:'광고 기획 저장',exact:true}).click();return JSON.parse(await readFile((await (await next).path())!,'utf8'));}
test('home, creation, library and guide fit narrow screens without claiming live AI',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of ['home','create','projects','guide']){await page.goto('/#'+route);for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${route} at ${width}`).toBeLessThanOrEqual(width);}}
 await page.goto('/');await expect(page.getByRole('heading',{name:/당신의 비즈니스/})).toBeVisible();await expect(page.locator('.gallery-caption')).toContainText('이전 aiadcast');await expect(page.locator('.home-scope:visible')).toContainText('연결 전');
 expect(await page.locator('.hero-gallery img').evaluateAll(images=>images.every(i=>(i as HTMLImageElement).naturalWidth>0))).toBe(true);expect(errors).toEqual([]);
});
test('service wizard exports a real dimension-free image and restores editable projects',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/교육·클래스/}).click();const wizard=page.locator('.create-page');
 await wizard.getByRole('button',{name:'다음',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('이름');
 await wizard.getByLabel('상품·서비스 이름').fill('성인 영어 회화');await wizard.getByRole('button',{name:'다음',exact:true}).click();
 await wizard.getByLabel('서비스 소개').fill('주 2회 소규모 수업');await expect(wizard.getByRole('checkbox',{name:/규격 정보 사용/})).not.toBeChecked();
 await wizard.getByRole('button',{name:'이전',exact:true}).click();await expect(wizard.getByLabel('상품·서비스 이름')).toHaveValue('성인 영어 회화');await wizard.getByRole('button',{name:'다음',exact:true}).click();await expect(wizard.getByLabel('서비스 소개')).toHaveValue('주 2회 소규모 수업');
 await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.locator('.wizard-formats').getByRole('button',{name:/4:5/}).click();await wizard.getByRole('button',{name:'편집 시작',exact:true}).click();await expect(page).toHaveURL(/#studio$/);
 const plan=await brief(page);expect(plan.status).toBe('planning-only');expect(plan.request.subjectType).toBe('service');expect(plan.request.specifications).toEqual([]);expect(plan.request.source).toBeNull();expect(plan.request.output.format).toBe('4:5');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();expect((await sharp(await readFile((await (await download).path())!)).metadata()).height).toBe(1350);
 await page.goto('/#projects');await page.getByRole('button',{name:/성인 영어 회화 광고/}).click();await expect(page.getByRole('textbox',{name:'상품·서비스명',exact:true})).toHaveValue('성인 영어 회화');
});
test('physical wizard saves the photo, optional hidden specs and structured campaign attributes',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/상품·브랜드/}).click();const wizard=page.locator('.create-page');
 await wizard.getByLabel('상품·서비스 이름').fill('크라프트 박스');await wizard.getByLabel('업종',{exact:true}).selectOption('packaging');await wizard.locator('.campaign-fields summary').click();await wizard.getByLabel('추가 속성 항목명').fill('수량');await wizard.getByLabel('추가 속성 값').fill('100');await wizard.getByRole('button',{name:'속성 추가',exact:true}).click();
 await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.getByRole('button',{name:'다음',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('사진');await wizard.getByLabel('제작용 사진 추가').setInputFiles(photo);await expect(wizard.getByText('reference.png',{exact:true})).toBeVisible();
 await wizard.getByRole('checkbox',{name:/규격 정보 사용/}).check();for(const [label,value] of [['가로 (mm)','300'],['세로 (mm)','200'],['높이 (mm)','100']])await wizard.getByLabel(label,{exact:true}).fill(value);await wizard.getByRole('checkbox',{name:'광고에 규격 표시',exact:true}).uncheck();
 await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.getByRole('button',{name:'편집 시작',exact:true}).click();await expect(page).toHaveURL(/#studio$/);
 const plan=await brief(page);expect(plan.request.output.showDimensions).toBe(false);expect(plan.request.specifications.map((s:{value:string})=>s.value)).toEqual(['300','200','100']);expect(plan.request.attributes).toContainEqual({name:'수량',value:'100'});expect(plan.request.specificationContract.geometryVerified).toBe(false);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();const data=JSON.parse(await readFile((await (await download).path())!,'utf8'));expect(Buffer.from(data.product.data.split(',')[1],'base64')).toEqual(pixels);
});
test('manual reference mismatch blocks a generation brief and clears when source changes',async({page})=>{
 await page.goto('/#studio');await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진');await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await page.getByLabel('높이 mm',{exact:true}).fill('600');await page.locator('.reference-inspector summary').click();await page.getByLabel('사진의 촬영 방향').selectOption('front');await page.getByRole('checkbox',{name:'두 치수선을 실제 상품 경계에 맞췄습니다.',exact:true}).check();await expect(page.locator('.reference-assessment')).toContainText('비례 재확인');
 await page.getByRole('button',{name:'광고 기획 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('비례가 다릅니다');
 await page.locator('.editor-tabs').getByRole('button',{name:/광고 정보/}).click();const another=await sharp(pixels).resize(300,200).png().toBuffer();await page.getByLabel('상품 사진 추가').setInputFiles({...photo,buffer:another});await expect(page.getByRole('status')).toContainText('원본 사진');await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await page.locator('.reference-inspector summary').click();await expect(page.getByRole('checkbox',{name:'두 치수선을 실제 상품 경계에 맞췄습니다.',exact:true})).not.toBeChecked();
});
test('opening a library item preserves newer unsaved edits to the same project',async({page})=>{
 await page.goto('/#studio');await page.getByRole('combobox',{name:'광고 업종·상품 분류',exact:true}).selectOption('services');await page.getByLabel('프로젝트 이름').fill('저장한 서비스');await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('이 기기에 저장');
 await page.getByRole('textbox',{name:'상품·서비스명',exact:true}).fill('수정한 서비스 정보');await page.evaluate(()=>location.hash='projects');await page.getByRole('button',{name:/저장한 서비스/}).click();await expect(page.getByRole('textbox',{name:'상품·서비스명',exact:true})).toHaveValue('수정한 서비스 정보');
 await page.reload();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/저장한 서비스/}).click();await expect(page.getByRole('textbox',{name:'상품·서비스명',exact:true})).toHaveValue('수정한 서비스 정보');
});
