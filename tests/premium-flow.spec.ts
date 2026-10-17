import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const photos=await Promise.all(Array.from({length:11},async(_,i)=>({name:`ref-${i}.png`,mimeType:'image/png',buffer:await sharp({create:{width:120,height:160,channels:3,background:{r:i*20,g:55,b:110}}}).png().toBuffer()})));
const result=await sharp({create:{width:1024,height:1280,channels:3,background:'#2459aa'}}).png().toBuffer();
async function backup(page:import('@playwright/test').Page){const d=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 백업',exact:true}).click();return JSON.parse(await readFile((await(await d).path())!,'utf8'));}
test('simple campaign supports 10 references, individual footer choices, reviewed generation and full-frame export',async({page})=>{
 let sent:any,job:any,accepts=0;
 await page.addInitScript(()=>{const w=window as any;w.drawn=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(value,x,y,max){w.drawn.push(value);return max===undefined?original.call(this,value,x,y):original.call(this,value,x,y,max);};});
 await page.route('**/api/**',route=>{const req=route.request(),url=new URL(req.url());const respond=(b:any)=>route.fulfill({contentType:'application/json',body:JSON.stringify(b)});const wallet={available:3,reserved:0};
 if(url.pathname==='/api/status')return respond({mode:'local-development',commercialReady:false,generation:{enabled:true,photoPurposes:true},assistant:{available:false},wallet,budget:{limitMicros:1000000,spentMicros:0,heldMicros:0}});
 if(url.pathname==='/api/generations'&&req.method()==='POST'){sent=req.postDataJSON();job={id:'premium_job_001',projectId:sent.projectId,requestIds:[sent.requestId],composition:'complete-ad',compositionKey:sent.request.output.compositionKey,state:'ready',mode:'creative',sourceHash:sent.source.sha256,createdAt:new Date().toISOString(),model:'gpt-image-2.5-sunburst',artifactId:hash(result),artifact:{id:hash(result),sha256:hash(result),dataUrl:'data:image/png;base64,'+result.toString('base64'),width:1024,height:1280,role:'creative'}};return respond({job,wallet});}
 if(url.pathname.endsWith('/accept')){accepts++;job.state='accepted';return respond({job,wallet});}return respond({});});
 await page.goto('/');await page.getByRole('button',{name:'내 광고 만들기',exact:true}).click();const wizard=page.locator('.create-page');await wizard.getByLabel('산업 선택').selectOption('boxes');
 await wizard.getByLabel('참조사진 추가').setInputFiles(photos);await expect(wizard.getByRole('alert')).toContainText('최대 10장');
 await expect(wizard.locator('.reference-item')).toHaveCount(10);await expect(wizard.getByLabel('참조사진 추가')).toHaveCount(0);
 await wizard.getByRole('button',{name:'2 대표 사진으로',exact:true}).click();
 await wizard.getByLabel(/^(상품명|서비스명)$/,{exact:true}).fill('리본 선물박스');await wizard.getByRole('textbox',{name:'상세설명',exact:true}).fill('검정색 자석 선물박스. '+ '소재 설명 '.repeat(40));
 await expect(wizard.locator('.creative-look-card')).toHaveCount(0);await wizard.locator('[data-order="7"] summary').click();await wizard.getByRole('textbox',{name:'요청사항',exact:true}).fill('박스의 접힘선을 보여주세요.');
 await wizard.locator('[data-order="2"] summary').click();await wizard.getByRole('textbox',{name:'회사명',exact:true}).fill('영화패키지');await wizard.getByRole('textbox',{name:'연락처',exact:true}).fill('1644-1410');await wizard.getByRole('textbox',{name:'이메일 주소',exact:true}).fill('hidden@example.com');await wizard.getByRole('textbox',{name:'홈페이지',exact:true}).fill('www.boxboy.co.kr');await wizard.getByRole('checkbox',{name:'이메일 주소 광고에 표시',exact:true}).uncheck();
 await page.goto('/#home');await page.goto('/#create');await expect(wizard.getByRole('textbox',{name:'회사명',exact:true})).toHaveValue('영화패키지');await expect(wizard.getByRole('checkbox',{name:'이메일 주소 광고에 표시',exact:true})).not.toBeChecked();
 await wizard.getByRole('button',{name:'4:5 SNS 피드',exact:true}).click();await wizard.getByRole('button',{name:'광고 생성',exact:true}).click();await expect(page.locator('.simple-ad-result')).toBeVisible();await expect(page.locator('.editor-details')).toHaveCount(0);
 const panel=page.getByRole('region',{name:'AI 광고 제작',exact:true});await expect(panel.getByText('결과를 확인해주세요',{exact:true})).toBeVisible();
 expect(sent.request.creativeDirection.visual.id).toBe('auto');expect(sent.request.creativeDirection.additionalInstructions).toBe('박스의 접힘선을 보여주세요.');expect(sent.request.output.format).toBe('4:5');expect(sent.references).toHaveLength(9);expect(sent.source.sha256).toBe(hash(photos[1].buffer));expect(sent.request.references.map((a:any)=>a.sha256)).toEqual(sent.references.map((a:any)=>a.sha256));expect(sent.request.productProfile.material.length).toBeGreaterThan(160);
 await panel.getByRole('checkbox',{name:'상품·재질 구조·규격·가격·문구를 확인했습니다.',exact:true}).check();await panel.getByRole('button',{name:'사용 확정 · 1개 차감',exact:true}).click();await expect(page.getByRole('button',{name:'이미지 저장',exact:true})).toBeEnabled();await page.goto('/#editor');
 const saved=await backup(page);expect(saved.references).toHaveLength(9);expect(saved.footer.email).toBe(false);expect(saved.copy.ko.email).toBe('hidden@example.com');
 await page.evaluate(()=>(window as any).drawn=[]);const d=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 내보내기',exact:true}).click();const png=await readFile((await(await d).path())!);const meta=await sharp(png).metadata();expect([meta.width,meta.height]).toEqual([1080,1350]);const pixel=await sharp(png).extract({left:50,top:600,width:1,height:1}).removeAlpha().raw().toBuffer();expect([...pixel]).toEqual([36,89,170]);
 expect(sent.request.copy.contact).toBe('1644-1410');expect(sent.request.copy.website).toBe('www.boxboy.co.kr');expect(sent.request.copy.email).toBe('');
 // Finished-ad bitmaps are not overprinted with another local copy layer.
 const printed=await page.evaluate(()=>(window as any).drawn.join('\n'));expect(printed).not.toContain('hidden@example.com');expect(printed).not.toContain('1644-1410');expect(accepts).toBe(1);
 page.on('dialog',d=>d.accept());await page.getByLabel('프로젝트 파일 선택').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.getByRole('status').filter({hasText:'프로젝트를 열었습니다.'})).toBeVisible();const restored=await backup(page);expect(restored.references.map((a:any)=>a.sha256)).toEqual(saved.references.map((a:any)=>a.sha256));expect(restored.footer).toEqual(saved.footer);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});
test('English service can start without photo, and offline generation is honest',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','en'));await page.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));await page.goto('/');await page.getByRole('button',{name:'Create an ad',exact:true}).click();const form=page.locator('.create-page');await form.getByLabel('Choose an industry').selectOption('yoga');await form.getByLabel('Service name',{exact:true}).fill('Studio Bloom');await form.getByRole('textbox',{name:'Description',exact:true}).fill('Private yoga classes');await form.getByRole('button',{name:'Generate ad',exact:true}).click();await expect(page.locator('.simple-ad-result')).toBeVisible();await expect(page.locator('.simple-generation-block')).toBeVisible();await expect(page.getByRole('button',{name:'Save image',exact:true})).toHaveCount(0);await expect(page.locator('.generation-ad-preview')).toHaveCount(0);

});

