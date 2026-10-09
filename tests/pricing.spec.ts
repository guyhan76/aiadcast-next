import {test,expect} from '@playwright/test';
test('pricing changes language and display currency without changing ad language or charging',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});
 await expect(dialog.getByText('₩9,900',{exact:true})).toBeVisible();
 await expect(dialog.getByText('₩24,900',{exact:true})).toBeVisible();
 await expect(dialog.getByText('₩79,900',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'English',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Pricing',exact:true});
 await expect(dialog).toHaveAttribute('lang','en');
 for(const price of ['$7.99','$19.99','$59.99'])await expect(dialog.getByText(price,{exact:true})).toBeVisible();
 await expect(dialog.getByText(/Purchases and credit charges are not available/)).toBeVisible();
 await expect(dialog.getByRole('button',{name:/buy|purchase|pay/i})).toHaveCount(0);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await dialog.getByRole('button',{name:'Close pricing'}).click();
 await page.getByRole('button',{name:/문구·언어/}).click();
 await expect(page.getByRole('button',{name:'한국어',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();await page.getByRole('button',{name:'이용 요금',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Pricing',exact:true});
 await expect(dialog.getByText('$7.99',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'한국어',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'이용 요금',exact:true});
 await expect(dialog.getByText('₩9,900',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'요금 안내 닫기'}).click();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
});
