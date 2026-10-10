import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {selectIndustry} from './helpers/industry';
const pixels=await sharp({create:{width:600,height:200,channels:4,background:'#b97b4e'}}).png().toBuffer();
async function backup(page:Page){const d=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();return JSON.parse(await readFile((await(await d).path())!,'utf8'));}
test('home, creation, library and guide fit narrow screens with an honest offline notice',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));for(const route of ['home','create','projects','guide']){await page.goto('/#'+route);for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}}
 await page.goto('/');await expect(page.getByRole('heading',{name:/내 상품과 서비스로/})).toBeVisible();await expect(page.locator('.home-scope:visible')).toContainText('연결 전');await expect(page.locator('.home-showcase')).toHaveAttribute('aria-label',/AI로 제작한/);await expect(page.locator('.generated-home-ad img')).toBeVisible();await expect.poll(()=>page.locator('.generated-home-ad img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(1000);expect(errors).toEqual([]);
});
test('service wizard keeps details when going back, supports manual export and restores projects',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'광고 만들기',exact:true}).click();await page.locator('.ad-subject-kind').getByRole('button',{name:'서비스',exact:true}).click();const wizard=page.locator('.create-page');await selectIndustry(page,'education',wizard);await wizard.getByRole('button',{name:'다음',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('이름');
 await wizard.getByLabel('상품·서비스 이름').fill('성인 영어 회화');await wizard.getByLabel('상품 상세설명').fill('주 2회 소규모 수업');await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.getByRole('button',{name:'이전',exact:true}).click();await expect(wizard.getByLabel('상품 상세설명')).toHaveValue('주 2회 소규모 수업');await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.getByText('다른 크기 · 언어 · 제작 방식',{exact:true}).click();await wizard.getByLabel('제작 방식',{exact:true}).selectOption('original');await wizard.getByRole('button',{name:'광고 제작으로',exact:true}).click();
 const saved=await backup(page);expect(saved.product).toBeNull();expect(saved.productProfile.specType).toBe('none');expect(saved.productProfile.category).toBe('education');const d=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();expect((await sharp(await readFile((await(await d).path())!)).metadata()).height).toBe(1350);
 await page.goto('/#projects');await page.getByRole('button',{name:/성인 영어 회화 광고/}).click();await page.locator('.editor-details>summary').click();await expect(page.getByRole('textbox',{name:'상품·서비스명',exact:true})).toHaveValue('성인 영어 회화');
});
test('physical wizard preserves original bytes and entered dimensions without requiring industry selection',async({page})=>{
 await page.goto('/#create');const wizard=page.locator('.create-page');await wizard.getByLabel('상품·서비스 이름').fill('크라프트 박스');await wizard.getByRole('button',{name:'다음',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('사진');await wizard.getByLabel('참조사진 추가').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:pixels});await wizard.locator('.quiet-details>summary').filter({hasText:'업종·규격 설정'}).click();await wizard.getByLabel('규격 형식').selectOption('rectangular');for(const [label,value] of [['가로 (mm)','300'],['세로 (mm)','200'],['높이 (mm)','100']])await wizard.getByLabel(label,{exact:true}).fill(value);
 await wizard.getByRole('button',{name:'다음',exact:true}).click();await wizard.getByRole('button',{name:'광고 제작으로',exact:true}).click();const saved=await backup(page);expect(Buffer.from(saved.product.data.split(',')[1],'base64')).toEqual(pixels);expect(saved.dimensions.width).toBe('300');expect(saved.dimensions.visible).toBe(true);expect(saved.generation.mode).toBe('creative');
});

test('six-category lookbook supports tabs, keyboard boundaries and touch without horizontal overflow',async({page})=>{
 await page.goto('/');const gallery=page.locator('.home-showcase'),panel=gallery.getByRole('tabpanel'),image=gallery.locator('.generated-home-ad img');
 await expect(gallery.getByRole('tab')).toHaveCount(6);
 await expect(gallery.getByRole('tab',{name:'화장품',exact:true})).toHaveAttribute('aria-selected','true');const cosmetics=await image.getAttribute('src');
 await gallery.getByRole('tab',{name:'패션소품',exact:true}).click();await expect(image).toHaveAttribute('alt',/패션소품 광고/);expect(await image.getAttribute('src')).not.toBe(cosmetics);
 await gallery.getByRole('tab',{name:'패션소품',exact:true}).press('ArrowRight');await expect(gallery.getByRole('tab',{name:'주얼리',exact:true})).toBeFocused();await expect(image).toHaveAttribute('alt',/주얼리 광고/);
 await gallery.getByRole('tab',{name:'주얼리',exact:true}).press('End');await expect(gallery.getByRole('tab',{name:'호텔',exact:true})).toBeFocused();await expect(image).toHaveAttribute('alt',/호텔 광고/);
 await panel.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:250,clientY:150}]});await panel.dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:80,clientY:155}]});await expect(gallery.getByRole('tab',{name:'화장품',exact:true})).toHaveAttribute('aria-selected','true');
 await panel.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:250,clientY:150}]});await panel.dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:230,clientY:300}]});await expect(gallery.getByRole('tab',{name:'화장품',exact:true})).toHaveAttribute('aria-selected','true');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});for(const name of ['화장품','패션소품','주얼리','패션','여행','호텔']){await gallery.getByRole('tab',{name,exact:true}).click();await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(1000);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}}
});

test('home has one creation path and projects recover in-progress edits without duplicate tiles',async({page})=>{
 await page.goto('/');const home=page.locator('.home-page');
 await expect(home.getByRole('button',{name:'광고 만들기',exact:true})).toHaveCount(1);
 await expect(home.locator('.premium-shortcuts,.continue-work,.premium-value')).toHaveCount(0);
 await expect(page.locator('.app-footer a')).toHaveCount(0);
 await home.getByRole('button',{name:'광고 만들기',exact:true}).click();
 const kinds=page.locator('.ad-subject-kind');await expect(kinds.getByRole('button',{name:'상품',exact:true})).toHaveAttribute('aria-pressed','true');
 await kinds.getByRole('button',{name:'서비스',exact:true}).click();
 await page.locator('.create-page').getByLabel('상품·서비스 이름').fill('이어갈 서비스');
 await page.locator('.create-page').getByRole('button',{name:'다음',exact:true}).click();
 await page.locator('.create-page').getByRole('button',{name:'광고 제작으로',exact:true}).click();
 await page.locator('.editor-details > summary').click();await page.getByRole('textbox',{name:'프로젝트 이름',exact:true}).fill('편집 중인 최신 내용');
 await page.goto('/#home');await page.goto('/#projects');
 const tile=page.locator('.project-tile').filter({hasText:'편집 중인 최신 내용'});await expect(tile).toHaveCount(1);await tile.click();
 await page.locator('.editor-details > summary').click();await expect(page.getByRole('textbox',{name:'프로젝트 이름',exact:true})).toHaveValue('편집 중인 최신 내용');
});
