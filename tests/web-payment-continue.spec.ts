import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {newProject} from '../src/model';
const bytes=await sharp({create:{width:200,height:300,channels:4,background:'#abc'}}).png().toBuffer();
const photo={name:'saved.png',data:'data:image/png;base64,'+bytes.toString('base64'),width:200,height:300,sha256:createHash('sha256').update(bytes).digest('hex')};
const userId='payment-web-user',orderId='payment-web-order';
const order={id:orderId,pack:'trial',credits:180,amount:9900,currency:'KRW',state:'paid',created:Date.now(),test:true,receipt:{verified:true,grantedCredits:180,balance:540}};
async function setup(page:Page,role:'admin'|'member'|null,saved=false){
 const calls:string[]=[];
 await page.addInitScript(({role,userId,orderId})=>{
  if(role)sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:userId,label:'Fixture',role}}));
  sessionStorage.setItem('aiadcast.browser-checkout',JSON.stringify({orderId,ticket:'mock-browser-ticket'}));
  if(role)localStorage.setItem('aiadcast.checkout-continuation',JSON.stringify({orderId,userId,origin:location.origin,route:'create',created:Date.now()}));
 },{role,userId,orderId});
 await page.route('**/api/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname;calls.push(req.method()+' '+path);
  if(path==='/api/checkout/receipt'||path==='/api/checkout/orders/'+orderId)return route.fulfill({json:order});
  if(req.method()!=='GET')return route.fulfill({status:500,json:{error:{code:'UNEXPECTED_WRITE'}}});
  return route.fulfill({json:{email:{enabled:false},password:{enabled:true,test:true,adminReady:true},checkout:{enabled:true,test:true,currency:'KRW'},generation:{enabled:false},wallet:{available:540,reserved:0}}});
 });
 await page.goto('/#home');await expect(page.locator('.app-header')).toBeVisible();
 let draft:any;
 if(saved){const p=newProject();p.presentation='campaign';p.product=photo;p.productName='보존한 광고';p.productProfile.material='구매 전 저장한 설명';p.dimensions.width='34';p.dimensions.depth='25';p.dimensions.height='21';
 draft={editor:p,wizard:{project:p,step:0},returnPage:'create'};
 await page.evaluate(async({draft,userId})=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onsuccess=()=>{const tx=r.result.transaction('drafts','readwrite');tx.objectStore('drafts').put(draft,userId);tx.oncomplete=()=>{r.result.close();resolve();};tx.onerror=()=>reject(tx.error);};}),{draft,userId});}
 await page.goto('/?checkout=return&orderId='+orderId);
 await expect(page.getByRole('heading',{name:'결제 완료',exact:true})).toBeVisible();
 await expect(page).toHaveURL(/\/#payment-return$/);
 return {calls,draft};
}
for(const role of ['admin','member'] as const)for(const saved of [false,true])test(`${role} web checkout continues to ${saved?'saved':'new'} creator`,async({page})=>{
 const {calls,draft}=await setup(page,role,saved);
 await page.getByRole('link',{name:'광고 만들기 계속',exact:true}).click();
 await expect(page).toHaveURL(/#create$/);await expect(page.locator('.consumer-create')).toBeVisible();
 await expect(page.getByRole('textbox',{name:'상품명',exact:true})).toHaveValue(saved?'보존한 광고':'');
 if(saved){await expect(page.locator('.reference-photos img')).toHaveCount(1);await expect(page.getByRole('textbox',{name:'상세설명',exact:true})).toHaveValue(draft.editor.productProfile.material);
 const stored=await page.evaluate(async userId=>new Promise<any>(resolve=>{const r=indexedDB.open('aiadcast-workspace-drafts',1);r.onsuccess=()=>{const q=r.result.transaction('drafts').objectStore('drafts').get(userId);q.onsuccess=()=>{r.result.close();resolve(q.result);};};}),userId);expect(stored.editor).toEqual(draft.editor);expect(stored.wizard.project.dimensions).toEqual(draft.wizard.project.dimensions);}
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!).user.role)).toBe(role);
 expect(calls).toContain('GET /api/checkout/orders/'+orderId);expect(calls.filter(c=>c.startsWith('POST'))).toEqual(['POST /api/checkout/receipt']);expect(calls.some(c=>c.includes('/api/generations'))).toBe(false);
});
test('external native checkout retains app return without copying session or drafts',async({page})=>{
 const {calls}=await setup(page,null);await expect(page.getByRole('link',{name:'광고 만들기 계속',exact:true})).toHaveAttribute('href','aiadcast-demo://checkout/return');expect(calls).not.toContain('GET /api/checkout/orders/'+orderId);expect(await page.evaluate(()=>sessionStorage.getItem('aiadcast.beta-session'))).toBeNull();
});
for(const changed of ['signed-out','other-account'])test(`web return with ${changed} requires the purchasing account`,async({page})=>{
 const {calls}=await setup(page,'member',true);
 await page.evaluate(changed=>{if(changed==='signed-out')sessionStorage.removeItem('aiadcast.beta-session');else{const s=JSON.parse(sessionStorage.getItem('aiadcast.beta-session')!);s.user.id='different-user';sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s));}},changed);
 await page.getByRole('link',{name:'광고 만들기 계속',exact:true}).click();await expect(page).toHaveURL(/#checkout-return$/);await expect(page.getByText('결제를 시작한 계정으로 로그인해주세요.',{exact:false})).toBeVisible();expect(calls).not.toContain('GET /api/checkout/orders/'+orderId);
});
