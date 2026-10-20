import {test,expect} from '@playwright/test';

test('approved packs keep currency independent of guide and ad languages, without checkout',async({page})=>{
 await page.goto('/#studio');await page.locator('.editor-details > summary').click();
 await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});
 for(const price of ['₩9,900','₩29,800','₩48,900'])await expect(dialog.getByText(price,{exact:true})).toBeVisible();
 await expect(dialog.getByText('생성·재생성 1회 = 10크레딧',{exact:true})).toBeVisible();
 await expect(dialog.getByText(/고급 제작|3크레딧|100개/)).toHaveCount(0);
 await dialog.getByRole('button',{name:'English',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Pricing',exact:true});
 await expect(dialog).toHaveAttribute('lang','en');
 for(const price of ['₩9,900','₩29,800','₩48,900'])await expect(dialog.getByText(price,{exact:true})).toBeVisible();
 await expect(dialog.getByText('KRW prices include Korean VAT.',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'USD · $',exact:true}).click();
 await expect(dialog.locator('.pack-price')).toHaveText(['$7.90','$21.99','$35.99']);
 await expect(dialog.getByText('USD prices exclude applicable local sales tax.',{exact:true})).toBeVisible();
 await expect(dialog.getByText('Demo · No real charge',{exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:/buy|purchase|pay/i})).toHaveCount(0);
 await expect(dialog.getByText(/Reels exports are still images/)).toBeVisible();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await dialog.getByRole('button',{name:'Close pricing'}).click();
 await page.getByRole('button',{name:/문구·언어/}).click();
 await expect(page.getByRole('button',{name:'한국어',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Pricing',exact:true});
 await expect(dialog.locator('.pack-price').first()).toHaveText(/\$7\.90/);
 await dialog.getByRole('button',{name:'한국어',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});
 await expect(dialog.locator('.pack-price').first()).toHaveText(/\$7\.90/);
 await expect(dialog.getByText('달러 가격은 해당 지역 판매세 별도 기준입니다.',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'요금 안내 닫기'}).click();
 await page.evaluate(()=>location.hash='home');await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});
 await expect(dialog.locator('.pack-price').first()).toHaveText(/\$7\.90/);
 await dialog.getByRole('button',{name:'KRW · 원',exact:true}).click();
 await expect(dialog.getByText('₩9,900',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'요금 안내 닫기'}).click();
 await page.evaluate(()=>location.hash='studio');await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'이용 요금',exact:true}).getByText('₩9,900',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'요금 안내 닫기'}).click();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
});

test('USD display packs disclose unchanged KRW settlement and never submit a USD checkout',async({page})=>{
 let posts=0;await page.route('**/api/**',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({json:{email:{enabled:false},checkout:{enabled:true,test:true,currency:'KRW'},generation:{enabled:false},wallet:{available:0},budget:{}}});});
 await page.goto('/#checkout');await page.getByRole('combobox',{name:'표시 통화',exact:true}).selectOption('USD');
 for(const price of ['US$7.90','US$21.99','US$35.99'])await expect(page.getByText(price,{exact:true}).first()).toBeVisible();
 for(const [credits,krw] of [[30,'₩9,900'],[100,'₩29,800'],[180,'₩48,900']] as const){await page.locator(`input[value="credits-v2-${credits}"]`).check();await expect(page.getByRole('region',{name:'결제 확인'})).toContainText(krw);await expect(page.getByRole('region',{name:'결제 확인'})).toContainText('USD 결제는 지원하지 않습니다.');await expect(page.getByRole('button',{name:'이메일로 로그인하고 계속'})).toBeDisabled();}
 expect(posts).toBe(0);await page.getByRole('combobox',{name:'표시 통화',exact:true}).selectOption('KRW');await expect(page.getByRole('region',{name:'결제 확인'})).toContainText('₩48,900');
});

test('signed-in header credits label follows UI language without changing its destination',async({page})=>{
 let posts=0;
 await page.addInitScript(()=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'header-test-user',label:'test@example.com'}})));
 await page.route('**/api/**',r=>{if(r.request().method()!=='GET')posts++;return r.fulfill({json:{jobs:[],email:{enabled:false},generation:{enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0}}});});
 await page.goto('/#home');const header=page.locator('.app-header');
 await expect(header.getByRole('link',{name:'내 이용권',exact:true})).toHaveAttribute('href','#credits');
 await header.getByRole('combobox',{name:'앱 언어',exact:true}).selectOption('en');
 await expect(header.getByRole('link',{name:'My Credits',exact:true})).toHaveAttribute('href','#credits');await expect(header.getByText('내 이용권',{exact:true})).toHaveCount(0);
 await header.getByRole('combobox',{name:'App language',exact:true}).selectOption('ko');await expect(header.getByRole('link',{name:'내 이용권',exact:true})).toHaveAttribute('href','#credits');expect(posts).toBe(0);
});
