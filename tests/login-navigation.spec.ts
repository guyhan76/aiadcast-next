import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
const session={token:'n'.repeat(43),expires:Date.now()+86400000,user:{id:'navigation-member',label:'Navigation member'}};
const photo=await sharp({create:{width:40,height:60,channels:4,background:'#abcdef'}}).png().toBuffer();
async function setup(page:Page){
 const writes:string[]=[];
 await page.route('**/api/**',r=>{
  const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')writes.push(path);
  if(path==='/api/account/capabilities')return r.fulfill({json:{email:{enabled:false},password:{enabled:true,test:true,adminReady:true,adminEmail:'owner@example.com'},checkout:{enabled:true,test:true,currency:'KRW'}}});
  if(path==='/api/auth/test/login')return r.fulfill({json:session});
  if(path==='/api/auth/me')return r.fulfill({json:{user:session.user}});
  if(path==='/api/status')return r.fulfill({json:{generation:{enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0},assistant:{available:false}}});
  return r.fulfill({json:{projects:[],orders:[]}});
 });return writes;
}
for(const stale of [false,true])test(`${stale?'stale stored studio/projects destination':'ordinary login'} opens home without losing draft photos`,async({page})=>{
 const writes=await setup(page);await page.goto('/#create');await page.getByLabel('상품명',{exact:true}).fill('보존할 로그인 초안');
 await page.getByLabel('참조사진 추가').setInputFiles({name:'draft.png',mimeType:'image/png',buffer:photo});await expect(page.locator('.reference-photos img')).toHaveCount(1);
 await expect(page.getByText('입력 내용이 기기에 저장되었습니다.',{exact:true})).toBeVisible();
 await page.locator('.app-header').getByRole('link',{name:'로그인',exact:true}).click();
 if(stale){await page.evaluate(async()=>{
  sessionStorage.setItem('aiadcast.auth-return','projects');sessionStorage.setItem('aiadcast.checkout-login-return','1');sessionStorage.setItem('returnTo','projects');
  sessionStorage.setItem('aiadcast.login-destination',JSON.stringify({target:'checkout',origin:location.origin,created:Date.now()-16*60000}));
  await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),get=store.get('guest');get.onsuccess=()=>store.put({...get.result,returnPage:'studio'},'guest');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});
 });await page.reload();}
 await page.getByLabel('이메일',{exact:true}).fill('navigation@example.com');await page.getByLabel('비밀번호',{exact:true}).fill('Fixture-password!');
 await page.getByRole('button',{name:'로그인하고 계속',exact:true}).click();await expect(page).toHaveURL(/#home$/);
 await page.goto('/#create');await expect(page.getByLabel('상품명',{exact:true})).toHaveValue('보존할 로그인 초안');await expect(page.locator('.reference-photos img')).toHaveCount(1);
 expect(writes).toEqual(['/api/auth/test/login']);
});
test('abandoned explicit checkout login does not redirect a later ordinary login',async({page})=>{
 await setup(page);await page.goto('/#checkout');await page.getByRole('checkbox',{name:/이용권 수량/}).check();await page.getByRole('button',{name:'이메일로 로그인하고 계속'}).click();await expect(page).toHaveURL(/#login$/);
 await page.getByRole('link',{name:'홈',exact:true}).filter({visible:true}).click();await page.locator('.app-header').getByRole('link',{name:'로그인',exact:true}).click();
 await page.getByLabel('이메일',{exact:true}).fill('navigation@example.com');await page.getByLabel('비밀번호',{exact:true}).fill('Fixture-password!');await page.getByRole('button',{name:'로그인하고 계속',exact:true}).click();await expect(page).toHaveURL(/#home$/);
});
