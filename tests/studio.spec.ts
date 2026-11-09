import {selectConsumerIndustry} from './helpers/industry';
import {test,expect,type Page} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));await protectedScreen(page,mockSession('protected-studio'));});
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
const pixels=await sharp({create:{width:600,height:200,channels:4,background:'#b97b4e'}}).png().toBuffer();
async function backup(page:Page){const d=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();return JSON.parse(await readFile((await(await d).path())!,'utf8'));}
test('home, creation, library and guide fit narrow screens with clean channel guidance',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));for(const route of ['home','create','projects','guide']){await page.goto('/#'+route);for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}}
 await page.goto('/');await expect(page.getByRole('heading',{name:'내 상품으로, 나만의 광고'})).toBeVisible();await expect(page.locator('.home-showcase')).toHaveCount(0);expect(errors).toEqual([]);
});
test('service wizard rejects missing photos, keeps details, and restores a photo-backed manual export',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'광고 이미지 만들기',exact:true}).click();const wizard=page.locator('.create-page');await selectConsumerIndustry(wizard,'education');await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('이름');
 await wizard.getByLabel('서비스명',{exact:true}).fill('성인 영어 회화');await wizard.getByRole('textbox',{name:'상세설명',exact:true}).fill('주 2회 소규모 수업');await page.goto('/#home');await page.goto('/#create');await expect(wizard.getByRole('textbox',{name:'상세설명',exact:true})).toHaveValue('주 2회 소규모 수업');await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('사진');await expect(page).toHaveURL(/#create$/);await wizard.getByLabel('참조사진 추가').setInputFiles({name:'classroom.png',mimeType:'image/png',buffer:pixels});await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page).toHaveURL(/#studio$/);await page.goto('/#editor');await page.locator('.editor-details>summary').click();await page.getByRole('radio',{name:'사진과 문구로 직접 만들기',exact:true}).check();await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();
 const saved=await backup(page);expect(Buffer.from(saved.product.data.split(',')[1],'base64')).toEqual(pixels);expect(saved.productProfile.specType).toBe('none');expect(saved.productProfile.category).toBe('education');const d=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();expect((await sharp(await readFile((await(await d).path())!)).metadata()).height).toBe(1920);
 await page.reload();await page.locator('.editor-details>summary').click();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/성인 영어 회화 광고/}).click();await expect(page.getByRole('textbox',{name:'상품·서비스명',exact:true})).toHaveValue('성인 영어 회화');
});
test('physical form validates industry and photos and preserves original bytes and entered dimensions',async({page})=>{
 await page.goto('/#create');const wizard=page.locator('.create-page');await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('산업');await selectConsumerIndustry(wizard,'boxes');await wizard.getByLabel('상품명',{exact:true}).fill('크라프트 박스');await wizard.getByRole('textbox',{name:'상세설명',exact:true}).fill('크라프트 포장 상자');await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('사진');await wizard.getByLabel('참조사진 추가').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:pixels});await wizard.getByRole('button',{name:'규격 넣기',exact:true}).click();await wizard.getByLabel('광고에 규격 표시').uncheck();for(const [label,value] of [['가로 cm','30'],['세로 cm','20'],['높이 cm','10']])await wizard.getByLabel(label,{exact:true}).fill(value);
 await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page).toHaveURL(/#studio$/);await page.goto('/#editor');const saved=await backup(page);expect(Buffer.from(saved.product.data.split(',')[1],'base64')).toEqual(pixels);expect(saved.dimensions.width).toBe('300');expect(saved.dimensions.visible).toBe(false);expect(saved.dimensions.displayUnit).toBe('cm');expect(saved.generation.mode).toBe('creative');
});

test('home has one creation path and stored work recovers in-progress edits without duplicate entries',async({page})=>{
 await page.goto('/');const home=page.locator('.home-page');
 await expect(home.getByRole('button',{name:'광고 이미지 만들기',exact:true})).toHaveCount(1);
 await expect(home.locator('.premium-shortcuts,.continue-work,.premium-value')).toHaveCount(0);
 await expect(page.locator('.app-footer a')).toHaveCount(0);
 await home.getByRole('button',{name:'광고 이미지 만들기',exact:true}).click();
 const form=page.locator('.create-page');await selectConsumerIndustry(form,'services');await form.getByLabel('서비스명',{exact:true}).fill('이어갈 서비스');await form.getByRole('textbox',{name:'상세설명',exact:true}).fill('이어서 편집할 서비스');await form.getByLabel('참조사진 추가').setInputFiles({name:'service.png',mimeType:'image/png',buffer:pixels});await form.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page).toHaveURL(/#studio$/);await page.goto('/#editor');
 await page.locator('.editor-details > summary').click();await page.getByRole('textbox',{name:'프로젝트 이름',exact:true}).fill('편집 중인 최신 내용');
 await page.goto('/#home');await page.goto('/#projects');
 await expect(page.locator('.project-tile').filter({hasText:'편집 중인 최신 내용'})).toHaveCount(1);await page.goto('/#editor');await page.locator('.editor-details > summary').click();await expect(page.getByRole('textbox',{name:'프로젝트 이름',exact:true})).toHaveValue('편집 중인 최신 내용');await page.getByRole('button',{name:'이 기기에 저장',exact:true}).click();await expect(page.locator('.editor-container .feedback')).toContainText('저장');await page.getByRole('button',{name:'저장한 작업',exact:true}).click();const saved=page.getByRole('button',{name:/편집 중인 최신 내용/});await expect(saved).toHaveCount(1);await saved.click();
 await expect(page.getByRole('textbox',{name:'프로젝트 이름',exact:true})).toHaveValue('편집 중인 최신 내용');
});
