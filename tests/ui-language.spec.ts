import {attachSubjectPhoto} from './helpers/subject-photo';
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test.describe('Independent Korean and English interface',()=>{
 test.use({locale:'en-US'});
 test('uses browser language, persists the choice and keeps navigation readable on mobile',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByRole('heading',{name:/Your products and services/})).toBeVisible();
  await page.getByRole('combobox',{name:'App language',exact:true}).selectOption('ko');
  await expect(page.getByRole('heading',{name:/내 상품과 서비스를/})).toBeVisible();
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','ko');
  await page.getByRole('combobox',{name:'앱 언어',exact:true}).selectOption('en');
  for(const route of ['home','create','projects','guide']){
   await page.goto('/#'+route);
   for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${route} at ${width}`).toBeLessThanOrEqual(width);}
  }
  expect(errors).toEqual([]);
 });
 test('finds industries in English and keeps the chosen ad language independent of the UI',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Create an ad',exact:true}).click();
  const wizard=page.locator('.create-page');
  await wizard.getByLabel('Choose an industry').selectOption('yoga');
  await wizard.getByLabel(/^(Product name|Service name)$/,{exact:true}).fill('Studio Bloom');
  await wizard.getByRole('textbox',{name:'Description',exact:true}).fill('Small-group yoga classes');

  await wizard.getByText('More ratios · Copy language',{exact:true}).click();
  await expect(wizard.getByRole('combobox',{name:'Ad copy language',exact:true})).toHaveValue('en');
  await wizard.getByRole('combobox',{name:'Ad copy language',exact:true}).selectOption('ko');
  await page.getByRole('combobox',{name:'App language',exact:true}).selectOption('ko');
  await page.getByRole('combobox',{name:'앱 언어',exact:true}).selectOption('en');
  await expect(wizard.getByRole('combobox',{name:'Ad copy language',exact:true})).toHaveValue('ko');
  await attachSubjectPhoto(page);await wizard.getByRole('button',{name:'Generate ad',exact:true}).click();
  await expect(page).toHaveURL(/#studio$/);await page.goto('/#editor');
  await page.locator('#publishing-tools > summary').click();const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Save campaign brief',exact:true}).click();
  const brief=JSON.parse(await readFile((await (await download).path())!,'utf8'));
  expect(brief.request.output.locale).toBe('ko');expect(brief.request.productName).toBe('Studio Bloom');
  expect(brief.request.productProfile.category).toBe('yoga');expect(brief.request.specifications).toEqual([]);
  expect(brief.guide.input.category).toBe('yoga');expect(brief.guide.input.locale).toBe('ko');expect(brief.guide.target.label).toContain('요가');
 });
 test('English quick-edit examples remain usable without a paid AI call',async({page})=>{
  await page.goto('/#studio');await page.locator('.editor-details > summary').click();
  await page.locator('#creative-tools > summary').click();const director=page.getByRole('region',{name:'Describe your ad',exact:true});
  await director.getByRole('button',{name:'Change background color',exact:false}).click();
  await expect(director.getByRole('textbox',{name:'Your ad idea or change request'})).toHaveValue('Set the background to black');
  await director.getByRole('button',{name:'Save request',exact:true}).click();
  await director.getByRole('button',{name:'Apply change',exact:true}).click();
  await expect(director.getByText('Quick edit applied',{exact:true})).toBeVisible();
 });
 test('Android back saves changed edits before leaving the editor and allows exit at home',async({page})=>{
  await page.goto('/');
  expect(await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-back',{cancelable:true})))).toBe(true);
  await page.goto('/#studio');await page.locator('.editor-details > summary').click();
  await page.getByRole('textbox',{name:'Project name',exact:true}).fill('Back navigation draft');
  expect(await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-back',{cancelable:true})))).toBe(false);
  await expect(page).toHaveURL(/#projects$/);
  await expect(page.locator('.project-tile').filter({hasText:'Back navigation draft'})).toBeVisible();
  expect(await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-back',{cancelable:true})))).toBe(false);
  await expect(page).toHaveURL(/#home$/);
  expect(await page.evaluate(()=>window.dispatchEvent(new CustomEvent('aiadcast-native-back',{cancelable:true})))).toBe(true);
 });
});

