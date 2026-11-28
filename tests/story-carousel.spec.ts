import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';

test('customer edits one card before authorizing a single four-image batch',async({page})=>{
  await protectedScreen(page,mockSession('carousel-owner'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  const cards=['마지막 한 조각','이번엔 네 차례','바질 향 가득','한 판 더 주세요'].map((caption,i)=>({caption,scene:'피자 매장 장면 '+(i+1)}));
  let submitted=0;
  await page.route('**/api/status',r=>r.fulfill({json:{generation:{enabled:true,batchVersion:1},wallet:{available:0,reserved:0,credits:{available:100,reserved:0}},budget:{limitMicros:1000000},assistant:{available:true}}}));
  await page.route('**/api/assistant',r=>r.fulfill({json:{requestId:r.request().postDataJSON().requestId,plan:{continuity:'같은 매장의 흰 접시 한 개',cards}}}));
  await page.route('**/api/generations',r=>{
    if(r.request().method()!=='POST')return r.fulfill({json:{jobs:[]}});
    submitted++;
    return r.fulfill({json:{id:r.request().postDataJSON().batch.id}});
  });
  await page.goto('/#create');
  const form=page.locator('.consumer-create');
  await form.getByRole('button',{name:'스토리형 캐러셀',exact:true}).click();
  await form.getByRole('button',{name:'서비스',exact:true}).click();
  await form.getByLabel('분야',{exact:true}).selectOption('dining');
  await form.getByLabel('세부 업종',{exact:true}).selectOption('restaurant');
  await form.getByLabel('원하는 광고 한 줄',{exact:true}).fill('친구 둘이 마지막 피자 한 조각을 두고 한 판 더 주문해요.');
  await form.getByRole('button',{name:'캐러셀 구성 만들기'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('이미지에 넣을 문구')).toHaveCount(4);
  const confirm=dialog.getByRole('button',{name:'캐러셀 4장 생성'});
  const last=dialog.getByLabel('이미지에 넣을 문구').nth(3);
  await last.fill('');
  await expect(confirm).toBeDisabled();
  await last.fill('같은 피자로 한 판 더!');
  expect(submitted).toBe(0);
  const pending=page.waitForRequest(r=>r.url().endsWith('/api/generations')&&r.method()==='POST');
  await confirm.click();
  const body=(await pending).postDataJSON();
  expect(body.request.output.format).toBe('4:5');
  expect(body.batch.count).toBe(4);
  expect(body.batch.storyPlan.cards.map((card:{caption:string})=>card.caption)).toEqual([...cards.slice(0,3).map(c=>c.caption),'같은 피자로 한 판 더!']);
});
