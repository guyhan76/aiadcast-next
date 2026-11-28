import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){
 await page.route('**/api/**',r=>r.fulfill({json:{generation:{enabled:false},wallet:{available:0,reserved:0},budget:{limitMicros:0},email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}}}));
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:{id:'sync-user-123',label:'A'}}}));
 await page.goto('/#account-recovery');await expect(page.locator('.account-page,.app-header').first()).toBeVisible();
 await page.evaluate(async()=>{const m=await import('/src/model.ts');(window as any).syncFixture={...m.newProject(),name:'Isolated email draft'};});
}
test('sign-in handoff stops before guest migration after account switch or guest logout',async({page})=>{
 await setup(page);
 const result=await page.evaluate(async()=>{
  const auth=await import('/src/beta-session.ts'),boundary=await import('/src/sign-in-boundary.ts'),drafts=await import('/src/workspace-draft.ts');
  auth.setBetaSession(null);const guard=boundary.signInBoundary();await drafts.saveWorkspace({editor:(window as any).syncFixture,returnPage:'studio'},'guest');
  auth.setBetaSession({token:'b'.repeat(43),expires:Date.now()+86400000,user:{id:'different-user-456',label:'B'}});
  let switched='';try{await drafts.carryGuestWorkspace('pending-email-user',guard);}catch(e){switched=(e as Error).message;}
  auth.setBetaSession(null);let guest='';try{guard();}catch(e){guest=(e as Error).message;}
  return {switched,guest,migrated:!!await drafts.loadWorkspace('pending-email-user')};
 });expect(result).toEqual({switched:'SESSION_CHANGED',guest:'SESSION_CHANGED',migrated:false});
});
test('verified email exchange cache cannot restore an old login after logout or mix poll tokens',async({page})=>{
 await setup(page);let calls=0;
 await page.route('**/api/auth/email/exchange',r=>{calls++;return calls===1?r.fulfill({json:{state:'verified',session:{token:'c'.repeat(43),expires:Date.now()+86400000,user:{id:'email-user-123',label:'Email'}}}}):r.fulfill({status:401,json:{error:{code:'EMAIL_REQUEST_INVALID'}}});});
 const result=await page.evaluate(async()=>{
  const auth=await import('/src/beta-session.ts'),client=await import('/src/account-client.ts');auth.setBetaSession(null);
  const request={requestId:'mock-request',pollToken:'p'.repeat(43),expires:Date.now()+600000};const first=await client.exchangeEmail(request),again=await client.exchangeEmail(request);
  let mixed='';try{await client.exchangeEmail({...request,pollToken:'q'.repeat(43)});}catch(e){mixed=(e as Error).message;}
  auth.setBetaSession(first.session!);auth.setBetaSession(null);let replay='';try{await client.exchangeEmail(request);}catch(e){replay=(e as Error).message;}
  return {same:first===again,mixed,replay,session:auth.betaSession()};
 });expect(result).toEqual({same:true,mixed:'EMAIL_REQUEST_INVALID',replay:'EMAIL_REQUEST_INVALID',session:null});expect(calls).toBe(3);
});

const user='sync-user-123';
async function authenticatedSetup(page:Page){
 await page.addInitScript(()=>sessionStorage.setItem('aiadcast.beta-session',JSON.stringify({token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'sync-user-123',label:'A'}})));
 await setup(page);
}
test('session timer invalidates an idle authenticated view without deleting account draft',async({page})=>{
 await authenticatedSetup(page);await page.clock.install();
 await page.evaluate(async()=>{const m=await import('/src/beta-session.ts'),d=await import('/src/workspace-draft.ts'),p=(window as any).syncFixture;await d.saveWorkspace({editor:p,returnPage:'studio'});m.setBetaSession({...m.betaSession()!,expires:Date.now()+1000});});
 await page.clock.fastForward(1001);await expect(page).toHaveURL(/#login$/);await expect(page.locator('.account-bar')).toHaveCount(0);
 expect(await page.evaluate(async user=>{const m=await import('/src/workspace-draft.ts');return (await m.loadWorkspace(user))?.editor.name;},user)).toBe('Isolated email draft');
 expect(await page.evaluate(async()=>{const m=await import('/src/workspace-draft.ts');return (await m.loadWorkspace('guest'))?.editor.name;})).not.toBe('Isolated email draft');
});
test('server revoked session is cleared, but delayed 401 never clears replacement account',async({page})=>{
 await authenticatedSetup(page);await page.route('**/api/revoked',r=>r.fulfill({status:401,json:{error:{code:'AUTH_REQUIRED'}}}));
 expect(await page.evaluate(async()=>{const m=await import('/src/generation-client.ts');try{await m.apiRequest('/api/revoked');}catch(e){return (e as Error).message;}})).toBe('AUTH_REQUIRED');await expect(page).toHaveURL(/#login$/);
 await page.evaluate(async()=>{const m=await import('/src/beta-session.ts');m.setBetaSession({token:'a'.repeat(43),expires:Date.now()+86400000,user:{id:'sync-user-123',label:'A'}});});
 let release=()=>{},started=false;await page.route('**/api/delayed-revoked',async r=>{started=true;await new Promise<void>(resolve=>release=resolve);await r.fulfill({status:401,json:{error:{code:'AUTH_REQUIRED'}}});});
 const result=page.evaluate(async()=>{const m=await import('/src/generation-client.ts');try{await m.apiRequest('/api/delayed-revoked');}catch(e){return (e as Error).message;}});await expect.poll(()=>started).toBe(true);
 await page.evaluate(async()=>{const m=await import('/src/beta-session.ts');m.setBetaSession({token:'b'.repeat(43),expires:Date.now()+86400000,user:{id:'different-user-456',label:'B'}});});release();expect(await result).toBe('SESSION_CHANGED');expect(await page.evaluate(async()=>{const m=await import('/src/beta-session.ts');return m.betaSession()?.user.id;})).toBe('different-user-456');
});

