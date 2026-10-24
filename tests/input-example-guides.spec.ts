import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));await protectedScreen(page,mockSession('protected-input-example-guides'));});
import {reloadDraft} from './helpers/workspace';

for(const service of [false,true])test(`example guides preserve ${service?'service':'product'} inputs through keyboard toggles, mode changes and reload`,async({page},info)=>{
 let generationPosts=0;await page.route('**/api/**',r=>{if(new URL(r.request().url()).pathname==='/api/auth/session')return r.fallback();if(r.request().method()==='POST'&&r.request().url().includes('/generations'))generationPosts++;return r.fallback();});
 await page.goto('/#create');const form=page.locator('.consumer-create');await form.getByLabel('산업 선택').selectOption(service?'lodging':'other');
 const name=form.getByRole('textbox',{name:service?'서비스명':'상품명',exact:true}),facts=form.getByRole('textbox',{name:'상세설명',exact:true});
 const directions=form.getByRole('textbox',{name:'추가 요청',exact:true});await directions.fill('내 연출 요청');
 await name.fill(service?'내 숙소':'내 텀블러');await facts.fill('고객이 입력한 실제 특징과 조건');await form.getByRole('button',{name:'직접 입력',exact:true}).click();
 const headline=form.getByRole('textbox',{name:'광고 제목',exact:true}),copy=form.getByRole('textbox',{name:'광고 설명',exact:true});await headline.fill('내가 정한 제목');await copy.fill('내가 확인한 구성과 조건');
 for(const kind of ['facts','headline','copy']){
  const guide=form.locator(`[data-guide="${kind}"]`),summary=guide.locator('summary');await expect(guide).not.toHaveAttribute('open','');
  await expect(summary).toHaveAccessibleName(new RegExp('더 좋은 결과를 위한 예시 가이드'));
  for(let i=0;i<2;i++){await summary.focus();await page.keyboard.press('Enter');await expect(guide).toHaveAttribute('open','');await expect(guide.locator('blockquote').first()).toBeVisible();await expect(guide).toContainText(kind==='facts'?(service?'여행상품 예시':'화장품 예시'):(service?'숙소':'텀블러'));await page.keyboard.press('Space');await expect(guide).not.toHaveAttribute('open','');}
  await expect(page).toHaveURL(/#create$/);await expect(facts).toHaveValue('고객이 입력한 실제 특징과 조건');await expect(headline).toHaveValue('내가 정한 제목');await expect(copy).toHaveValue('내가 확인한 구성과 조건');
 }
 const guide=form.locator('[data-guide="facts"]');await guide.locator('summary').click();await expect(guide).toContainText('상품 정보는 정확하게, 원하는 연출은 구체적으로.');await expect(guide.locator('blockquote').first()).toHaveText(service?'제주 2박 3일, 호텔·조식 포함, 1인 39만원부터.':'보습 크림 50ml, 가벼운 사용감, 29,000원.');await expect(guide.locator('blockquote').nth(1)).toHaveText(service?'푸른 바다 배경, 여유로운 분위기, 일정·가격 강조.':'밝은 베이지 배경, 촉촉한 분위기, 제품을 크게.');await expect(directions).toHaveValue('내 연출 요청');await expect(guide).toContainText('정보·가격·포함 사항은 실제 상품에 맞게 바꿔주세요.');
 await facts.fill('입력 도중 다시 수정한 내용');await form.getByRole('button',{name:'AI가 만들기',exact:true}).click();await form.getByRole('button',{name:'직접 입력',exact:true}).click();await expect(headline).toHaveValue('내가 정한 제목');await expect(copy).toHaveValue('내가 확인한 구성과 조건');
 await reloadDraft(page);await expect(directions).toHaveValue('내 연출 요청');await expect(facts).toHaveValue('입력 도중 다시 수정한 내용');await expect(headline).toHaveValue('내가 정한 제목');await expect(copy).toHaveValue('내가 확인한 구성과 조건');await expect(guide).not.toHaveAttribute('open','');
 for(const g of await form.locator('.input-example-guide').all())await g.locator('summary').click();
 if(info.project.name==='mobile')await page.setViewportSize({width:320,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);await expect(form.locator('[role="alert"]')).toHaveCount(0);expect(generationPosts).toBe(0);
 await form.locator('[data-order="5"]').screenshot({path:info.outputPath(`example-${service?'service':'product'}.png`)});
});

for(const service of [false,true])test(`example guides follow interface language without changing ${service?'service':'product'} copy`,async({page},info)=>{
 await page.goto('/#create');await page.getByRole('combobox',{name:'앱 언어',exact:true}).selectOption('en');const form=page.locator('.consumer-create');await form.getByLabel('Choose an industry').selectOption(service?'lodging':'other');await form.getByRole('textbox',{name:'Additional requests',exact:true}).fill('My creative direction');await form.getByRole('textbox',{name:'Description',exact:true}).fill('My original description');
 const guide=form.locator('[data-guide="facts"]');await guide.locator('summary').click();await expect(guide.locator('summary')).toHaveText('Example guide for better results');await expect(guide).toContainText('Replace the facts, prices and inclusions with your actual offer.');
 await expect(guide).toContainText('Keep product facts accurate and creative directions specific.');await expect(guide.locator('blockquote').first()).toHaveText(service?'3 days, 2 nights in Jeju, hotel and breakfast included, from KRW 390,000 per person.':'50 ml moisturizing cream, lightweight feel, KRW 29,000.');await expect(guide.locator('blockquote').nth(1)).toHaveText(service?'Blue ocean background, relaxed mood, highlight the itinerary and price.':'Light beige background, fresh, dewy mood, make the product prominent.');
 if(info.project.name==='mobile')await page.setViewportSize({width:320,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);await guide.screenshot({path:info.outputPath('guide-en.png')});
 await page.getByRole('combobox',{name:'App language',exact:true}).selectOption('ko');await expect(guide.locator('summary')).toHaveText('더 좋은 결과를 위한 예시 가이드');await expect(form.getByRole('textbox',{name:'상세설명',exact:true})).toHaveValue('My original description');await expect(form.getByRole('textbox',{name:'추가 요청',exact:true})).toHaveValue('My creative direction');
});
