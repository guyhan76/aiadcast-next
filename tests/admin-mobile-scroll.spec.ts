import {test,expect} from '@playwright/test';
import {authenticatedSession,mockSession} from './helpers/authenticated-session';
for(const language of ['ko','en'])for(const width of [320,390,768,1440])test(`compact admin history with bounded pages and no photo tests at ${width}px (${language})`,async({page})=>{
 await page.setViewportSize({width,height:900});let overview=0,history=0,writes=0,photoReads=0,statusReads=0;const queries:string[]=[];
 await page.addInitScript(language=>localStorage.setItem('aiadcast.ui-language',language),language);
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(route.request().method()!=='GET'){writes++;return route.fulfill({status:500,json:{}});}
  if(path.includes('evaluation'))photoReads++;if(path==='/api/status')statusReads++;
  if(path==='/api/admin/overview'){overview++;expect(url.searchParams.get('jobs')).toBe('none');return route.fulfill({json:{readiness:{},budget:{limitMicros:110000000,allocatedMicros:110000000,spentMicros:5000000,heldMicros:2000000},users:[],jobs:[],orders:[],audit:[]}});}
  if(path==='/api/admin/generations'){history++;queries.push(url.search);const second=!!url.searchParams.get('cursor'),filtered=!!url.searchParams.get('state');return route.fulfill({json:{jobs:Array.from({length:filtered?1:10},(_,i)=>({id:'job-'+(second?10+i:i),userLabel:'Admin <script>fixture</script>',state:filtered?'accepted':i===0?'uncertain':'ready',createdAt:'2026-10-24T02:17:25Z',model:'gpt-image-fixture-long-model',outputFormat:'9:16',costMicros:i===0?null:123400,errorCode:!filtered&&i===0?'PROVIDER_UNCERTAIN':null})),nextCursor:second||filtered?null:'cursor-fixture'}});}
  return route.fulfill({status:404,json:{error:{code:'MOCK_UNAVAILABLE'}}});
 });
 await authenticatedSession(page,mockSession('scroll-admin','admin'));await page.goto('/#admin');
 const section=page.locator('.admin-history'),rows=section.locator('.admin-history-row');await expect(rows).toHaveCount(10);expect(history).toBe(1);expect(overview).toBe(1);
 await expect(page.getByText('승인 원본 사진 분석',{exact:true})).toHaveCount(0);await expect(page.getByText('Advanced diagnostics · Historical photo tests',{exact:true})).toHaveCount(0);
 await expect(section.getByText('PROVIDER_UNCERTAIN',{exact:true})).not.toBeVisible();await rows.first().locator('summary').focus();await page.keyboard.press('Enter');await expect(section.getByText('PROVIDER_UNCERTAIN',{exact:true})).toBeVisible();await expect(rows.first()).toContainText(language==='ko'?'미확인':'Unknown');
 await expect(rows.first().locator('time')).toHaveAttribute('datetime','2026-10-24T02:17:25Z');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await section.evaluate(el=>el.querySelectorAll('script').length)).toBe(0);
 const next=section.getByRole('button',{name:language==='ko'?'다음':'Next',exact:true}),previous=section.getByRole('button',{name:language==='ko'?'이전':'Previous',exact:true});await expect(previous).toBeDisabled();await next.click();await expect(previous).toBeEnabled();await expect(next).toBeDisabled();expect(history).toBe(2);expect(queries.at(-1)).toContain('cursor=cursor-fixture');
 await section.locator(':scope > summary').click();await section.locator(':scope > summary').click();await expect(next).toBeDisabled();expect(history).toBe(2);
 await previous.click();await expect(previous).toBeDisabled();await section.getByRole('combobox',{name:language==='ko'?'상태':'Status',exact:true}).selectOption('accepted');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText(language==='ko'?'사용 확정':'Accepted');await expect(rows.first()).not.toContainText(language==='ko'?'완료':'Completed');
 await section.getByRole('combobox',{name:language==='ko'?'기간':'Period',exact:true}).selectOption('7');await expect.poll(()=>queries.at(-1)).toContain('days=7');await expect(next).toBeDisabled();
 const stable=history;await page.mouse.wheel(0,700);await page.mouse.wheel(0,-700);expect(history).toBe(stable);expect(overview).toBe(1);expect(writes).toBe(0);expect(photoReads).toBe(0);expect(statusReads).toBe(0);
 await section.screenshot({path:`/tmp/admin-compact-${width}-${language}.png`});
});
test('history reads coalesce, time out safely and cancel on navigation without writes',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
 await page.clock.install();let reads=0,writes=0,mode='ok';const held:any[]=[];
 await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')writes++;
 if(path==='/api/admin/overview')return r.fulfill({json:{readiness:{},budget:{limitMicros:0},users:[],jobs:[],orders:[],audit:[]}});
 if(path==='/api/admin/generations'){reads++;if(mode==='hold')return new Promise<void>(done=>held.push({r,done}));if(mode==='bad')return r.fulfill({json:{jobs:[{id:'malformed'}],nextCursor:null}});return r.fulfill({json:{jobs:[],nextCursor:null}});}
 return r.fulfill({status:404,json:{error:{code:'MOCK'}}});});
 await authenticatedSession(page,mockSession('history-timeout','admin'));await page.goto('/#admin');const section=page.locator('.admin-history');await expect(section.getByText('조건에 맞는 생성 기록이 없습니다.',{exact:true})).toBeVisible();
 mode='hold';await section.getByRole('button',{name:'다시 조회',exact:true}).evaluate(b=>{(b as HTMLButtonElement).click();(b as HTMLButtonElement).click();});await expect.poll(()=>reads).toBe(2);await page.clock.fastForward(15001);await expect(section.getByRole('alert')).toBeVisible();await expect(section.getByRole('button',{name:'다시 조회',exact:true})).toBeEnabled();
 mode='bad';await section.getByRole('button',{name:'다시 조회',exact:true}).click();await expect.poll(()=>reads).toBe(3);await expect(section.getByRole('alert')).toBeVisible();
 mode='ok';await section.getByRole('button',{name:'다시 조회',exact:true}).click();await expect(section.getByRole('alert')).toHaveCount(0);
 mode='hold';await section.getByRole('button',{name:'다시 조회',exact:true}).click();await expect.poll(()=>reads).toBe(5);await page.getByRole('link',{name:'홈으로',exact:true}).click();await expect(page.locator('.admin-history')).toHaveCount(0);
 for(const {r,done} of held){await r.fulfill({json:{jobs:[],nextCursor:null}}).catch(()=>{});done();}expect(writes).toBe(0);
});
