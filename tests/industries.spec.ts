import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {industryDirections,industryGroups,industryLabel,productCategories} from '../src/industry';
import {selectIndustry} from './helpers/industry';

async function downloadJSON(page:Page,name='프로젝트 백업'){
 const event=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();
 return JSON.parse(await readFile((await (await event).path())!,'utf8'));
}
async function serviceWizard(page:Page,category:string,name:string,creative=false){
 await page.goto('/');await page.getByRole('button',{name:'기업·서비스 업종으로 광고 만들기',exact:true}).click();const wizard=page.locator('.create-page:visible');
 await selectIndustry(page,category,wizard);await wizard.getByLabel('상품·서비스 이름').fill(name);
 await wizard.getByRole('button',{name:'다음',exact:true}).click();
 await expect(wizard.getByText('사진이나 로고 추가 (선택)',{exact:true})).toBeVisible();
 await expect(wizard.getByRole('checkbox',{name:/규격 정보 사용/})).not.toBeChecked();
 await expect(wizard.locator('.dimension-inputs input')).toHaveCount(0);
 await wizard.getByLabel('서비스 소개').fill('예약과 이용 조건은 상담으로 안내합니다.');
 if(creative)await wizard.getByRole('combobox',{name:'제작 방식',exact:true}).selectOption('creative');
 await wizard.getByRole('button',{name:'다음',exact:true}).click();return wizard;
}

