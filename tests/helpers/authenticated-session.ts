import type {Page} from '@playwright/test';
export type MockSession={token:string;expires:number;user:{id:string;label:string;role?:'admin'|'member'}};
export function mockSession(id:string,role:'admin'|'member'='member',letter='a'):MockSession{
 return {token:letter.repeat(43),expires:Date.now()+86400000,user:{id,label:id,role}};
}
// Explicit per-spec opt-in only. The mock server owns identity; client storage is not authority.
// Install AFTER a spec's broad API route so its fallback cannot swallow this endpoint.
export async function authenticatedSession(page:Page,session:MockSession,{seed=true}={}){
 await page.route('**/api/auth/session',r=>{
  if(r.request().method()!=='GET'||r.request().headers().authorization!=='Bearer '+session.token||session.expires<=Date.now())return r.fulfill({status:401,json:{error:{code:'AUTH_REQUIRED'}}});
  return r.fulfill({json:{user:session.user}});
 });
 if(seed)await page.addInitScript(s=>{
  // Reload must not resurrect a signed-out session or overwrite an account switch.
  if(!sessionStorage.getItem('aiadcast.fixture-session-seeded')){
   sessionStorage.setItem('aiadcast.beta-session',JSON.stringify(s));sessionStorage.setItem('aiadcast.fixture-session-seeded','1');
  }
 },session);
}
