import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fixture=await sharp({create:{width:480,height:320,channels:4,background:{r:191,g:87,b:45,alpha:1}}}).png().toBuffer();
const photo={name:'original-product.png',mimeType:'image/png',buffer:fixture};
test.beforeEach(async({page})=>{await page.goto('/#studio');await page.evaluate(()=>document.fonts.ready);});
async function backup(page:import('@playwright/test').Page){const promise=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();const download=await promise;return JSON.parse(await readFile((await download.path())!,'utf8'));}
test('uploaded product is preserved through background, text, language and format changes',async({page})=>{
 await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진을 추가');
 await page.getByRole('button',{name:'문구·언어',exact:false}).click();await page.getByRole('textbox',{name:'홍보 제목',exact:true}).fill('원본 상품, 그대로');
 await page.getByRole('button',{name:'English',exact:true}).click();await page.getByRole('textbox',{name:'홍보 제목',exact:true}).fill('The same original product');
 await page.getByRole('button',{name:'배경',exact:false}).first().click();await page.getByRole('button',{name:'차콜',exact:true}).click();
 await page.getByLabel('출력 비율').selectOption('2:3');
 const p=await backup(page);expect(Buffer.from(p.product.data.split(',')[1],'base64')).toEqual(fixture);expect(p.product.sha256).toBe(createHash('sha256').update(fixture).digest('hex'));expect(p.copy.ko.title).toBe('원본 상품, 그대로');expect(p.copy.en.title).toBe('The same original product');expect(p.format).toBe('2:3');expect(p.dimensions.width).toBe('300');
});
test('projects save, reopen and import with editable source and dimensions',async({page})=>{
 await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진을 추가');await page.getByLabel('프로젝트 이름').fill('보존 테스트');
 await page.getByLabel('출력 비율').selectOption('3:4');
 await page.getByRole('button',{name:'규격',exact:false}).first().click();await page.getByLabel('가로 mm',{exact:true}).fill('321.5');await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('이 기기에 저장');
 const p=await backup(page);await page.reload();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/보존 테스트/}).click();await page.getByRole('button',{name:'규격',exact:false}).first().click();await expect(page.getByLabel('가로 mm',{exact:true})).toHaveValue('321.5');
 await expect(page.getByLabel('출력 비율')).toHaveValue('3:4');
 await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await expect(page.getByRole('status')).toContainText('프로젝트를 열었습니다');const restored=await backup(page);expect(restored.product.data).toBe(p.product.data);expect(restored.dimensions).toEqual(p.dimensions);expect(restored.format).toBe('3:4');expect(restored.id).not.toBe(p.id);
});
test('PNG export has the selected size and preserves visible product pixels',async({page})=>{
 await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진을 추가');
 for(const [format,width,height,x,y] of [
  ['9:16',1080,1920,540,1010],['2:3',1080,1620,540,860],['1:1',1080,1080,540,614],
  ['4:5',1080,1350,540,753],['3:4',1080,1440,540,798],['16:9',1920,1080,1350,450],['1.91:1',1200,628,844,258],
 ] as const){
  await page.getByLabel('출력 비율').selectOption(format);
  const canvas=page.getByLabel('현재 홍보 이미지');await expect(canvas).toHaveAttribute('width',String(width));await expect(canvas).toHaveAttribute('height',String(height));
  const rect=await canvas.boundingBox();expect(rect!.width/rect!.height).toBeCloseTo(width/height,2);
  await expect(page.locator('.preview-foot')).toContainText(`${width} × ${height} px`);
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();const d=await promise;
  const bytes=await readFile((await d.path())!);const metadata=await sharp(bytes).metadata();expect([metadata.width,metadata.height]).toEqual([width,height]);
  const pixel=await sharp(bytes).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer();expect([...pixel]).toEqual([191,87,45]);
 }
});
test('invalid dimensions and overflowing copy cannot silently export',async({page})=>{
 await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();await expect(page.getByRole('alert')).toContainText('상품 사진');
 await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진을 추가');await page.getByRole('button',{name:'규격',exact:false}).first().click();await page.getByLabel('가로 mm',{exact:true}).fill('-3');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();await expect(page.getByRole('alert')).toContainText('규격은');await page.getByLabel('가로 mm',{exact:true}).fill('300');
 await page.getByRole('button',{name:'문구·언어',exact:false}).click();await page.getByRole('textbox',{name:'홍보 제목',exact:true}).fill('너무 긴 홍보 문구를 입력했습니다. '.repeat(7));await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();await expect(page.getByRole('alert')).toContainText('제목이(가) 영역을 넘습니다');
});
test('dimension lines are editable, undoable and consistent with the summary',async({page})=>{
 await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진을 추가');await page.getByRole('button',{name:'규격',exact:false}).first().click();await page.getByRole('radio',{name:'요약과 치수선',exact:true}).check();await page.getByLabel('가로 mm',{exact:true}).fill('450');await page.getByLabel('시작점 X',{exact:true}).fill('0.3');const before=await backup(page);expect(before.dimensions.width).toBe('450');expect(before.dimensions.anchors.width[0].x).toBe(.3);await page.getByRole('button',{name:'되돌리기',exact:true}).click();const after=await backup(page);expect(after.dimensions.width).toBe('450');expect(after.dimensions.anchors.width[0].x).toBe(.1);await page.getByRole('radio',{name:'표시 안 함',exact:true}).check();expect((await backup(page)).dimensions.visible).toBe(false);
});
test('all editing panels fit narrow mobile and desktop screens',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});for(const name of ['광고 정보','문구·언어','배경','규격']){await page.locator('.editor-tabs').getByRole('button',{name:new RegExp(name)}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${name} at ${width}`).toBeLessThanOrEqual(width);}}expect(errors).toEqual([]);
});
test('ad format guide selects portrait, square and landscape without mobile overflow',async({page})=>{
 await page.locator('.format-guide summary').click();
 const options=page.getByRole('group',{name:'광고 이미지 비율'});await expect(options.getByRole('button')).toHaveCount(7);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const label of ['1:1 정사각형','4:5 피드 세로형','3:4 상품 세로형','9:16 전체 화면 세로형','2:3 포스터 세로형','16:9 와이드 가로형','1.91:1 링크 광고 가로형']){
   const button=options.getByRole('button',{name:label,exact:true});await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
   await expect(page.getByLabel('출력 비율')).toHaveValue(label.split(' ')[0]);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${label} at ${width}`).toBeLessThanOrEqual(width);
  }
 }
});
test('general product profiles persist and cylindrical outputs need only diameter and height',async({page})=>{
 await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진을 추가');
 await page.getByRole('combobox',{name:'광고 업종·상품 분류',exact:true}).selectOption('beauty');await page.getByLabel('소재·제품 정보',{exact:true}).fill('유리 용기');
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await page.getByRole('combobox',{name:'규격 형식',exact:true}).selectOption('cylindrical');
 await page.getByLabel('지름 mm',{exact:true}).fill('80');await page.getByLabel('높이 mm',{exact:true}).fill('210');await expect(page.getByLabel('세로 mm',{exact:true})).toHaveCount(0);
 const p=await backup(page);expect(p.productProfile).toEqual({category:'beauty',specType:'cylindrical',material:'유리 용기'});
 let download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();await download;
 await page.getByRole('combobox',{name:'규격 형식',exact:true}).selectOption('none');await expect(page.getByRole('radio',{name:'규격 요약만',exact:true})).toBeDisabled();
 download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();await download;
});
test('dimension display choice is saved and changes only the intended PNG overlays',async({page})=>{
 await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진을 추가');
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await page.getByLabel('가로 mm',{exact:true}).fill('450');
 async function png(){const event=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();return readFile((await (await event).path())!);}
 const crop=async(bytes:Buffer,region:{left:number;top:number;width:number;height:number})=>sharp(bytes).extract(region).raw().toBuffer();
 await page.getByRole('radio',{name:'표시 안 함',exact:true}).check();const hidden=await png();
 await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('이 기기에 저장');
 await page.reload();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/새 프로젝트/}).click();await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();
 await expect(page.getByRole('radio',{name:'표시 안 함',exact:true})).toBeChecked();await expect(page.getByLabel('가로 mm',{exact:true})).toHaveValue('450');
 await page.getByRole('radio',{name:'규격 요약만',exact:true}).check();const summary=await png();
 await page.getByRole('radio',{name:'요약과 치수선',exact:true}).check();const annotated=await png();
 const productRegion={left:90,top:715,width:900,height:590};const summaryRegion={left:80,top:1574,width:920,height:114};
 expect(await crop(hidden,productRegion)).toEqual(await crop(summary,productRegion));
 expect(await crop(annotated,productRegion)).not.toEqual(await crop(summary,productRegion));
 expect(await crop(hidden,summaryRegion)).not.toEqual(await crop(summary,summaryRegion));
 expect(await crop(annotated,summaryRegion)).toEqual(await crop(summary,summaryRegion));
 const p=await backup(page);expect(p.dimensions.width).toBe('450');expect(Buffer.from(p.product.data.split(',')[1],'base64')).toEqual(fixture);
});
test('image creation mode persists independently from dimension visibility and keeps the original asset',async({page})=>{
 await expect(page.getByRole('radio',{name:'사진과 문구로 직접 만들기',exact:true})).toBeChecked();
 await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진을 추가');
 await page.getByRole('radio',{name:'새로운 광고 이미지 만들기',exact:true}).check();await page.getByRole('textbox',{name:'원하는 광고 이미지',exact:true}).fill('같은 규격의 곡선형 화이트 용기');
 await page.getByLabel('출력 비율').selectOption('1.91:1');
 await expect(page.getByText('새 광고 이미지는 아직 생성되지 않았습니다.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'AI 생성 연결 예정',exact:true})).toBeDisabled();
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await page.getByRole('radio',{name:'표시 안 함',exact:true}).check();await page.getByLabel('가로 mm',{exact:true}).fill('450');
 await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('이 기기에 저장');
 const p=await backup(page);expect(p.format).toBe('1.91:1');expect(p.generation).toEqual({mode:'creative',brief:'같은 규격의 곡선형 화이트 용기'});expect(p.dimensions.visible).toBe(false);expect(p.dimensions.width).toBe('450');expect(Buffer.from(p.product.data.split(',')[1],'base64')).toEqual(fixture);
 await page.reload();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/새 프로젝트/}).click();await expect(page.getByRole('radio',{name:'새로운 광고 이미지 만들기',exact:true})).toBeChecked();
 await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'creative.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await expect(page.getByRole('status')).toContainText('프로젝트를 열었습니다');await expect(page.getByRole('radio',{name:'새로운 광고 이미지 만들기',exact:true})).toBeChecked();
 await page.getByRole('radio',{name:'사진과 문구로 직접 만들기',exact:true}).check();await expect(page.getByRole('button',{name:'PNG 내보내기',exact:true})).toBeEnabled();const restored=await backup(page);expect(restored.product.data).toBe(p.product.data);expect(restored.dimensions).toEqual(p.dimensions);expect(restored.generation.brief).toBe(p.generation.brief);
 await expect(page.getByLabel('출력 비율')).toHaveValue('1.91:1');
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await expect(page.getByRole('radio',{name:'표시 안 함',exact:true})).toBeChecked();
});
test('automotive, education, insurance and services export without dimension fields or spec overlays',async({page})=>{
 await page.getByLabel('상품 사진 추가').setInputFiles(photo);await expect(page.getByRole('status')).toContainText('원본 사진을 추가');
 await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();await page.getByLabel('가로 mm',{exact:true}).fill('-1');
 for(const category of ['automotive','education','insurance','services']){
  await page.locator('.editor-tabs').getByRole('button',{name:/광고 정보/}).click();
  await page.getByRole('combobox',{name:'광고 업종·상품 분류',exact:true}).selectOption(category);
  await expect(page.getByRole('checkbox',{name:'규격 정보 사용',exact:true})).not.toBeChecked();
  await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();
  await expect(page.getByRole('combobox',{name:'규격 형식',exact:true})).toHaveValue('none');await expect(page.locator('.dimension-inputs input')).toHaveCount(0);
  await expect(page.getByRole('radio',{name:'규격 요약만',exact:true})).toBeDisabled();
  const event=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();
  const bytes=await readFile((await (await event).path())!);const metadata=await sharp(bytes).metadata();expect([metadata.width,metadata.height]).toEqual([1080,1920]);
  // The previous spec card's corner is now plain background, not a white spec block.
  const pixel=await sharp(bytes).extract({left:85,top:1580,width:1,height:1}).removeAlpha().raw().toBuffer();expect([...pixel]).toEqual([244,240,232]);
  const p=await backup(page);expect(p.productProfile.specType).toBe('none');expect(p.dimensions.width).toBe('-1');expect(p.dimensions.visible).toBe(false);expect(p.product.data).toBe('data:image/png;base64,'+fixture.toString('base64'));
 }
});
test('photo-free service ads save, restore and export while creative requests stay pending',async({page})=>{
 await page.getByRole('combobox',{name:'광고 업종·상품 분류',exact:true}).selectOption('education');
 await page.getByRole('textbox',{name:'상품·서비스명',exact:true}).fill('성인 영어 회화');await page.getByLabel('서비스 내용',{exact:true}).fill('주 2회 소규모 수업');
 await page.getByLabel('출력 비율').selectOption('4:5');
 await page.locator('.editor-tabs').getByRole('button',{name:/문구·언어/}).click();await page.getByRole('textbox',{name:'홍보 제목',exact:true}).fill('나에게 맞는 영어 수업');await page.getByRole('textbox',{name:'광고 설명',exact:true}).fill('성인 대상 · 주 2회\n수업 일정은 상담으로 안내합니다.');
 await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('이 기기에 저장');
 const p=await backup(page);expect(p.product).toBeNull();expect(p.productProfile).toEqual({category:'education',specType:'none',material:'주 2회 소규모 수업'});
 await page.reload();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/새 프로젝트/}).click();await expect(page.getByRole('checkbox',{name:'규격 정보 사용',exact:true})).not.toBeChecked();
 await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'service.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await expect(page.getByRole('status')).toContainText('프로젝트를 열었습니다');
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();const bytes=await readFile((await (await event).path())!);const metadata=await sharp(bytes).metadata();expect([metadata.width,metadata.height]).toEqual([1080,1350]);
 await page.getByRole('radio',{name:'새로운 광고 이미지 만들기',exact:true}).check();await expect(page.getByText('사진 없이 만들 광고의 내용과 원하는 분위기를 입력해주세요.',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'원하는 광고 이미지',exact:true}).fill('차분하고 밝은 교실, 성인 학습자를 위한 영어 회화 수업');
 await expect(page.locator('.generation-issue')).toHaveCount(0);await expect(page.getByRole('button',{name:'AI 생성 연결 예정',exact:true})).toBeDisabled();
 const creative=await backup(page);expect(creative.product).toBeNull();expect(creative.productProfile.specType).toBe('none');expect(creative.generation.mode).toBe('creative');expect(creative.format).toBe('4:5');
});
