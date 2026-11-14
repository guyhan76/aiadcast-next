import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';

test('search and select an industry, browse product and service groups, and choose each image count',async({page})=>{
  await protectedScreen(page,mockSession('preview-release'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  await page.goto('/#create');
  const form=page.locator('.consumer-create');
  const search=form.getByRole('searchbox',{name:'업종 검색'});
  await search.fill('신발');
  const results=form.getByRole('list',{name:'검색 결과'});
  await results.getByRole('button',{name:/신발/}).first().click();
  await expect(search).toHaveValue('');
  await expect(form.getByText(/선택한 업종.*신발/)).toBeVisible();
  await form.getByText('업종 분류 전체 보기',{exact:true}).click();
  const browse=form.locator('.industry-search details');
  await browse.getByRole('button',{name:'서비스',exact:true}).click();
  await expect(browse.getByRole('button',{name:'신발',exact:true})).toHaveCount(0);
  await browse.getByRole('button',{name:'물류·배송',exact:true}).click();
  await expect(form.getByText(/선택한 업종.*물류/)).toBeVisible();
  const section=form.locator('[data-order="9"]');
  await expect(section.getByRole('heading',{name:/생성 장수/})).toBeVisible();
  for(const n of [1,2,4,6,8,10]){
    const option=section.getByRole('button',{name:String(n),exact:true});
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed','true');
    await expect(section.getByRole('button',{pressed:true})).toHaveCount(1);
  }
});
