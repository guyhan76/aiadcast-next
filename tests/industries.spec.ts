import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {industryGroups} from '../src/industry';
import {selectIndustry} from './helpers/industry';
async function backup(page:Page){const d=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();return JSON.parse(await readFile((await(await d).path())!,'utf8'));}
test('all industries are reachable through product or service, category and detail without a flat dropdown',async({page})=>{
 test.setTimeout(60000);await page.goto('/#create');const wizard=page.locator('.create-page');await wizard.locator('.quiet-details>summary').filter({hasText:'업종·규격 설정'}).click();const picker=wizard.getByRole('group',{name:'업종 선택',exact:true});await expect(wizard.getByRole('combobox',{name:'업종',exact:true})).toHaveCount(0);
 for(const kind of ['product','service']){
  await picker.getByRole('button',{name:kind==='product'?'실물·규격 상품':'서비스',exact:true}).click();
  const groups=industryGroups.filter(g=>g.kind===kind);await expect(picker.locator('.industry-group-card')).toHaveCount(groups.length);
  for(const group of groups){await picker.getByRole('button',{name:group.label+' 업종 그룹',exact:true}).click();const leaves=picker.locator('.industry-detail-options button');await expect(leaves).toHaveCount(group.categoryIds.length);for(let i=0;i<group.categoryIds.length;i++){await leaves.nth(i).click();await expect(leaves.nth(i)).toHaveAttribute('aria-pressed','true');}}
 }
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});
test('different service industries can request creative ads without photos or dimensions',async({page})=>{
 test.setTimeout(60000);for(const category of ['pilates','lodging','hospital','banking','tarot','astrology','myeongri','sinjeom']){await page.goto('/');await page.getByRole('button',{name:'서비스 광고 만들기',exact:true}).click();const wizard=page.locator('.create-page');await selectIndustry(page,category,wizard);await wizard.getByLabel('상품·서비스 이름').fill(category+' 안내');await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.getByRole('button',{name:'광고 제작으로',exact:true}).click();const saved=await backup(page);expect(saved.product).toBeNull();expect(saved.productProfile).toMatchObject({category,specType:'none'});expect(saved.generation.mode).toBe('creative');}
});
test('optional purpose and requests remain editable and persist through backup',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'서비스 광고 만들기',exact:true}).click();const wizard=page.locator('.create-page');await wizard.getByLabel('상품·서비스 이름').fill('온 필라테스');await wizard.getByText('광고의 목적',{exact:true}).first().click();await wizard.locator('.creative-purpose-card').nth(1).click();await expect(wizard.locator('.creative-look-card')).toHaveCount(0);await wizard.getByRole('textbox',{name:'요청사항 선택',exact:true}).fill('조용한 스튜디오');for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.getByRole('button',{name:'광고 제작으로',exact:true}).click();const saved=await backup(page);expect(saved.campaign.creative).toMatchObject({look:'auto',directionId:'offer',note:'조용한 스튜디오'});
});

test('legacy fortune JSON and device projects keep their source and copy with migrated industries',async({page})=>{
 await page.goto('/#studio');await page.locator('.editor-details>summary').click();const bytes=await sharp({create:{width:400,height:300,channels:4,background:'#b87844'}}).png().toBuffer();
 await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'original.png',mimeType:'image/png',buffer:bytes});await expect(page.getByRole('status')).toContainText('원본 사진');
 const legacy=await backup(page);if(legacy.campaign)delete legacy.campaign.creative;
 legacy.copy.ko.title='고객이 작성한 제목';legacy.background.color='#ffeedd';legacy.productProfile.category='fortunehouse';
 const confirmImport=page.waitForEvent('dialog').then(async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toBe('저장하지 않은 편집을 닫고 프로젝트를 불러올까요?');await dialog.accept();});
 await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'legacy-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await confirmImport;await expect(page.getByRole('status')).toContainText('프로젝트를 열었습니다');
 const loaded=await backup(page);expect(loaded.copy).toEqual(legacy.copy);expect(loaded.background).toEqual(legacy.background);expect(loaded.product).toEqual(legacy.product);expect(loaded.productProfile).toEqual({...legacy.productProfile,category:'myeongri'});
 const deviceProject={...legacy,id:'legacy-divination-device',name:'이전 신점 프로젝트',productProfile:{...legacy.productProfile,category:'divination'}};
 await page.evaluate(async project=>{
  const database=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('aiadcast-editor',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{await new Promise<void>((resolve,reject)=>{const transaction=database.transaction('projects','readwrite');transaction.objectStore('projects').put(project);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});}finally{database.close();}
 },deviceProject);
 await page.goto('/#projects');await page.getByRole('button',{name:/이전 신점 프로젝트/}).click();await page.locator('.editor-details>summary').click();
 const migrated=await backup(page);expect(migrated.productProfile).toEqual({...legacy.productProfile,category:'sinjeom'});expect(migrated.copy).toEqual(legacy.copy);expect(migrated.product).toEqual(legacy.product);expect(migrated.dimensions).toEqual(legacy.dimensions);
 const picker=page.locator('.editor-container:visible').getByRole('group',{name:'업종 선택',exact:true});
 await picker.getByRole('button',{name:/업종 변경/}).click();await expect(picker.getByRole('button',{name:'서비스',exact:true})).toHaveAttribute('aria-pressed','true');
 await picker.getByRole('button',{name:'실물·규격 상품',exact:true}).click();await picker.getByRole('button',{name:'포장재 업종 그룹',exact:true}).click();
 const browsing=await backup(page);expect(browsing.productProfile).toEqual(migrated.productProfile);expect(browsing.copy).toEqual(migrated.copy);expect(browsing.product).toEqual(migrated.product);expect(browsing.dimensions).toEqual(migrated.dimensions);
 await selectIndustry(page,'corporate');
 const options=page.locator('.editor-container:visible .creative-options-compact');await options.locator(':scope > summary').click();
 await expect(options.locator('.creative-look-card')).toHaveCount(0);await options.getByRole('textbox',{name:'요청사항 선택',exact:true}).fill('장비 구조를 잘 보여주세요.');let updated=await backup(page);
 expect(updated.copy).toEqual(legacy.copy);expect(updated.product).toEqual(legacy.product);expect(updated.dimensions.width).toBe(legacy.dimensions.width);expect(updated.productProfile.specType).toBe('none');
 await options.getByRole('button',{name:'추천 문구 적용',exact:true}).click();updated=await backup(page);expect(updated.copy.ko.title).not.toBe(legacy.copy.ko.title);expect(updated.copy.en).toEqual(legacy.copy.en);expect(updated.product).toEqual(legacy.product);
});
