import {test,expect,type Page} from './helpers/authenticated';
async function setup(page:Page){
 const state={byUser:new Map<string,Map<string,{project:any;revision:number}>>(),requests:[] as {path:string;auth:string}[]};
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.route(url=>url.pathname.startsWith('/api/')&&url.pathname!=='/api/auth/me',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,auth=req.headers().authorization??'';
  const reply=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  state.requests.push({path,auth});
  if(path==='/api/auth/login'){const {invite}=req.postDataJSON();const name=invite==='a'.repeat(43)?'alpha':'bravo';return reply({token:(name==='alpha'?'A':'B').repeat(43),expires:Date.now()+86400000,user:{id:'tester_'+name,label:name}});}
  if(path==='/api/status')return reply({mode:'invite-beta',commercialReady:false,generation:{enabled:false,reason:'GENERATION_DISABLED'},wallet:{available:3,reserved:0},budget:{limitMicros:0},assistant:{available:false}});
  if(path==='/api/auth/logout')return reply({signedOut:true});
  if(!auth)return reply({error:{code:'AUTH_REQUIRED'}},401);
  const user=auth==='Bearer '+'A'.repeat(43)?'alpha':'bravo';
  if(!state.byUser.has(user))state.byUser.set(user,new Map());const items=state.byUser.get(user)!;
  if(path==='/api/projects')return reply({projects:[...items].map(([id,p])=>({id,revision:p.revision,name:p.project.name,updated:new Date().toISOString()}))});
  if(path.startsWith('/api/projects/')){const id=path.split('/').pop()!;
   if(req.method()==='GET')return reply(items.get(id));
   const body=req.postDataJSON(),old=items.get(id);if((old?.revision??0)!==body.revision)return reply({error:{code:'PROJECT_CONFLICT'}},409);
   items.set(id,{project:body.project,revision:body.revision+1});return reply({revision:body.revision+1});
  }
  return reply({error:{code:'NOT_FOUND'}},404);
 });
 await page.goto('/');return state;
}
async function login(page:Page,letter='a'){await page.goto('/#guide');await expect(page.locator('.beta-account-trigger')).toHaveText('테스트 로그인');const drawer=page.locator('.account-drawer');if(await drawer.getAttribute('open')===null)await drawer.locator(':scope > summary').click();await page.getByRole('button',{name:'테스트 로그인',exact:true}).click();await page.getByLabel('초대코드',{exact:true}).fill(letter.repeat(43));await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page).toHaveURL(/#home$/);await page.goto('/#guide');await expect(page.locator('.beta-account-trigger')).toHaveText('내 계정');if(await drawer.getAttribute('open')===null)await drawer.locator(':scope > summary').click();await expect(page.getByRole('button',{name:'내 계정',exact:true})).toBeVisible();}
async function account(page:Page){await page.goto('/#guide');const drawer=page.locator('.account-drawer');if(await drawer.getAttribute('open')===null)await drawer.locator(':scope > summary').click();await page.getByRole('button',{name:'내 계정',exact:true}).click();return page.getByRole('region',{name:'테스트 계정',exact:true});}
test('invitation login, server save and validated restore keep the same project identity',async({page})=>{
 const state=await setup(page);await login(page);await page.goto('/#studio');await page.locator('.editor-details > summary').click();await page.getByLabel('프로젝트 이름').fill('카페 서버 저장');let panel=await account(page);await panel.getByRole('button',{name:'현재 작업 서버 저장'}).click();await expect(panel.getByRole('status')).toContainText('서버에 저장했습니다');const saved=[...state.byUser.get('alpha')!.values()][0];const id=saved.project.id;await panel.getByRole('button',{name:'계정 닫기'}).click();await page.goto('/#studio');await page.locator('.editor-details > summary').click();await page.getByLabel('프로젝트 이름').fill('수정 중인 기기 작업');panel=await account(page);await panel.getByRole('button',{name:/카페 서버 저장/}).click();await page.locator('.editor-details > summary').click();await expect(page.getByLabel('프로젝트 이름')).toHaveValue('카페 서버 저장');panel=await account(page);await panel.getByRole('button',{name:'현재 작업 서버 저장'}).click();await expect(panel.getByRole('status')).toContainText('서버에 저장했습니다');expect(state.byUser.get('alpha')!.get(id)!.revision).toBe(2);expect(state.byUser.get('alpha')!.size).toBe(1);expect(state.requests.filter(r=>r.path.startsWith('/api/projects')).every(r=>r.auth==='Bearer '+'A'.repeat(43))).toBeTruthy();
});
test('server conflict preserves local edits and does not overwrite the other device',async({page})=>{
 const state=await setup(page);await login(page);await page.goto('/#studio');await page.locator('.editor-details > summary').click();await page.getByLabel('프로젝트 이름').fill('나의 작업');const panel=await account(page);await panel.getByRole('button',{name:'현재 작업 서버 저장'}).click();await expect(panel.getByRole('status')).toContainText('서버에 저장했습니다');const p=[...state.byUser.get('alpha')!.values()][0];p.revision++;p.project.name='다른 기기의 최신 작업';await panel.getByRole('button',{name:'현재 작업 서버 저장'}).click();await expect(panel.getByRole('status')).toContainText('다른 기기에서 변경');expect(p.project.name).toBe('다른 기기의 최신 작업');await panel.getByRole('button',{name:'계정 닫기'}).click();await page.goto('/#studio');await page.locator('.editor-details > summary').click();await expect(page.getByLabel('프로젝트 이름')).toHaveValue('나의 작업');
});
test('signing out and into another account isolates local and remote libraries',async({page})=>{
 await setup(page);await login(page);await page.goto('/#studio');await page.locator('.editor-details > summary').click();await page.getByLabel('프로젝트 이름').fill('알파 비공개 광고');const panel=await account(page);await panel.getByRole('button',{name:'현재 작업 서버 저장'}).click();await expect(panel.getByRole('status')).toContainText('서버에 저장했습니다');await panel.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page).toHaveURL(/#home$/);await login(page,'b');await page.goto('/#projects');await expect(page.getByRole('button',{name:/알파 비공개 광고/})).toHaveCount(0);const other=await account(page);await expect(other.getByText('서버에 저장한 광고가 없습니다.')).toBeVisible();
});
test('account panel remains within a narrow phone viewport',async({page})=>{await setup(page);await page.goto('/#guide');await page.setViewportSize({width:320,height:780});await page.locator('.account-drawer>summary').click();await page.getByRole('button',{name:'테스트 로그인',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();});
