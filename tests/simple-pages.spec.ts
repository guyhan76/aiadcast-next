import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
const photo=await sharp({create:{width:400,height:300,channels:4,background:'#dddddd'}}).png().toBuffer();
test('unit conversion preserves canonical size, selected unit and display option through a saved project',async({page})=>{
 await protectedScreen(page,mockSession('simple-units-user'));
 await page.goto('/#create');const wizard=page.locator('.create-page');await wizard.getByLabel('산업 선택').selectOption('boxes');await wizard.getByRole('textbox',{name:'상세설명',exact:true}).fill('원본 사진과 입력 규격을 유지하는 시험 상품');
 await wizard.getByLabel('상품명',{exact:true}).fill('단위 검증 상품');
 await wizard.getByLabel('참조사진 추가').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:photo});
 await wizard.getByRole('button',{name:'규격 넣기',exact:true}).click();await wizard.getByLabel('규격 형식').selectOption('rectangular');
 await expect(wizard.getByLabel('규격 단위')).toHaveValue('cm');await expect(wizard.getByLabel('광고에 규격 표시')).toBeChecked();await wizard.getByLabel('광고에 규격 표시').uncheck();
 for(const [label,value] of [['가로 cm','25.4'],['세로 cm','12.7'],['높이 cm','2.54']])await wizard.getByLabel(label,{exact:true}).fill(value);
 for(let i=0;i<3;i++){
  await wizard.getByLabel('규격 단위').selectOption('inch');await expect(wizard.getByLabel('가로 inch')).toHaveValue('10');await expect(wizard.getByLabel('높이 inch')).toHaveValue('1');
  await wizard.getByLabel('규격 단위').selectOption('mm');await expect(wizard.getByLabel('가로 mm')).toHaveValue('254');
  await wizard.getByLabel('규격 단위').selectOption('cm');await expect(wizard.getByLabel('가로 cm')).toHaveValue('25.4');
 }
 await wizard.getByLabel('가로 cm').fill('30');await wizard.getByLabel('규격 단위').selectOption('inch');await expect(wizard.getByLabel('가로 inch')).toHaveValue('11.811023622');await wizard.getByLabel('가로 inch').fill('12.811023622');await wizard.getByLabel('규격 단위').selectOption('mm');await expect(wizard.getByLabel('가로 mm')).toHaveValue('325.4');await wizard.getByLabel('가로 mm').fill('254');
 await wizard.getByLabel('규격 단위').selectOption('inch');await wizard.getByLabel('높이 inch').fill('-1');await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(wizard.getByRole('alert')).toContainText('규격');
 await wizard.getByLabel('높이 inch').fill('0.125');await wizard.getByLabel('광고에 규격 표시').check();
 await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page).toHaveURL(/#studio$/);await page.goto('/#editor');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();
 const saved=JSON.parse(await readFile((await(await download).path())!,'utf8'));expect(saved.dimensions).toMatchObject({width:'254',depth:'127',height:'3.175',displayUnit:'inch',visible:true});
 await page.goto('/#editor');await page.locator('.editor-details>summary').click();await page.getByRole('button',{name:'저장한 작업',exact:true}).click();await page.getByRole('button',{name:/단위 검증 상품/}).click();await page.locator('.editor-tabs').getByRole('button',{name:/규격/}).click();
 await expect(page.locator('.editor-container').getByLabel('규격 단위')).toHaveValue('inch');await expect(page.locator('.editor-container').getByLabel('높이 inch')).toHaveValue('0.125');
 await page.locator('.editor-container').getByLabel('규격 단위').selectOption('cm');await expect(page.locator('.editor-container').getByLabel('높이 cm')).toHaveValue('0.3175');
 await page.getByRole('button',{name:'되돌리기',exact:true}).click();await expect(page.locator('.editor-container').getByLabel('규격 단위')).toHaveValue('inch');
});
test('library and guide show brief essentials while backup and details stay available',async({page})=>{
 await protectedScreen(page,mockSession('simple-library-user'));
 await page.goto('/#projects');const library=page.locator('.projects-page');
 await expect(library.getByRole('heading',{name:'내 프로젝트',exact:true})).toBeVisible();await expect(library.locator('.project-reuse-note,.section-label,.home-scope')).toHaveCount(0);
 await expect(library.locator('.library-backup')).not.toHaveAttribute('open');await library.locator('.library-backup>summary').click();await expect(library.getByRole('link',{name:'파일 불러오러 가기'})).toBeVisible();
 await page.goto('/#guide');const guide=page.locator('.guide-page');await expect(guide.locator('.simple-guide-steps li')).toHaveCount(3);await expect(guide.getByRole('button',{name:'광고 만들기',exact:true})).toHaveCount(1);
 await expect(guide.locator('details[open]')).toHaveCount(0);await guide.getByText('만든 광고를 다시 수정할 수 있나요?',{exact:true}).click();await expect(guide.getByText(/PNG·JPG만으로는/)).toBeVisible();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});
test('Google gate, existing-account recovery and order review never pretend to authenticate or charge',async({page})=>{
 let ready=false;await page.route('**/api/account/capabilities',route=>route.fulfill(ready?{json:{google:{enabled:false},email:{enabled:true},checkout:{enabled:false,test:true,currency:'KRW'}}}:{status:503,json:{error:{code:'UNAVAILABLE'}}}));
 const writes:string[]=[];page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
 await page.goto('/#account-recovery');await expect(page.getByRole('alert')).toContainText('로그인 방식을 확인하지 못했습니다');await expect(page.getByRole('textbox')).toHaveCount(0);ready=true;await page.getByRole('button',{name:'로그인 방식 다시 확인',exact:true}).click();await page.getByLabel('이메일',{exact:true}).fill('invalid');await page.getByRole('heading',{name:'로그인',exact:true}).click();expect(await page.getByLabel('이메일',{exact:true}).evaluate((e:HTMLInputElement)=>e.validity.typeMismatch)).toBe(true);
 await page.getByLabel('이메일',{exact:true}).fill('test@example.com');await expect(page.locator('.account-page').getByRole('alert')).toHaveCount(0);await expect(page.getByRole('button',{name:'인증메일 받기'})).toBeEnabled();expect(writes).toEqual([]);
 await page.goto('/#login');await expect(page.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeDisabled();await expect(page.getByRole('textbox')).toHaveCount(0);
 await protectedScreen(page,mockSession('simple-checkout-user'));await page.route('**/api/account/capabilities',r=>r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}));await page.goto('/?fixture=authenticated#checkout');
 const checkout=page.locator('.checkout-page');await checkout.getByRole('radio',{name:/묶음형/}).check();await expect(checkout.getByRole('region',{name:'결제 확인'})).toContainText('48,900');
 await checkout.getByLabel('표시 통화').selectOption('USD');await expect(checkout.getByRole('region',{name:'결제 확인'})).toContainText('$35.99');await expect(checkout.getByRole('region',{name:'결제 확인'})).toContainText('현지 세금 별도');
 await expect(checkout.getByRole('button',{name:'결제 상태 확인 실패',exact:true})).toBeDisabled();await expect(checkout.getByRole('button',{name:'결제 연결 다시 확인',exact:true})).toBeVisible();expect(writes).toEqual([]);
 for(const route of ['checkout']){await page.goto('/#'+route);for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}}
});
