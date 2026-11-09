import {selectConsumerIndustry} from './helpers/industry';
import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
// This spec exercises protected screens; guest/login contracts stay in their dedicated specs.
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));await protectedScreen(page,mockSession('protected-input-example-guides'));});
import {reloadDraft} from './helpers/workspace';

for(const service of [false,true])test(`example guides preserve ${service?'service':'product'} inputs through keyboard toggles, mode changes and reload`,async({page},info)=>{
 let generationPosts=0;await page.route('**/api/**',r=>{if(new URL(r.request().url()).pathname==='/api/auth/session')return r.fallback();if(r.request().method()==='POST'&&r.request().url().includes('/generations'))generationPosts++;return r.fallback();});
 await page.goto('/#create');const form=page.locator('.consumer-create');await selectConsumerIndustry(form,service?'lodging':'other');
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
 const guide=form.locator('[data-guide="facts"]');await guide.locator('summary').click();await expect(guide).toContainText('가상 상품');await expect(guide).toContainText('상품 정보는 정확하게, 원하는 연출은 구체적으로.');await expect(guide.locator('blockquote').first()).toHaveText(service?'바쁜 직장인 커플을 위한 제주 2박 3일 휴식 여행이에요. 호텔 2박과 조식이 포함되며 항공권은 별도예요. 가격은 1인 39만원부터이고 출발일에 따라 달라져요.':'건조한 피부를 위한 보습 크림 50ml로, 가볍게 발리고 끈적임이 적어요. 바쁜 20~30대가 매일 쓰기 좋은 제품이에요. 가격은 29,000원이에요.당일로켓배송');await expect(guide.locator('blockquote').nth(1)).toHaveText(service?'푸른 바다와 맑은 햇살로 여유로운 분위기를 표현해주세요. 여행사명과 일정·시작 가격을 강조하고, ‘지금 예약하세요’ 같은 예약 유도 문구를 넣어주세요. 호텔·조식 포함, 항공권 별도, 출발일별 가격 변동 조건도 분명히 표시해주세요.':'밝은 베이지 배경과 부드러운 자연광으로 제품을 중앙에 크게 배치해주세요. 브랜드명과 가격을 눈에 띄게 강조하고, ‘지금 만나보세요’ 같은 구매 유도 문구를 넣어주세요.');await expect(guide.locator('[data-example-delivery]')).toHaveCount(service?0:1);if(!service){await expect(guide.locator('blockquote').first().locator('p')).toHaveCount(4);await expect(guide.locator('[data-example-delivery]')).toHaveText('당일로켓배송');}
 await expect(directions).toHaveValue('내 연출 요청');await expect(guide).toContainText('정보·가격·포함 사항은 실제 상품에 맞게 바꿔주세요.');
 await facts.fill('입력 도중 다시 수정한 내용');await form.getByRole('button',{name:'AI가 만들기',exact:true}).click();await form.getByRole('button',{name:'직접 입력',exact:true}).click();await expect(headline).toHaveValue('내가 정한 제목');await expect(copy).toHaveValue('내가 확인한 구성과 조건');
 await reloadDraft(page);await expect(directions).toHaveValue('내 연출 요청');await expect(facts).toHaveValue('입력 도중 다시 수정한 내용');await expect(headline).toHaveValue('내가 정한 제목');await expect(copy).toHaveValue('내가 확인한 구성과 조건');await expect(guide).not.toHaveAttribute('open','');
 for(const g of await form.locator('.input-example-guide').all())await g.locator('summary').click();
 if(!service){const delivery=guide.locator('[data-example-delivery]');await expect(delivery).toBeVisible();expect(await delivery.evaluate(el=>{const previous=el.previousElementSibling;return !!previous&&el.getBoundingClientRect().top>=previous.getBoundingClientRect().bottom;})).toBe(true);}
 if(info.project.name==='mobile')await page.setViewportSize({width:320,height:844});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(guide.locator('.input-example-price')).toHaveCount(1);
  expect(await guide.locator('.input-example-price').evaluate(el=>el.getClientRects().length)).toBe(1);
  expect(await guide.locator('.input-example-content').evaluate(el=>getComputedStyle(el).wordBreak)).toBe('keep-all');
  await guide.screenshot({path:info.outputPath(`spacing-${service?'travel':'cosmetics'}-${width}.png`)});
 }
 await expect(form.locator('[role="alert"]')).toHaveCount(0);expect(generationPosts).toBe(0);
 await form.locator('[data-order="5"]').screenshot({path:info.outputPath(`example-${service?'service':'product'}.png`)});
});

for(const service of [false,true])test(`example guides follow interface language without changing ${service?'service':'product'} copy`,async({page},info)=>{
 await page.goto('/#create');await page.getByRole('combobox',{name:'앱 언어',exact:true}).selectOption('en');const form=page.locator('.consumer-create');await selectConsumerIndustry(form,service?'lodging':'other');await form.getByRole('textbox',{name:'Additional requests',exact:true}).fill('My creative direction');await form.getByRole('textbox',{name:'Description',exact:true}).fill('My original description');
 const guide=form.locator('[data-guide="facts"]');await guide.locator('summary').click();await expect(guide.locator('summary')).toHaveText('Example guide for better results');await expect(guide).toContainText('Replace the facts, prices and inclusions with your actual offer.');
 await expect(guide).toContainText('Fictional offer');await expect(guide).toContainText('Keep product facts accurate and creative directions specific.');await expect(guide.locator('blockquote').first()).toHaveText(service?'A relaxing 3-day, 2-night Jeju trip for busy working couples. Includes two hotel nights and breakfast; flights are extra. From KRW 390,000 per person, depending on departure date.':'A 50 ml moisturizer for dry skin with a lightweight, non-sticky feel. For busy people in their 20s and 30s looking for daily hydration. Price: KRW 29,000.Same-day Rocket delivery');await expect(guide.locator('blockquote').nth(1)).toHaveText(service?'Create a relaxed mood with blue ocean scenery and clear sunlight. Highlight the travel company name, trip duration and starting price, and include a call to action such as “Book now”. Clearly state that hotel and breakfast are included, flights are extra, and prices vary by departure date.':'Use a light beige background and soft natural light, with the product large and centered. Make the brand name and price stand out, and include a shopping call to action such as “Shop now”.');
 if(!service){const delivery=guide.locator('[data-example-delivery]');await expect(delivery).toBeVisible();expect(await delivery.evaluate(el=>{const previous=el.previousElementSibling;return !!previous&&el.getBoundingClientRect().top>=previous.getBoundingClientRect().bottom;})).toBe(true);}
 if(info.project.name==='mobile')await page.setViewportSize({width:320,height:844});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(guide.locator('.input-example-price')).toHaveCount(1);
  expect(await guide.locator('.input-example-price').evaluate(el=>el.getClientRects().length)).toBe(1);
  expect(await guide.locator('.input-example-content').evaluate(el=>getComputedStyle(el).wordBreak)).toBe('keep-all');
  await guide.screenshot({path:info.outputPath(`spacing-${service?'travel':'cosmetics'}-${width}.png`)});
 }
 await guide.screenshot({path:info.outputPath('guide-en.png')});
 await page.getByRole('combobox',{name:'App language',exact:true}).selectOption('ko');await expect(guide.locator('summary')).toHaveText('더 좋은 결과를 위한 예시 가이드');await expect(form.getByRole('textbox',{name:'상세설명',exact:true})).toHaveValue('My original description');await expect(form.getByRole('textbox',{name:'추가 요청',exact:true})).toHaveValue('My creative direction');
});