test('twelve visual groups expose fashion directly and all forty-two industries are searchable',async({page})=>{
 test.setTimeout(60000);await page.goto('/');
 await expect(page.locator('.business-options').getByRole('button')).toHaveCount(12);
 await expect(page.locator('.business-options').getByRole('button').nth(1)).toHaveAccessibleName('패션·스타일 업종으로 광고 만들기');
 await page.getByRole('button',{name:'패션·스타일 업종으로 광고 만들기',exact:true}).click();
 const wizard=page.locator('.create-page:visible'),picker=wizard.getByRole('group',{name:'업종 선택',exact:true});
 await expect(picker.getByRole('group',{name:'패션·스타일 세부 업종',exact:true}).getByRole('button')).toHaveText(['의류·패션','가방','신발','주얼리','패션잡화']);
 await expect(picker.getByRole('group',{name:'업종 그룹',exact:true}).getByRole('button')).toHaveCount(12);
 for(const group of industryGroups){
  await picker.getByRole('button',{name:group.label+' 업종 그룹',exact:true}).click();
  const options=picker.getByRole('group',{name:group.label+' 세부 업종',exact:true});
  await expect(options.getByRole('button')).toHaveCount(group.categoryIds.length);
  for(const category of group.categoryIds)await expect(options.getByRole('button',{name:industryLabel(category),exact:true})).toBeVisible();
 }
 for(const [category] of productCategories)await selectIndustry(page,category,wizard);
 await picker.getByRole('searchbox',{name:'업종 찾기',exact:true}).fill('없는업종찾기xyz');
 await expect(picker.getByText('일치하는 업종이 없습니다.',{exact:true})).toBeVisible();
 await picker.getByRole('button',{name:'기타 서비스 선택',exact:false}).click();
 await expect(picker.getByRole('button',{name:'서비스 업종',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('service industries including all four fortune consultations prepare ads without a photo or dimensions',async({page})=>{
 test.setTimeout(60000);
 for(const [category,name] of [['pilates','필라테스 스튜디오'],['lodging','모먼트 호텔'],['hospital','한결 의원'],['banking','은행 상담 서비스'],['tarot','타로 상담소'],['astrology','별자리 상담소'],['myeongri','명리학 상담소'],['sinjeom','신점 상담소']]){
  const wizard=await serviceWizard(page,category,name,category==='banking');
  await expect(wizard.getByRole('region',{name:'광고 방향과 스타일',exact:true})).toBeVisible();
  await wizard.getByRole('button',{name:'편집 시작',exact:true}).click();await expect(page).toHaveURL(/#studio$/);
  const plan=await downloadJSON(page,'광고 기획 저장');
  expect(plan.status).toBe('planning-only');expect(plan.request.subjectType).toBe('service');expect(plan.request.source).toBeNull();expect(plan.request.specifications).toEqual([]);expect(plan.request.output.showDimensions).toBe(false);
  expect(plan.request.creativeDirection.industry.id).toBe(category);expect(plan.request.creativeDirection.providerStatus).toBe('not-connected');
  if(category==='banking'){expect(plan.request.operation).toBe('image-ad-creative');expect(plan.request.brief).toBe('');await expect(page.getByRole('button',{name:'AI 생성 연결 예정',exact:true})).toBeDisabled();}
  const data=await downloadJSON(page);expect(data.productName).toBe(name);expect(data.productProfile.specType).toBe('none');expect(data.copy.ko.title).toContain(name);
 }
});

test('selected premium direction and optional notes survive save, import and real PNG export',async({page})=>{
 const wizard=await serviceWizard(page,'pilates','온 필라테스');
 const creative=wizard.getByRole('region',{name:'광고 방향과 스타일',exact:true});
 await creative.locator('.creative-purpose-card').filter({hasText:industryDirections('pilates').find(d=>d.id==='offer')!.label}).click();
 await creative.locator('.creative-look-card').filter({hasText:'시그니처'}).click();
 const note='따뜻한 운동 공간과 차분한 조명. 오른쪽에 상담 안내 공간을 남겨주세요.';
 await creative.getByLabel('더 담고 싶은 내용',{exact:false}).fill(note);
 await wizard.locator('.wizard-format-details summary').click();await wizard.locator('.wizard-formats').getByRole('button',{name:/4:5/}).click();
 await wizard.getByRole('button',{name:'편집 시작',exact:true}).click();await expect(page).toHaveURL(/#studio$/);
 const data=await downloadJSON(page);expect(data.campaign.creative).toEqual({directionId:'offer',look:'signature',note});expect(data.background.color).toBe('#191d1f');expect(data.ink).toBe('light');expect(data.copy.ko.title).toContain('나에게 맞는 수업');
 const plan=await downloadJSON(page,'광고 기획 저장');expect(plan.request.creativeDirection.direction.id).toBe('offer');expect(plan.request.creativeDirection.visual.id).toBe('signature');expect(plan.request.creativeDirection.additionalInstructions).toBe(note);expect(plan.request.creativeDirection.status).toBe('direction-prepared');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();
 const png=await readFile((await (await download).path())!);expect((await sharp(png).metadata()).height).toBe(1350);expect([...await sharp(png).extract({left:5,top:5,width:1,height:1}).removeAlpha().raw().toBuffer()]).toEqual([25,29,31]);
 await page.reload();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/온 필라테스 광고/}).click();expect((await downloadJSON(page)).campaign.creative).toEqual(data.campaign.creative);
 await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'premium-direction.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await expect(page.getByRole('status')).toContainText('프로젝트를 열었습니다');expect((await downloadJSON(page)).campaign.creative).toEqual(data.campaign.creative);
});

test('legacy fortune JSON and device projects keep their source and copy with migrated industries',async({page})=>{
 await page.goto('/#studio');const bytes=await sharp({create:{width:400,height:300,channels:4,background:'#b87844'}}).png().toBuffer();
 await page.getByLabel('상품 사진 추가').setInputFiles({name:'original.png',mimeType:'image/png',buffer:bytes});await expect(page.getByRole('status')).toContainText('원본 사진');
 const legacy=await downloadJSON(page);if(legacy.campaign)delete legacy.campaign.creative;
 legacy.copy.ko.title='고객이 작성한 제목';legacy.background.color='#ffeedd';legacy.productProfile.category='fortunehouse';
 const confirmImport=page.waitForEvent('dialog').then(async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toBe('저장하지 않은 편집을 닫고 프로젝트를 불러올까요?');await dialog.accept();});
 await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'legacy-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await confirmImport;await expect(page.getByRole('status')).toContainText('프로젝트를 열었습니다');
 const loaded=await downloadJSON(page);expect(loaded.copy).toEqual(legacy.copy);expect(loaded.background).toEqual(legacy.background);expect(loaded.product).toEqual(legacy.product);expect(loaded.productProfile).toEqual({...legacy.productProfile,category:'myeongri'});
 const deviceProject={...legacy,id:'legacy-divination-device',name:'이전 신점 프로젝트',productProfile:{...legacy.productProfile,category:'divination'}};
 await page.evaluate(async project=>{
  const database=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('aiadcast-editor',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{await new Promise<void>((resolve,reject)=>{const transaction=database.transaction('projects','readwrite');transaction.objectStore('projects').put(project);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});}finally{database.close();}
 },deviceProject);
 await page.goto('/#projects');await page.getByRole('button',{name:/이전 신점 프로젝트/}).click();
 const migrated=await downloadJSON(page);expect(migrated.productProfile).toEqual({...legacy.productProfile,category:'sinjeom'});expect(migrated.copy).toEqual(legacy.copy);expect(migrated.product).toEqual(legacy.product);expect(migrated.dimensions).toEqual(legacy.dimensions);
 await selectIndustry(page,'corporate');
 const options=page.locator('.editor-container:visible .creative-options-compact');await options.locator('summary').click();
 await options.locator('.creative-look-card').filter({hasText:'모던 테크'}).click();let updated=await downloadJSON(page);
 expect(updated.copy).toEqual(legacy.copy);expect(updated.product).toEqual(legacy.product);expect(updated.dimensions.width).toBe(legacy.dimensions.width);expect(updated.productProfile.specType).toBe('none');
 await options.getByRole('button',{name:'추천 문구 적용',exact:true}).click();updated=await downloadJSON(page);expect(updated.copy.ko.title).not.toBe(legacy.copy.ko.title);expect(updated.copy.en).toEqual(legacy.copy.en);expect(updated.product).toEqual(legacy.product);
});

test('industry cards and premium options remain usable from 320 pixels to desktop',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#create');
 const wizard=page.locator('.create-page:visible'),picker=wizard.getByRole('group',{name:'업종 선택',exact:true});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});await picker.getByRole('button',{name:'금융·보험 업종 그룹',exact:true}).click();
  await expect(picker.getByRole('button',{name:'코인·디지털 자산',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth),`industry cards at ${width}`).toBeLessThanOrEqual(width);
 }
 await selectIndustry(page,'restaurant',wizard);await wizard.getByLabel('상품·서비스 이름').fill('프리미엄 다이닝');await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.getByRole('button',{name:'다음',exact:true}).click();
 const creative=wizard.getByRole('region',{name:'광고 방향과 스타일',exact:true});await creative.getByLabel('더 담고 싶은 내용',{exact:false}).fill('https://example.com/'+'very-long-brand-direction'.repeat(20));
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await creative.locator('.creative-look-card').filter({hasText:'시그니처'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth),`creative choices at ${width}`).toBeLessThanOrEqual(width);}
 expect(errors).toEqual([]);
});
