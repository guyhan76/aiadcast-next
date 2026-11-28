import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {reloadDraft} from './helpers/workspace';
for(const language of ['ko','en'] as const)test(`decimal paste and precise field errors preserve inputs (${language})`,async({page})=>{
 await protectedScreen(page,mockSession('decimal-input-owner'));await page.addInitScript(l=>localStorage.setItem('aiadcast.ui-language',l),language);
 let generationPosts=0;await page.route('**/api/**',route=>{const r=route.request(),p=new URL(r.url()).pathname;if(p==='/api/auth/session')return route.fallback();if(p==='/api/generations'&&r.method()==='POST')generationPosts++;return route.fulfill({json:{}});});
 await page.goto('/#create');const form=page.locator('.consumer-create'),ko=language==='ko';
 await form.getByLabel(ko?'산업 선택':'Industry').selectOption('boxes');
 await form.getByRole('button',{name:ko?'규격 넣기':'Add dimensions',exact:true}).click();
 const unit=form.getByLabel(ko?'규격 단위':'Dimension unit');await unit.selectOption('mm');
 const width=form.getByLabel(ko?'가로 mm':'Width mm',{exact:true}),depth=form.getByLabel(ko?'세로 mm':'Depth mm',{exact:true}),height=form.getByLabel(ko?'높이 mm':'Height mm',{exact:true});
 await width.fill('364');await depth.fill('266');await height.fill('30.\u00a023');await height.blur();await expect(height).toHaveValue('30.23');await expect(height).toHaveAttribute('aria-invalid','false');
 await unit.selectOption('cm');await expect(form.getByLabel(ko?'높이 cm':'Height cm',{exact:true})).toHaveValue('3.023');await unit.selectOption('inch');await unit.selectOption('mm');await expect(height).toHaveValue('30.23');
 for(const invalid of ['30 23','30,23','３０．２３','30mm','100001','0']){
  await height.fill(invalid);await expect(height).toHaveValue(invalid);await expect(height).toHaveAttribute('aria-invalid','true');await expect(unit).toBeDisabled();await expect(height.locator('..').getByRole('status')).toContainText(ko?'높이:':'Height:');await expect(width).toHaveValue('364');await expect(depth).toHaveValue('266');
 }
 await height.fill('30 23');await reloadDraft(page);await expect(height).toHaveValue('30 23');await expect(unit).toBeDisabled();
 await height.fill('30 . 23');await height.blur();await expect(height).toHaveValue('30.23');await expect(unit).toBeEnabled();await expect(height).toHaveAttribute('aria-invalid','false');
 expect(generationPosts).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual((await page.viewportSize())!.width);
});
