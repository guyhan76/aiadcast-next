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
// Opt-in baseline for visual/editor specs with no live backend. Specific scenario routes
// registered later override these responses; writes never reach a real provider.
export async function protectedScreen(page:Page,session:MockSession){
 await page.route('**/api/**',r=>{
  const path=new URL(r.request().url()).pathname;
  if(r.request().method()==='GET'){
   if(path==='/api/account/capabilities')return r.fulfill({json:{google:{enabled:false},email:{enabled:false},checkout:{enabled:false,test:true,currency:'KRW'}}});
   if(path==='/api/status')return r.fulfill({json:{generation:{enabled:false,reason:'GENERATION_DISABLED'},wallet:{available:0,reserved:0},budget:{limitMicros:0},assistant:{available:false}}});
   if(path==='/api/generations')return r.fulfill({json:{jobs:[]}});
   if(path==='/api/projects')return r.fulfill({json:{projects:[]}});
  }
  return r.fulfill({status:503,json:{error:{code:'UNMOCKED_TEST_REQUEST'}}});
 });
 await authenticatedSession(page,session);
}
