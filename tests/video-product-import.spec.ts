import {test,expect} from '@playwright/test';
import {mockSession,protectedScreen} from './helpers/authenticated-session';
import sharp from 'sharp';

test('an unreadable link can use a screenshot and editable facts before a prompt is made',async({page})=>{
  await protectedScreen(page,mockSession('product-import','admin'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  const png=await sharp({create:{width:64,height:64,channels:3,background:'#777'}}).png().toBuffer();
  const imported={title:'겨울 코트',price:'285,000원',option:'블랙',shipping:'무료배송',description:'',image:'data:image/png;base64,'+png.toString('base64')};
  let reads=0,submissions=0;
  await page.route('**/api/product-import',r=>{
    reads++;
    if(r.request().postDataJSON().url)return r.fulfill({status:422,json:{error:{code:'PRODUCT_PAGE_UNAVAILABLE'}}});
    expect(r.request().postDataJSON().capture).toMatch(/^data:image\/png/);
    return r.fulfill({json:imported});
  });
  await page.route('**/api/videos',r=>{submissions++;return r.abort();});
  await page.goto('/#video');
  const editor=page.getByRole('region',{name:'광고 영상 편집'});
  await editor.getByLabel('상품명',{exact:true}).fill('기존 상품');
  await editor.getByRole('button',{name:'상품 링크에서 불러오기'}).click();
  await editor.getByLabel('상품 링크',{exact:true}).fill('https://shop.example/item?itemId=1');
  await editor.getByRole('button',{name:'링크 읽기'}).click();
  await expect(editor.getByRole('alert')).toContainText('상품 화면 캡처');
  await editor.getByLabel('상품 화면 캡처 파일').setInputFiles({name:'capture.png',mimeType:'image/png',buffer:png});
  await expect(editor.getByLabel('판매가')).toHaveValue('285,000원');
  await editor.getByLabel('판매가').fill('259,000원');
  await expect(editor.getByLabel('상품명',{exact:true})).toHaveValue('기존 상품');
  await editor.getByRole('button',{name:'상품 정보 적용'}).click();
  await expect(editor.getByLabel('상품명',{exact:true})).toHaveValue('겨울 코트');
  await expect(editor.getByLabel('강조할 점 (선택)')).toHaveValue('259,000원 · 무료배송');
  await expect(editor.getByRole('button',{name:'프롬프트 만들기'})).toBeEnabled();
  expect(reads).toBe(2);expect(submissions).toBe(0);
  expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
