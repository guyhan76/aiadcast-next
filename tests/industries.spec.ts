import {test,expect,type Page} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await protectedScreen(page,mockSession('protected-industries'));});
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {industryGroups} from '../src/industry';
import {selectIndustry} from './helpers/industry';
async function backup(page:Page){const d=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();return JSON.parse(await readFile((await(await d).path())!,'utf8'));}
test('all industries remain available in a grouped list without a duplicate subject selection',async({page})=>{
 await page.goto('/#create');const wizard=page.locator('.create-page'),select=wizard.getByLabel('산업 선택');
 await expect(wizard.locator('.ad-subject-kind')).toHaveCount(0);
 expect(await select.locator('optgroup option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value))).toEqual(industryGroups.flatMap(g=>g.categoryIds));
 for(const group of industryGroups)for(const category of group.categoryIds){await select.selectOption(category);await expect(select).toHaveValue(category);if(group.kind==='service')await expect(wizard.getByLabel('규격 형식')).toHaveCount(0);}
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});
test('different service industries reject missing photos without generation or credit mutations',async({page})=>{
 let writes=0;await page.route('**/api/**',r=>{if(r.request().method()!=='GET')writes++;return r.fallback();});
 for(const category of ['pilates','lodging','hospital','banking','tarot','astrology','myeongri','sinjeom']){await page.goto('/#create');const wizard=page.locator('.create-page');await wizard.getByLabel('산업 선택').selectOption(category);await wizard.getByRole('textbox',{name:'상세설명',exact:true}).fill(category+' 서비스 안내');await wizard.getByLabel(/^(상품명|서비스명)$/).fill(category+' 안내');await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('사진');await expect(page).toHaveURL(/#create$/);await expect(wizard.getByLabel('규격 형식')).toHaveCount(0);await expect(wizard.getByLabel(/^(상품명|서비스명)$/)).toHaveValue(category+' 안내');expect(writes).toBe(0);}
});
test('optional purpose and requests remain editable and persist through backup',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'내 광고 만들기',exact:true}).click();const wizard=page.locator('.create-page');await wizard.getByLabel('산업 선택').selectOption('pilates');await wizard.getByRole('textbox',{name:'상세설명',exact:true}).fill('조용한 필라테스 수업');await wizard.getByLabel('서비스명',{exact:true}).fill('온 필라테스');await wizard.getByLabel('목적 선택').selectOption('offer');await wizard.locator('[data-order="7"] summary').click();await expect(wizard.locator('.creative-look-card')).toHaveCount(0);await wizard.getByRole('textbox',{name:'요청사항',exact:true}).fill('조용한 스튜디오');for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}await wizard.getByLabel('참조사진 추가').setInputFiles({name:'studio.png',mimeType:'image/png',buffer:await sharp({create:{width:400,height:300,channels:4,background:'#b87844'}}).png().toBuffer()});await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page).toHaveURL(/#studio$/);await page.goto('/#editor');const saved=await backup(page);expect(saved.campaign.creative).toMatchObject({look:'auto',directionId:'offer',note:'조용한 스튜디오'});
});

test('legacy fortune JSON and device projects keep their source and copy with migrated industries',async({page})=>{
 await page.goto('/#editor');await page.locator('.editor-details>summary').click();const bytes=await sharp({create:{width:400,height:300,channels:4,background:'#b87844'}}).png().toBuffer();
 await page.locator('.editor-container').getByLabel('참조사진 추가').setInputFiles({name:'original.png',mimeType:'image/png',buffer:bytes});await expect(page.locator('.editor-container .feedback[role="status"]')).toContainText('원본 사진');
 const legacy=await backup(page);if(legacy.campaign)delete legacy.campaign.creative;
 legacy.copy.ko.title='고객이 작성한 제목';legacy.background.color='#ffeedd';legacy.productProfile.category='fortunehouse';
 const confirmImport=page.waitForEvent('dialog').then(async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toBe('저장하지 않은 편집을 닫고 프로젝트를 불러올까요?');await dialog.accept();});
 await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'legacy-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await confirmImport;await expect(page.locator('.editor-container .feedback[role="status"]')).toContainText('프로젝트를 열었습니다');
 const loaded=await backup(page);expect(loaded.copy).toEqual(legacy.copy);expect(loaded.background).toEqual(legacy.background);expect(loaded.product).toEqual(legacy.product);expect(loaded.productProfile).toEqual({...legacy.productProfile,category:'myeongri'});
 const deviceProject={...legacy,id:'legacy-divination-device',name:'이전 신점 프로젝트',productProfile:{...legacy.productProfile,category:'divination'}};
 await page.evaluate(async project=>{
  const database=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('aiadcast-editor-protected-industries',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{await new Promise<void>((resolve,reject)=>{const transaction=database.transaction('projects','readwrite');transaction.objectStore('projects').put(project);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});}finally{database.close();}
 },deviceProject);
 await page.reload();await page.locator('.editor-details>summary').click();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/이전 신점 프로젝트/}).click();
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

