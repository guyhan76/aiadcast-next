import {test,expect} from '@playwright/test';
import {authenticatedSession,mockSession} from './helpers/authenticated-session';
for(const language of ['ko','en'])for(const width of [390,768,1440])test(`admin table touch scrolling and readable job evidence at ${width}px (${language})`,async({page},info)=>{
 await page.setViewportSize({width,height:900});let reads=0,writes=0;
 await page.addInitScript(language=>{localStorage.setItem('aiadcast.ui-language',language);(window as any).longTasks=[];new PerformanceObserver(list=>(window as any).longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});},language);
 const jobs=Array.from({length:60},(_,i)=>({id:'job-'+i,userLabel:'Admin <script>fixture</script>',state:i===0?'uncertain':'ready',createdAt:'2026-10-24T02:17:25Z',model:'gpt-image-fixture-long-model',outputFormat:'9:16',costMicros:i===0?null:123400,errorCode:i===0?'PROVIDER_UNCERTAIN':null}));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET'){writes++;return route.fulfill({status:500,json:{}});}if(path==='/api/admin/overview'){reads++;return route.fulfill({json:{readiness:{},budget:{limitMicros:5000000,allocatedMicros:0,spentMicros:0,heldMicros:500000},users:[],jobs,orders:[],audit:[]}});}return route.fulfill({status:404,json:{error:{code:'MOCK_UNAVAILABLE'}}});});
 await authenticatedSession(page,mockSession('scroll-admin','admin'));await page.goto('/#admin');
 const section=page.locator('.admin-card').filter({has:page.getByRole('heading',{name:language==='ko'?'최근 이미지 생성':'Recent image generations',exact:true})});await expect(section).toBeVisible();
 await section.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-100));
 const client=await page.context().newCDPSession(page);await client.send('Emulation.setCPUThrottlingRate',{rate:4});
 const before=await page.evaluate(()=>scrollY);
 await client.send('Emulation.setTouchEmulationEnabled',{enabled:true});
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:Math.floor(width/2),y:650}]});
 for(const y of [600,550,500,450,400,350]){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:Math.floor(width/2),y}]});await page.waitForTimeout(20);}
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before+100);
 const after=await page.evaluate(()=>scrollY);console.log(JSON.stringify({width,project:info.project.name,before,after,reads,writes,longTasks:await page.evaluate(()=>(window as any).longTasks)}));
 await section.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-100));
 await expect(section.getByText('PROVIDER_UNCERTAIN',{exact:true})).toBeVisible();
 const row=section.locator('tbody tr').first();for(const cell of width<=900?await row.locator('td').all():[]){expect(await cell.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})).toBe(true);}
 await expect(row.locator('time')).toHaveAttribute('datetime','2026-10-24T02:17:25Z');await expect(row).toContainText('uncertain');await expect(row).toContainText('PROVIDER_UNCERTAIN');await expect(row.locator('td').nth(4)).toHaveText('—');
 await row.screenshot({path:`/tmp/admin-cards-${width}-${language}-${info.project.name}.png`});
 await section.evaluate(el=>{(window as any).scrollMutations=0;new MutationObserver(records=>(window as any).scrollMutations+=records.length).observe(el,{childList:true,subtree:true});});
 expect(await section.evaluate(el=>el.querySelectorAll('script').length)).toBe(0);
 for(let i=0;i<3;i++)await page.mouse.wheel(0,500);expect(reads).toBe(1);expect(writes).toBe(0);expect(await page.evaluate(()=>(window as any).scrollMutations)).toBe(0);
 await page.goto('/#home');await expect(page.locator('.admin-page')).toHaveCount(0);await page.goto('/#admin');await expect.poll(()=>reads).toBe(2);expect(writes).toBe(0);
 await client.send('Emulation.setCPUThrottlingRate',{rate:1});
});
